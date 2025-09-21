from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from panelyt_api.core.settings import Settings
from panelyt_api.ingest.service import IngestionService

logger = logging.getLogger(__name__)


class IngestionScheduler:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._scheduler = AsyncIOScheduler(timezone=settings.timezone)
        self._ingestion_service = IngestionService(settings)
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        logger.info("Starting APScheduler")
        self._scheduler.add_job(
            self._run_ingestion,
            CronTrigger(hour=3, minute=15, jitter=600, timezone=self._settings.timezone),
            id="daily_ingestion",
            replace_existing=True,
        )
        self._scheduler.start()

    async def stop(self) -> None:
        logger.info("Stopping APScheduler")
        self._scheduler.shutdown(wait=False)

    async def trigger_now(self) -> None:
        await self._run_ingestion()

    async def _run_ingestion(self) -> None:
        if self._lock.locked():
            logger.info("Ingestion already running; skipping new trigger")
            return
        async with self._lock:
            logger.info("Running scheduled ingestion at %s", datetime.utcnow().isoformat())
            await self._ingestion_service.run(scheduled=True, reason="scheduled")
