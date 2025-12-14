from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from panelyt_api.api.deps import SessionDep
from panelyt_api.core.cache import user_activity_debouncer
from panelyt_api.core.settings import get_settings
from panelyt_api.ingest.repository import IngestionRepository
from panelyt_api.ingest.service import IngestionService
from panelyt_api.schemas.common import (
    BiomarkerSearchResponse,
    CatalogMeta,
    CatalogSearchResponse,
)
from panelyt_api.services import catalog

router = APIRouter()


async def record_user_activity_debounced(
    repo: IngestionRepository, timestamp: datetime
) -> None:
    """Record user activity with debouncing to reduce DB writes."""
    if user_activity_debouncer.should_record():
        await repo.record_user_activity(timestamp)
        user_activity_debouncer.mark_recorded()


@router.get("/meta", response_model=CatalogMeta)
async def get_meta(session: SessionDep) -> CatalogMeta:
    repo = IngestionRepository(session)
    await record_user_activity_debounced(repo, datetime.now(UTC))
    ingestion_service = IngestionService(get_settings())
    await ingestion_service.ensure_fresh_data(background=True)
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
    repo = IngestionRepository(session)
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
    repo = IngestionRepository(session)
    await record_user_activity_debounced(repo, datetime.now(UTC))
    return await catalog.search_catalog(session, query)
