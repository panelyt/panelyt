"""In-memory TTL caching utilities for API performance optimization.

This module provides TTL-based caches for:
- Catalog metadata (changes only after ingestion)
- Optimization results (deterministic for same inputs)
- Freshness check results (avoid repeated DB queries)
- User activity recording (debounce writes)
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from cachetools import TTLCache

if TYPE_CHECKING:
    from panelyt_api.ingest.repository import IngestionRepository
    from panelyt_api.schemas.common import CatalogMeta
    from panelyt_api.schemas.optimize import OptimizeResponse


class CatalogMetaCache:
    """Cache for catalog metadata (item count, biomarker count, etc.).

    Metadata changes only after ingestion runs, so a 5-minute TTL is safe.
    """

    def __init__(self, ttl_seconds: int = 300) -> None:
        self._ttl_seconds = ttl_seconds
        self._cache: TTLCache[str, CatalogMeta] = TTLCache(maxsize=1, ttl=ttl_seconds)
        self._key = "meta"

    def get(self) -> CatalogMeta | None:
        return self._cache.get(self._key)

    def set(self, value: CatalogMeta) -> None:
        self._cache[self._key] = value

    def clear(self) -> None:
        self._cache.clear()


class OptimizationCache:
    """Cache for optimization results.

    Results are deterministic for the same biomarker set + mode + lab_code.
    Uses a 1-hour TTL since prices change at most once daily during ingestion.
    """

    def __init__(self, maxsize: int = 1000, ttl_seconds: int = 3600) -> None:
        self._cache: TTLCache[str, OptimizeResponse] = TTLCache(
            maxsize=maxsize, ttl=ttl_seconds
        )

    def get(self, key: str) -> OptimizeResponse | None:
        return self._cache.get(key)

    def set(self, key: str, value: OptimizeResponse) -> None:
        self._cache[key] = value

    def make_key(
        self, biomarkers: Sequence[str], mode: str, lab_code: str | None
    ) -> str:
        """Create a cache key from optimization parameters.

        Biomarkers are sorted to ensure order-independent keys.
        """
        sorted_biomarkers = sorted(b.lower().strip() for b in biomarkers)
        key_parts = [
            ",".join(sorted_biomarkers),
            mode,
            lab_code or "",
        ]
        key_string = "|".join(key_parts)
        return hashlib.sha256(key_string.encode()).hexdigest()[:32]

    def clear(self) -> None:
        self._cache.clear()


class FreshnessCache:
    """Cache for data freshness check results.

    Avoids hitting the database on every request to check if data is stale.
    Short TTL (5 minutes) ensures we don't serve very stale data.

    Note: There is a benign race condition between should_check() and
    mark_checked() - concurrent callers may both see should_check()=True
    before either calls mark_checked(). Worst case is duplicate DB queries,
    which is wasteful but not incorrect.
    """

    def __init__(self, ttl_seconds: int = 300) -> None:
        self._ttl_seconds = ttl_seconds
        self._last_check: datetime | None = None

    def should_check(self) -> bool:
        if self._last_check is None:
            return True
        elapsed = datetime.now() - self._last_check
        return elapsed > timedelta(seconds=self._ttl_seconds)

    def mark_checked(self) -> None:
        self._last_check = datetime.now()

    def clear(self) -> None:
        self._last_check = None


class UserActivityDebouncer:
    """Debounce user activity recording to reduce DB writes.

    Instead of writing on every request, only write if enough time has
    passed since the last write (default: 1 minute).

    Note: There is a benign race condition between should_record() and
    mark_recorded() - concurrent callers may both see should_record()=True
    before either calls mark_recorded(). Worst case is duplicate DB writes,
    which is wasteful but not incorrect.
    """

    def __init__(self, debounce_seconds: int = 60) -> None:
        self._debounce_seconds = debounce_seconds
        self._last_record: datetime | None = None

    def should_record(self) -> bool:
        if self._last_record is None:
            return True
        elapsed = datetime.now() - self._last_record
        return elapsed > timedelta(seconds=self._debounce_seconds)

    def mark_recorded(self) -> None:
        self._last_record = datetime.now()

    def clear(self) -> None:
        self._last_record = None


# Global cache instances
#
# Thread Safety and Concurrency Model:
#
# These caches are safe for async single-process deployments (FastAPI/uvicorn default).
# While cachetools.TTLCache is NOT thread-safe, Python's GIL combined with the async
# concurrency model makes this safe in practice for single-threaded async execution:
# - Async tasks yield at await points, not during dict operations
# - The GIL prevents true parallel execution of Python bytecode
#
# Multi-worker deployments (multiple uvicorn workers via --workers N or gunicorn):
# - Each worker is a separate process with its own cache instance
# - No cache sharing between workers - each builds its own cache
# - This is fine for our use case (caches warm up quickly, data is idempotent)
#
# For true multi-process shared caching, Redis would be needed.
catalog_meta_cache = CatalogMetaCache(ttl_seconds=300)
optimization_cache = OptimizationCache(maxsize=1000, ttl_seconds=3600)
freshness_cache = FreshnessCache(ttl_seconds=300)
user_activity_debouncer = UserActivityDebouncer(debounce_seconds=60)


def clear_all_caches() -> None:
    """Clear all caches. Useful for testing and after ingestion."""
    catalog_meta_cache.clear()
    optimization_cache.clear()
    freshness_cache.clear()
    user_activity_debouncer.clear()


async def record_user_activity_debounced(
    repo: IngestionRepository, timestamp: datetime
) -> None:
    """Record user activity with debouncing to reduce DB writes."""
    if user_activity_debouncer.should_record():
        await repo.record_user_activity(timestamp)
        user_activity_debouncer.mark_recorded()
