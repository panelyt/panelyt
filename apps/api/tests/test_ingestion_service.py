from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from panelyt_api.core.settings import Settings
from panelyt_api.ingest.client import DiagClient, _normalize_identifier, _pln_to_grosz
from panelyt_api.ingest.service import IngestionService
from panelyt_api.ingest.types import LabIngestionResult, RawLabBiomarker, RawLabItem


class TestIngestionService:
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
        repo.stage_lab_items.return_value = MagicMock()
        repo.synchronize_catalog.return_value = None
        repo.prune_snapshots.return_value = None
        repo.write_raw_snapshot.return_value = None
        return repo

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
    async def test_ensure_fresh_data_no_stale_data(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Test ensure_fresh_data when data is fresh."""
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.latest_fetched_at.return_value = datetime.now(UTC)
        mock_repo.latest_snapshot_date.return_value = datetime.now().date()
        mock_repo_class.return_value = mock_repo

        with patch.object(ingestion_service, '_run_with_lock', new_callable=AsyncMock) as mock_run:
            await ingestion_service.ensure_fresh_data()
            mock_run.assert_not_awaited()

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
    async def test_ensure_fresh_data_stale_data(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Test ensure_fresh_data when data is stale."""
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        # Simulate stale data (older than threshold)
        stale_time = datetime.now(UTC) - timedelta(hours=25)
        mock_repo.latest_fetched_at.return_value = stale_time
        mock_repo.latest_snapshot_date.return_value = None
        mock_repo_class.return_value = mock_repo

        with patch.object(ingestion_service, '_run_with_lock', new_callable=AsyncMock) as mock_run:
            await ingestion_service.ensure_fresh_data()
            mock_run.assert_awaited_once_with(reason="staleness_check", blocking=False)

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
    async def test_ensure_fresh_data_missing_snapshot(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Test ensure_fresh_data when today's snapshot is missing."""
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.latest_fetched_at.return_value = datetime.now(UTC)
        # Simulate missing today's snapshot
        yesterday = datetime.now().date() - timedelta(days=1)
        mock_repo.latest_snapshot_date.return_value = yesterday
        mock_repo_class.return_value = mock_repo

        with patch.object(ingestion_service, '_run_with_lock', new_callable=AsyncMock) as mock_run:
            await ingestion_service.ensure_fresh_data()
            mock_run.assert_awaited_once_with(reason="staleness_check", blocking=False)

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
    async def test_ensure_fresh_data_does_not_block_when_running(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        """Ensure concurrent ensure_fresh_data calls avoid waiting for ongoing ingestion."""
        mock_session = AsyncMock()
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
            mock_run.return_value = False
            with patch.object(ingestion_service, '_schedule_background_run') as mock_schedule:
                await ingestion_service.ensure_fresh_data()
                mock_run.assert_awaited_once_with(reason="staleness_check", blocking=False)
                mock_schedule.assert_not_called()

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
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

        sample_item = RawLabItem(
            external_id="1",
            kind="single",
            name="ALT Test",
            slug="alt-test",
            price_now_grosz=1000,
            price_min30_grosz=900,
            currency="PLN",
            is_available=True,
            biomarkers=[
                RawLabBiomarker(
                    external_id="alt",
                    name="ALT",
                    elab_code="ALT",
                    slug="alt",
                )
            ],
            sale_price_grosz=None,
            regular_price_grosz=1000,
        )
        lab_result = LabIngestionResult(
            lab_code="diag",
            fetched_at=datetime.now(UTC),
            items=[sample_item],
            raw_payload={"sample": "payload"},
        )

        with patch.object(
            ingestion_service, "_fetch_all_labs", new_callable=AsyncMock
        ) as mock_fetch, patch.object(
            ingestion_service, "_process_lab_result", new_callable=AsyncMock
        ) as mock_process:
            mock_fetch.return_value = [lab_result]

            await ingestion_service.run(reason="test")

            mock_fetch.assert_awaited_once()
            mock_process.assert_awaited_once_with(mock_repo, lab_result)
            mock_repo.prune_snapshots.assert_called_once()
            mock_repo.finalize_run_log.assert_called_with(1, status="completed")

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
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
            ingestion_service, "_fetch_all_labs", new_callable=AsyncMock
        ) as mock_fetch:
            mock_fetch.side_effect = Exception("Network error")

            with pytest.raises(Exception, match="Network error"):
                await ingestion_service.run(reason="test")

        mock_repo.create_run_log.assert_called_once()
        mock_repo.finalize_run_log.assert_called_with(1, status="failed", note="Network error")

    @pytest.mark.asyncio
    async def test_process_lab_result_stages_and_syncs(self, mock_repo, ingestion_service):
        fetched_at = datetime.now(UTC)
        lab_result = LabIngestionResult(
            lab_code="diag",
            fetched_at=fetched_at,
            items=[
                RawLabItem(
                    external_id="1",
                    kind="single",
                    name="ALT",
                    slug="alt",
                    price_now_grosz=1000,
                    price_min30_grosz=900,
                    currency="PLN",
                    is_available=True,
                    biomarkers=[
                        RawLabBiomarker(
                            external_id="alt",
                            name="ALT",
                            elab_code="ALT",
                            slug="alt",
                        )
                    ],
                )
            ],
            raw_payload={"page_1": {}},
        )

        stage_context = MagicMock()
        mock_repo.stage_lab_items = AsyncMock(return_value=stage_context)
        mock_repo.synchronize_catalog = AsyncMock()

        await ingestion_service._process_lab_result(mock_repo, lab_result)

        mock_repo.write_raw_snapshot.assert_called_once()
        mock_repo.stage_lab_items.assert_awaited_once()
        mock_repo.synchronize_catalog.assert_awaited_once_with(stage_context)

    @pytest.mark.asyncio
    async def test_process_lab_result_without_items(self, mock_repo, ingestion_service):
        lab_result = LabIngestionResult(
            lab_code="diag",
            fetched_at=datetime.now(UTC),
            items=[],
            raw_payload={"page_1": {}},
        )

        await ingestion_service._process_lab_result(mock_repo, lab_result)

        mock_repo.write_raw_snapshot.assert_called_once()
        mock_repo.stage_lab_items.assert_not_called()

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
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
        mock_repo.latest_snapshot_date.return_value = datetime.now().date()
        mock_repo_class.return_value = mock_repo

        result = await ingestion_service._should_skip_scheduled_run()
        assert result is True

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
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

        result = await ingestion_service._should_skip_scheduled_run()
        assert result is False

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
    async def test_background_run_schedules_task(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        mock_session = AsyncMock()
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
                await ingestion_service.ensure_fresh_data(background=True)
                await asyncio.sleep(0)
                mock_run.assert_awaited_once_with(reason="staleness_check")
        finally:
            ingestion_service.__class__._scheduled_task = None

    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
    async def test_background_run_ignores_duplicate_requests(
        self, mock_repo_class, mock_get_session, ingestion_service
    ):
        mock_session = AsyncMock()
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
                await ingestion_service.ensure_fresh_data(background=True)
                await ingestion_service.ensure_fresh_data(background=True)
                assert mock_run.await_count == 0

                await asyncio.sleep(0)
                assert mock_run.await_count == 1
        finally:
            ingestion_service.__class__._scheduled_task = None


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

        result = await diag_client.fetch_all()

        assert isinstance(result, LabIngestionResult)
        assert len(result.items) == 2
        assert {item.kind for item in result.items} == {"package", "single"}
        assert mock_http_client.get.call_count == 2

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
        assert result.price_now_grosz == 800
        assert result.price_min30_grosz == 900
        assert result.biomarkers[0].elab_code == "ALT"
        assert result.biomarkers[0].external_id == "alt"

    async def test_parse_product_package(self, diag_client):
        entry = {
            "id": "456",
            "name": "Liver Panel",
            "slug": "liver-panel",
            "type": "package",
            "products": [
                {"elabCode": "ALT", "name": "ALT", "slug": "alt"},
                {"elabCode": "AST", "name": "AST", "slug": "ast"},
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
        assert result.price_now_grosz == 2000
        assert {b.elab_code for b in result.biomarkers} == {"ALT", "AST"}

    def test_pln_to_grosz(self):
        assert _pln_to_grosz("12,34") == 1234
        assert _pln_to_grosz(0) == 0

    def test_normalize_identifier(self):
        assert _normalize_identifier("Białko całkowite") == "białko-całkowite"

    async def test_parse_product_invalid_id(self, diag_client):
        entry = {"id": "invalid", "name": "Test"}
        result = diag_client._parse_product(entry)
        assert result is None

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

    async def test_close(self, diag_client, mock_http_client):
        """Test client cleanup."""
        await diag_client.close()
        mock_http_client.aclose.assert_called_once()
