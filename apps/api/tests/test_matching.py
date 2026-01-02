from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import event, insert, select

from panelyt_api.db import models
from panelyt_api.matching import (
    MatchingSynchronizer,
    apply_matching_if_needed,
    config_hash,
    load_config,
    suggest_lab_matches,
)
from panelyt_api.matching.config import BiomarkerConfig, LabMatchConfig, MatchingConfig


class QueryCounter:
    def __init__(self, engine):
        self.count = 0
        self._engine = engine

    def __enter__(self):
        event.listen(self._engine, "before_cursor_execute", self._increment)
        return self

    def __exit__(self, exc_type, exc, tb):
        event.remove(self._engine, "before_cursor_execute", self._increment)

    def _increment(self, *args, **kwargs):
        self.count += 1


@pytest.mark.asyncio
async def test_matching_synchronizer_applies_config(db_session):
    await _seed_labs(db_session)

    # Seed lab biomarkers for diag and alab
    await db_session.execute(
        models.LabBiomarker.__table__.insert(),
        [
            {
                "lab_id": 1,
                "external_id": "605348821",
                "slug": "albumina",
                "name": "Albumina",
                "is_active": True,
            },
            {
                "lab_id": 2,
                "external_id": "1975726",
                "slug": "albumina-w-surowicy-i09",
                "name": "Albumina",
                "is_active": True,
            },
        ],
    )

    config = load_config()
    synchronizer = MatchingSynchronizer(db_session, config)
    await synchronizer.apply()

    biomarker_rows = (
        await db_session.execute(select(models.Biomarker.name, models.Biomarker.slug))
    ).all()
    assert any(row.slug == "albumina" for row in biomarker_rows)

    match_rows = (
        await db_session.execute(select(models.BiomarkerMatch.lab_biomarker_id))
    ).all()
    assert len(match_rows) == 2


@pytest.mark.asyncio
async def test_matching_synchronizer_falls_back_to_slug_when_id_mismatch(db_session):
    await _seed_labs(db_session)

    await db_session.execute(
        models.LabBiomarker.__table__.insert(),
        {
            "lab_id": 2,
            "external_id": "19213914",
            "slug": "testosteron-wolny-o41",
            "name": "Testosteron wolny",
            "is_active": True,
        },
    )

    config = MatchingConfig(
        biomarkers=[
            BiomarkerConfig(
                code="testosteron-wolny",
                name="Testosteron wolny",
                slug="testosteron-wolny",
                labs={
                    "alab": [
                        LabMatchConfig(id="1976070", slug="testosteron-wolny-o41"),
                    ],
                },
            )
        ]
    )
    synchronizer = MatchingSynchronizer(db_session, config)
    await synchronizer.apply()

    match_id = await db_session.scalar(
        select(models.BiomarkerMatch.id)
        .join(
            models.LabBiomarker,
            models.BiomarkerMatch.lab_biomarker_id == models.LabBiomarker.id,
        )
        .where(models.LabBiomarker.external_id == "19213914")
    )

    assert match_id is not None


@pytest.mark.asyncio
async def test_matching_synchronizer_matches_alias_slug(db_session):
    await _seed_labs(db_session)

    await db_session.execute(
        models.LabBiomarker.__table__.insert(),
        {
            "lab_id": 2,
            "external_id": "vit-d3",
            "slug": "witamina-d3",
            "name": "Witamina D3",
            "is_active": True,
        },
    )

    config = MatchingConfig(
        biomarkers=[
            BiomarkerConfig(
                code="witamina-d-25oh",
                name="Witamina D3 25(OH)",
                slug="witamina-d-25oh",
                aliases=["Witamina D3"],
                labs={
                    "alab": [LabMatchConfig(id="1976655", slug="witamina-d-25oh")],
                },
            )
        ]
    )

    synchronizer = MatchingSynchronizer(db_session, config)
    await synchronizer.apply()

    match_id = await db_session.scalar(
        select(models.BiomarkerMatch.id)
        .join(
            models.LabBiomarker,
            models.BiomarkerMatch.lab_biomarker_id == models.LabBiomarker.id,
        )
        .where(models.LabBiomarker.slug == "witamina-d3")
    )

    assert match_id is not None


