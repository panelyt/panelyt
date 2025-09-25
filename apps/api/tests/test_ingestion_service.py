from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from panelyt_api.core.settings import Settings
from panelyt_api.ingest.client import DiagClient, _extract_grosz, _clean_str
from panelyt_api.ingest.service import IngestionService
from panelyt_api.ingest.types import IngestionResult, RawBiomarker, RawProduct


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
        repo.upsert_catalog.return_value = None
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

    @patch("panelyt_api.ingest.service.DiagClient")
    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
    async def test_run_successful_ingestion(
        self, mock_repo_class, mock_get_session, mock_client_class, ingestion_service
    ):
        """Test successful ingestion run."""
        # Mock session and repository
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock()

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo_class.return_value = mock_repo

        # Mock client
        mock_client = AsyncMock()
        mock_client.fetch_all.return_value = [
            IngestionResult(
                fetched_at=datetime.now(UTC),
                items=[
                    RawProduct(
                        id=1,
                        kind="single",
                        name="ALT Test",
                        slug="alt-test",
                        price_now_grosz=1000,
                        price_min30_grosz=900,
                        currency="PLN",
                        is_available=True,
                        biomarkers=[
                            RawBiomarker(elab_code="ALT", slug="alt", name="ALT")
                        ],
                        sale_price_grosz=None,
                        regular_price_grosz=1000,
                    )
                ],
                raw_payload={"test": "data"},
                source="singles",
            )
        ]
        mock_client_class.return_value = mock_client

        await ingestion_service.run(reason="test")

        # Verify the flow
        mock_repo.create_run_log.assert_called_once()
        mock_client.fetch_all.assert_called_once()
        mock_client.close.assert_called_once()
        mock_repo.write_raw_snapshot.assert_called_once_with("singles", {"test": "data"})
        mock_repo.upsert_catalog.assert_called_once()
        mock_repo.prune_snapshots.assert_called_once()
        mock_repo.finalize_run_log.assert_called_with(1, status="completed")

    @patch("panelyt_api.ingest.service.DiagClient")
    @patch("panelyt_api.ingest.service.get_session")
    @patch("panelyt_api.ingest.service.IngestionRepository")
    async def test_run_failed_ingestion(
        self, mock_repo_class, mock_get_session, mock_client_class, ingestion_service
    ):
        """Test failed ingestion run."""
        # Mock session and repository
        mock_session = AsyncMock()
        mock_get_session.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_get_session.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_repo = AsyncMock()
        mock_repo.create_run_log.return_value = 1
        mock_repo_class.return_value = mock_repo

        # Mock client to raise exception
        mock_client = AsyncMock()
        mock_client.fetch_all.side_effect = Exception("Network error")
        mock_client.close = AsyncMock()
        mock_client_class.return_value = mock_client

        # Run and expect exception to be raised
        with pytest.raises(Exception, match="Network error"):
            await ingestion_service.run(reason="test")

        # Verify error handling was called
        mock_repo.create_run_log.assert_called_once()
        mock_repo.finalize_run_log.assert_called_with(1, status="failed", note="Network error")

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
        # Mock successful HTTP responses
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "data": [
                {
                    "id": "1",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "type": "bloodtest",
                    "elabCode": "ALT",
                    "prices": {
                        "regular": {"gross": 10.0},
                        "sale": None,
                        "minimal": {"gross": 9.0},
                        "currency": "PLN",
                        "sellState": "available",
                    },
                }
            ],
            "meta": {"last_page": 1},
        }
        mock_http_client.get.return_value = mock_response

        results = await diag_client.fetch_all()

        assert len(results) == 2  # packages and singles
        assert all(isinstance(r, IngestionResult) for r in results)

        # Verify HTTP calls were made
        assert mock_http_client.get.call_count == 2

    async def test_parse_product_single_test(self, diag_client):
        """Test parsing a single blood test product."""
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

        result = diag_client._parse_product(entry, {})

        assert result is not None
        assert result.id == 123
        assert result.name == "ALT Test"
        assert result.slug == "alt-test"
        assert result.kind == "single"
        assert result.price_now_grosz == 800  # Sale price
        assert result.price_min30_grosz == 900  # Minimal price
        assert result.currency == "PLN"
        assert result.is_available is True
        assert len(result.biomarkers) == 1
        assert result.biomarkers[0].elab_code == "ALT"

    async def test_parse_product_package(self, diag_client):
        """Test parsing a package product."""
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

        result = diag_client._parse_product(entry, {})

        assert result is not None
        assert result.id == 456
        assert result.name == "Liver Panel"
        assert result.kind == "package"
        assert result.price_now_grosz == 2000
        assert len(result.biomarkers) == 2
        assert {b.elab_code for b in result.biomarkers} == {"ALT", "AST"}

    async def test_parse_product_invalid_id(self, diag_client):
        """Test parsing product with invalid ID."""
        entry = {"id": "invalid", "name": "Test"}
        result = diag_client._parse_product(entry, {})
        assert result is None

    async def test_parse_product_unavailable(self, diag_client):
        """Test parsing unavailable product."""
        entry = {
            "id": "123",
            "name": "Unavailable Test",
            "type": "bloodtest",
            "prices": {"sellState": "unavailable"},
        }

        result = diag_client._parse_product(entry, {})

        assert result is not None
        assert result.is_available is False

    async def test_close(self, diag_client, mock_http_client):
        """Test client cleanup."""
        await diag_client.close()
        mock_http_client.aclose.assert_called_once()


class TestIngestionUtilities:
    def test_extract_grosz_from_dict(self):
        """Test grosz extraction from price dictionary."""
        # Test with gross value
        assert _extract_grosz({"gross": 10.5}) == 1050

        # Test with value fallback
        assert _extract_grosz({"value": 15.25}) == 1525

        # Test with no valid value
        assert _extract_grosz({"other": 10}) == 0

        # Test with invalid gross
        assert _extract_grosz({"gross": "invalid"}) == 0

    def test_extract_grosz_from_number(self):
        """Test grosz extraction from numbers."""
        assert _extract_grosz(10.5) == 1050
        assert _extract_grosz(15) == 1500
        assert _extract_grosz(0) == 0

    def test_extract_grosz_invalid_input(self):
        """Test grosz extraction with invalid input."""
        assert _extract_grosz(None) == 0
        assert _extract_grosz("invalid") == 0
        assert _extract_grosz([]) == 0

    def test_clean_str_valid_input(self):
        """Test string cleaning with valid input."""
        assert _clean_str("  test  ") == "test"
        assert _clean_str("normal") == "normal"
        assert _clean_str(123) == "123"

    def test_clean_str_invalid_input(self):
        """Test string cleaning with invalid input."""
        assert _clean_str(None) is None
        assert _clean_str("") is None
        assert _clean_str("   ") is None
