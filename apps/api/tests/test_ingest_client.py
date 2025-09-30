from __future__ import annotations

from unittest.mock import AsyncMock

from panelyt_api.ingest.client import AlabClient


def _make_alab_client() -> AlabClient:
    return AlabClient(client=AsyncMock())


def test_alab_single_applies_percentage_promotion():
    client = _make_alab_client()
    entry = {
        "id": 501,
        "name": "ALT",
        "slug": "alt",
        "price": "100",
        "lowest_price": "90",
        "is_available": True,
        "slipOfNotepaperPromotion": {
            "id": 1,
            "discount": "20",
            "type": "percentage",
            "code": "jesien25",
        },
    }

    item = client._build_single(entry)

    assert item.price_now_grosz == 8000
    assert item.price_min30_grosz == 7200
    assert item.sale_price_grosz == 8000
    assert item.regular_price_grosz == 10000
    assert item.metadata["promotion"]["code"] == "jesien25"


def test_alab_package_applies_percentage_promotion():
    client = _make_alab_client()
    entry = {
        "id": 701,
        "name": "Liver Panel",
        "slug": "liver-panel",
        "price": "200",
        "lowest_price": "150",
        "is_available": True,
        "examinations": [
            "ALT",
            "AST",
        ],
        "slipOfNotepaperPromotion": {
            "id": 2,
            "discount": "10",
            "type": "percentage",
            "code": "wrzesien",
        },
    }

    item = client._build_package(entry)

    assert item.price_now_grosz == 18000
    assert item.price_min30_grosz == 13500
    assert item.sale_price_grosz == 18000
    assert item.regular_price_grosz == 20000
    assert item.metadata["promotion"]["code"] == "wrzesien"
    assert {b.slug for b in item.biomarkers} == {"alt", "ast"}
