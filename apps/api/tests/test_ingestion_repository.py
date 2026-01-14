from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select

from panelyt_api.db import models
from panelyt_api.ingest.repository import CatalogRepository
from panelyt_api.utils.slugify import slugify_identifier_pl
from panelyt_api.ingest.types import RawDiagBiomarker, RawDiagItem


@pytest.mark.asyncio
async def test_upsert_catalog_upserts_items_biomarkers_links_and_snapshots(
    db_session,
) -> None:
    repo = CatalogRepository(db_session)
    await db_session.execute(
        models.Institution.__table__.insert().values(
            {"id": 1135, "name": "Default / Lab office"}
        )
    )
    fetched_at = datetime(2025, 1, 1, tzinfo=UTC)
    item = RawDiagItem(
        external_id="diag-1",
        kind="single",
        name="ALT",
        slug=None,
        price_now_grosz=1000,
        price_min30_grosz=900,
        currency="PLN",
        is_available=True,
        biomarkers=[
            RawDiagBiomarker(
                external_id="alt",
                name="ALT",
                elab_code="ALT",
                slug=None,
            )
        ],
        sale_price_grosz=None,
        regular_price_grosz=1000,
    )

    await repo.upsert_catalog(1135, singles=[item], packages=[], fetched_at=fetched_at)
    await db_session.commit()

    stored_item = await db_session.scalar(
        select(models.Item).where(models.Item.external_id == "diag-1")
    )
    assert stored_item is not None
    stored_item_id = stored_item.id
    assert stored_item.slug == slugify_identifier_pl("ALT")

    stored_biomarker = await db_session.scalar(
        select(models.Biomarker).where(models.Biomarker.slug == slugify_identifier_pl("ALT"))
    )
    assert stored_biomarker is not None
    assert stored_biomarker.elab_code == "ALT"

    link = await db_session.scalar(
        select(models.ItemBiomarker).where(
            models.ItemBiomarker.item_id == stored_item.id,
            models.ItemBiomarker.biomarker_id == stored_biomarker.id,
        )
    )
    assert link is not None

    institution_item = await db_session.scalar(
        select(models.InstitutionItem).where(
            models.InstitutionItem.institution_id == 1135,
            models.InstitutionItem.item_id == stored_item.id,
        )
    )
    assert institution_item is not None
    assert institution_item.price_now_grosz == 1000
    assert institution_item.price_min30_grosz == 900

    snapshot = await db_session.scalar(
        select(models.PriceSnapshot).where(
            models.PriceSnapshot.institution_id == 1135,
            models.PriceSnapshot.item_id == stored_item.id,
            models.PriceSnapshot.snap_date == fetched_at.date(),
        )
    )
    assert snapshot is not None
    assert snapshot.price_now_grosz == 1000
    assert snapshot.price_min30_grosz == 900

    updated_item = RawDiagItem(
        external_id="diag-1",
        kind="single",
        name="ALT Updated",
        slug=None,
        price_now_grosz=1200,
        price_min30_grosz=900,
        currency="PLN",
        is_available=True,
        biomarkers=[
            RawDiagBiomarker(
                external_id="ast",
                name="AST",
                elab_code="AST",
                slug=None,
            )
        ],
        sale_price_grosz=None,
        regular_price_grosz=1200,
    )

    await repo.upsert_catalog(1135, singles=[updated_item], packages=[], fetched_at=fetched_at)
    await db_session.commit()
    db_session.expire_all()

    link_count = await db_session.scalar(
        select(func.count()).select_from(models.ItemBiomarker).where(
            models.ItemBiomarker.item_id == stored_item_id
        )
    )
    assert link_count == 1

    ast_biomarker = await db_session.scalar(
        select(models.Biomarker).where(models.Biomarker.slug == slugify_identifier_pl("AST"))
    )
    assert ast_biomarker is not None

    updated_link = await db_session.scalar(
        select(models.ItemBiomarker).where(
            models.ItemBiomarker.item_id == stored_item_id,
            models.ItemBiomarker.biomarker_id == ast_biomarker.id,
        )
    )
    assert updated_link is not None

    updated_snapshot = await db_session.scalar(
        select(models.PriceSnapshot).where(
            models.PriceSnapshot.institution_id == 1135,
            models.PriceSnapshot.item_id == stored_item_id,
            models.PriceSnapshot.snap_date == fetched_at.date(),
        )
    )
    assert updated_snapshot is not None
    assert updated_snapshot.price_now_grosz == 1200
    assert updated_snapshot.price_min30_grosz == 900


