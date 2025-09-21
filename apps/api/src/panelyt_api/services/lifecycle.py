from __future__ import annotations

import logging

from panelyt_api.core.settings import get_settings
from panelyt_api.db.session import dispose_engine, init_engine
from panelyt_api.ingest.scheduler import IngestionScheduler

logger = logging.getLogger(__name__)


class LifecyleManager:
    def __init__(self) -> None:
        self._scheduler: IngestionScheduler | None = None

    async def startup(self) -> None:
        settings = get_settings()
        logger.info("Starting Panelyt API")
        init_engine()
        self._scheduler = IngestionScheduler(settings)
        await self._scheduler.start()

    async def shutdown(self) -> None:
        logger.info("Shutting down Panelyt API")
        if self._scheduler:
            await self._scheduler.stop()
            self._scheduler = None
        await dispose_engine()
