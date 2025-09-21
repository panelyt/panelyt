from __future__ import annotations

from fastapi import APIRouter

from panelyt_api.api import catalog, health, optimize

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(optimize.router, tags=["optimize"])
