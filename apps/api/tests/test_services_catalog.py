from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import insert

from panelyt_api.db import models
from panelyt_api.services import catalog


class TestCatalogService:
    async def test_get_catalog_meta_empty_db(self, db_session):
        """Test catalog meta with empty database."""
        result = await catalog.get_catalog_meta(db_session)

        assert result.item_count == 0
        assert result.biomarker_count == 0
        assert result.latest_fetched_at is None
        assert result.snapshot_days_covered == 0
        assert result.percent_with_today_snapshot == 0.0

    async def test_get_catalog_meta_with_data(self, db_session):
        """Test catalog meta with populated database."""
        # Add test biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"name": "AST", "elab_code": "AST", "slug": "ast"},
            ])
        )

        # Add test items
        fetched_time = datetime.now(timezone.utc)
        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 1,
                    "external_id": "item-1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 950,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": fetched_time,
                },
                {
                    "id": 2,
                    "external_id": "item-2",
                    "kind": "single",
                    "name": "AST Test",
                    "slug": "ast-test",
                    "price_now_grosz": 1200,
                    "price_min30_grosz": 1100,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": fetched_time,
                },
            ])
        )

        # Add price snapshots
        today = datetime.now(timezone.utc).date()
        yesterday = today - timedelta(days=1)

        await db_session.execute(
            insert(models.PriceSnapshot).values([
                {
                    "item_id": 1,
                    "snap_date": today,
                    "price_now_grosz": 1000,
                },
                {
                    "item_id": 1,
                    "snap_date": yesterday,
                    "price_now_grosz": 1100,
                },
                {
                    "item_id": 2,
                    "snap_date": today,
                    "price_now_grosz": 1200,
                },
            ])
        )

        await db_session.commit()

        result = await catalog.get_catalog_meta(db_session)

        assert result.item_count == 2
        assert result.biomarker_count == 2
        assert result.latest_fetched_at == fetched_time.replace(tzinfo=None)
        assert result.snapshot_days_covered == 2  # today and yesterday
        assert result.percent_with_today_snapshot == 100.0  # 2/2 items

    async def test_search_biomarkers_empty_query(self, db_session):
        """Test biomarker search with empty query."""
        result = await catalog.search_biomarkers(db_session, "")
        assert result.results == []

        result = await catalog.search_biomarkers(db_session, "   ")
        assert result.results == []

    async def test_search_biomarkers_exact_elab_code_match(self, db_session):
        """Test biomarker search with exact ELAB code match."""
        # Add test biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
                {"id": 2, "name": "Aspartate aminotransferase", "elab_code": "AST", "slug": "ast"},
            ])
        )
        await db_session.commit()
        await self._attach_item(db_session, biomarker_id=1, item_id=1001, price=1000)
        await self._attach_item(db_session, biomarker_id=2, item_id=1002, price=1100)
        await db_session.commit()

        result = await catalog.search_biomarkers(db_session, "ALT")

        assert len(result.results) == 1
        assert result.results[0].id == 1
        assert result.results[0].name == "Alanine aminotransferase"
        assert result.results[0].elab_code == "ALT"

    async def test_search_biomarkers_case_insensitive(self, db_session):
        """Test biomarker search is case insensitive."""
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
            ])
        )
        await db_session.commit()
        await self._attach_item(db_session, biomarker_id=1, item_id=1101, price=900)
        await db_session.commit()

        result = await catalog.search_biomarkers(db_session, "alt")
        assert len(result.results) == 1
        assert result.results[0].elab_code == "ALT"

    async def test_search_biomarkers_fuzzy_search(self, db_session):
        """Test biomarker fuzzy search functionality."""
        # Add test biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Total cholesterol", "elab_code": "CHOL", "slug": "cholesterol"},
                {"id": 2, "name": "LDL cholesterol", "elab_code": "LDL", "slug": "ldl-cholesterol"},
                {"id": 3, "name": "HDL cholesterol", "elab_code": "HDL", "slug": "hdl-cholesterol"},
            ])
        )
        await db_session.commit()
        await self._attach_item(db_session, biomarker_id=1, item_id=1201, price=1000)
        await self._attach_item(db_session, biomarker_id=2, item_id=1202, price=1050)
        await self._attach_item(db_session, biomarker_id=3, item_id=1203, price=980)
        await db_session.commit()

        # Search by partial name
        result = await catalog.search_biomarkers(db_session, "cholesterol")
        assert len(result.results) == 3

        # Search by partial elab code
        result = await catalog.search_biomarkers(db_session, "LDL")
        assert len(result.results) == 1
        assert result.results[0].elab_code == "LDL"

    async def test_search_biomarkers_with_aliases(self, db_session):
        """Test biomarker search includes aliases."""
        # Add test biomarker
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
            ])
        )

        # Add aliases
        await db_session.execute(
            insert(models.BiomarkerAlias).values([
                {"biomarker_id": 1, "alias": "ALAT"},
                {"biomarker_id": 1, "alias": "GPT"},
            ])
        )
        await db_session.commit()
        await self._attach_item(db_session, biomarker_id=1, item_id=1301, price=1000)
        await db_session.commit()

        # Search by alias
        result = await catalog.search_biomarkers(db_session, "ALAT")
        assert len(result.results) == 1
        assert result.results[0].elab_code == "ALT"

        result = await catalog.search_biomarkers(db_session, "GPT")
        assert len(result.results) == 1
        assert result.results[0].elab_code == "ALT"

    async def test_search_biomarkers_limit(self, db_session):
        """Test biomarker search respects limit parameter."""
        # Add many biomarkers
        biomarkers = [
            {"id": i, "name": f"Biomarker {i}", "elab_code": f"BM{i}", "slug": f"biomarker-{i}"}
            for i in range(1, 16)  # 15 biomarkers
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))
        await db_session.commit()
        for i in range(1, 16):
            await self._attach_item(db_session, biomarker_id=i, item_id=1400 + i)
        await db_session.commit()

        # Search with default limit (10)
        result = await catalog.search_biomarkers(db_session, "Biomarker")
        assert len(result.results) == 10

        # Search with custom limit
        result = await catalog.search_biomarkers(db_session, "Biomarker", limit=5)
        assert len(result.results) == 5

    async def test_search_biomarkers_ranking_prefers_prefix_and_id(self, db_session):
        """Search should prefer close name matches and smaller IDs."""
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 10, "name": "Glukoza", "elab_code": "GLUC", "slug": "glukoza"},
                {"id": 3349, "name": "Glukagon", "elab_code": None, "slug": "glukagon"},
                {
                    "id": 4000,
                    "name": "IgE sp. I73 - Chironomus plumosus",
                    "elab_code": None,
                    "slug": "ige-sp-i73",
                },
            ])
        )
        await db_session.commit()
        await self._attach_item(db_session, biomarker_id=10, item_id=1501, price=900)
        await self._attach_item(db_session, biomarker_id=3349, item_id=1502, price=950)
        await self._attach_item(db_session, biomarker_id=4000, item_id=1503, price=970)
        await db_session.commit()

        result = await catalog.search_biomarkers(db_session, "glu")
        names = [r.name for r in result.results]

        assert names[0] == "Glukoza"
        assert names[1] == "Glukagon"
        assert result.results[0].id == 10  # smaller id wins tie

    async def test_search_biomarkers_prioritises_exact_code(self, db_session):
        """Exact ELAB code should surface before longer substring matches."""
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Aspartate aminotransferase", "elab_code": "AST", "slug": "ast"},
                {"id": 2, "name": "Atopowe zapalenie skóry", "elab_code": None, "slug": "atopowe"},
                {"id": 3, "name": "Dystrofia plamki", "elab_code": None, "slug": "dystrofia"},
            ])
        )
        await db_session.commit()
        await self._attach_item(db_session, biomarker_id=1, item_id=1601, price=880)
        await db_session.commit()

        result = await catalog.search_biomarkers(db_session, "ast")
        assert result.results[0].elab_code == "AST"

    async def test_search_biomarkers_prefers_single_item_price(self, db_session):
        """Prefer single item prices even when a cheaper package exists."""
        await db_session.execute(
            insert(models.Biomarker).values(
                {"id": 1, "name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"}
            )
        )
        await db_session.commit()
        await self._attach_item(
            db_session, biomarker_id=1, item_id=1701, price=500, kind="package"
        )
        await self._attach_item(
            db_session, biomarker_id=1, item_id=1702, price=1000, kind="single"
        )
        await db_session.commit()

        result = await catalog.search_biomarkers(db_session, "ALT")

        assert len(result.results) == 1
        assert result.results[0].price_now_grosz == 1000

    async def test_search_biomarkers_falls_back_to_package_price(self, db_session):
        """Fallback to the cheapest available price when no singles exist."""
        await db_session.execute(
            insert(models.Biomarker).values(
                {"id": 1, "name": "Aspartate aminotransferase", "elab_code": "AST", "slug": "ast"}
            )
        )
        await db_session.commit()
        await self._attach_item(
            db_session, biomarker_id=1, item_id=1801, price=1200, kind="package"
        )
        await self._attach_item(
            db_session, biomarker_id=1, item_id=1802, price=900, kind="package"
        )
        await db_session.commit()

        result = await catalog.search_biomarkers(db_session, "AST")

        assert len(result.results) == 1
        assert result.results[0].price_now_grosz == 900

    async def _attach_item(
        self,
        session,
        biomarker_id: int,
        *,
        item_id: int,
        price: int = 1000,
        kind: str = "single",
    ) -> None:
        now = datetime.now(timezone.utc)
        await session.execute(
            insert(models.Item).values(
                {
                    "id": item_id,
                    "external_id": f"item-{item_id}",
                    "kind": kind,
                    "name": f"Item {item_id}",
                    "slug": f"item-{item_id}",
                    "price_now_grosz": price,
                    "price_min30_grosz": price,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": now,
                }
            )
        )
        await session.execute(
            insert(models.ItemBiomarker).values(
                {
                    "item_id": item_id,
                    "biomarker_id": biomarker_id,
                }
            )
        )


class TestCatalogMetaCaching:
    async def test_get_catalog_meta_cached_returns_cached_value(self, db_session):
        """Second call should return cached value without DB query."""
        from panelyt_api.core.cache import catalog_meta_cache, clear_all_caches

        clear_all_caches()

        # First call - hits DB
        meta1 = await catalog.get_catalog_meta_cached(db_session)

        # Second call - should return cached value
        meta2 = await catalog.get_catalog_meta_cached(db_session)

        assert meta1 == meta2
        assert catalog_meta_cache.get() is not None

        clear_all_caches()

    async def test_get_catalog_meta_uncached_always_hits_db(self, db_session):
        """Uncached version should always query the database."""
        from panelyt_api.core.cache import catalog_meta_cache, clear_all_caches

        clear_all_caches()

        meta1 = await catalog.get_catalog_meta(db_session)
        meta2 = await catalog.get_catalog_meta(db_session)

        # Both should succeed (no caching)
        assert meta1.item_count == meta2.item_count
        # Cache should not be populated
        assert catalog_meta_cache.get() is None

        clear_all_caches()
