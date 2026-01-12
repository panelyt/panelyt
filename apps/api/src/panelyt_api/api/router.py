from __future__ import annotations

from fastapi import APIRouter

from panelyt_api.api import (
    account,
    biomarker_lists,
    catalog,
    health,
    institutions,
    optimize,
    saved_lists,
    telegram,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(optimize.router, tags=["optimize"])
api_router.include_router(institutions.router, tags=["institutions"])
api_router.include_router(users.router)
api_router.include_router(account.router)
api_router.include_router(saved_lists.router)
api_router.include_router(biomarker_lists.router)
api_router.include_router(biomarker_lists.admin_router)
api_router.include_router(telegram.router)
