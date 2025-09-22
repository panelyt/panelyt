from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from panelyt_api.core.settings import Settings
from panelyt_api.db.session import get_session
from panelyt_api.ingest.client import DiagClient
from panelyt_api.ingest.repository import IngestionRepository
from panelyt_api.ingest.types import RawProduct

logger = logging.getLogger(__name__)


class IngestionService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def ensure_fresh_data(self) -> None:
        now_utc = datetime.now(UTC)
        async with get_session() as session:
            repo = IngestionRepository(session)
            latest_fetch = await repo.latest_fetched_at()
            latest_snapshot = await repo.latest_snapshot_date()

        tz = ZoneInfo(self._settings.timezone)
        today = datetime.now(tz=tz).date()
        stale_threshold = now_utc - timedelta(
            hours=self._settings.ingestion_staleness_threshold_hours
        )

        needs_snapshot = latest_snapshot != today
        is_stale = latest_fetch is None or latest_fetch < stale_threshold

        if needs_snapshot or is_stale:
            logger.info(
                "Ingestion required: needs_snapshot=%s is_stale=%s", needs_snapshot, is_stale
            )
            await self.run(reason="staleness_check")

    async def run(self, scheduled: bool = False, reason: str | None = None) -> None:
        logger.info("Starting ingestion run (scheduled=%s reason=%s)", scheduled, reason)

        if scheduled and await self._should_skip_scheduled_run():
            logger.info("Skipping scheduled ingestion; already fresh for active users")
            return

        now_utc = datetime.now(UTC)

        async with self._ingestion_session() as repo:
            log_id = await repo.create_run_log(started_at=now_utc, reason=reason or "manual")
            try:
                client = DiagClient()
                try:
                    results = await client.fetch_all()
                finally:
                    await client.close()

                combined: list[RawProduct] = []
                for result in results:
                    combined.extend(result.items)
                    if result.raw_payload:
                        await repo.write_raw_snapshot(result.source, result.raw_payload)

                if not combined:
                    logger.warning("Ingestion returned no products")

                await repo.upsert_catalog(combined, fetched_at=now_utc)
                await repo.prune_snapshots(now_utc.date())
                await repo.finalize_run_log(log_id, status="completed")
            except Exception as exc:
                await repo.finalize_run_log(log_id, status="failed", note=str(exc)[:500])
                logger.exception("Ingestion failed: %s", exc)
                raise

    async def _should_skip_scheduled_run(self) -> bool:
        tz = ZoneInfo(self._settings.timezone)
        now_local = datetime.now(tz=tz)
        async with get_session() as session:
            repo = IngestionRepository(session)
            last_activity = await repo.last_user_activity()
            latest_snapshot = await repo.latest_snapshot_date()

        window = timedelta(hours=self._settings.ingestion_user_activity_window_hours)
        inactivity = True
        if last_activity is not None:
            inactivity = (
                now_local.astimezone(UTC)
                - last_activity.astimezone(UTC)
            ) > window

        has_today_snapshot = latest_snapshot == now_local.date()
        return inactivity and has_today_snapshot

    @asynccontextmanager
    async def _ingestion_session(self) -> AsyncGenerator[IngestionRepository, None]:
        async with get_session() as session:
            repo = IngestionRepository(session)
            yield repo
