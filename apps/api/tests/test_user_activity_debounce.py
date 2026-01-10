from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from panelyt_api.core.cache import clear_all_caches, user_activity_debouncer


class TestUserActivityDebounceIntegration:
    @pytest.fixture(autouse=True)
    def clear_caches(self):
        clear_all_caches()
        yield
        clear_all_caches()

    async def test_record_user_activity_debounced_skips_when_recent(
        self, db_session
    ):
        """Should skip DB write if activity was recorded recently."""
        from panelyt_api.ingest.repository import CatalogRepository

        repo = CatalogRepository(db_session)

        # Mock the actual DB write
        with patch.object(repo, "record_user_activity", new_callable=AsyncMock) as mock_record:
            from panelyt_api.core.cache import record_user_activity_debounced

            # First call should record
            await record_user_activity_debounced(repo, datetime.now(UTC))
            assert mock_record.call_count == 1

            # Second call should be debounced (skipped)
            await record_user_activity_debounced(repo, datetime.now(UTC))
            assert mock_record.call_count == 1  # Still 1, not 2

    async def test_record_user_activity_debounced_records_after_expiry(
        self, db_session
    ):
        """Should record if debounce period has expired."""
        from panelyt_api.ingest.repository import CatalogRepository

        repo = CatalogRepository(db_session)

        with patch.object(repo, "record_user_activity", new_callable=AsyncMock) as mock_record:
            from panelyt_api.core.cache import record_user_activity_debounced

            # First call
            await record_user_activity_debounced(repo, datetime.now(UTC))
            assert mock_record.call_count == 1

            # Clear debouncer to simulate expiry
            user_activity_debouncer.clear()

            # Should record again after expiry
            await record_user_activity_debounced(repo, datetime.now(UTC))
            assert mock_record.call_count == 2
