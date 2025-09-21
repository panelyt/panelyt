from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from panelyt_api.api.router import api_router
from panelyt_api.core.settings import get_settings
from panelyt_api.services.lifecycle import LifecyleManager

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    lifecycle = LifecyleManager()
    await lifecycle.startup()
    try:
        yield
    finally:
        await lifecycle.shutdown()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Panelyt API", version="0.1.0", lifespan=lifespan)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(api_router)
    return app


app = create_app()
