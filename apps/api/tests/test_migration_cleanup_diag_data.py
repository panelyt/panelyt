from __future__ import annotations

from datetime import UTC, datetime
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from sqlalchemy import select

from panelyt_api.db import models


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "2026010900002_cleanup_diag_data.py"
)


def _load_migration_module():
    spec = spec_from_file_location("cleanup_diag_data", MIGRATION_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to load cleanup migration module")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def test_cleanup_migration_prunes_orphans_and_non_diag_snapshots(db_session):
    module = _load_migration_module()

    user = models.UserAccount(id="user-1")
    saved_list = models.SavedList(id="list-1", user_id=user.id, name="Main list")
    template = models.BiomarkerListTemplate(
        id=1,
        slug="base",
        name_en="Base",
        name_pl="Baza",
        description_en=None,
        description_pl=None,
    )

    biomarker_item = models.Biomarker(id=1, name="Item BM", slug="item-bm", elab_code="I1")
    biomarker_saved = models.Biomarker(id=2, name="Saved BM", slug="saved-bm", elab_code="S1")
    biomarker_template = models.Biomarker(
        id=3, name="Template BM", slug="template-bm", elab_code="T1"
    )
    biomarker_orphan = models.Biomarker(id=4, name="Orphan", slug="orphan", elab_code="O1")

    item = models.Item(
        id=10,
        external_id="10",
        kind="single",
        name="Item",
        slug="item",
        is_available=True,
        currency="PLN",
        price_now_grosz=100,
        price_min30_grosz=100,
        fetched_at=datetime.now(UTC),
    )

    item_biomarker = models.ItemBiomarker(item_id=item.id, biomarker_id=biomarker_item.id)
    saved_entry = models.SavedListEntry(
        id="entry-1",
        list_id=saved_list.id,
        biomarker_id=biomarker_saved.id,
        code="S1",
        display_name="Saved BM",
    )
    template_entry = models.BiomarkerListTemplateEntry(
        template_id=template.id,
        biomarker_id=biomarker_template.id,
        code="T1",
        display_name="Template BM",
        sort_order=0,
    )

    raw_other = models.RawSnapshot(source="otherlab:catalog", payload={"source": "other"})
    raw_diag = models.RawSnapshot(source="diag:catalog", payload={"source": "diag"})

    db_session.add_all(
        [
            user,
            saved_list,
            template,
            biomarker_item,
            biomarker_saved,
            biomarker_template,
            biomarker_orphan,
            item,
            item_biomarker,
            saved_entry,
            template_entry,
            raw_other,
            raw_diag,
        ]
    )
    await db_session.commit()

    await db_session.run_sync(module._delete_non_diag_raw_snapshots)
    await db_session.run_sync(module._delete_orphan_biomarkers)
    await db_session.commit()

    remaining_ids = set(
        (await db_session.scalars(select(models.Biomarker.id))).all()
    )
    assert biomarker_orphan.id not in remaining_ids
    assert biomarker_item.id in remaining_ids
    assert biomarker_saved.id in remaining_ids
    assert biomarker_template.id in remaining_ids

    remaining_sources = set(
        (await db_session.scalars(select(models.RawSnapshot.source))).all()
    )
    assert remaining_sources == {"diag:catalog"}
