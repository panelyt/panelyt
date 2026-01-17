from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import pytest
import respx
from sqlalchemy import select

from panelyt_api.db import models
from panelyt_api.ingest import client as diag_client
from panelyt_api.ingest.client import DiagClient
from panelyt_api.ingest.service import IngestionService
from panelyt_api.services import catalog
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID, InstitutionService


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "ingest"


def _load_fixture(name: str) -> dict:
    payload = (FIXTURE_DIR / name).read_text(encoding="utf-8")
    return json.loads(payload)


@respx.mock
@pytest.mark.asyncio
async def test_ingestion_e2e_with_fixtures(db_session, test_settings, monkeypatch) -> None:
    packages_payload = _load_fixture("diag_packages_page1.json")
    singles_payload = _load_fixture("diag_singles_page1.json")
    institution_payload = _load_fixture("diag_institution_detail.json")

    def products_handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        if params.get("filter[type]") == "package,shop-package":
            return httpx.Response(200, json=packages_payload)
        if params.get("filter[type]") == "bloodtest":
            return httpx.Response(200, json=singles_payload)
        raise AssertionError(f"Unexpected products query: {params}")

    respx.get(diag_client._DIAG_BASE_URL).mock(side_effect=products_handler)
    respx.get(
        f"{diag_client._DIAG_INSTITUTION_DETAIL_URL}/{DEFAULT_INSTITUTION_ID}"
    ).mock(return_value=httpx.Response(200, json=institution_payload))

    @asynccontextmanager
    async def _session_override():
        try:
            yield db_session
            await db_session.commit()
        except Exception:
            await db_session.rollback()
            raise

    monkeypatch.setattr("panelyt_api.ingest.service.get_session", _session_override)

    client = DiagClient(httpx.AsyncClient())
    institution = await client.get_institution(DEFAULT_INSTITUTION_ID)
    await client.close()
    assert institution is not None
    service = InstitutionService(db_session)
    await service.upsert_institution(institution)
    await db_session.commit()

    ingestion = IngestionService(test_settings)
    await ingestion.run(reason="fixture", institution_id=DEFAULT_INSTITUTION_ID)

    items = (await db_session.execute(select(models.Item))).scalars().all()
    biomarkers = (await db_session.execute(select(models.Biomarker))).scalars().all()
    offers = (await db_session.execute(select(models.InstitutionItem))).scalars().all()
    snapshots = (await db_session.execute(select(models.PriceSnapshot))).scalars().all()
    raw_snapshots = (await db_session.execute(select(models.RawSnapshot))).scalars().all()

    assert len(items) == 3
    assert len(biomarkers) == 2
    assert len(offers) == 3
    assert len(snapshots) == 3
    assert len(raw_snapshots) == 1

    meta = await catalog.get_catalog_meta(db_session)
    assert meta.item_count == 3
    assert meta.biomarker_count == 2
    assert meta.latest_fetched_at is not None
    assert meta.percent_with_today_snapshot == 100.0