@pytest.mark.asyncio
async def test_upsert_catalog_reuses_existing_biomarker_on_elab_conflict(
    db_session,
) -> None:
    repo = CatalogRepository(db_session)
    await db_session.execute(
        models.Institution.__table__.insert().values(
            {"id": 1135, "name": "Default / Lab office"}
        )
    )
    existing = models.Biomarker(
        slug="ppj-ana2-met-iif-typ-swiecenia-miano-dsdna-ama",
        name="Existing ANA",
        elab_code="601",
    )
    db_session.add(existing)
    await db_session.flush()

    fetched_at = datetime(2025, 1, 1, tzinfo=UTC)
    item = RawDiagItem(
        external_id="diag-601",
        kind="single",
        name="ANA1 - PPJ met. IIF (typ swiecenia, miano)",
        slug="ana1-ppj-met-iif-typ-swiecenia-miano",
        price_now_grosz=1000,
        price_min30_grosz=900,
        currency="PLN",
        is_available=True,
        biomarkers=[
            RawDiagBiomarker(
                external_id="ana1",
                name="ANA1 - PPJ met. IIF (typ swiecenia, miano)",
                elab_code="601",
                slug="ana1-ppj-met-iif-typ-swiecenia-miano",
            )
        ],
        sale_price_grosz=None,
        regular_price_grosz=1000,
    )

    await repo.upsert_catalog(1135, singles=[item], packages=[], fetched_at=fetched_at)
    await db_session.commit()
    db_session.expire_all()

    stored = await db_session.scalar(
        select(models.Biomarker).where(models.Biomarker.elab_code == "601")
    )
    assert stored is not None
    assert stored.slug == existing.slug
    assert stored.name == existing.name

    stored_item = await db_session.scalar(
        select(models.Item).where(models.Item.external_id == "diag-601")
    )
    assert stored_item is not None
    link = await db_session.scalar(
        select(models.ItemBiomarker).where(
            models.ItemBiomarker.item_id == stored_item.id,
            models.ItemBiomarker.biomarker_id == stored.id,
        )
    )
    assert link is not None


@pytest.mark.asyncio
async def test_prune_missing_offers_marks_unavailable(db_session) -> None:
    repo = CatalogRepository(db_session)
    await db_session.execute(
        models.Institution.__table__.insert().values(
            [
                {"id": 1135, "name": "Default / Lab office"},
                {"id": 2222, "name": "Office 2222"},
            ]
        )
    )
    fetched_at = datetime(2025, 1, 1, tzinfo=UTC)
    item_a = RawDiagItem(
        external_id="diag-1",
        kind="single",
        name="ALT",
        slug="alt",
        price_now_grosz=1000,
        price_min30_grosz=900,
        currency="PLN",
        is_available=True,
        biomarkers=[
            RawDiagBiomarker(
                external_id="alt",
                name="ALT",
                elab_code="ALT",
                slug="alt",
            )
        ],
        sale_price_grosz=None,
        regular_price_grosz=1000,
    )
    item_b = RawDiagItem(
        external_id="diag-2",
        kind="single",
        name="AST",
        slug="ast",
        price_now_grosz=1200,
        price_min30_grosz=1100,
        currency="PLN",
        is_available=True,
        biomarkers=[
            RawDiagBiomarker(
                external_id="ast",
                name="AST",
                elab_code="AST",
                slug="ast",
            )
        ],
        sale_price_grosz=None,
        regular_price_grosz=1200,
    )

    await repo.upsert_catalog(1135, singles=[item_a, item_b], packages=[], fetched_at=fetched_at)
    await repo.upsert_catalog(2222, singles=[item_b], packages=[], fetched_at=fetched_at)
    await db_session.commit()

    await repo.prune_missing_offers(1135, ["diag-1"])
    await db_session.commit()
    db_session.expire_all()

    items = await db_session.scalars(select(models.Item.external_id))
    assert set(items.all()) == {"diag-1", "diag-2"}

    item_b_id = await db_session.scalar(
        select(models.Item.id).where(models.Item.external_id == "diag-2")
    )
    inst_b_1135 = await db_session.scalar(
        select(models.InstitutionItem).where(
            models.InstitutionItem.institution_id == 1135,
            models.InstitutionItem.item_id == item_b_id,
        )
    )
    assert inst_b_1135 is not None
    assert inst_b_1135.is_available is False

    inst_b_2222 = await db_session.scalar(
        select(models.InstitutionItem).where(
            models.InstitutionItem.institution_id == 2222,
            models.InstitutionItem.item_id == item_b_id,
        )
    )
    assert inst_b_2222 is not None
    assert inst_b_2222.is_available is True


@pytest.mark.asyncio
async def test_prune_missing_offers_noops_on_empty_list(db_session) -> None:
    repo = CatalogRepository(db_session)
    await db_session.execute(
        models.Institution.__table__.insert().values(
            {"id": 1135, "name": "Default / Lab office"}
        )
    )
    fetched_at = datetime(2025, 1, 1, tzinfo=UTC)
    item = RawDiagItem(
        external_id="diag-1",
        kind="single",
        name="ALT",
        slug="alt",
        price_now_grosz=1000,
        price_min30_grosz=900,
        currency="PLN",
        is_available=True,
        biomarkers=[
            RawDiagBiomarker(
                external_id="alt",
                name="ALT",
                elab_code="ALT",
                slug="alt",
            )
        ],
        sale_price_grosz=None,
        regular_price_grosz=1000,
    )

    await repo.upsert_catalog(1135, singles=[item], packages=[], fetched_at=fetched_at)
    await db_session.commit()

    await repo.prune_missing_offers(1135, [])
    await db_session.commit()
    db_session.expire_all()

    item_count = await db_session.scalar(select(func.count()).select_from(models.Item))
    assert item_count == 1
    institution_item = await db_session.scalar(
        select(models.InstitutionItem).where(models.InstitutionItem.institution_id == 1135)
    )
    assert institution_item is not None
    assert institution_item.is_available is True
