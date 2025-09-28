from __future__ import annotations

import hashlib
import logging
import math
import re
from datetime import UTC, datetime
from typing import Any

import httpx
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from panelyt_api.ingest.types import LabIngestionResult, RawLabBiomarker, RawLabItem

logger = logging.getLogger(__name__)

_DIAG_BASE_URL = "https://api-eshop.diag.pl/api/front/v1/products"
_DIAG_DEFAULT_LIMIT = 200
_ALAB_BASE_URL = "https://api.alab.pl/api/referrals/get-examinations"
_ALAB_DEFAULT_FACILITY_ID = 166


class DiagClient:
    lab_code = "diag"

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(timeout=30, follow_redirects=True)

    async def close(self) -> None:
        await self._client.aclose()

    async def fetch_all(self) -> LabIngestionResult:
        combined_items: list[RawLabItem] = []
        raw_payload: dict[str, dict[str, Any]] = {}
        for source, params in (
            ("packages", {"filter[type]": "package,shop-package", "filter[institution]": "1135"}),
            ("singles", {"filter[type]": "bloodtest", "filter[institution]": "1135"}),
        ):
            items, payload = await self._fetch_source(params)
            combined_items.extend(items)
            raw_payload[source] = payload
        return LabIngestionResult(
            lab_code=self.lab_code,
            fetched_at=datetime.now(UTC),
            items=combined_items,
            raw_payload=raw_payload,
        )

    async def _fetch_source(self, base_params: dict[str, Any]) -> tuple[list[RawLabItem], dict[str, Any]]:
        page = 1
        items: list[RawLabItem] = []
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

    def _parse_product(self, entry: dict[str, Any]) -> RawLabItem | None:
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

        return RawLabItem(
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
    ) -> list[RawLabBiomarker]:
        biomarkers: list[RawLabBiomarker] = []

        if entry.get("type") == "bloodtest":
            elab_code = self._clean_str(entry.get("elabCode"))
            slug = self._clean_str(entry.get("slug")) or fallback_slug
            name = self._clean_str(entry.get("name")) or ""
            external_id = _diag_biomarker_identifier(elab_code, slug, name)
            biomarkers.append(
                RawLabBiomarker(
                    external_id=external_id,
                    name=name or external_id,
                    elab_code=elab_code,
                    slug=slug,
                    metadata={"source": "diag_solo"},
                )
            )

        for product in entry.get("products") or []:
            if not isinstance(product, dict):
                continue
            elab_code = self._clean_str(product.get("elabCode"))
            slug = self._clean_str(product.get("slug"))
            name = self._clean_str(product.get("name")) or ""
            external_id = _diag_biomarker_identifier(elab_code, slug, name)
            biomarkers.append(
                RawLabBiomarker(
                    external_id=external_id,
                    name=name or external_id,
                    elab_code=elab_code,
                    slug=slug,
                    metadata={"source": "diag_package"},
                )
            )

        return biomarkers

    @staticmethod
    def _clean_str(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None


class AlabClient:
    lab_code = "alab"

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        *,
        facility_id: int = _ALAB_DEFAULT_FACILITY_ID,
    ) -> None:
        self._client = client or httpx.AsyncClient(timeout=30, follow_redirects=True)
        self._facility_id = facility_id

    async def close(self) -> None:
        await self._client.aclose()

    async def fetch_all(self) -> LabIngestionResult:
        fetched_at = datetime.now(UTC)
        items: list[RawLabItem] = []
        raw_payload: dict[str, dict[str, Any]] = {"examinations": {}, "packages": {}}

        items.extend(await self._collect_examinations(raw_payload["examinations"]))
        items.extend(await self._collect_packages(raw_payload["packages"]))

        return LabIngestionResult(
            lab_code=self.lab_code,
            fetched_at=fetched_at,
            items=items,
            raw_payload=raw_payload,
        )

    async def _collect_examinations(self, raw_store: dict[str, Any]) -> list[RawLabItem]:
        return await self._paginate_collection(
            collection_key="examinations",
            page_param="page",
            raw_store=raw_store,
            item_builder=self._build_single,
        )

    async def _collect_packages(self, raw_store: dict[str, Any]) -> list[RawLabItem]:
        return await self._paginate_collection(
            collection_key="packages",
            page_param="package_page",
            raw_store=raw_store,
            item_builder=self._build_package,
        )

    async def _paginate_collection(
        self,
        *,
        collection_key: str,
        page_param: str,
        raw_store: dict[str, Any],
        item_builder,
    ) -> list[RawLabItem]:
        page = 1
        records: list[RawLabItem] = []

        while True:
            params = {"facility_id": self._facility_id, page_param: page}
            if page_param == "page":
                params["package_page"] = 1
            else:
                params["page"] = 1
            response = await _retrying_request(self._client, _ALAB_BASE_URL, params=params)
            payload = response.json()
            collection = payload.get(collection_key) or {}
            raw_store[f"page_{page}"] = collection

            data_items = collection.get("data") or []
            for entry in data_items:
                built = item_builder(entry)
                if built is not None:
                    records.append(built)

            meta = collection.get("meta") or {}
            last_page_raw = meta.get("last_page") or page
            try:
                last_page = int(last_page_raw)
            except (TypeError, ValueError):
                last_page = page
            if page >= last_page:
                break
            page += 1

        return records

    def _build_single(self, entry: dict[str, Any]) -> RawLabItem | None:
        item_id = entry.get("id")
        if item_id is None:
            logger.debug("Skipping ALAB examination without id: %s", entry)
            return None

        name = str(entry.get("name") or "Badanie ALAB")
        slug = _clean_slug(entry.get("slug"))
        price_now = _pln_to_grosz(entry.get("price"))
        price_min30 = _pln_to_grosz(entry.get("lowest_price")) or price_now
        currency = "PLN"
        is_available = bool(entry.get("is_available", True))

        biomarker = RawLabBiomarker(
            external_id=str(item_id),
            name=name,
            elab_code=None,
            slug=slug,
            metadata={"source": "alab_single"},
        )

        return RawLabItem(
            external_id=str(item_id),
            kind="single",
            name=name,
            slug=slug,
            price_now_grosz=price_now,
            price_min30_grosz=price_min30,
            currency=currency,
            is_available=is_available,
            biomarkers=[biomarker],
            sale_price_grosz=None,
            regular_price_grosz=price_now,
            metadata={"raw_id": item_id},
        )

    def _build_package(self, entry: dict[str, Any]) -> RawLabItem | None:
        item_id = entry.get("id")
        if item_id is None:
            logger.debug("Skipping ALAB package without id: %s", entry)
            return None

        name = str(entry.get("name") or "Pakiet ALAB")
        slug = _clean_slug(entry.get("slug"))
        price_now = _pln_to_grosz(entry.get("price"))
        price_min30 = _pln_to_grosz(entry.get("lowest_price")) or price_now
        currency = "PLN"
        is_available = bool(entry.get("is_available", True))

        exams = entry.get("examinations") or []
        biomarkers: list[RawLabBiomarker] = []
        for exam in exams:
            if not isinstance(exam, str):
                continue
            exam_name = exam.strip()
            if not exam_name:
                continue
            identifier = _normalize_identifier(exam_name)
            biomarkers.append(
                RawLabBiomarker(
                    external_id=identifier,
                    name=exam_name,
                    elab_code=None,
                    slug=identifier,
                    metadata={"source": "alab_package", "package_id": item_id},
                )
            )

        return RawLabItem(
            external_id=str(item_id),
            kind="package",
            name=name,
            slug=slug,
            price_now_grosz=price_now,
            price_min30_grosz=price_min30,
            currency=currency,
            is_available=is_available,
            biomarkers=biomarkers,
            sale_price_grosz=None,
            regular_price_grosz=price_now,
            metadata={"raw_id": item_id},
        )


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
    return int(math.floor(numeric * 100 + 0.5))


def _diag_biomarker_identifier(elab_code: str | None, slug: str | None, name: str) -> str:
    if elab_code:
        return elab_code.lower()
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


def _clean_slug(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    return text or None


__all__ = ["DiagClient", "AlabClient"]
