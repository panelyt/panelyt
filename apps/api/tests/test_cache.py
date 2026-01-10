from __future__ import annotations

from panelyt_api.core.cache import (
    CatalogMetaCache,
    FreshnessCache,
    OptimizationCache,
    UserActivityDebouncer,
)


class TestCatalogMetaCache:
    def test_get_returns_none_when_empty(self):
        cache = CatalogMetaCache(ttl_seconds=300)
        assert cache.get() is None

    def test_set_and_get_returns_value(self):
        cache = CatalogMetaCache(ttl_seconds=300)
        data = {"item_count": 100}
        cache.set(data)
        assert cache.get() == data

    def test_get_returns_none_after_ttl_expires(self):
        cache = CatalogMetaCache(ttl_seconds=0)  # Immediate expiry
        data = {"item_count": 100}
        cache.set(data)
        # TTL of 0 means it expires immediately
        assert cache.get() is None

    def test_clear_removes_cached_value(self):
        cache = CatalogMetaCache(ttl_seconds=300)
        cache.set({"item_count": 100})
        cache.clear()
        assert cache.get() is None


class TestOptimizationCache:
    def test_get_returns_none_when_empty(self):
        cache = OptimizationCache(maxsize=100, ttl_seconds=3600)
        assert cache.get("nonexistent_key") is None

    def test_set_and_get_returns_value(self):
        cache = OptimizationCache(maxsize=100, ttl_seconds=3600)
        data = {"total_grosz": 5000}
        cache.set("key1", data)
        assert cache.get("key1") == data

    def test_different_keys_store_different_values(self):
        cache = OptimizationCache(maxsize=100, ttl_seconds=3600)
        cache.set("key1", {"total": 100})
        cache.set("key2", {"total": 200})
        assert cache.get("key1") == {"total": 100}
        assert cache.get("key2") == {"total": 200}

    def test_make_key_produces_consistent_keys(self):
        cache = OptimizationCache(maxsize=100, ttl_seconds=3600)
        biomarkers = ["TSH", "ALT", "AST"]

        key1 = cache.make_key(biomarkers)
        key2 = cache.make_key(biomarkers)
        assert key1 == key2

    def test_make_key_different_for_different_inputs(self):
        cache = OptimizationCache(maxsize=100, ttl_seconds=3600)
        key1 = cache.make_key(["TSH", "ALT"])
        key2 = cache.make_key(["TSH", "AST"])
        key3 = cache.make_key(["ALT", "CRP"])

        assert len({key1, key2, key3}) == 3  # All different

    def test_make_key_order_independent_for_biomarkers(self):
        cache = OptimizationCache(maxsize=100, ttl_seconds=3600)
        key1 = cache.make_key(["TSH", "ALT", "AST"])
        key2 = cache.make_key(["AST", "TSH", "ALT"])
        assert key1 == key2

    def test_clear_removes_all_cached_values(self):
        cache = OptimizationCache(maxsize=100, ttl_seconds=3600)
        cache.set("key1", {"data": 1})
        cache.set("key2", {"data": 2})
        cache.clear()
        assert cache.get("key1") is None
        assert cache.get("key2") is None


class TestFreshnessCache:
    def test_should_check_returns_true_when_never_checked(self):
        cache = FreshnessCache(ttl_seconds=300)
        assert cache.should_check() is True

    def test_should_check_returns_false_after_recent_mark(self):
        cache = FreshnessCache(ttl_seconds=300)
        cache.mark_checked()
        assert cache.should_check() is False

    def test_should_check_returns_true_after_ttl_expires(self):
        cache = FreshnessCache(ttl_seconds=0)  # Immediate expiry
        cache.mark_checked()
        assert cache.should_check() is True

    def test_clear_resets_check_state(self):
        cache = FreshnessCache(ttl_seconds=300)
        cache.mark_checked()
        cache.clear()
        assert cache.should_check() is True


class TestUserActivityDebouncer:
    def test_should_record_returns_true_when_never_recorded(self):
        debouncer = UserActivityDebouncer(debounce_seconds=60)
        assert debouncer.should_record() is True

    def test_should_record_returns_false_after_recent_record(self):
        debouncer = UserActivityDebouncer(debounce_seconds=60)
        debouncer.mark_recorded()
        assert debouncer.should_record() is False

    def test_should_record_returns_true_after_debounce_expires(self):
        debouncer = UserActivityDebouncer(debounce_seconds=0)  # Immediate expiry
        debouncer.mark_recorded()
        assert debouncer.should_record() is True

    def test_clear_resets_state(self):
        debouncer = UserActivityDebouncer(debounce_seconds=60)
        debouncer.mark_recorded()
        debouncer.clear()
        assert debouncer.should_record() is True