@pytest.mark.asyncio
async def test_matching_synchronizer_merges_replacements(db_session):
    await _seed_labs(db_session)

    await db_session.execute(
        models.LabBiomarker.__table__.insert(),
        [
            {
                "lab_id": 1,
                "external_id": "605348976",
                "slug": "hemoglobina-glikowana-met-hplc",
                "name": "Hemoglobina glikowana (HbA1c)",
                "is_active": True,
            },
            {
                "lab_id": 1,
                "external_id": "605359535",
                "slug": "hemoglobina-glikowana",
                "name": "Hemoglobina glikowana",
                "is_active": True,
            },
            {
                "lab_id": 2,
                "external_id": "1976197",
                "slug": "hemoglobina-glikowana-hba1c-l55",
                "name": "Hemoglobina glikowana (HbA1c)",
                "is_active": True,
            },
        ],
    )

    primary_id = await db_session.scalar(
        insert(models.Biomarker)
        .values(slug="hemoglobina-glikowana", name="Hemoglobina glikowana")
        .returning(models.Biomarker.id)
    )
    await db_session.execute(
        models.BiomarkerAlias.__table__.insert(),
        {
            "biomarker_id": primary_id,
            "alias": "HbA1c stary",
            "alias_type": "legacy",
            "priority": 1,
        },
    )
    await db_session.execute(
        insert(models.Biomarker)
        .values(slug="hemoglobina-glikowana-met-hplc", name="HbA1c HPLC")
    )

    user_id = str(uuid4())
    await db_session.execute(models.UserAccount.__table__.insert(), {"id": user_id})
    list_id = str(uuid4())
    await db_session.execute(
        models.SavedList.__table__.insert(),
        {
            "id": list_id,
            "user_id": user_id,
            "name": "Test list",
        },
    )
    await db_session.execute(
        models.SavedListEntry.__table__.insert(),
        {
            "id": str(uuid4()),
            "list_id": list_id,
            "biomarker_id": primary_id,
            "code": "hemoglobina-glikowana",
            "display_name": "Hemoglobina glikowana",
        },
    )

    await db_session.flush()

    config = MatchingConfig(
        biomarkers=[
            BiomarkerConfig(
                code="hba1c",
                name="Hemoglobina glikowana (HbA1c)",
                slug="hba1c",
                aliases=["Hemoglobina glikowana"],
                labs={
                    "diag": [
                        LabMatchConfig(id="605348976"),
                        LabMatchConfig(id="605359535"),
                    ],
                    "alab": [LabMatchConfig(id="1976197")],
                },
                replaces=[
                    "hemoglobina-glikowana",
                    "hemoglobina-glikowana-met-hplc",
                ],
            )
        ]
    )
    synchronizer = MatchingSynchronizer(db_session, config)
    await synchronizer.apply()
    await db_session.flush()

    merged = await db_session.scalar(
        select(models.Biomarker).where(models.Biomarker.slug == "hba1c")
    )
    assert merged is not None

    entry_target = await db_session.scalar(
        select(models.SavedListEntry.biomarker_id).where(
            models.SavedListEntry.list_id == list_id
        )
    )
    assert entry_target == merged.id

    remaining_slugs = {
        slug for (slug,) in (await db_session.execute(select(models.Biomarker.slug))).all()
    }
    assert "hemoglobina-glikowana" not in remaining_slugs
    assert "hemoglobina-glikowana-met-hplc" not in remaining_slugs


