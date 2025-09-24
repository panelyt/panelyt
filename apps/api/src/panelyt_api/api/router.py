from __future__ import annotations

from fastapi import APIRouter

from panelyt_api.api import biomarker_lists, catalog, health, optimize, saved_lists, users

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(optimize.router, tags=["optimize"])
api_router.include_router(users.router)
api_router.include_router(saved_lists.router)
api_router.include_router(biomarker_lists.router)
api_router.include_router(biomarker_lists.admin_router)
