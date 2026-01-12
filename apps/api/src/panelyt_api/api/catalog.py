from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from panelyt_api.api.deps import SessionDep
from panelyt_api.core.cache import record_user_activity_debounced
from panelyt_api.core.settings import get_settings
from panelyt_api.ingest.repository import CatalogRepository
from panelyt_api.ingest.service import IngestionService
from panelyt_api.schemas.common import (
    BiomarkerSearchResponse,
    CatalogMeta,
    CatalogSearchResponse,
)
from panelyt_api.services import catalog
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID

router = APIRouter()


@router.get("/meta", response_model=CatalogMeta)
async def get_meta(session: SessionDep) -> CatalogMeta:
    repo = CatalogRepository(session)
    await record_user_activity_debounced(repo, datetime.now(UTC))
    ingestion_service = IngestionService(get_settings())
    await ingestion_service.ensure_fresh_data(
        DEFAULT_INSTITUTION_ID, background=True
    )
    return await catalog.get_catalog_meta_cached(session)


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
    repo = CatalogRepository(session)
    await record_user_activity_debounced(repo, datetime.now(UTC))
    return await catalog.search_biomarkers(session, query)


@router.get("/search", response_model=CatalogSearchResponse)
async def search_catalog_endpoint(
    query: Annotated[
        str,
        Query(
            ...,
            min_length=1,
            description="Search biomarkers and curated templates",
        ),
    ],
    session: SessionDep,
) -> CatalogSearchResponse:
    repo = CatalogRepository(session)
    await record_user_activity_debounced(repo, datetime.now(UTC))
    return await catalog.search_catalog(session, query)
