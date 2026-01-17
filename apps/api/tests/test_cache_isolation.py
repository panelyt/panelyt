from __future__ import annotations

from datetime import UTC, datetime

from panelyt_api.core.cache import catalog_meta_cache
from panelyt_api.optimization import synthetic_packages
from panelyt_api.schemas.common import CatalogMeta

catalog_meta_cache.set(
    CatalogMeta(
        item_count=1,
        biomarker_count=1,
        latest_fetched_at=datetime.now(UTC),
        snapshot_days_covered=0,
        percent_with_today_snapshot=0.0,
    )
)
synthetic_packages.load_diag_synthetic_packages()


def test_autouse_cache_clear_removes_catalog_meta() -> None:
    assert catalog_meta_cache.get() is None


def test_autouse_cache_clear_resets_synthetic_packages_cache() -> None:
    assert synthetic_packages.load_diag_synthetic_packages.cache_info().currsize == 0
