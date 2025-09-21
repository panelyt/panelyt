from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from panelyt_api.api.deps import SessionDep

router = APIRouter()


@router.get("/healthz", summary="Liveness probe")
async def healthcheck(session: SessionDep) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.get("/health", summary="Health check for Docker")
async def health(session: SessionDep) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}
