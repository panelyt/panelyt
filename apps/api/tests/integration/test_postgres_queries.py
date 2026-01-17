from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import delete, insert, select

from panelyt_api.db import models
from panelyt_api.ingest.repository import CatalogRepository, RetentionWindow
from panelyt_api.optimization.context import ResolvedBiomarker
from panelyt_api.optimization.service import OptimizationService
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID
from panelyt_api.services.saved_lists import SavedListEntryData, SavedListService


async def _clear_tables(session) -> None:
    tables = (
        models.SavedListEntry,
        models.SavedList,
        models.UserSession,
        models.UserAccount,
        models.ItemBiomarker,
        models.PriceSnapshot,
        models.InstitutionItem,
        models.Item,
        models.BiomarkerAlias,
        models.Biomarker,
        models.Institution,
    )
    for table in tables:
        await session.execute(delete(table))
    await session.commit()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_collect_candidates_queries_postgres(pg_session) -> None:
    await _clear_tables(pg_session)

    now = datetime.now(UTC)
    await pg_session.execute(
        insert(models.Institution).values(id=DEFAULT_INSTITUTION_ID, name="Diag")
    )
    await pg_session.execute(
        insert(models.Biomarker).values(
            [
                {"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"id": 2, "name": "AST", "elab_code": "AST", "slug": "ast"},
            ]
        )
    )
    await pg_session.execute(
        insert(models.Item).values(
            [
                {
                    "id": 1,
                    "external_id": "item-1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": now,
                },
                {
                    "id": 2,
                    "external_id": "item-2",
                    "kind": "single",
                    "name": "AST Test",
                    "slug": "ast-test",
                    "price_now_grosz": 1200,
                    "price_min30_grosz": 1100,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": now,
                },
                {
                    "id": 3,
                    "external_id": "item-3",
                    "kind": "package",
                    "name": "Liver Panel",
                    "slug": "liver-panel",
                    "price_now_grosz": 2400,
                    "price_min30_grosz": 2300,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": now,
                },
            ]
        )
    )
    await pg_session.execute(
        insert(models.ItemBiomarker).values(
            [
                {"item_id": 1, "biomarker_id": 1},
                {"item_id": 2, "biomarker_id": 2},
                {"item_id": 3, "biomarker_id": 1},
                {"item_id": 3, "biomarker_id": 2},
            ]
        )
    )
    await pg_session.execute(
        insert(models.InstitutionItem).values(
            [
                {
                    "institution_id": DEFAULT_INSTITUTION_ID,
                    "item_id": 1,
                    "is_available": True,
                    "currency": "PLN",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": now,
                },
                {
                    "institution_id": DEFAULT_INSTITUTION_ID,
                    "item_id": 2,
                    "is_available": True,
                    "currency": "PLN",
                    "price_now_grosz": 1200,
                    "price_min30_grosz": 1100,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": now,
                },
                {
                    "institution_id": DEFAULT_INSTITUTION_ID,
                    "item_id": 3,
                    "is_available": True,
                    "currency": "PLN",
                    "price_now_grosz": 2400,
                    "price_min30_grosz": 2300,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": now,
                },
            ]
        )
    )
    await pg_session.execute(
        insert(models.PriceSnapshot).values(
            {
                "institution_id": DEFAULT_INSTITUTION_ID,
                "item_id": 1,
                "snap_date": now.date(),
                "price_now_grosz": 800,
                "price_min30_grosz": 800,
                "sale_price_grosz": None,
                "regular_price_grosz": None,
                "is_available": True,
                "seen_at": now,
            }
        )
    )
    await pg_session.commit()

    service = OptimizationService(pg_session)
    resolved = [
        ResolvedBiomarker(id=1, token="ALT", display_name="ALT", original="ALT"),
        ResolvedBiomarker(id=2, token="AST", display_name="AST", original="AST"),
    ]
    candidates = await service._collect_candidates(resolved, DEFAULT_INSTITUTION_ID)

    by_id = {candidate.id: candidate for candidate in candidates}
    assert by_id[1].coverage == {"ALT"}
    assert by_id[3].coverage == {"ALT", "AST"}
    assert by_id[1].price_min30 == 800


@pytest.mark.integration
@pytest.mark.asyncio
async def test_saved_list_persistence_postgres(pg_session) -> None:
    await _clear_tables(pg_session)

    now = datetime.now(UTC)
    await pg_session.execute(
        insert(models.Institution).values(id=DEFAULT_INSTITUTION_ID, name="Diag")
    )
    await pg_session.execute(
        insert(models.UserAccount).values(id="user-1", username="tester")
    )
    await pg_session.execute(
        insert(models.Biomarker).values(
            [
                {"id": 10, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"id": 11, "name": "AST", "elab_code": "AST", "slug": "ast"},
            ]
        )
    )
    await pg_session.execute(
        insert(models.Item).values(
            [
                {
                    "id": 10,
                    "external_id": "alt-item",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": now,
                },
                {
                    "id": 11,
                    "external_id": "ast-item",
                    "kind": "single",
                    "name": "AST Test",
                    "slug": "ast-test",
                    "price_now_grosz": 1100,
                    "price_min30_grosz": 1000,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": now,
                },
            ]
        )
    )
    await pg_session.execute(
        insert(models.ItemBiomarker).values(
            [
                {"item_id": 10, "biomarker_id": 10},
                {"item_id": 11, "biomarker_id": 11},
            ]
        )
    )
    await pg_session.execute(
        insert(models.InstitutionItem).values(
            [
                {
                    "institution_id": DEFAULT_INSTITUTION_ID,
                    "item_id": 10,
                    "is_available": True,
                    "currency": "PLN",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": now,
                },
                {
                    "institution_id": DEFAULT_INSTITUTION_ID,
                    "item_id": 11,
                    "is_available": True,
                    "currency": "PLN",
                    "price_now_grosz": 1100,
                    "price_min30_grosz": 1000,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": now,
                },
            ]
        )
    )
    await pg_session.commit()

    service = SavedListService(pg_session)
    created = await service.create_list(
        user_id="user-1",
        name="Basics",
        entries=[
            SavedListEntryData(code="ALT", display_name="ALT"),
            SavedListEntryData(code="AST", display_name="AST"),
        ],
        institution_id=DEFAULT_INSTITUTION_ID,
    )
    await pg_session.commit()

    fetched = await service.get_for_user(created.id, "user-1")
    assert fetched is not None
    assert [entry.code for entry in fetched.entries] == ["ALT", "AST"]
    assert fetched.last_known_total_grosz == 2100


@pytest.mark.integration
@pytest.mark.asyncio
async def test_snapshot_pruning_postgres(pg_session) -> None:
    await _clear_tables(pg_session)

    await pg_session.execute(
        insert(models.Institution).values(id=DEFAULT_INSTITUTION_ID, name="Diag")
    )
    await pg_session.execute(
        insert(models.Item).values(
            {
                "id": 20,
                "external_id": "item-20",
                "kind": "single",
                "name": "ALT Test",
                "slug": "alt-test",
                "price_now_grosz": 1000,
                "price_min30_grosz": 900,
                "currency": "PLN",
                "is_available": True,
                "fetched_at": datetime.now(UTC),
            }
        )
    )

    reference = date(2026, 1, 15)
    old_date = reference - RetentionWindow - timedelta(days=1)
    keep_date = reference - timedelta(days=5)
    await pg_session.execute(
        insert(models.PriceSnapshot).values(
            [
                {
                    "institution_id": DEFAULT_INSTITUTION_ID,
                    "item_id": 20,
                    "snap_date": old_date,
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "is_available": True,
                    "seen_at": datetime.now(UTC),
                },
                {
                    "institution_id": DEFAULT_INSTITUTION_ID,
                    "item_id": 20,
                    "snap_date": keep_date,
                    "price_now_grosz": 1100,
                    "price_min30_grosz": 1000,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "is_available": True,
                    "seen_at": datetime.now(UTC),
                },
            ]
        )
    )
    await pg_session.commit()

    repo = CatalogRepository(pg_session)
    await repo.prune_snapshots(reference)
    await pg_session.commit()

    remaining = (
        await pg_session.execute(
            select(models.PriceSnapshot.snap_date).order_by(models.PriceSnapshot.snap_date)
        )
    ).scalars().all()
    assert remaining == [keep_date]
