from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from panelyt_api.core.cache import clear_all_caches
from panelyt_api.core.settings import Settings
from panelyt_api.db.session import get_session
from panelyt_api.ingest.client import AlabClient, DiagClient
from panelyt_api.ingest.repository import IngestionRepository
from panelyt_api.ingest.types import LabIngestionResult
from panelyt_api.matching import MatchingConfig, MatchingSynchronizer, load_config
from panelyt_api.services.alerts import TelegramPriceAlertService

logger = logging.getLogger(__name__)


class IngestionService:
    _run_lock: asyncio.Lock = asyncio.Lock()
    _scheduled_task: asyncio.Task | None = None

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def ensure_fresh_data(self, background: bool = False) -> None:
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
            if background:
                self._schedule_background_run(reason="staleness_check")
            else:
                ran = await self._run_with_lock(reason="staleness_check", blocking=False)
                if not ran:
                    logger.info("Ingestion already running; serving existing data")

    async def run(self, scheduled: bool = False, reason: str | None = None) -> None:
        logger.info("Starting ingestion run (scheduled=%s reason=%s)", scheduled, reason)

        if scheduled and await self._should_skip_scheduled_run():
            logger.info("Skipping scheduled ingestion; already fresh for active users")
            return

        now_utc = datetime.now(UTC)

        async with self._ingestion_session() as repo:
            log_id = await repo.create_run_log(started_at=now_utc, reason=reason or "manual")
            try:
                results = await self._fetch_all_labs()

                if not any(result.items for result in results):
                    logger.warning("Ingestion returned no lab items")

                matching_config = load_config()

                for result in results:
                    await self._process_lab_result(repo, result, matching_config)

                await repo.prune_snapshots(now_utc.date())
                await repo.prune_orphan_biomarkers()
                await self._dispatch_price_alerts(repo)
                await repo.finalize_run_log(log_id, status="completed")
            except Exception as exc:
                await repo.finalize_run_log(log_id, status="failed", note=str(exc)[:500])
                logger.exception("Ingestion failed: %s", exc)
                raise
            finally:
                clear_all_caches()

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

    async def _run_with_lock(
        self,
        scheduled: bool = False,
        reason: str | None = None,
        *,
        blocking: bool = True,
    ) -> bool:
        if blocking:
            async with self._run_lock:
                await self.run(scheduled=scheduled, reason=reason)
            return True

        try:
            await asyncio.wait_for(self._run_lock.acquire(), timeout=0)
        except TimeoutError:
            return False

        try:
            await self.run(scheduled=scheduled, reason=reason)
        finally:
            self._run_lock.release()
        return True

    def _schedule_background_run(self, *, reason: str | None = None) -> None:
        if self._scheduled_task and not self._scheduled_task.done():
            logger.debug("Skipping background ingestion; task already running")
            return

        async def runner() -> None:
            try:
                await self._run_with_lock(reason=reason)
            except Exception as exc:  # pragma: no cover - logged and propagated to callback
                logger.exception("Background ingestion failed: %s", exc)
                raise

        task = asyncio.create_task(runner())

        def _cleanup(completed: asyncio.Task) -> None:
            try:
                completed.result()
            except Exception:  # pragma: no cover - already logged in runner
                pass
            finally:
                self.__class__._scheduled_task = None

        task.add_done_callback(_cleanup)
        self.__class__._scheduled_task = task

    async def _dispatch_price_alerts(self, repo: IngestionRepository) -> None:
        try:
            service = TelegramPriceAlertService(repo.session, settings=self._settings)
            await service.run()
        except Exception as exc:  # pragma: no cover - failures logged but ingestion continues
            logger.exception("Failed to deliver Telegram price alerts: %s", exc)

    async def _fetch_all_labs(self) -> list[LabIngestionResult]:
        clients: list[DiagClient | AlabClient] = [DiagClient(), AlabClient()]
        try:
            tasks = [asyncio.create_task(self._fetch_lab_catalog(client)) for client in clients]
            return await asyncio.gather(*tasks)
        finally:
            await asyncio.gather(*(client.close() for client in clients), return_exceptions=True)

    async def _fetch_lab_catalog(
        self, client: DiagClient | AlabClient
    ) -> LabIngestionResult:
        logger.info("Fetching catalog for lab %s", client.lab_code)
        lab_result = await client.fetch_all()
        logger.info(
            "Fetched %s items for lab %s", len(lab_result.items), client.lab_code
        )
        return lab_result

    async def _process_lab_result(
        self,
        repo: IngestionRepository,
        result: LabIngestionResult,
        matching_config: MatchingConfig,
    ) -> None:
        if result.raw_payload:
            await repo.write_raw_snapshot(
                source=f"{result.lab_code}:catalog",
                payload={
                    "lab": result.lab_code,
                    "fetched_at": result.fetched_at.isoformat(),
                    "payload": result.raw_payload,
                },
            )

        if not result.items:
            logger.info("Lab %s returned no items", result.lab_code)
            return

        logger.info(
            "Staging %s items for lab %s", len(result.items), result.lab_code
        )

        context = await repo.stage_lab_items(
            result.lab_code,
            result.items,
            fetched_at=result.fetched_at,
        )

        if matching_config.biomarkers:
            synchronizer = MatchingSynchronizer(repo.session, matching_config)
            await synchronizer.apply()

        await repo.synchronize_catalog(context)
