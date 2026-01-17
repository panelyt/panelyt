from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from panelyt_api.core.cache import clear_all_caches
from panelyt_api.core.diag import DIAG_CODE
from panelyt_api.core.settings import Settings
from panelyt_api.ingest.client import DiagClient, _normalize_identifier, _pln_to_grosz
from panelyt_api.ingest.types import DiagInstitution
from panelyt_api.ingest.service import IngestionService
from panelyt_api.ingest.types import DiagIngestionResult, RawDiagBiomarker, RawDiagItem
from panelyt_api.schemas.common import CatalogMeta


class TestIngestionService:
    @pytest.fixture(autouse=True)
    def reset_caches(self):
        clear_all_caches()
        yield
        clear_all_caches()

    @pytest.fixture
    def ingestion_service(self, test_settings):
        return IngestionService(test_settings)

    @pytest.fixture
    def mock_repo(self):
        repo = AsyncMock()
        repo.latest_fetched_at.return_value = None
        repo.latest_snapshot_date.return_value = None
        repo.last_user_activity.return_value = None
        repo.create_run_log.return_value = 1
        repo.finalize_run_log.return_value = None
        repo.upsert_catalog.return_value = None
        repo.prune_snapshots.return_value = None
        repo.prune_missing_offers.return_value = None
        repo.prune_orphan_biomarkers.return_value = None
        repo.write_raw_snapshot.return_value = None
        return repo

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_ensure_fresh_data_no_stale_data(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Test ensure_fresh_data when data is fresh."""
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
        )
        mock_session.add = MagicMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.latest_fetched_at.return_value = datetime.now(UTC)
        mock_repo.latest_snapshot_date.return_value = datetime.now(UTC).date()
        mock_repo_class.return_value = mock_repo

        with patch.object(ingestion_service, '_run_with_lock', new_callable=AsyncMock) as mock_run:
            await ingestion_service.ensure_fresh_data(1135)
            mock_run.assert_not_awaited()

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_ensure_fresh_data_stale_data(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Test ensure_fresh_data when data is stale."""
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
        )
        mock_session.add = MagicMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        # Simulate stale data (older than threshold)
        stale_time = datetime.now(UTC) - timedelta(hours=25)
        mock_repo.latest_fetched_at.return_value = stale_time
        mock_repo.latest_snapshot_date.return_value = None
        mock_repo_class.return_value = mock_repo

        with patch.object(ingestion_service, '_run_with_lock', new_callable=AsyncMock) as mock_run:
            await ingestion_service.ensure_fresh_data(1135)
            mock_run.assert_awaited_once_with(
                institution_id=1135,
                reason="staleness_check",
                blocking=False,
            )

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_ensure_fresh_data_missing_snapshot(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Test ensure_fresh_data when today's snapshot is missing."""
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
        )
        mock_session.add = MagicMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.latest_fetched_at.return_value = datetime.now(UTC)
        # Simulate missing today's snapshot
        yesterday = datetime.now().date() - timedelta(days=1)
        mock_repo.latest_snapshot_date.return_value = yesterday
        mock_repo_class.return_value = mock_repo

        with patch.object(ingestion_service, '_run_with_lock', new_callable=AsyncMock) as mock_run:
            await ingestion_service.ensure_fresh_data(1135)
            mock_run.assert_awaited_once_with(
                institution_id=1135,
                reason="staleness_check",
                blocking=False,
            )

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_ensure_fresh_data_blocks_when_requested(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Test ensure_fresh_data blocks when blocking is requested."""
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
        )
        mock_session.add = MagicMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        stale_time = datetime.now(UTC) - timedelta(hours=25)
        mock_repo.latest_fetched_at.return_value = stale_time
        mock_repo.latest_snapshot_date.return_value = None
        mock_repo_class.return_value = mock_repo

        with patch.object(ingestion_service, "_run_with_lock", new_callable=AsyncMock) as mock_run:
            await ingestion_service.ensure_fresh_data(1135, blocking=True)
            mock_run.assert_awaited_once_with(
                institution_id=1135,
                reason="staleness_check",
                blocking=True,
            )

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_ensure_fresh_data_blocking_rechecks_after_wait(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Ensure blocking re-checks freshness after waiting on the lock."""
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
        )
        mock_session.add = MagicMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        stale_time = datetime.now(UTC) - timedelta(hours=25)
        fresh_time = datetime.now(UTC)
        mock_repo.latest_fetched_at.side_effect = [stale_time, fresh_time]
        mock_repo.latest_snapshot_date.side_effect = [None, fresh_time.date()]
        mock_repo_class.return_value = mock_repo

        lock = asyncio.Lock()
        await lock.acquire()

        async def release_lock() -> None:
            await asyncio.sleep(0)
            lock.release()

        with patch.object(IngestionService, "_run_lock", lock):
            with patch.object(
                ingestion_service, "run", new_callable=AsyncMock
            ) as mock_run:
                release_task = asyncio.create_task(release_lock())
                await ingestion_service.ensure_fresh_data(1135, blocking=True)
                await release_task
                mock_run.assert_not_awaited()

    async def test_ensure_fresh_data_blocking_busy_rechecks_and_runs(
        self, ingestion_service
    ):
        lock = asyncio.Lock()
        with patch.object(IngestionService, "_run_lock", lock), patch.object(
            ingestion_service, "_lock_is_busy", return_value=True
        ), patch.object(
            ingestion_service, "_evaluate_freshness", new_callable=AsyncMock
        ) as mock_evaluate, patch.object(
            ingestion_service, "run", new_callable=AsyncMock
        ) as mock_run, patch(
            "panelyt_api.ingest.service.freshness_cache.mark_checked"
        ) as mock_mark_checked:
            mock_evaluate.side_effect = [(True, False), (True, False)]

            await ingestion_service.ensure_fresh_data(2222, blocking=True)

            mock_evaluate.assert_has_awaits([call(2222), call(2222)])
            assert mock_mark_checked.call_args_list == [call(2222), call(2222)]
            mock_run.assert_awaited_once_with(
                reason="staleness_check",
                institution_id=2222,
            )

    @patch("panelyt_api.ingest.service.InstitutionService")
    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_ensure_fresh_data_ensures_institution(
        self,
        mock_repo_class,
        mock_get_session,
        mock_institution_service,
        ingestion_service,
    ):
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
        )
        mock_session.add = MagicMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.latest_fetched_at.return_value = None
        mock_repo.latest_snapshot_date.return_value = None
        mock_repo_class.return_value = mock_repo

        service_instance = mock_institution_service.return_value
        service_instance.ensure_institution = AsyncMock()

        with patch.object(
            ingestion_service, "_run_with_lock", new_callable=AsyncMock
        ) as mock_run:
            mock_run.return_value = False
            await ingestion_service.ensure_fresh_data(2222)
            service_instance.ensure_institution.assert_awaited_once_with(2222)

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_ensure_fresh_data_waits_for_lock(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Ensure ensure_fresh_data skips queued ingestion when lock is held."""
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
        )
        mock_session.add = MagicMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        stale_time = datetime.now(UTC) - timedelta(hours=25)
        mock_repo.latest_fetched_at.return_value = stale_time
        mock_repo.latest_snapshot_date.return_value = None
        mock_repo_class.return_value = mock_repo

        with patch.object(
            ingestion_service,
            '_run_with_lock',
            new_callable=AsyncMock,
        ) as mock_run:
            mock_run.return_value = True
            with patch.object(ingestion_service, '_schedule_background_run') as mock_schedule:
                await ingestion_service.ensure_fresh_data(1135)
                mock_run.assert_awaited_once_with(
                    institution_id=1135,
                    reason="staleness_check",
                    blocking=False,
                )
                mock_schedule.assert_not_called()

    async def test_run_with_lock_nonblocking_acquires_when_free(self, ingestion_service):
        lock = asyncio.Lock()
        with patch.object(IngestionService, "_run_lock", lock):
            with patch.object(ingestion_service, "run", new_callable=AsyncMock) as mock_run:
                result = await ingestion_service._run_with_lock(
                    scheduled=False,
                    reason="staleness_check",
                    blocking=False,
                    institution_id=1135,
                )

                assert result is True
                mock_run.assert_awaited_once_with(
                    scheduled=False,
                    reason="staleness_check",
                    institution_id=1135,
                )

    async def test_run_with_lock_nonblocking_returns_fast_when_locked(
        self, ingestion_service
    ):
        lock = asyncio.Lock()
        run_started = asyncio.Event()
        run_release = asyncio.Event()

        async def hold_run(*_args, **_kwargs):
            run_started.set()
            await run_release.wait()

        with patch.object(IngestionService, "_run_lock", lock):
            with patch.object(ingestion_service, "run", new=AsyncMock(side_effect=hold_run)) as mock_run:
                first = asyncio.create_task(
                    ingestion_service._run_with_lock(
                        scheduled=False,
                        reason="staleness_check",
                        blocking=False,
                        institution_id=1135,
                    )
                )
                await run_started.wait()

                second = asyncio.create_task(
                    ingestion_service._run_with_lock(
                        scheduled=False,
                        reason="staleness_check",
                        blocking=False,
                        institution_id=1135,
                    )
                )

                assert await asyncio.wait_for(second, timeout=0.1) is False
                run_release.set()
                assert await asyncio.wait_for(first, timeout=0.1) is True
                assert mock_run.await_count == 1

    def test_lock_is_busy_true_with_active_waiters(self, ingestion_service) -> None:
        class DummyWaiter:
            def __init__(self, cancelled: bool) -> None:
                self._cancelled = cancelled

            def cancelled(self) -> bool:
                return self._cancelled

        class DummyLock:
            def __init__(self) -> None:
                self._waiters = [DummyWaiter(False)]

            def locked(self) -> bool:
                return False

        with patch.object(IngestionService, "_run_lock", DummyLock()):
            assert ingestion_service._lock_is_busy() is True

    def test_lock_is_busy_false_with_cancelled_waiters(self, ingestion_service) -> None:
        class DummyWaiter:
            def __init__(self, cancelled: bool) -> None:
                self._cancelled = cancelled

            def cancelled(self) -> bool:
                return self._cancelled

        class DummyLock:
            def __init__(self) -> None:
                self._waiters = [DummyWaiter(True)]

            def locked(self) -> bool:
                return False

        with patch.object(IngestionService, "_run_lock", DummyLock()):
            assert ingestion_service._lock_is_busy() is False

    def test_lock_is_busy_false_without_waiters_attribute(self, ingestion_service) -> None:
        class DummyLock:
            def locked(self) -> bool:
                return False

        with patch.object(IngestionService, "_run_lock", DummyLock()):
            assert ingestion_service._lock_is_busy() is False

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_run_successful_ingestion(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Test successful ingestion run."""
        # Mock session and repository
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo_class.return_value = mock_repo

        sample_item = RawDiagItem(
            external_id="1",
            kind="single",
            name="ALT Test",
            slug="alt-test",
            price_now_grosz=1000,
            price_min30_grosz=900,
            currency="PLN",
            is_available=True,
            biomarkers=[
                RawDiagBiomarker(
                    external_id="alt",
                    name="ALT",
                    elab_code="ALT",
                    slug="alt",
                )
            ],
            sale_price_grosz=None,
            regular_price_grosz=1000,
        )
        lab_result = DiagIngestionResult(
            fetched_at=datetime.now(UTC),
            items=[sample_item],
            raw_payload={"sample": "payload"},
        )

        with patch.object(
            ingestion_service, "_fetch_catalog", new_callable=AsyncMock
        ) as mock_fetch, patch.object(
            ingestion_service, "_dispatch_price_alerts", new_callable=AsyncMock
        ):
            mock_fetch.return_value = [lab_result]

            await ingestion_service.run(reason="test")

            mock_fetch.assert_awaited_once_with(1135)
            mock_repo.write_raw_snapshot.assert_awaited_once()
            mock_repo.upsert_catalog.assert_awaited_once_with(
                1135,
                singles=[sample_item],
                packages=[],
                fetched_at=lab_result.fetched_at,
            )
            mock_repo.prune_snapshots.assert_called_once()
            mock_repo.prune_missing_offers.assert_awaited_once_with(1135, ["1"])
            mock_repo.finalize_run_log.assert_called_with(1, status="completed")

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_run_writes_raw_snapshot_payload(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        fixed_now = datetime(2025, 1, 2, 12, 0, 0, tzinfo=UTC)
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo.finalize_run_log.return_value = None
        mock_repo.prune_snapshots.return_value = None
        mock_repo.prune_orphan_biomarkers.return_value = None
        mock_repo.write_raw_snapshot.return_value = None
        mock_repo_class.return_value = mock_repo

        lab_result = DiagIngestionResult(
            fetched_at=fixed_now,
            items=[],
            raw_payload={"sample": "payload"},
        )

        with patch.object(
            ingestion_service, "_fetch_catalog", new_callable=AsyncMock
        ) as mock_fetch, patch.object(
            ingestion_service, "_dispatch_price_alerts", new_callable=AsyncMock
        ) as mock_alerts:
            mock_fetch.return_value = [lab_result]

            await ingestion_service.run(reason="test-raw-snapshot")

        mock_repo.write_raw_snapshot.assert_awaited_once_with(
            source=f"{DIAG_CODE}:catalog",
            payload={
                "source": DIAG_CODE,
                "institution_id": 1135,
                "fetched_at": fixed_now.isoformat(),
                "payload": {"sample": "payload"},
            },
        )
        mock_alerts.assert_awaited_once_with(mock_repo)

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_run_dedupes_external_ids_before_prune(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo.finalize_run_log.return_value = None
        mock_repo.prune_snapshots.return_value = None
        mock_repo.prune_orphan_biomarkers.return_value = None
        mock_repo.write_raw_snapshot.return_value = None
        mock_repo.upsert_catalog.return_value = None
        mock_repo_class.return_value = mock_repo

        sample_biomarker = RawDiagBiomarker(
            external_id="alt",
            name="ALT",
            elab_code="ALT",
            slug="alt",
        )
        items = [
            RawDiagItem(
                external_id=" 1 ",
                kind="single",
                name="ALT Test",
                slug="alt-test",
                price_now_grosz=1000,
                price_min30_grosz=900,
                currency="PLN",
                is_available=True,
                biomarkers=[sample_biomarker],
                sale_price_grosz=None,
                regular_price_grosz=1000,
            ),
            RawDiagItem(
                external_id="1",
                kind="single",
                name="ALT Test",
                slug="alt-test",
                price_now_grosz=1000,
                price_min30_grosz=900,
                currency="PLN",
                is_available=True,
                biomarkers=[sample_biomarker],
                sale_price_grosz=None,
                regular_price_grosz=1000,
            ),
            RawDiagItem(
                external_id="2",
                kind="single",
                name="ALT Test",
                slug="alt-test",
                price_now_grosz=1000,
                price_min30_grosz=900,
                currency="PLN",
                is_available=True,
                biomarkers=[sample_biomarker],
                sale_price_grosz=None,
                regular_price_grosz=1000,
            ),
        ]
        lab_result = DiagIngestionResult(
            fetched_at=datetime.now(UTC),
            items=items,
            raw_payload=None,
        )

        with patch.object(
            ingestion_service, "_fetch_catalog", new_callable=AsyncMock
        ) as mock_fetch, patch.object(
            ingestion_service, "_dispatch_price_alerts", new_callable=AsyncMock
        ):
            mock_fetch.return_value = [lab_result]

            await ingestion_service.run(reason="test-dedupe")

        mock_repo.prune_missing_offers.assert_awaited_once_with(1135, ["1", "2"])

    @patch("panelyt_api.ingest.service.metrics.increment")
    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_run_reports_completed_status_metric(
        self, mock_repo_class, mock_get_session, mock_metrics_increment, ingestion_service
    ):
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo.finalize_run_log.return_value = None
        mock_repo.prune_snapshots.return_value = None
        mock_repo.prune_orphan_biomarkers.return_value = None
        mock_repo.write_raw_snapshot.return_value = None
        mock_repo.upsert_catalog.return_value = None
        mock_repo_class.return_value = mock_repo

        lab_result = DiagIngestionResult(
            fetched_at=datetime.now(UTC),
            items=[],
            raw_payload=None,
        )

        with patch.object(
            ingestion_service, "_fetch_catalog", new_callable=AsyncMock
        ) as mock_fetch, patch.object(
            ingestion_service, "_dispatch_price_alerts", new_callable=AsyncMock
        ):
            mock_fetch.return_value = [lab_result]

            await ingestion_service.run(reason="test-metrics")

        mock_metrics_increment.assert_called_once_with(
            "ingestion.run",
            status="completed",
            scheduled="False",
        )

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_run_scheduled_ingests_active_institutions(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo.finalize_run_log.return_value = None
        mock_repo.prune_snapshots.return_value = None
        mock_repo.prune_missing_offers.return_value = None
        mock_repo.prune_orphan_biomarkers.return_value = None
        mock_repo.write_raw_snapshot.return_value = None
        mock_repo.upsert_catalog.return_value = None
        mock_repo_class.return_value = mock_repo

        sample_item = RawDiagItem(
            external_id="1",
            kind="single",
            name="ALT Test",
            slug="alt-test",
            price_now_grosz=1000,
            price_min30_grosz=900,
            currency="PLN",
            is_available=True,
            biomarkers=[
                RawDiagBiomarker(
                    external_id="alt",
                    name="ALT",
                    elab_code="ALT",
                    slug="alt",
                )
            ],
            sale_price_grosz=None,
            regular_price_grosz=1000,
        )
        lab_result = DiagIngestionResult(
            fetched_at=datetime.now(UTC),
            items=[sample_item],
            raw_payload={},
        )

        with patch.object(
            ingestion_service, "_fetch_catalog", new_callable=AsyncMock
        ) as mock_fetch, patch.object(
            ingestion_service, "_dispatch_price_alerts", new_callable=AsyncMock
        ), patch.object(
            ingestion_service, "_resolve_institutions", new_callable=AsyncMock
        ) as mock_resolve, patch.object(
            ingestion_service, "_should_skip_scheduled_run", new_callable=AsyncMock
        ) as mock_skip:
            mock_fetch.return_value = [lab_result]
            mock_resolve.return_value = {2222, 1111}
            mock_skip.return_value = False

            await ingestion_service.run(scheduled=True, reason="scheduled")

            mock_resolve.assert_awaited_once_with(
                scheduled=True, institution_id=None
            )
            mock_skip.assert_awaited_once_with({2222, 1111})
            mock_fetch.assert_has_awaits([call(1111), call(2222)])
            mock_repo.upsert_catalog.assert_has_awaits(
                [
                    call(
                        1111,
                        singles=[sample_item],
                        packages=[],
                        fetched_at=lab_result.fetched_at,
                    ),
                    call(
                        2222,
                        singles=[sample_item],
                        packages=[],
                        fetched_at=lab_result.fetched_at,
                    ),
                ]
            )
            mock_repo.prune_missing_offers.assert_has_awaits(
                [call(1111, ["1"]), call(2222, ["1"])]
            )

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_run_clears_catalog_cache_after_ingestion(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Catalog meta cache should be cleared so post-ingestion requests see fresh data."""
        from panelyt_api.core.cache import catalog_meta_cache, clear_all_caches

        clear_all_caches()
        cached_meta = CatalogMeta(
            item_count=1,
            biomarker_count=1,
            latest_fetched_at=datetime.now(UTC),
            snapshot_days_covered=1,
            percent_with_today_snapshot=100.0,
        )
        catalog_meta_cache.set(cached_meta)
        assert catalog_meta_cache.get() is not None

        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo.finalize_run_log.return_value = None
        mock_repo.prune_snapshots.return_value = None
        mock_repo.prune_missing_offers.return_value = None
        mock_repo.prune_orphan_biomarkers.return_value = None
        mock_repo.write_raw_snapshot.return_value = None
        mock_repo.upsert_catalog.return_value = None
        mock_repo_class.return_value = mock_repo

        lab_result = DiagIngestionResult(
            fetched_at=datetime.now(UTC),
            items=[],
            raw_payload={"sample": "payload"},
        )

        with patch.object(
            ingestion_service, "_fetch_catalog", new_callable=AsyncMock
        ) as mock_fetch:
            mock_fetch.return_value = [lab_result]
            await ingestion_service.run(reason="test-cache-clear")

        assert catalog_meta_cache.get() is None
        clear_all_caches()

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_run_failed_ingestion(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Test failed ingestion run."""
        # Mock session and repository
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo_class.return_value = mock_repo

        with patch.object(
            ingestion_service, "_fetch_catalog", new_callable=AsyncMock
        ) as mock_fetch:
            mock_fetch.side_effect = Exception("Network error")

            with pytest.raises(Exception, match="Network error"):
                await ingestion_service.run(reason="test")

        mock_repo.create_run_log.assert_called_once()
        mock_repo.finalize_run_log.assert_called_with(1, status="failed", note="Network error")

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_run_skips_upsert_when_no_items(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo.finalize_run_log.return_value = None
        mock_repo.prune_snapshots.return_value = None
        mock_repo.prune_orphan_biomarkers.return_value = None
        mock_repo.write_raw_snapshot.return_value = None
        mock_repo.upsert_catalog.return_value = None
        mock_repo_class.return_value = mock_repo

        lab_result = DiagIngestionResult(
            fetched_at=datetime.now(UTC),
            items=[],
            raw_payload={"page_1": {}},
        )

        with patch.object(
            ingestion_service, "_fetch_catalog", new_callable=AsyncMock
        ) as mock_fetch, patch.object(
            ingestion_service, "_dispatch_price_alerts", new_callable=AsyncMock
        ):
            mock_fetch.return_value = [lab_result]
            await ingestion_service.run(reason="test-empty")

        mock_repo.write_raw_snapshot.assert_awaited_once()
        mock_repo.upsert_catalog.assert_not_awaited()
        mock_repo.prune_missing_offers.assert_not_awaited()

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_should_skip_scheduled_run_inactive_users(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Test skipping scheduled run when users are inactive."""
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        # Simulate inactive users (last activity > window)
        old_activity = datetime.now(UTC) - timedelta(hours=25)
        mock_repo.last_user_activity.return_value = old_activity
        mock_repo.latest_snapshot_date.return_value = datetime.now(UTC).date()
        mock_repo_class.return_value = mock_repo

        result = await ingestion_service._should_skip_scheduled_run({1135})
        assert result is True

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_should_skip_scheduled_run_active_users(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Test not skipping scheduled run when users are active."""
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        # Simulate active users (last activity < window)
        recent_activity = datetime.now(UTC) - timedelta(hours=1)
        mock_repo.last_user_activity.return_value = recent_activity
        mock_repo.latest_snapshot_date.return_value = datetime.now().date()
        mock_repo_class.return_value = mock_repo

        result = await ingestion_service._should_skip_scheduled_run({1135})
        assert result is False

    @patch("panelyt_api.ingest.service.InstitutionService")
    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_evaluate_freshness_uses_institution_id(
        self,
        mock_repo_class,
        mock_get_session,
        mock_institution_service,
        ingestion_service,
        monkeypatch,
    ):
        fixed_now = datetime(2025, 1, 2, 12, 0, 0, tzinfo=UTC)

        class FixedDateTime(datetime):
            @classmethod
            def now(cls, tz=None):  # type: ignore[override]
                return fixed_now

        monkeypatch.setattr("panelyt_api.ingest.service.datetime", FixedDateTime)

        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.latest_fetched_at.return_value = fixed_now
        mock_repo.latest_snapshot_date.return_value = fixed_now.date()
        mock_repo_class.return_value = mock_repo

        service_instance = mock_institution_service.return_value
        service_instance.ensure_institution = AsyncMock()

        needs_snapshot, is_stale = await ingestion_service._evaluate_freshness(2222)

        assert needs_snapshot is False
        assert is_stale is False
        mock_repo.latest_fetched_at.assert_awaited_once_with(2222)
        mock_repo.latest_snapshot_date.assert_awaited_once_with(2222)

    @patch("panelyt_api.ingest.service.InstitutionService")
    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_evaluate_freshness_handles_naive_fetch_time(
        self,
        mock_repo_class,
        mock_get_session,
        mock_institution_service,
        ingestion_service,
        monkeypatch,
    ):
        fixed_now = datetime(2025, 1, 2, 12, 0, 0, tzinfo=UTC)

        class FixedDateTime(datetime):
            @classmethod
            def now(cls, tz=None):  # type: ignore[override]
                return fixed_now

        monkeypatch.setattr("panelyt_api.ingest.service.datetime", FixedDateTime)

        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.latest_fetched_at.return_value = fixed_now.replace(tzinfo=None)
        mock_repo.latest_snapshot_date.return_value = fixed_now.date()
        mock_repo_class.return_value = mock_repo
        mock_institution_service.return_value.ensure_institution = AsyncMock()

        needs_snapshot, is_stale = await ingestion_service._evaluate_freshness(1135)

        assert needs_snapshot is False
        assert is_stale is False

    @patch("panelyt_api.ingest.service.InstitutionService")
    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_evaluate_freshness_stale_threshold_boundary(
        self,
        mock_repo_class,
        mock_get_session,
        mock_institution_service,
        ingestion_service,
        monkeypatch,
    ):
        fixed_now = datetime(2025, 1, 2, 12, 0, 0, tzinfo=UTC)

        class FixedDateTime(datetime):
            @classmethod
            def now(cls, tz=None):  # type: ignore[override]
                return fixed_now

        monkeypatch.setattr("panelyt_api.ingest.service.datetime", FixedDateTime)

        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        stale_threshold = fixed_now - timedelta(
            hours=ingestion_service._settings.ingestion_staleness_threshold_hours
        )

        mock_repo = AsyncMock()
        mock_repo.latest_fetched_at.return_value = stale_threshold
        mock_repo.latest_snapshot_date.return_value = fixed_now.date()
        mock_repo_class.return_value = mock_repo
        mock_institution_service.return_value.ensure_institution = AsyncMock()

        needs_snapshot, is_stale = await ingestion_service._evaluate_freshness(1135)

        assert needs_snapshot is False
        assert is_stale is False

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_background_run_schedules_task(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
        )
        mock_session.add = MagicMock()
        mock_session.flush = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        stale_time = datetime.now(UTC) - timedelta(hours=25)
        mock_repo.latest_fetched_at.return_value = stale_time
        mock_repo.latest_snapshot_date.return_value = None
        mock_repo_class.return_value = mock_repo

        ingestion_service.__class__._scheduled_task = None

        try:
            with patch.object(ingestion_service, '_run_with_lock', new_callable=AsyncMock) as mock_run:
                await ingestion_service.ensure_fresh_data(1135, background=True)
                await asyncio.sleep(0)
                mock_run.assert_awaited_once_with(
                    institution_id=1135,
                    reason="staleness_check",
                )
        finally:
            ingestion_service.__class__._scheduled_task = None

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_background_run_ignores_duplicate_requests(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None))
        )
        mock_session.add = MagicMock()
        mock_session.flush = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        stale_time = datetime.now(UTC) - timedelta(hours=25)
        mock_repo.latest_fetched_at.return_value = stale_time
        mock_repo.latest_snapshot_date.return_value = None
        mock_repo_class.return_value = mock_repo

        ingestion_service.__class__._scheduled_task = None

        try:
            with patch.object(ingestion_service, '_run_with_lock', new_callable=AsyncMock) as mock_run:
                await ingestion_service.ensure_fresh_data(1135, background=True)
                await ingestion_service.ensure_fresh_data(1135, background=True)
                assert mock_run.await_count == 0

                await asyncio.sleep(0)
                assert mock_run.await_count == 1
        finally:
            ingestion_service.__class__._scheduled_task = None


class TestIngestionCacheClearing:
    @pytest.fixture(autouse=True)
    def reset_caches(self):
        clear_all_caches()
        yield
        clear_all_caches()

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_run_clears_caches_after_successful_ingestion(
        self, mock_repo_class, mock_get_session, test_settings
    ):
        """Successful ingestion should clear all performance caches."""
        from panelyt_api.core.cache import catalog_meta_cache, optimization_cache
        from panelyt_api.ingest.service import IngestionService

        catalog_meta_cache.set({"item_count": 999})
        optimization_cache.set("test_key", {"total": 123})

        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo.finalize_run_log.return_value = None
        mock_repo.prune_snapshots.return_value = None
        mock_repo.prune_orphan_biomarkers.return_value = None
        mock_repo.write_raw_snapshot.return_value = None
        mock_repo.upsert_catalog.return_value = None
        mock_repo_class.return_value = mock_repo

        service = IngestionService(test_settings)

        with patch.object(service, "_fetch_catalog", new_callable=AsyncMock) as mock_fetch, patch.object(
            service, "_dispatch_price_alerts", new_callable=AsyncMock
        ):
            mock_fetch.return_value = []
            await service.run(reason="test")

        assert catalog_meta_cache.get() is None
        assert optimization_cache.get("test_key") is None

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.CatalogRepository")
    async def test_run_does_not_clear_caches_on_failure(
        self, mock_repo_class, mock_get_session, test_settings
    ):
        """Failed ingestion should not clear caches so existing data remains available."""
        from panelyt_api.core.cache import catalog_meta_cache, optimization_cache
        from panelyt_api.ingest.service import IngestionService

        catalog_meta_cache.set({"item_count": 999})
        optimization_cache.set("test_key", {"total": 123})

        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo.finalize_run_log.return_value = None
        mock_repo_class.return_value = mock_repo

        service = IngestionService(test_settings)

        with patch.object(service, "_fetch_catalog", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.side_effect = RuntimeError("boom")
            with pytest.raises(RuntimeError, match="boom"):
                await service.run(reason="test-failure")

        assert catalog_meta_cache.get() == {"item_count": 999}
        assert optimization_cache.get("test_key") == {"total": 123}

class TestDiagClient:
    @pytest.fixture
    def mock_http_client(self):
        return AsyncMock()

    @pytest.fixture
    def diag_client(self, mock_http_client):
        return DiagClient(client=mock_http_client)

    async def test_fetch_all_success(self, diag_client, mock_http_client):
        """Test successful fetch_all operation."""
        package_entry = {
            "id": "10",
            "name": "Panel",
            "slug": "panel",
            "type": "package",
            "products": [
                {"elabCode": "ALT", "name": "ALT", "slug": "alt"},
            ],
            "prices": {
                "regular": {"gross": 50.0},
                "currency": "PLN",
                "sellState": "available",
            },
        }
        single_entry = {
            "id": "11",
            "name": "ALT",
            "slug": "alt",
            "type": "bloodtest",
            "elabCode": "ALT",
            "prices": {
                "regular": {"gross": 25.0},
                "currency": "PLN",
                "sellState": "available",
            },
        }

        package_response = MagicMock()
        package_response.json.return_value = {"data": [package_entry], "meta": {"last_page": 1}}
        single_response = MagicMock()
        single_response.json.return_value = {"data": [single_entry], "meta": {"last_page": 1}}

        mock_http_client.get.side_effect = [package_response, single_response]

        result = await diag_client.fetch_all(1135)

        assert isinstance(result, DiagIngestionResult)
        assert len(result.items) == 2
        assert {item.kind for item in result.items} == {"package", "single"}
        assert mock_http_client.get.call_count == 2
        for _, kwargs in mock_http_client.get.call_args_list:
            params = kwargs.get("params") or {}
            assert params.get("filter[institution]") == "1135"

    async def test_search_institutions_normalizes_payload(self, diag_client, mock_http_client):
        payload = {
            "data": [
                {
                    "id": "2222",
                    "name": "Main Office",
                    "city": "Krakow",
                    "address": "Main 1",
                }
            ]
        }
        response = MagicMock()
        response.json.return_value = payload
        mock_http_client.get.return_value = response

        results = await diag_client.search_institutions("krak", page=2, limit=5)

        assert results == [
            DiagInstitution(id=2222, name="Main Office", city="Krakow", address="Main 1")
        ]
        assert mock_http_client.get.call_count == 1
        _, kwargs = mock_http_client.get.call_args
        assert kwargs.get("params") == {
            "q": "krak",
            "page": 2,
            "limit": 5,
            "include": "address,city",
            "filter[attributes]": "ESHOP,ECO,PPA",
            "filter[temporaryDisabled]": "false",
        }

    async def test_parse_product_single_test(self, diag_client):
        entry = {
            "id": "123",
            "name": "ALT Test",
            "slug": "alt-test",
            "type": "bloodtest",
            "elabCode": "ALT",
            "prices": {
                "regular": {"gross": 10.0},
                "sale": {"gross": 8.0},
                "minimal": {"gross": 9.0},
                "currency": "PLN",
                "sellState": "available",
            },
        }

        result = diag_client._parse_product(entry)

        assert result is not None
        assert result.external_id == "123"
        assert result.kind == "single"
        assert result.name == "ALT Test"
        assert result.slug == "alt-test"
        assert result.price_now_grosz == 800
        assert result.price_min30_grosz == 900
        assert result.currency == "PLN"
        assert result.is_available is True
        assert result.biomarkers[0].elab_code == "ALT"
        assert result.biomarkers[0].external_id == "123"
        assert result.biomarkers[0].slug == "alt-test"
        assert result.biomarkers[0].name == "ALT Test"

    async def test_parse_product_package(self, diag_client):
        entry = {
            "id": "456",
            "name": "Liver Panel",
            "slug": "liver-panel",
            "type": "package",
            "products": [
                {"id": "1001", "elabCode": "ALT", "name": "ALT", "slug": "alt"},
                {"id": "1002", "elabCode": "AST", "name": "AST", "slug": "ast"},
            ],
            "prices": {
                "regular": {"gross": 20.0},
                "currency": "PLN",
                "sellState": "available",
            },
        }

        result = diag_client._parse_product(entry)

        assert result is not None
        assert result.external_id == "456"
        assert result.kind == "package"
        assert result.name == "Liver Panel"
        assert result.slug == "liver-panel"
        assert result.price_now_grosz == 2000
        assert result.price_min30_grosz == 2000
        assert result.currency == "PLN"
        assert result.is_available is True
        assert {b.elab_code for b in result.biomarkers} == {"ALT", "AST"}
        assert {b.external_id for b in result.biomarkers} == {"1001", "1002"}
        assert {b.slug for b in result.biomarkers} == {"alt", "ast"}
        assert {b.name for b in result.biomarkers} == {"ALT", "AST"}

    def test_pln_to_grosz(self):
        assert _pln_to_grosz("12,34") == 1234
        assert _pln_to_grosz(0) == 0

    def test_normalize_identifier(self):
        assert _normalize_identifier("Białko całkowite") == "białko-całkowite"

    async def test_parse_product_invalid_id(self, diag_client, caplog):
        entry = {"id": "invalid", "name": "Test"}
        caplog.set_level(logging.WARNING, logger="panelyt_api.ingest.client")
        result = diag_client._parse_product(entry)
        assert result is None
        assert any(
            "Skipping product without valid id" in record.message and "invalid" in record.message
            for record in caplog.records
        )

    async def test_parse_product_unavailable(self, diag_client):
        entry = {
            "id": "123",
            "name": "Unavailable Test",
            "type": "bloodtest",
            "prices": {"sellState": "unavailable"},
        }

        result = diag_client._parse_product(entry)

        assert result is not None
        assert result.is_available is False

    async def test_extract_biomarkers_bloodtest_uses_slug_and_fallback(self, diag_client):
        entry = {
            "type": "bloodtest",
            "id": None,
            "slug": "entry-slug",
            "name": "ALT",
            "elabCode": "ALT",
        }

        biomarkers = diag_client._extract_biomarkers_from_item(
            entry, fallback_slug="fallback-slug"
        )

        assert len(biomarkers) == 1
        biomarker = biomarkers[0]
        assert biomarker.slug == "entry-slug"
        assert biomarker.name == "ALT"
        assert biomarker.external_id == "entry-slug"
        assert biomarker.metadata == {"source": "diag_solo"}

    async def test_extract_biomarkers_uses_fallback_slug_when_missing(self, diag_client):
        entry = {"type": "bloodtest", "id": None, "name": "ALT"}

        biomarkers = diag_client._extract_biomarkers_from_item(
            entry, fallback_slug="fallback-slug"
        )

        assert len(biomarkers) == 1
        biomarker = biomarkers[0]
        assert biomarker.slug == "fallback-slug"
        assert biomarker.external_id == "fallback-slug"

    async def test_extract_biomarkers_from_products(self, diag_client):
        entry = {
            "type": "package",
            "products": [
                {"id": "1001", "slug": "alt", "name": "ALT", "elabCode": "ALT"},
                {"name": "Gamma"},
                "not-a-dict",
            ],
        }

        biomarkers = diag_client._extract_biomarkers_from_item(entry, fallback_slug=None)

        assert len(biomarkers) == 2
        assert {b.external_id for b in biomarkers} == {"1001", "gamma"}
        assert {b.slug for b in biomarkers} == {"alt", None}
        assert {b.name for b in biomarkers} == {"ALT", "Gamma"}
        assert all(b.metadata == {"source": "diag_package"} for b in biomarkers)

    async def test_close(self, diag_client, mock_http_client):
        """Test client cleanup."""
        await diag_client.close()
        mock_http_client.aclose.assert_called_once()
