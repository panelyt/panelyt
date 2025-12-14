from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from panelyt_api.core.cache import clear_all_caches, freshness_cache


class TestFreshnessCacheIntegration:
    @pytest.fixture(autouse=True)
    def clear_caches(self):
        clear_all_caches()
        yield
        clear_all_caches()

    async def test_ensure_fresh_data_skips_check_when_cached(self, test_settings):
        """Should skip DB queries if freshness was checked recently."""
        from panelyt_api.ingest.service import IngestionService

        service = IngestionService(test_settings)

        # Mark freshness as recently checked
        freshness_cache.mark_checked()

        # Mock the session to ensure no DB calls happen
        with patch("panelyt_api.ingest.service.get_session") as mock_session:
            await service.ensure_fresh_data(background=True)
            # Should not have called get_session since freshness is cached
            mock_session.assert_not_called()

    async def test_ensure_fresh_data_checks_when_cache_expired(self, test_settings):
        """Should check DB when freshness cache has expired."""
        from panelyt_api.ingest.service import IngestionService

        service = IngestionService(test_settings)

        # Clear cache to simulate expiry
        freshness_cache.clear()

        with patch("panelyt_api.ingest.service.get_session") as mock_session:
            mock_repo = AsyncMock()
            mock_repo.latest_fetched_at = AsyncMock(return_value=None)
            mock_repo.latest_snapshot_date = AsyncMock(return_value=None)
            mock_repo.scalar = AsyncMock(return_value=None)

            mock_context = AsyncMock()
            mock_context.__aenter__ = AsyncMock(return_value=mock_repo)
            mock_context.__aexit__ = AsyncMock(return_value=None)
            mock_session.return_value = mock_context

            # Should hit the database
            await service.ensure_fresh_data(background=True)

            # Cache should now be populated
            assert not freshness_cache.should_check()
