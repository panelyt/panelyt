from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import re
from datetime import UTC, datetime
from typing import Any

import httpx
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from panelyt_api.ingest.types import (
    DiagIngestionResult,
    DiagInstitution,
    RawDiagBiomarker,
    RawDiagItem,
)

logger = logging.getLogger(__name__)

_DIAG_BASE_URL = "https://api-eshop.diag.pl/api/front/v1/products"
_DIAG_INSTITUTION_SEARCH_URL = (
    "https://api-eshop.diag.pl/api/v1/institution-service/institutions/search"
)
_DIAG_DEFAULT_LIMIT = 200
_DIAG_INSTITUTION_DEFAULT_LIMIT = 20


class DiagClient:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(timeout=30, follow_redirects=True)

    async def close(self) -> None:
        await self._client.aclose()

    async def fetch_all(self, institution_id: int) -> DiagIngestionResult:
        institution = str(institution_id)

        async def _load_source(
            source: str, params: dict[str, Any]
        ) -> tuple[str, list[RawDiagItem], dict[str, Any]]:
            items, payload = await self._fetch_source(params)
            return source, items, payload

        sources = (
            (
                "packages",
                {"filter[type]": "package,shop-package", "filter[institution]": institution},
            ),
            ("singles", {"filter[type]": "bloodtest", "filter[institution]": institution}),
        )

        combined_items: list[RawDiagItem] = []
        raw_payload: dict[str, dict[str, Any]] = {}
        results = await asyncio.gather(
            *(asyncio.create_task(_load_source(source, params)) for source, params in sources)
        )
        for source, items, payload in results:
            combined_items.extend(items)
            raw_payload[source] = payload
        return DiagIngestionResult(
            fetched_at=datetime.now(UTC),
            items=combined_items,
            raw_payload=raw_payload,
        )

    async def search_institutions(
        self, q: str, page: int = 1, limit: int = _DIAG_INSTITUTION_DEFAULT_LIMIT
    ) -> list[DiagInstitution]:
        params = {
            "q": q,
            "page": page,
            "limit": limit,
        }
        response = await _retrying_request(
            self._client, _DIAG_INSTITUTION_SEARCH_URL, params=params
        )
        payload = response.json()
        entries = (
            payload.get("data")
            or payload.get("items")
            or payload.get("results")
            or []
        )
        institutions: list[DiagInstitution] = []
        for entry in entries:
            parsed = self._parse_institution(entry)
            if parsed is not None:
                institutions.append(parsed)
        return institutions

    async def _fetch_source(
        self, base_params: dict[str, Any]
    ) -> tuple[list[RawDiagItem], dict[str, Any]]:
        page = 1
        items: list[RawDiagItem] = []
        raw_payload: dict[str, Any] = {}

        while True:
            params = {
                **base_params,
                "include": "prices",
                "limit": _DIAG_DEFAULT_LIMIT,
                "page": page,
            }
            response = await _retrying_request(self._client, _DIAG_BASE_URL, params=params)
            payload = response.json()
            raw_payload[f"page_{page}"] = payload

            data_items = payload.get("data", [])
            for entry in data_items:
                parsed = self._parse_product(entry)
                if parsed:
                    items.append(parsed)

            last_page = payload.get("meta", {}).get("last_page", page)
            if page >= int(last_page or page):
                break
            page += 1

        return items, raw_payload

    def _parse_product(self, entry: dict[str, Any]) -> RawDiagItem | None:
        try:
            product_id = int(entry["id"])
        except (KeyError, ValueError, TypeError):
            logger.warning("Skipping product without valid id: %s", entry)
            return None

        name = str(entry.get("name") or "Unnamed")
        slug = self._clean_str(entry.get("slug"))
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

        biomarkers = self._extract_biomarkers_from_item(entry, fallback_slug=slug)
        if not biomarkers:
            logger.debug("Diag product %s has no biomarkers; skipping", product_id)
            return None

        return RawDiagItem(
            external_id=str(product_id),
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
            metadata={"raw_type": entry.get("type")},
        )

    def _extract_biomarkers_from_item(
        self, entry: dict[str, Any], *, fallback_slug: str | None
    ) -> list[RawDiagBiomarker]:
        biomarkers: list[RawDiagBiomarker] = []

        if entry.get("type") == "bloodtest":
            diag_id = entry.get("id")
            slug = self._clean_str(entry.get("slug")) or fallback_slug
            name = self._clean_str(entry.get("name")) or ""
            external_id = _diag_biomarker_identifier(diag_id, slug, name)
            biomarkers.append(
                RawDiagBiomarker(
                    external_id=external_id,
                    name=name or external_id,
                    elab_code=self._clean_str(entry.get("elabCode")),
                    slug=slug,
                    metadata={"source": "diag_solo"},
                )
            )

        for product in entry.get("products") or []:
            if not isinstance(product, dict):
                continue
            diag_product_id = product.get("id")
            slug = self._clean_str(product.get("slug"))
            name = self._clean_str(product.get("name")) or ""
            external_id = _diag_biomarker_identifier(diag_product_id, slug, name)
            biomarkers.append(
                RawDiagBiomarker(
                    external_id=external_id,
                    name=name or external_id,
                    elab_code=self._clean_str(product.get("elabCode")),
                    slug=slug,
                    metadata={"source": "diag_package"},
                )
            )

        return biomarkers

    def _parse_institution(self, entry: Any) -> DiagInstitution | None:
        if not isinstance(entry, dict):
            return None
        raw_id = entry.get("id") or entry.get("institutionId") or entry.get("institution_id")
        try:
            institution_id = int(raw_id)
        except (TypeError, ValueError):
            logger.warning("Skipping institution with invalid id: %s", entry)
            return None

        name = self._clean_str(
            entry.get("name") or entry.get("fullName") or entry.get("displayName")
        )
        if not name:
            name = f"Institution {institution_id}"

        city = self._clean_str(
            entry.get("city")
            or entry.get("town")
            or (entry.get("address") or {}).get("city")
        )
        address = self._extract_address(entry)

        return DiagInstitution(
            id=institution_id,
            name=name,
            city=city,
            address=address,
        )

    def _extract_address(self, entry: dict[str, Any]) -> str | None:
        raw_address = entry.get("address")
        if isinstance(raw_address, str):
            return self._clean_str(raw_address)
        if isinstance(raw_address, dict):
            address = self._compose_address(raw_address)
            if address:
                return address
            return self._clean_str(raw_address.get("full") or raw_address.get("line1"))
        return self._compose_address(entry)

    def _compose_address(self, entry: dict[str, Any]) -> str | None:
        street = self._clean_str(
            entry.get("street")
            or entry.get("streetName")
            or entry.get("street_name")
        )
        building = self._clean_str(
            entry.get("buildingNumber")
            or entry.get("building")
            or entry.get("number")
        )
        local = self._clean_str(
            entry.get("localNumber")
            or entry.get("local")
            or entry.get("unit")
        )

        if not any([street, building, local]):
            return None

        address = street or ""
        if building:
            address = f"{address} {building}".strip()
        if local:
            address = f"{address}/{local}" if address else local
        return address or None

    @staticmethod
    def _clean_str(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None


async def _retrying_request(
    client: httpx.AsyncClient, url: str, *, params: dict[str, Any]
) -> httpx.Response:
    async for attempt in AsyncRetrying(
        wait=wait_exponential(multiplier=1, min=1, max=8),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type(httpx.HTTPError),
        reraise=True,
    ):
        with attempt:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response
    raise RuntimeError("Retrying logic failed to return a response")


def _extract_grosz(node: Any) -> int:
    if isinstance(node, dict):
        for key in ("gross", "value", "minimal", "sale", "regular"):
            if key in node and node[key] is not None:
                return _pln_to_grosz(node[key])
        return 0
    if isinstance(node, (int, float)):
        return _pln_to_grosz(node)
    if isinstance(node, str):
        try:
            return _pln_to_grosz(float(node))
        except ValueError:
            return 0
    return 0


def _pln_to_grosz(value: Any) -> int:
    try:
        if isinstance(value, str):
            value = value.replace(",", ".")
        numeric = float(value)
    except (TypeError, ValueError):
        return 0
    return math.floor(numeric * 100 + 0.5)


def _diag_biomarker_identifier(diag_id: Any, slug: str | None, name: str) -> str:
    if diag_id not in (None, ""):
        return str(diag_id)
    if slug:
        return slug.lower()
    normalized = _normalize_identifier(name)
    if normalized:
        return normalized
    digest = hashlib.sha1(name.encode("utf-8")).hexdigest()[:12]
    return f"diag:{digest}"


def _normalize_identifier(value: str | None) -> str:
    if not value:
        return ""
    text = value.lower()
    text = re.sub(r"[^a-z0-9ąęółśżźćń]+", "-", text)
    text = text.strip("-")
    return text or ""


__all__ = ["DiagClient"]
