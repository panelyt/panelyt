from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from sqlalchemy import insert

from panelyt_api.db import models
from panelyt_api.optimization.service import (
    CandidateItem,
    OptimizationService,
    ResolvedBiomarker,
    _item_url,
)
from panelyt_api.schemas.optimize import OptimizeRequest


class TestOptimizationService:
    @pytest.fixture
    def service(self, db_session):
        return OptimizationService(db_session)

    async def test_resolve_biomarkers_empty_input(self, service):
        """Test biomarker resolution with empty input."""
        resolved, unresolved = await service._resolve_biomarkers([])
        assert resolved == []
        assert unresolved == []

    async def test_resolve_biomarkers_by_elab_code(self, service, db_session):
        """Test biomarker resolution by ELAB code."""
        # Add test biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
                {"id": 2, "name": "Aspartate aminotransferase", "elab_code": "AST", "slug": "ast"},
            ])
        )
        await db_session.commit()

        resolved, unresolved = await service._resolve_biomarkers(["ALT", "AST", "UNKNOWN"])

        assert len(resolved) == 2
        assert len(unresolved) == 1

        assert resolved[0].id == 1
        assert resolved[0].token == "ALT"
        assert resolved[0].display_name == "Alanine aminotransferase"
        assert resolved[0].original == "ALT"

        assert resolved[1].id == 2
        assert resolved[1].token == "AST"

        assert unresolved == ["UNKNOWN"]

    async def test_resolve_biomarkers_case_insensitive(self, service, db_session):
        """Test biomarker resolution is case insensitive."""
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
            ])
        )
        await db_session.commit()

        resolved, unresolved = await service._resolve_biomarkers(["alt", "Alt", "ALT"])

        assert len(resolved) == 3
        assert unresolved == []
        for r in resolved:
            assert r.token == "ALT"

    async def test_resolve_biomarkers_batches_queries(self, service, db_session, monkeypatch):
        """Ensure biomarker resolution performs a single batched query."""
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
                {"id": 2, "name": "Aspartate aminotransferase", "elab_code": "AST", "slug": "ast"},
            ])
        )
        await db_session.commit()

        call_count = 0
        original_execute = service.session.execute

        async def counting_execute(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return await original_execute(*args, **kwargs)

        monkeypatch.setattr(service.session, "execute", counting_execute)

        resolved, unresolved = await service._resolve_biomarkers(["ALT", "AST", "alt"])

        assert len(resolved) == 3
        assert unresolved == []
        assert call_count == 1

    async def test_resolve_biomarkers_by_slug_and_name(self, service, db_session):
        """Test biomarker resolution by slug and name."""
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Total cholesterol", "elab_code": None, "slug": "cholesterol"},
                {"id": 2, "name": "Vitamin D", "elab_code": None, "slug": None},
            ])
        )
        await db_session.commit()

        resolved, unresolved = await service._resolve_biomarkers(["cholesterol", "vitamin d"])

        assert len(resolved) == 2
        assert unresolved == []

        assert resolved[0].token == "cholesterol"  # Uses slug when no elab_code
        assert resolved[1].token == "Vitamin D"    # Uses name when no elab_code or slug

    async def test_collect_candidates_empty_biomarkers(self, service):
        """Test candidate collection with empty biomarkers."""
        candidates = await service._collect_candidates([])
        assert candidates == []

    async def test_collect_candidates_with_data(self, service, db_session):
        """Test candidate collection with valid data."""
        # Add biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"id": 2, "name": "AST", "elab_code": "AST", "slug": "ast"},
            ])
        )

        # Add items
        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 1,
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                },
                {
                    "id": 2,
                    "kind": "package",
                    "name": "Liver Panel",
                    "slug": "liver-panel",
                    "price_now_grosz": 2000,
                    "price_min30_grosz": 1900,
                },
            ])
        )

        # Add item-biomarker relationships
        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 1, "biomarker_id": 1},  # ALT test covers ALT
                {"item_id": 2, "biomarker_id": 1},  # Liver panel covers ALT
                {"item_id": 2, "biomarker_id": 2},  # Liver panel covers AST
            ])
        )

        await db_session.commit()

        biomarkers = [
            ResolvedBiomarker(id=1, token="ALT", display_name="ALT", original="ALT"),
            ResolvedBiomarker(id=2, token="AST", display_name="AST", original="AST"),
        ]

        candidates = await service._collect_candidates(biomarkers)

        assert len(candidates) == 2

        # Find ALT test
        alt_test = next(c for c in candidates if c.id == 1)
        assert alt_test.name == "ALT Test"
        assert alt_test.kind == "single"
        assert alt_test.coverage == {"ALT"}
        assert alt_test.price_now == 1000

        # Find Liver panel
        liver_panel = next(c for c in candidates if c.id == 2)
        assert liver_panel.name == "Liver Panel"
        assert liver_panel.kind == "package"
        assert liver_panel.coverage == {"ALT", "AST"}
        assert liver_panel.price_now == 2000

    def test_prune_candidates_cheapest_single_only(self, service):
        """Test pruning keeps only cheapest single tests."""
        candidates = [
            CandidateItem(
                id=1,
                kind="single",
                name="ALT",
                slug="alt",
                price_now=1000,
                price_min30=1000,
                sale_price=None,
                regular_price=None,
                coverage={"ALT"},
            ),
            CandidateItem(
                id=2,
                kind="single",
                name="ALT premium",
                slug="alt-premium",
                price_now=1500,
                price_min30=1500,
                sale_price=None,
                regular_price=None,
                coverage={"ALT"},
            ),
            CandidateItem(
                id=3,
                kind="package",
                name="Liver panel",
                slug="liver-panel",
                price_now=2500,
                price_min30=2400,
                sale_price=None,
                regular_price=None,
                coverage={"ALT", "AST"},
            ),
        ]

        pruned = service._prune_candidates(candidates)
        ids = {item.id for item in pruned}
        assert ids == {1, 3}  # Cheapest ALT single + package

    def test_prune_candidates_dominance_removal(self, service):
        """Test pruning removes dominated candidates."""
        candidates = [
            CandidateItem(
                id=1,
                kind="single",
                name="ALT",
                slug="alt",
                price_now=1000,
                price_min30=1000,
                sale_price=None,
                regular_price=None,
                coverage={"ALT"},
            ),
            CandidateItem(
                id=2,
                kind="package",
                name="Basic Panel",
                slug="basic-panel",
                price_now=1000,  # Same price as ALT single
                price_min30=1000,
                sale_price=None,
                regular_price=None,
                coverage={"ALT", "AST"},  # Covers more biomarkers
            ),
        ]

        pruned = service._prune_candidates(candidates)
        ids = {item.id for item in pruned}
        assert ids == {2}  # Package dominates single test

    async def test_solve_no_biomarkers(self, service):
        """Test optimization with no biomarkers."""
        request = OptimizeRequest(biomarkers=[])
        result = await service.solve(request)

        assert result.total_now == 0.0
        assert result.total_min30 == 0.0
        assert result.currency == "PLN"
        assert result.items == []
        assert result.explain == {}
        assert result.uncovered == []

    async def test_solve_unresolved_biomarkers(self, service):
        """Test optimization with unresolvable biomarkers."""
        request = OptimizeRequest(biomarkers=["UNKNOWN1", "UNKNOWN2"])
        result = await service.solve(request)

        assert result.total_now == 0.0
        assert result.items == []
        assert result.uncovered == ["UNKNOWN1", "UNKNOWN2"]

    async def test_solve_simple_optimization(self, service, db_session):
        """Test simple optimization scenario."""
        # Add biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"id": 2, "name": "AST", "elab_code": "AST", "slug": "ast"},
            ])
        )

        # Add items
        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 1,
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                },
                {
                    "id": 2,
                    "kind": "single",
                    "name": "AST Test",
                    "slug": "ast-test",
                    "price_now_grosz": 1200,
                    "price_min30_grosz": 1100,
                },
                {
                    "id": 3,
                    "kind": "package",
                    "name": "Liver Panel",
                    "slug": "liver-panel",
                    "price_now_grosz": 1800,  # Cheaper than individual tests
                    "price_min30_grosz": 1700,
                },
            ])
        )

        # Add relationships
        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 1, "biomarker_id": 1},
                {"item_id": 2, "biomarker_id": 2},
                {"item_id": 3, "biomarker_id": 1},
                {"item_id": 3, "biomarker_id": 2},
            ])
        )

        await db_session.commit()

        request = OptimizeRequest(biomarkers=["ALT", "AST"])
        result = await service.solve(request)

        assert result.total_now == 18.0  # 1800 grosz = 18.0 PLN
        assert result.total_min30 == 17.0  # 1700 grosz = 17.0 PLN
        assert len(result.items) == 1
        assert result.items[0].name == "Liver Panel"
        assert result.uncovered == []
        assert "ALT" in result.explain
        assert "AST" in result.explain

    def test_candidate_item_on_sale_property(self):
        """Test CandidateItem on_sale property."""
        # Item not on sale (no sale/regular price)
        item1 = CandidateItem(
            id=1, kind="single", name="Test", slug="test",
            price_now=1000, price_min30=1000,
            sale_price=None, regular_price=None
        )
        assert not item1.on_sale

        # Item on sale
        item2 = CandidateItem(
            id=2, kind="single", name="Test", slug="test",
            price_now=1000, price_min30=1000,
            sale_price=800, regular_price=1000
        )
        assert item2.on_sale

        # Item not on sale (sale price >= regular price)
        item3 = CandidateItem(
            id=3, kind="single", name="Test", slug="test",
            price_now=1000, price_min30=1000,
            sale_price=1000, regular_price=1000
        )
        assert not item3.on_sale

    def test_item_url_generation(self):
        """Test URL generation for different item kinds."""
        single_item = CandidateItem(
            id=1, kind="single", name="Test", slug="test-single",
            price_now=1000, price_min30=1000,
            sale_price=None, regular_price=None
        )
        assert _item_url(single_item) == "https://diag.pl/sklep/badania/test-single"

        package_item = CandidateItem(
            id=2, kind="package", name="Test Package", slug="test-package",
            price_now=2000, price_min30=2000,
            sale_price=None, regular_price=None
        )
        assert _item_url(package_item) == "https://diag.pl/sklep/pakiety/test-package"
