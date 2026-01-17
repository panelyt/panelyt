from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import insert

from panelyt_api.db import models
from panelyt_api.optimization.service import OptimizationService
from panelyt_api.schemas.optimize import OptimizeRequest
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID


async def _seed_base(
    db_session,
    *,
    items: list[dict],
    biomarker_rows: list[dict],
    item_biomarkers: list[dict],
) -> None:
    now = datetime.now(UTC)
    await db_session.execute(
        insert(models.Institution).values(id=DEFAULT_INSTITUTION_ID, name="Diag")
    )
    await db_session.execute(insert(models.Biomarker).values(biomarker_rows))
    await db_session.execute(insert(models.Item).values(items))
    await db_session.execute(insert(models.ItemBiomarker).values(item_biomarkers))
    await db_session.execute(
        insert(models.InstitutionItem).values(
            [
                {
                    "institution_id": DEFAULT_INSTITUTION_ID,
                    "item_id": item["id"],
                    "is_available": item.get("is_available", True),
                    "currency": "PLN",
                    "price_now_grosz": item["price_now_grosz"],
                    "price_min30_grosz": item["price_min30_grosz"],
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": item.get("fetched_at", now),
                }
                for item in items
            ]
        )
    )
    await db_session.commit()


def _assert_invariants(response, requested: list[str]) -> None:
    covered = set(response.explain.keys())
    uncovered = set(response.uncovered)
    assert covered | uncovered == set(requested)

    for token, explain in response.explain.items():
        assert token
        assert explain

    total_now = round(sum(item.price_now_grosz for item in response.items) / 100, 2)
    total_min30 = round(sum(item.price_min30_grosz for item in response.items) / 100, 2)
    assert response.total_now == total_now
    assert response.total_min30 == total_min30


@pytest.mark.asyncio
async def test_optimizer_prefers_cheaper_package(db_session) -> None:
    items = [
        {
            "id": 1,
            "external_id": "alt-item",
            "kind": "single",
            "name": "ALT",
            "slug": "alt",
            "price_now_grosz": 1200,
            "price_min30_grosz": 1100,
            "currency": "PLN",
            "is_available": True,
        },
        {
            "id": 2,
            "external_id": "ast-item",
            "kind": "single",
            "name": "AST",
            "slug": "ast",
            "price_now_grosz": 1400,
            "price_min30_grosz": 1300,
            "currency": "PLN",
            "is_available": True,
        },
        {
            "id": 3,
            "external_id": "package-item",
            "kind": "package",
            "name": "Liver Panel",
            "slug": "liver-panel",
            "price_now_grosz": 2000,
            "price_min30_grosz": 1900,
            "currency": "PLN",
            "is_available": True,
        },
    ]
    biomarkers = [
        {"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
        {"id": 2, "name": "AST", "elab_code": "AST", "slug": "ast"},
    ]
    await _seed_base(
        db_session,
        items=items,
        biomarker_rows=biomarkers,
        item_biomarkers=[
            {"item_id": 1, "biomarker_id": 1},
            {"item_id": 2, "biomarker_id": 2},
            {"item_id": 3, "biomarker_id": 1},
            {"item_id": 3, "biomarker_id": 2},
        ],
    )

    service = OptimizationService(db_session)
    response = await service.solve(
        OptimizeRequest(biomarkers=["ALT", "AST"]), DEFAULT_INSTITUTION_ID
    )

    assert [item.id for item in response.items] == [3]
    assert response.total_now == 20.0
    _assert_invariants(response, ["ALT", "AST"])


@pytest.mark.asyncio
async def test_optimizer_prefers_cheaper_singles(db_session) -> None:
    items = [
        {
            "id": 1,
            "external_id": "alt-item",
            "kind": "single",
            "name": "ALT",
            "slug": "alt",
            "price_now_grosz": 1000,
            "price_min30_grosz": 900,
            "currency": "PLN",
            "is_available": True,
        },
        {
            "id": 2,
            "external_id": "ast-item",
            "kind": "single",
            "name": "AST",
            "slug": "ast",
            "price_now_grosz": 1100,
            "price_min30_grosz": 1000,
            "currency": "PLN",
            "is_available": True,
        },
        {
            "id": 3,
            "external_id": "package-item",
            "kind": "package",
            "name": "Liver Panel",
            "slug": "liver-panel",
            "price_now_grosz": 2600,
            "price_min30_grosz": 2500,
            "currency": "PLN",
            "is_available": True,
        },
    ]
    biomarkers = [
        {"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
        {"id": 2, "name": "AST", "elab_code": "AST", "slug": "ast"},
    ]
    await _seed_base(
        db_session,
        items=items,
        biomarker_rows=biomarkers,
        item_biomarkers=[
            {"item_id": 1, "biomarker_id": 1},
            {"item_id": 2, "biomarker_id": 2},
            {"item_id": 3, "biomarker_id": 1},
            {"item_id": 3, "biomarker_id": 2},
        ],
    )

    service = OptimizationService(db_session)
    response = await service.solve(
        OptimizeRequest(biomarkers=["ALT", "AST"]), DEFAULT_INSTITUTION_ID
    )

    assert {item.id for item in response.items} == {1, 2}
    assert response.total_now == 21.0
    _assert_invariants(response, ["ALT", "AST"])


@pytest.mark.asyncio
async def test_optimizer_uncovered_biomarkers(db_session) -> None:
    items = [
        {
            "id": 1,
            "external_id": "ast-item",
            "kind": "single",
            "name": "AST",
            "slug": "ast",
            "price_now_grosz": 1100,
            "price_min30_grosz": 1000,
            "currency": "PLN",
            "is_available": True,
        },
        {
            "id": 2,
            "external_id": "ast-package",
            "kind": "package",
            "name": "AST Panel",
            "slug": "ast-panel",
            "price_now_grosz": 2100,
            "price_min30_grosz": 2000,
            "currency": "PLN",
            "is_available": True,
        },
        {
            "id": 3,
            "external_id": "alt-missing",
            "kind": "package",
            "name": "ALT Bundle",
            "slug": "alt-bundle",
            "price_now_grosz": 1900,
            "price_min30_grosz": 1800,
            "currency": "PLN",
            "is_available": False,
        },
    ]
    biomarkers = [
        {"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
        {"id": 2, "name": "AST", "elab_code": "AST", "slug": "ast"},
    ]
    await _seed_base(
        db_session,
        items=items,
        biomarker_rows=biomarkers,
        item_biomarkers=[
            {"item_id": 1, "biomarker_id": 2},
            {"item_id": 2, "biomarker_id": 2},
        ],
    )

    service = OptimizationService(db_session)
    response = await service.solve(
        OptimizeRequest(biomarkers=["ALT"]), DEFAULT_INSTITUTION_ID
    )

    assert response.items == []
    assert response.uncovered == ["ALT"]
    _assert_invariants(response, ["ALT"])
