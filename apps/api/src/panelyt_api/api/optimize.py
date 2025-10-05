from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter

from panelyt_api.api.deps import SessionDep
from panelyt_api.core.settings import get_settings
from panelyt_api.ingest.repository import IngestionRepository
from panelyt_api.ingest.service import IngestionService
from panelyt_api.optimization.service import OptimizationService
from panelyt_api.schemas.optimize import OptimizeRequest, OptimizeResponse

router = APIRouter()


@router.post("/optimize", response_model=OptimizeResponse)
async def optimize(
    payload: OptimizeRequest,
    session: SessionDep,
) -> OptimizeResponse:
    repo = IngestionRepository(session)
    await repo.record_user_activity(datetime.now(UTC))
    ingestion_service = IngestionService(get_settings())
    await ingestion_service.ensure_fresh_data()
    optimizer = OptimizationService(session)
    return await optimizer.solve(payload)
