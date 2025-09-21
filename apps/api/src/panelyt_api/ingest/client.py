from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from panelyt_api.ingest.types import IngestionResult, RawBiomarker, RawProduct

logger = logging.getLogger(__name__)

_BASE_URL = "https://api-eshop.diag.pl/api/front/v1/products"
_DEFAULT_LIMIT = 200


@dataclass(slots=True)
class IncludedRecord:
    id: str
    type: str
    attributes: Mapping[str, Any]


class DiagClient:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(timeout=30, follow_redirects=True)

    async def close(self) -> None:
        await self._client.aclose()

    async def fetch_all(self) -> list[IngestionResult]:
        results: list[IngestionResult] = []
        for source, params in (
            ("packages", {"filter[type]": "package,shop-package", "filter[institution]": "1135"}),
            ("singles", {"filter[type]": "bloodtest", "filter[institution]": "1135"}),
        ):
            results.append(await self._fetch_source(source, params))
        return results

    async def _fetch_source(self, source: str, base_params: dict[str, Any]) -> IngestionResult:
        page = 1
        items: list[RawProduct] = []
        raw_payload: dict[str, Any] = {}

        while True:
            params = {
                **base_params,
                "include": "prices",
                "limit": _DEFAULT_LIMIT,
                "page": page,
            }
            response = await _retrying_request(self._client, params)
            payload = response.json()
            raw_payload[f"page_{page}"] = payload

            included_index = _build_included_index(payload.get("included", []))
            data_items = payload.get("data", [])
            for entry in data_items:
                parsed = self._parse_product(entry, included_index)
                if parsed and parsed.is_available:
                    items.append(parsed)

            last_page = payload.get("meta", {}).get("last_page", page)
            if page >= int(last_page or page):
                break
            page += 1

        return IngestionResult(
            fetched_at=datetime.now(UTC),
            items=items,
            raw_payload=raw_payload,
            source=source,
        )

    def _parse_product(
        self, entry: dict[str, Any], included_index: Mapping[str, IncludedRecord]
    ) -> RawProduct | None:
        try:
            product_id = int(entry["id"])
        except (KeyError, ValueError, TypeError):
            logger.warning("Skipping product without valid id: %s", entry)
            return None

        # API now returns flat structure, not nested under "attributes"
        name = str(entry.get("name") or "Unnamed")
        slug = str(entry.get("slug") or product_id)
        item_type = str(entry.get("type") or "").lower()
        kind = "package" if "package" in item_type else "single"

        prices = entry.get("prices") or {}
        sale_price = _extract_grosz(prices.get("sale"))
        regular_price = _extract_grosz(prices.get("regular"))
        minimal_price = _extract_grosz(prices.get("minimal"))

        price_now = sale_price or regular_price
        price_min30 = minimal_price or price_now
        currency = (prices.get("currency") or "PLN").upper()
        sell_state = prices.get("sellState") or "available"
        is_available = str(sell_state).lower() == "available"

        # Extract biomarker info from the item itself
        biomarkers = _extract_biomarkers_from_item(entry)

        return RawProduct(
            id=product_id,
            kind=kind,
            name=name,
            slug=slug,
            price_now_grosz=price_now,
            price_min30_grosz=price_min30,
            currency=currency,
            is_available=is_available,
            biomarkers=biomarkers,
            sale_price_grosz=sale_price,
            regular_price_grosz=regular_price,
        )


def _build_included_index(nodes: Iterable[dict[str, Any]]) -> Mapping[str, IncludedRecord]:
    index: dict[str, IncludedRecord] = {}
    for item in nodes or []:
        if not isinstance(item, dict):
            continue
        record_id = str(item.get("id"))
        record_type = str(item.get("type"))
        attributes = item.get("attributes") or {}
        key = f"{record_type}:{record_id}"
        index[key] = IncludedRecord(id=record_id, type=record_type, attributes=attributes)
    return index


def _extract_biomarkers_from_item(entry: dict[str, Any]) -> list[RawBiomarker]:
    """Extract biomarker info directly from the item in the new API format."""
    biomarkers: list[RawBiomarker] = []

    # For single tests, create a biomarker from the item itself
    if entry.get("type") == "bloodtest":
        elab_code = _clean_str(entry.get("elabCode"))
        if elab_code:
            biomarkers.append(
                RawBiomarker(
                    elab_code=elab_code,
                    slug=_clean_str(entry.get("slug")),
                    name=_clean_str(entry.get("name") or ""),
                )
            )

    # For packages, check if there are any products listed
    products = entry.get("products") or []
    for product in products:
        if isinstance(product, dict):
            elab_code = _clean_str(product.get("elabCode"))
            if elab_code:
                biomarkers.append(
                    RawBiomarker(
                        elab_code=elab_code,
                        slug=_clean_str(product.get("slug")),
                        name=_clean_str(product.get("name") or ""),
                    )
                )

    return biomarkers


def _extract_biomarkers(
    relationships: dict[str, Any], included_index: Mapping[str, IncludedRecord]
) -> list[RawBiomarker]:
    biomarkers: list[RawBiomarker] = []
    rel = relationships.get("parameters") or relationships.get("biomarkers")
    data = rel.get("data") if isinstance(rel, dict) else rel
    if not isinstance(data, list):
        return biomarkers

    for node in data:
        if not isinstance(node, dict):
            continue
        rel_type = str(node.get("type"))
        rel_id = str(node.get("id"))
        key = f"{rel_type}:{rel_id}"
        included = included_index.get(key)
        attributes = included.attributes if included else {}
        biomarkers.append(
            RawBiomarker(
                elab_code=_clean_str(attributes.get("elab_code") or attributes.get("code")),
                slug=_clean_str(attributes.get("slug")),
                name=_clean_str(attributes.get("name") or attributes.get("title") or ""),
            )
        )
    return biomarkers


async def _retrying_request(client: httpx.AsyncClient, params: dict[str, Any]) -> httpx.Response:
    async for attempt in AsyncRetrying(
        wait=wait_exponential(multiplier=1, min=1, max=8),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type(httpx.HTTPError),
        reraise=True,
    ):
        with attempt:
            response = await client.get(_BASE_URL, params=params)
            response.raise_for_status()
            return response
    raise RuntimeError("Retrying logic failed to return a response")


def _extract_grosz(node: Any) -> int:
    if isinstance(node, dict):
        gross = node.get("gross")
        if gross is None:
            gross = node.get("value")
        if gross is None:
            return 0
        try:
            value = float(gross)
        except (TypeError, ValueError):
            return 0
        return round(value * 100)
    if isinstance(node, (int, float)):
        return round(float(node) * 100)
    return 0


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
