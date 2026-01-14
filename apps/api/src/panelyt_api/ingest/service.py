from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from panelyt_api.core import metrics
from panelyt_api.core.cache import clear_all_caches, freshness_cache
from panelyt_api.core.diag import DIAG_CODE
from panelyt_api.core.settings import Settings
from panelyt_api.db.session import get_session
from panelyt_api.ingest.client import DiagClient
from panelyt_api.ingest.repository import CatalogRepository
from panelyt_api.ingest.types import DiagIngestionResult
from panelyt_api.services.alerts import TelegramPriceAlertService
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID, InstitutionService

logger = logging.getLogger(__name__)


class IngestionService:
    _run_lock: asyncio.Lock = asyncio.Lock()
    _scheduled_task: asyncio.Task | None = None

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def ensure_fresh_data(
        self, institution_id: int, background: bool = False
    ) -> None:
        # Skip check if freshness was verified recently for this institution
        if not freshness_cache.should_check(institution_id):
            return

        now_utc = datetime.now(UTC)
        async with get_session() as session:
            institution_service = InstitutionService(session)
            await institution_service.ensure_institution(institution_id)
            repo = CatalogRepository(session)
            latest_fetch = await repo.latest_fetched_at(institution_id)
            latest_snapshot = await repo.latest_snapshot_date(institution_id)

        today = now_utc.date()
        stale_threshold = now_utc - timedelta(
            hours=self._settings.ingestion_staleness_threshold_hours
        )

        # SQLite can return naive timestamps; treat them as UTC.
        if latest_fetch and latest_fetch.tzinfo is None:
            latest_fetch = latest_fetch.replace(tzinfo=UTC)

        needs_snapshot = latest_snapshot != today
        is_stale = latest_fetch is None or latest_fetch < stale_threshold

        # Mark freshness as checked regardless of outcome
        freshness_cache.mark_checked(institution_id)

        if needs_snapshot or is_stale:
            logger.info(
                "Ingestion required institution=%s needs_snapshot=%s is_stale=%s",
                institution_id,
                needs_snapshot,
                is_stale,
            )
            if background:
                self._schedule_background_run(
                    institution_id=institution_id, reason="staleness_check"
                )
            else:
                ran = await self._run_with_lock(
                    institution_id=institution_id,
                    reason="staleness_check",
                    blocking=False,
                )
                if not ran:
                    logger.info("Ingestion already running; serving existing data")

    async def run(
        self,
        scheduled: bool = False,
        reason: str | None = None,
        institution_id: int | None = None,
    ) -> None:
        logger.info(
            "Starting ingestion run (scheduled=%s reason=%s)", scheduled, reason
        )
        start_time = time.perf_counter()
        status = "failed"

        institution_ids = await self._resolve_institutions(
            scheduled=scheduled, institution_id=institution_id
        )

        if scheduled and await self._should_skip_scheduled_run(institution_ids):
            logger.info("Skipping scheduled ingestion; already fresh for active users")
            return

        now_utc = datetime.now(UTC)

        async with self._ingestion_session() as repo:
            log_id = await repo.create_run_log(started_at=now_utc, reason=reason or "manual")
            try:
                for active_institution_id in sorted(institution_ids):
                    results = await self._fetch_catalog(active_institution_id)

                    if not any(result.items for result in results):
                        logger.warning(
                            "Ingestion returned no catalog items institution=%s",
                            active_institution_id,
                        )

                    external_ids: list[str] = []
                    seen_external_ids: set[str] = set()

                    for result in results:
                        if result.raw_payload:
                            await repo.write_raw_snapshot(
                                source=f"{DIAG_CODE}:catalog",
                                payload={
                                    "source": DIAG_CODE,
                                    "institution_id": active_institution_id,
                                    "fetched_at": result.fetched_at.isoformat(),
                                    "payload": result.raw_payload,
                                },
                            )
                        if result.items:
                            singles = [
                                item for item in result.items if item.kind == "single"
                            ]
                            packages = [
                                item for item in result.items if item.kind == "package"
                            ]
                            await repo.upsert_catalog(
                                active_institution_id,
                                singles=singles,
                                packages=packages,
                                fetched_at=result.fetched_at,
                            )
                            for item in result.items:
                                external_id = item.external_id.strip()
                                if not external_id or external_id in seen_external_ids:
                                    continue
                                seen_external_ids.add(external_id)
                                external_ids.append(external_id)

                    if external_ids:
                        await repo.prune_missing_offers(active_institution_id, external_ids)

                await repo.prune_snapshots(now_utc.date())
                await repo.prune_orphan_biomarkers()
                await self._dispatch_price_alerts(repo)
                await repo.finalize_run_log(log_id, status="completed")
                status = "completed"
                # Clear caches so fresh ingestion data is served immediately
                clear_all_caches()
            except Exception as exc:
                await repo.finalize_run_log(log_id, status="failed", note=str(exc)[:500])
                logger.exception("Ingestion failed: %s", exc)
                raise
            finally:
                duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
                metrics.increment(
                    "ingestion.run", status=status, scheduled=str(scheduled)
                )
                logger.info(
                    "Ingestion run finished status=%s duration_ms=%s",
                    status,
                    duration_ms,
                )

    async def _should_skip_scheduled_run(self, institution_ids: set[int]) -> bool:
        now_utc = datetime.now(UTC)
        async with get_session() as session:
            repo = CatalogRepository(session)
            last_activity = await repo.last_user_activity()
            latest_snapshots = {
                institution_id: await repo.latest_snapshot_date(institution_id)
                for institution_id in institution_ids
            }

        window = timedelta(hours=self._settings.ingestion_user_activity_window_hours)
        inactivity = True
        if last_activity is not None:
            inactivity = (now_utc - last_activity.astimezone(UTC)) > window

        today = now_utc.date()
        has_today_snapshots = all(
            snapshot_date == today for snapshot_date in latest_snapshots.values()
        )
        return inactivity and has_today_snapshots

    @asynccontextmanager
    async def _ingestion_session(self) -> AsyncGenerator[CatalogRepository, None]:
        async with get_session() as session:
            repo = CatalogRepository(session)
            yield repo

    async def _run_with_lock(
        self,
        scheduled: bool = False,
        reason: str | None = None,
        *,
        blocking: bool = True,
        institution_id: int | None = None,
    ) -> bool:
        if blocking:
            async with self._run_lock:
                await self.run(
                    scheduled=scheduled,
                    reason=reason,
                    institution_id=institution_id,
                )
            return True

        waiters = getattr(self._run_lock, "_waiters", None)
        if self._run_lock.locked() or (
            waiters and any(not waiter.cancelled() for waiter in waiters)
        ):
            return False

        # Avoid awaiting to keep the non-blocking path atomic in the event loop.
        self._run_lock._locked = True

        try:
            await self.run(
                scheduled=scheduled,
                reason=reason,
                institution_id=institution_id,
            )
        finally:
            self._run_lock.release()
        return True

    def _schedule_background_run(
        self, *, institution_id: int, reason: str | None = None
    ) -> None:
        if self._scheduled_task and not self._scheduled_task.done():
            logger.debug("Skipping background ingestion; task already running")
            return

        async def runner() -> None:
            try:
                await self._run_with_lock(
                    reason=reason, institution_id=institution_id
                )
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

    async def _dispatch_price_alerts(self, repo: CatalogRepository) -> None:
        try:
            service = TelegramPriceAlertService(repo.session, settings=self._settings)
            await service.run()
        except Exception as exc:  # pragma: no cover - failures logged but ingestion continues
            logger.exception("Failed to deliver Telegram price alerts: %s", exc)

    async def _fetch_catalog(self, institution_id: int) -> list[DiagIngestionResult]:
        client = DiagClient()
        try:
            result = await self._fetch_diag_catalog(client, institution_id)
            return [result]
        finally:
            await client.close()

    async def _fetch_diag_catalog(
        self, client: DiagClient, institution_id: int
    ) -> DiagIngestionResult:
        logger.info(
            "Fetching %s catalog institution=%s", DIAG_CODE, institution_id
        )
        result = await client.fetch_all(institution_id)
        logger.info(
            "Fetched %s items for %s institution=%s",
            len(result.items),
            DIAG_CODE,
            institution_id,
        )
        return result

    async def _resolve_institutions(
        self,
        *,
        scheduled: bool,
        institution_id: int | None,
    ) -> set[int]:
        if not scheduled:
            return {institution_id or DEFAULT_INSTITUTION_ID}

        async with get_session() as session:
            service = InstitutionService(session)
            return await service.active_institution_ids()
