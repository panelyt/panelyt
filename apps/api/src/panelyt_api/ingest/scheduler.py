from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from panelyt_api.core.settings import Settings
from panelyt_api.db.session import get_session
from panelyt_api.ingest.service import IngestionService
from panelyt_api.services.session_cleanup import SessionCleanupService

logger = logging.getLogger(__name__)


class IngestionScheduler:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._scheduler = AsyncIOScheduler(timezone=settings.timezone)
        self._ingestion_service = IngestionService(settings)
        self._lock = asyncio.Lock()
        self._cleanup_lock = asyncio.Lock()

    async def start(self) -> None:
        logger.info("Starting APScheduler")
        self._scheduler.add_job(
            self._run_ingestion,
            CronTrigger(hour=3, minute=15, jitter=600, timezone=self._settings.timezone),
            id="daily_ingestion",
            replace_existing=True,
        )
        self._scheduler.add_job(
            self._run_session_cleanup,
            CronTrigger(hour=4, minute=30, jitter=600, timezone=self._settings.timezone),
            id="daily_session_cleanup",
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
            logger.info("Running scheduled ingestion at %s", datetime.now(UTC).isoformat())
            await self._ingestion_service.run(scheduled=True, reason="scheduled")

    async def _run_session_cleanup(self) -> None:
        if self._cleanup_lock.locked():
            logger.info("Session cleanup already running; skipping new trigger")
            return
        async with self._cleanup_lock:
            logger.info("Running session cleanup at %s", datetime.now(UTC).isoformat())
            start_time = time.perf_counter()
            async with get_session() as session:
                service = SessionCleanupService(
                    session, retention_days=self._settings.anonymous_user_retention_days
                )
                summary = await service.run()
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.info(
                "Session cleanup finished duration_ms=%s expired_sessions=%s anonymous_users=%s",
                duration_ms,
                summary.expired_sessions,
                summary.anonymous_users,
            )
