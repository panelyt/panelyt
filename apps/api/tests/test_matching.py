from __future__ import annotations

import pytest
from sqlalchemy import select

from panelyt_api.db import models
from panelyt_api.matching import MatchingSynchronizer, load_config, suggest_lab_matches


@pytest.mark.asyncio
async def test_matching_synchronizer_applies_config(db_session):
    await _seed_labs(db_session)

    # Seed lab biomarkers for diag and alab
    await db_session.execute(
        models.LabBiomarker.__table__.insert(),
        [
            {
                "lab_id": 1,
                "external_id": "alt",
                "elab_code": "ALT",
                "slug": "alt",
                "name": "ALT",
                "is_active": True,
            },
            {
                "lab_id": 2,
                "external_id": "alt",
                "elab_code": None,
                "slug": "alt",
                "name": "ALT",
                "is_active": True,
            },
        ],
    )

    config = load_config()
    synchronizer = MatchingSynchronizer(db_session, config)
    await synchronizer.apply()

    biomarker_rows = (
        await db_session.execute(select(models.Biomarker.name, models.Biomarker.elab_code))
    ).all()
    assert any(row.name.startswith("Aminotransferaza") for row in biomarker_rows)

    match_rows = (
        await db_session.execute(select(models.BiomarkerMatch.lab_biomarker_id))
    ).all()
    assert len(match_rows) == 2


@pytest.mark.asyncio
async def test_suggest_lab_matches_returns_candidates(db_session):
    await _seed_labs(db_session)

    await db_session.execute(
        models.LabBiomarker.__table__.insert(),
        [
            {
                "lab_id": 1,
                "external_id": "alt",
                "elab_code": "ALT",
                "slug": "alt",
                "name": "ALT",
                "is_active": True,
            },
            {
                "lab_id": 2,
                "external_id": "alt-test",
                "elab_code": None,
                "slug": "alt-test",
                "name": "Aminotransferaza alaninowa",
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
            "external_id": "alt-unmatched",
            "slug": "alt-unmatched",
            "name": "Alat",
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
