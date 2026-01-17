from __future__ import annotations

from datetime import UTC, datetime, date
from typing import Any

_DEFAULT_NOW = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
_DEFAULT_DATE = _DEFAULT_NOW.date()


def make_institution(
    *,
    id: int = 1135,
    name: str = "Institution 1135",
    city: str | None = None,
    address: str | None = None,
    postal_code: str | None = None,
    is_temporary_disabled: bool | None = None,
    attributes: dict | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": id,
        "name": name,
        "city": city,
        "address": address,
        "postal_code": postal_code,
        "attributes": attributes,
    }
    if is_temporary_disabled is not None:
        data["is_temporary_disabled"] = is_temporary_disabled
    return data


def make_biomarker(
    *,
    id: int | None = None,
    name: str = "ALT",
    elab_code: str = "ALT",
    slug: str | None = "alt",
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "name": name,
        "elab_code": elab_code,
        "slug": slug,
    }
    if id is not None:
        data["id"] = id
    return data


def make_item(
    *,
    id: int = 1,
    external_id: str = "item-1",
    kind: str = "single",
    name: str = "ALT Test",
    slug: str = "alt-test",
    price_now_grosz: int = 1000,
    price_min30_grosz: int = 900,
    currency: str = "PLN",
    is_available: bool = True,
    fetched_at: datetime | None = None,
    sale_price_grosz: int | None = None,
    regular_price_grosz: int | None = None,
) -> dict[str, Any]:
    return {
        "id": id,
        "external_id": external_id,
        "kind": kind,
        "name": name,
        "slug": slug,
        "price_now_grosz": price_now_grosz,
        "price_min30_grosz": price_min30_grosz,
        "currency": currency,
        "is_available": is_available,
        "fetched_at": fetched_at or _DEFAULT_NOW,
        "sale_price_grosz": sale_price_grosz,
        "regular_price_grosz": regular_price_grosz,
    }


def make_institution_item(
    *,
    institution_id: int,
    item_id: int,
    price_now_grosz: int = 1000,
    price_min30_grosz: int | None = None,
    currency: str = "PLN",
    is_available: bool = True,
    fetched_at: datetime | None = None,
    sale_price_grosz: int | None = None,
    regular_price_grosz: int | None = None,
) -> dict[str, Any]:
    return {
        "institution_id": institution_id,
        "item_id": item_id,
        "is_available": is_available,
        "currency": currency,
        "price_now_grosz": price_now_grosz,
        "price_min30_grosz": price_min30_grosz or price_now_grosz,
        "sale_price_grosz": sale_price_grosz,
        "regular_price_grosz": regular_price_grosz,
        "fetched_at": fetched_at or _DEFAULT_NOW,
    }


def make_item_biomarker(*, item_id: int, biomarker_id: int) -> dict[str, Any]:
    return {"item_id": item_id, "biomarker_id": biomarker_id}


def make_price_snapshot(
    *,
    institution_id: int,
    item_id: int,
    snap_date: date | None = None,
    price_now_grosz: int = 1000,
    price_min30_grosz: int = 1000,
    is_available: bool = True,
) -> dict[str, Any]:
    return {
        "institution_id": institution_id,
        "item_id": item_id,
        "snap_date": snap_date or _DEFAULT_DATE,
        "price_now_grosz": price_now_grosz,
        "price_min30_grosz": price_min30_grosz,
        "is_available": is_available,
    }


def make_raw_snapshot(
    *,
    source: str = "test-source",
    fetched_at: datetime | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "source": source,
        "fetched_at": fetched_at or _DEFAULT_NOW,
        "payload": payload or {},
    }


__all__ = [
    "make_biomarker",
    "make_institution",
    "make_institution_item",
    "make_item",
    "make_item_biomarker",
    "make_price_snapshot",
    "make_raw_snapshot",
]
