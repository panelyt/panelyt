from __future__ import annotations

from dataclasses import dataclass

import pytest
from sqlalchemy import insert

from panelyt_api.db import models
from panelyt_api.services.biomarker_resolver import BiomarkerResolver


@dataclass(slots=True)
class StubEntry:
    code: str


@pytest.mark.asyncio
async def test_resolver_resolves_by_elab_slug_and_alias(db_session) -> None:
    biomarker_id = await db_session.scalar(
        insert(models.Biomarker)
        .values({
            "name": "Alanine aminotransferase",
            "elab_code": "ALT",
            "slug": "alt",
        })
        .returning(models.Biomarker.id)
    )
    await db_session.execute(
        insert(models.BiomarkerAlias).values({
            "biomarker_id": biomarker_id,
            "alias": "Alt legacy",
            "alias_type": "common",
            "priority": 1,
        })
    )
    await db_session.commit()

    resolver = BiomarkerResolver(db_session)
    resolved, unresolved = await resolver.resolve_tokens(
        ["ALT", "alt", "Alt legacy", "missing"]
    )

    assert unresolved == ["missing"]
    assert {entry.id for entry in resolved} == {biomarker_id}
    assert {entry.original for entry in resolved} == {"ALT", "alt", "Alt legacy"}
    assert {entry.display_name for entry in resolved} == {"Alanine aminotransferase"}


@pytest.mark.asyncio
async def test_resolver_builds_entry_mapping(db_session) -> None:
    biomarker_id = await db_session.scalar(
        insert(models.Biomarker)
        .values({
            "name": "C reactive protein",
            "elab_code": "CRP",
            "slug": "crp",
        })
        .returning(models.Biomarker.id)
    )
    await db_session.execute(
        insert(models.BiomarkerAlias).values({
            "biomarker_id": biomarker_id,
            "alias": "C-reactive protein",
            "alias_type": "common",
            "priority": 1,
        })
    )
    await db_session.commit()

    resolver = BiomarkerResolver(db_session)
    entries = [StubEntry(code="C-reactive protein"), StubEntry(code="missing")]
    mapping = await resolver.resolve_for_list_entries(entries)

    assert mapping == {"c-reactive protein": biomarker_id}
