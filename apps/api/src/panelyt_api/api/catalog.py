from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from panelyt_api.api.deps import SessionDep
from panelyt_api.core.settings import get_settings
from panelyt_api.ingest.service import IngestionService
from panelyt_api.schemas.common import BiomarkerSearchResponse, CatalogMeta
from panelyt_api.services import activity, catalog

router = APIRouter()


@router.get("/meta", response_model=CatalogMeta)
async def get_meta(session: SessionDep) -> CatalogMeta:
    await activity.touch_user_activity(session)
    ingestion_service = IngestionService(get_settings())
    await ingestion_service.ensure_fresh_data()
    return await catalog.get_catalog_meta(session)


@router.get("/biomarkers", response_model=BiomarkerSearchResponse)
async def search(
    query: Annotated[
        str,
        Query(
            ..., min_length=1, description="Search by biomarker name or ELAB code"
        ),
    ],
    session: SessionDep,
) -> BiomarkerSearchResponse:
    await activity.touch_user_activity(session)
    return await catalog.search_biomarkers(session, query)
