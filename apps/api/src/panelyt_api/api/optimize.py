from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from panelyt_api.api.deps import SessionDep, SessionStateDep
from panelyt_api.core.cache import record_user_activity_debounced
from panelyt_api.core.settings import get_settings
from panelyt_api.ingest.repository import CatalogRepository
from panelyt_api.ingest.service import IngestionService
from panelyt_api.optimization.service import OptimizationService
from panelyt_api.schemas.optimize import (
    AddonSuggestionsRequest,
    AddonSuggestionsResponse,
    OptimizeRequest,
    OptimizeResponse,
)
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID

router = APIRouter()


@router.post("/optimize", response_model=OptimizeResponse)
async def optimize(
    payload: OptimizeRequest,
    session: SessionDep,
    session_state: SessionStateDep,
    institution: Annotated[
        int | None, Query(ge=1, description="Institution (office) id")
    ] = None,
) -> OptimizeResponse:
    institution_id = (
        institution
        or session_state.user.preferred_institution_id
        or DEFAULT_INSTITUTION_ID
    )
    repo = CatalogRepository(session)
    await record_user_activity_debounced(repo, datetime.now(UTC))
    ingestion_service = IngestionService(get_settings())
    await ingestion_service.ensure_fresh_data(institution_id)
    optimizer = OptimizationService(session)
    return await optimizer.solve_cached(payload, institution_id)


@router.post("/optimize/addons", response_model=AddonSuggestionsResponse)
async def optimize_addons(
    payload: AddonSuggestionsRequest,
    session: SessionDep,
    session_state: SessionStateDep,
    institution: Annotated[
        int | None, Query(ge=1, description="Institution (office) id")
    ] = None,
) -> AddonSuggestionsResponse:
    """Compute addon suggestions for a given optimization solution.

    This endpoint is called after /optimize to lazily load addon suggestions,
    improving the initial response time of the optimization endpoint.
    """
    institution_id = (
        institution
        or session_state.user.preferred_institution_id
        or DEFAULT_INSTITUTION_ID
    )
    optimizer = OptimizationService(session)
    return await optimizer.compute_addons(payload, institution_id)