@pytest.mark.asyncio
async def test_apply_matching_skips_when_hash_unchanged(db_session, tmp_path):
    await _seed_labs(db_session)

    await db_session.execute(
        models.LabBiomarker.__table__.insert(),
        [
            {
                "lab_id": 1,
                "external_id": "diag-1",
                "slug": "alt",
                "name": "ALT",
                "is_active": True,
            },
            {
                "lab_id": 2,
                "external_id": "alab-1",
                "slug": "alt",
                "name": "ALT",
                "is_active": True,
            },
        ],
    )
    await db_session.commit()

    config_path = tmp_path / "biomarkers.yaml"
    config_path.write_text(
        "\n".join(
            [
                "version: 1",
                "biomarkers:",
                "  - code: ALT",
                "    name: ALT",
                "    slug: alt",
                "    labs:",
                "      diag:",
                "        - id: diag-1",
                "      alab:",
                "        - id: alab-1",
            ]
        ),
        encoding="utf-8",
    )

    config = load_config(config_path)
    config_digest = config_hash(config_path)

    applied_first = await apply_matching_if_needed(db_session, config, config_digest)
    applied_second = await apply_matching_if_needed(db_session, config, config_digest)

    assert applied_first is True
    assert applied_second is False
    stored_hash = await db_session.scalar(
        select(models.AppSetting.value).where(
            models.AppSetting.name == "matching_config_hash"
        )
    )
    assert stored_hash == config_digest


@pytest.mark.asyncio
async def test_matching_synchronizer_bulkifies_queries(db_session):
    await _seed_labs(db_session)

    biomarker_configs = []
    lab_biomarkers = []
    for index in range(20):
        code = f"bio-{index}"
        slug = f"bio-{index}"
        biomarker_configs.append(
            BiomarkerConfig(
                code=code,
                name=f"Biomarker {index}",
                slug=slug,
                labs={
                    "diag": [LabMatchConfig(id=f"diag-{index}")],
                    "alab": [LabMatchConfig(id=f"alab-{index}")],
                },
            )
        )
        lab_biomarkers.extend(
            [
                {
                    "lab_id": 1,
                    "external_id": f"diag-{index}",
                    "slug": slug,
                    "name": f"Biomarker {index}",
                    "is_active": True,
                },
                {
                    "lab_id": 2,
                    "external_id": f"alab-{index}",
                    "slug": slug,
                    "name": f"Biomarker {index}",
                    "is_active": True,
                },
            ]
        )

    await db_session.execute(models.LabBiomarker.__table__.insert(), lab_biomarkers)
    await db_session.commit()

    config = MatchingConfig(biomarkers=biomarker_configs)
    synchronizer = MatchingSynchronizer(db_session, config)
    engine = db_session.get_bind()
    sync_engine = getattr(engine, "sync_engine", engine)

    with QueryCounter(sync_engine) as counter:
        await synchronizer.apply()

    assert counter.count <= 60


@pytest.mark.asyncio
async def test_suggest_lab_matches_returns_candidates(db_session):
    await _seed_labs(db_session)

    await db_session.execute(
        models.LabBiomarker.__table__.insert(),
        [
            {
                "lab_id": 1,
                "external_id": "605348821",
                "slug": "albumina",
                "name": "Albumina",
                "is_active": True,
            },
            {
                "lab_id": 2,
                "external_id": "1975726",
                "slug": "albumina-w-surowicy-i09",
                "name": "Albumina",
                "is_active": True,
            },
        ],
    )

    config = load_config()
    synchronizer = MatchingSynchronizer(db_session, config)
    await synchronizer.apply()

    # Add an unmatched biomarker for suggestion
    await db_session.execute(
        models.LabBiomarker.__table__.insert(),
        {
            "lab_id": 2,
            "external_id": "999999",
            "slug": "albumina-inna",
            "name": "Albumina inna",
            "is_active": True,
        },
    )

    suggestions = await suggest_lab_matches(db_session, "alab", limit=3)
    assert suggestions
    first = suggestions[0]
    assert first["lab_name"]
    assert first["candidates"]


async def _seed_labs(session):
    existing = await session.scalar(select(models.Lab.id))
    if existing:
        return
    await session.execute(
        models.Lab.__table__.insert(),
        [
            {
                "id": 1,
                "code": "diag",
                "name": "Diagnostyka",
                "slug": "diag",
                "timezone": "Europe/Warsaw",
            },
            {
                "id": 2,
                "code": "alab",
                "name": "ALAB",
                "slug": "alab",
                "timezone": "Europe/Warsaw",
            },
        ],
    )
