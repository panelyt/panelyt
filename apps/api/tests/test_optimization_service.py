from __future__ import annotations

import pytest
from ortools.sat.python import cp_model
from sqlalchemy import delete, insert, select

from panelyt_api.db import models
from panelyt_api.optimization.service import (
    CandidateItem,
    OptimizationService,
    ResolvedBiomarker,
    _item_url,
)
from panelyt_api.schemas.optimize import OptimizeRequest


def make_candidate(**overrides) -> CandidateItem:
    defaults = {
        "external_id": "item-1",
        "lab_id": 1,
        "lab_code": "diag",
        "lab_name": "Diagnostyka",
        "single_url_template": "https://diag.pl/sklep/badania/{slug}",
        "package_url_template": "https://diag.pl/sklep/pakiety/{slug}",
        "price_now": 1000,
        "price_min30": 1000,
        "sale_price": None,
        "regular_price": None,
        "coverage": set(),
    }
    defaults.update(overrides)
    coverage = defaults.get("coverage", set())
    defaults["coverage"] = set(coverage)
    return CandidateItem(**defaults)


class TestOptimizationService:
    @pytest.fixture
    def service(self, db_session):
        return OptimizationService(db_session)

    @pytest.mark.asyncio
    async def test_resolve_biomarkers_empty_input(self, service):
        """Test biomarker resolution with empty input."""
        resolved, unresolved = await service._resolve_biomarkers([])
        assert resolved == []
        assert unresolved == []

    @pytest.mark.asyncio
    async def test_resolve_biomarkers_by_elab_code(self, service, db_session):
        """Test biomarker resolution by ELAB code."""
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        # Add test biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
                {"name": "Aspartate aminotransferase", "elab_code": "AST", "slug": "ast"},
            ])
        )
        await db_session.commit()

        resolved, unresolved = await service._resolve_biomarkers(["ALT", "AST", "UNKNOWN"])

        assert len(resolved) == 2
        assert len(unresolved) == 1

        assert resolved[0].token == "ALT"
        assert resolved[0].display_name == "Alanine aminotransferase"
        assert resolved[0].original == "ALT"

        assert resolved[1].token == "AST"

        assert unresolved == ["UNKNOWN"]

    @pytest.mark.asyncio
    async def test_resolve_biomarkers_case_insensitive(self, service, db_session):
        """Test biomarker resolution is case insensitive."""
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
            ])
        )
        await db_session.commit()

        resolved, unresolved = await service._resolve_biomarkers(["alt", "Alt", "ALT"])

        assert len(resolved) == 3
        assert unresolved == []
        for r in resolved:
            assert r.token == "ALT"

    @pytest.mark.asyncio
    async def test_evaluate_lab_skips_unsatisfiable_labs(self, service, monkeypatch):
        """Labs that cannot cover all biomarkers are skipped without solving."""
        resolved = [
            ResolvedBiomarker(id=1, token="ALT", display_name="ALT", original="ALT"),
            ResolvedBiomarker(id=2, token="AST", display_name="AST", original="AST"),
        ]
        candidates = [
            make_candidate(
                id=1,
                kind="single",
                name="ALT",
                slug="alt",
                price_now=1000,
                price_min30=1000,
                coverage={"ALT"},
            )
        ]

        context = service._prepare_context(resolved, [], candidates)
        assert context is not None

        async def _fail_run_solver(*args, **kwargs):
            raise AssertionError("_run_solver should not be called for unsatisfiable labs")

        monkeypatch.setattr(service, "_run_solver", _fail_run_solver)
        result = await service._evaluate_lab_solution(1, context.grouped_candidates[1], context)

        assert result is None

    @pytest.mark.asyncio
    async def test_resolve_biomarkers_batches_queries(self, service, db_session, monkeypatch):
        """Ensure biomarker resolution performs a single batched query."""
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
                {"name": "Aspartate aminotransferase", "elab_code": "AST", "slug": "ast"},
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

    @pytest.mark.asyncio
    async def test_resolve_biomarkers_by_slug_and_name(self, service, db_session):
        """Test biomarker resolution by slug and name."""
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "Total cholesterol", "elab_code": None, "slug": "cholesterol"},
                {"name": "Vitamin D", "elab_code": None, "slug": None},
            ])
        )
        await db_session.commit()

        resolved, unresolved = await service._resolve_biomarkers(["cholesterol", "vitamin d"])

        assert len(resolved) == 2
        assert unresolved == []

        assert resolved[0].token == "cholesterol"  # Uses slug when no elab_code
        assert resolved[1].token == "Vitamin D"    # Uses name when no elab_code or slug

    @pytest.mark.asyncio
    async def test_collect_candidates_empty_biomarkers(self, service):
        """Test candidate collection with empty biomarkers."""
        candidates = await service._collect_candidates([])
        assert candidates == []

    @pytest.mark.asyncio
    async def test_collect_candidates_with_data(self, service, db_session):
        """Test candidate collection with valid data."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        # Add biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"name": "AST", "elab_code": "AST", "slug": "ast"},
            ])
        )

        # Add items
        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 1,
                    "lab_id": 1,
                    "external_id": "1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                    "currency": "PLN",
                    "is_available": True,
                },
                {
                    "id": 2,
                    "lab_id": 1,
                    "external_id": "2",
                    "kind": "package",
                    "name": "Liver Panel",
                    "slug": "liver-panel",
                    "price_now_grosz": 2000,
                    "price_min30_grosz": 1900,
                    "currency": "PLN",
                    "is_available": True,
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
            make_candidate(
                id=1,
                kind="single",
                name="ALT",
                slug="alt",
                price_now=1000,
                price_min30=1000,
                coverage={"ALT"},
            ),
            make_candidate(
                id=2,
                kind="single",
                name="ALT premium",
                slug="alt-premium",
                price_now=1500,
                price_min30=1500,
                coverage={"ALT"},
            ),
            make_candidate(
                id=3,
                kind="package",
                name="Liver panel",
                slug="liver-panel",
                price_now=2500,
                price_min30=2400,
                coverage={"ALT", "AST"},
            ),
        ]

        pruned = service._prune_candidates(candidates)
        ids = {item.id for item in pruned}
        assert ids == {1, 3}  # Cheapest ALT single + package

    def test_prune_candidates_dominance_removal(self, service):
        """Test pruning removes dominated candidates."""
        candidates = [
            make_candidate(
                id=1,
                kind="single",
                name="ALT",
                slug="alt",
                price_now=1000,
                price_min30=1000,
                coverage={"ALT"},
            ),
            make_candidate(
                id=2,
                kind="package",
                name="Basic Panel",
                slug="basic-panel",
                price_now=1000,
                price_min30=1000,
                coverage={"ALT", "AST"},
            ),
        ]

        pruned = service._prune_candidates(candidates)
        ids = {item.id for item in pruned}
        assert ids == {2}  # Package dominates single test

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
    async def test_solve_unresolved_biomarkers(self, service):
        """Test optimization with unresolvable biomarkers."""
        request = OptimizeRequest(biomarkers=["UNKNOWN1", "UNKNOWN2"])
        result = await service.solve(request)

        assert result.total_now == 0.0
        assert result.items == []
        assert result.uncovered == ["UNKNOWN1", "UNKNOWN2"]

    @pytest.mark.asyncio
    async def test_solve_preserves_unresolved_order(
        self, service, db_session
    ):
        """Unresolved biomarkers remain in the original order in responses."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await db_session.execute(
            insert(models.Biomarker).values(
                [
                    {"name": "ALT", "elab_code": "ALT", "slug": "alt"},
                    {"name": "AST", "elab_code": "AST", "slug": "ast"},
                ]
            )
        )
        await db_session.execute(
            insert(models.Item).values(
                [
                    {
                        "id": 501,
                        "lab_id": 1,
                        "external_id": "diag-alt",
                        "kind": "single",
                        "name": "Diagnostyka ALT",
                        "slug": "diag-alt",
                        "price_now_grosz": 1000,
                        "price_min30_grosz": 900,
                        "currency": "PLN",
                        "is_available": True,
                    },
                    {
                        "id": 502,
                        "lab_id": 1,
                        "external_id": "diag-ast",
                        "kind": "single",
                        "name": "Diagnostyka AST",
                        "slug": "diag-ast",
                        "price_now_grosz": 1100,
                        "price_min30_grosz": 1000,
                        "currency": "PLN",
                        "is_available": True,
                    },
                ]
            )
        )
        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [
                    {"item_id": 501, "biomarker_id": 1},
                    {"item_id": 502, "biomarker_id": 2},
                ]
            )
        )
        await db_session.commit()

        request = OptimizeRequest(
            biomarkers=["ALT", "unknown-b", "AST", "unknown-a"]
        )
        response = await service.solve(request)

        assert response.uncovered == ["unknown-b", "unknown-a"]
        assert {item.id for item in response.items} == {501, 502}

    @pytest.mark.asyncio
    async def test_solve_nonexclusive_with_more_expensive_alternative(
        self, service, db_session
    ):
        """If another lab offers a biomarker, exclusivity should not trigger."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.PriceSnapshot))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        biomarker_id = (
            await db_session.execute(
                insert(models.Biomarker)
                .values({"name": "Żelazo", "slug": "zelazo", "elab_code": None})
                .returning(models.Biomarker.id)
            )
        ).scalar_one()

        await db_session.execute(
            insert(models.Item).values(
                {
                    "id": 11,
                    "lab_id": 1,
                    "external_id": "diag-zelazo",
                    "kind": "single",
                    "name": "Żelazo",
                    "slug": "zelazo",
                    "price_now_grosz": 2500,
                    "price_min30_grosz": 2500,
                    "currency": "PLN",
                    "is_available": True,
                }
            )
        )
        await db_session.execute(
            insert(models.Item).values(
                {
                    "id": 22,
                    "lab_id": 2,
                    "external_id": "alab-zelazo",
                    "kind": "single",
                    "name": "Żelazo (ALAB)",
                    "slug": "zelazo-w-surowicy",
                    "price_now_grosz": 2900,
                    "price_min30_grosz": 2900,
                    "currency": "PLN",
                    "is_available": True,
                }
            )
        )
        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [
                    {"item_id": 11, "biomarker_id": biomarker_id},
                    {"item_id": 22, "biomarker_id": biomarker_id},
                ]
            )
        )
        await db_session.commit()

        response = await service.solve(OptimizeRequest(biomarkers=["zelazo"]))

        assert response.lab_code == "diag"
        assert response.exclusive == {}

    @pytest.mark.asyncio
    async def test_solve_selects_cheapest_single_lab_panel(
        self, service, db_session
    ):
        """Optimizer compares summed prices per lab and keeps the cheapest full panel."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.PriceSnapshot))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        biomarker_rows = (
            await db_session.execute(
                insert(models.Biomarker)
                .returning(models.Biomarker.id, models.Biomarker.slug)
                .values(
                    [
                        {"name": "Marker A", "slug": "marker-a", "elab_code": None},
                        {"name": "Marker B", "slug": "marker-b", "elab_code": None},
                    ]
                )
            )
        ).all()
        biomarker_ids = {slug: biomarker_id for biomarker_id, slug in biomarker_rows}

        await db_session.execute(
            insert(models.Item).values(
                [
                    {
                        "id": 101,
                        "lab_id": 1,
                        "external_id": "diag-marker-a",
                        "kind": "single",
                        "name": "Diagnostyka Marker A",
                        "slug": "diag-marker-a",
                        "price_now_grosz": 5000,
                        "price_min30_grosz": 5000,
                        "currency": "PLN",
                        "is_available": True,
                    },
                    {
                        "id": 102,
                        "lab_id": 1,
                        "external_id": "diag-marker-b",
                        "kind": "single",
                        "name": "Diagnostyka Marker B",
                        "slug": "diag-marker-b",
                        "price_now_grosz": 7000,
                        "price_min30_grosz": 7000,
                        "currency": "PLN",
                        "is_available": True,
                    },
                    {
                        "id": 201,
                        "lab_id": 2,
                        "external_id": "alab-marker-a",
                        "kind": "single",
                        "name": "ALAB Marker A",
                        "slug": "alab-marker-a",
                        "price_now_grosz": 6000,
                        "price_min30_grosz": 6000,
                        "currency": "PLN",
                        "is_available": True,
                    },
                    {
                        "id": 202,
                        "lab_id": 2,
                        "external_id": "alab-marker-b",
                        "kind": "single",
                        "name": "ALAB Marker B",
                        "slug": "alab-marker-b",
                        "price_now_grosz": 8000,
                        "price_min30_grosz": 8000,
                        "currency": "PLN",
                        "is_available": True,
                    },
                ]
            )
        )

        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [
                    {"item_id": 101, "biomarker_id": biomarker_ids["marker-a"]},
                    {"item_id": 102, "biomarker_id": biomarker_ids["marker-b"]},
                    {"item_id": 201, "biomarker_id": biomarker_ids["marker-a"]},
                    {"item_id": 202, "biomarker_id": biomarker_ids["marker-b"]},
                ]
            )
        )
        await db_session.commit()

        response = await service.solve(
            OptimizeRequest(biomarkers=["marker-a", "marker-b"])
        )

        assert response.lab_code == "diag"
        assert response.uncovered == []
        assert {item.id for item in response.items} == {101, 102}
        assert response.total_now == 120.0
        assert response.items[0].biomarkers and response.items[1].biomarkers

    @pytest.mark.asyncio
    async def test_solve_skips_labs_missing_required_biomarker(
        self, service, db_session
    ):
        """Labs that cannot cover the full selection are ignored."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.PriceSnapshot))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        biomarker_rows = (
            await db_session.execute(
                insert(models.Biomarker)
                .returning(models.Biomarker.id, models.Biomarker.slug)
                .values(
                    [
                        {"name": "OnlyDiag", "slug": "only-diag", "elab_code": None},
                        {"name": "Shared", "slug": "shared", "elab_code": None},
                    ]
                )
            )
        ).all()
        biomarker_ids = {slug: biomarker_id for biomarker_id, slug in biomarker_rows}

        await db_session.execute(
            insert(models.Item).values(
                [
                    {
                        "id": 301,
                        "lab_id": 1,
                        "external_id": "diag-only",
                        "kind": "single",
                        "name": "Diagnostyka Only",
                        "slug": "diag-only",
                        "price_now_grosz": 4000,
                        "price_min30_grosz": 4000,
                        "currency": "PLN",
                        "is_available": True,
                    },
                    {
                        "id": 302,
                        "lab_id": 2,
                        "external_id": "alab-shared",
                        "kind": "single",
                        "name": "ALAB Shared",
                        "slug": "alab-shared",
                        "price_now_grosz": 3500,
                        "price_min30_grosz": 3500,
                        "currency": "PLN",
                        "is_available": True,
                    },
                    {
                        "id": 303,
                        "lab_id": 2,
                        "external_id": "alab-only",
                        "kind": "single",
                        "name": "ALAB Only",
                        "slug": "alab-only",
                        "price_now_grosz": 4500,
                        "price_min30_grosz": 4500,
                        "currency": "PLN",
                        "is_available": True,
                    },
                ]
            )
        )

        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [
                    {"item_id": 301, "biomarker_id": biomarker_ids["only-diag"]},
                    {"item_id": 302, "biomarker_id": biomarker_ids["shared"]},
                    {"item_id": 303, "biomarker_id": biomarker_ids["only-diag"]},
                    {"item_id": 303, "biomarker_id": biomarker_ids["shared"]},
                ]
            )
        )
        await db_session.commit()

        response = await service.solve(
            OptimizeRequest(biomarkers=["only-diag", "shared"])
        )

        assert response.lab_code == "alab"
        assert response.uncovered == []
        assert {item.id for item in response.items} == {303}
        assert response.exclusive

    @pytest.mark.asyncio
    async def test_solve_simple_optimization(self, service, db_session):
        """Test simple optimization scenario."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        # Add biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"name": "AST", "elab_code": "AST", "slug": "ast"},
            ])
        )

        # Add items
        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 1,
                    "lab_id": 1,
                    "external_id": "1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                    "currency": "PLN",
                    "is_available": True,
                },
                {
                    "id": 2,
                    "lab_id": 1,
                    "external_id": "2",
                    "kind": "single",
                    "name": "AST Test",
                    "slug": "ast-test",
                    "price_now_grosz": 1200,
                    "price_min30_grosz": 1100,
                    "currency": "PLN",
                    "is_available": True,
                },
                {
                    "id": 3,
                    "lab_id": 1,
                    "external_id": "3",
                    "kind": "package",
                    "name": "Liver Panel",
                    "slug": "liver-panel",
                    "price_now_grosz": 1800,
                    "price_min30_grosz": 1700,
                    "currency": "PLN",
                    "is_available": True,
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

    @pytest.mark.asyncio
    async def test_addon_suggestions_surface_cheapest_packages(self, service, db_session):
        """Ensure addon suggestions recommend cheapest relevant packages."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "marker-a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "marker-b"},
            {"id": 3, "name": "Marker C", "elab_code": "C", "slug": "marker-c"},
            {"id": 4, "name": "Marker D", "elab_code": "D", "slug": "marker-d"},
            {"id": 5, "name": "Marker E", "elab_code": "E", "slug": "marker-e"},
            {"id": 6, "name": "Marker F", "elab_code": "F", "slug": "marker-f"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            {
                "id": 10,
                "lab_id": 1,
                "external_id": "single-a",
                "kind": "single",
                "name": "Single A",
                "slug": "single-a",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 11,
                "lab_id": 1,
                "external_id": "single-b",
                "kind": "single",
                "name": "Single B",
                "slug": "single-b",
                "price_now_grosz": 1500,
                "price_min30_grosz": 1500,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 12,
                "lab_id": 1,
                "external_id": "single-c",
                "kind": "single",
                "name": "Single C",
                "slug": "single-c",
                "price_now_grosz": 3000,
                "price_min30_grosz": 2800,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 13,
                "lab_id": 1,
                "external_id": "single-d",
                "kind": "single",
                "name": "Single D",
                "slug": "single-d",
                "price_now_grosz": 5000,
                "price_min30_grosz": 4800,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 20,
                "lab_id": 1,
                "external_id": "package-ab",
                "kind": "package",
                "name": "Package AB Bonus",
                "slug": "package-ab",
                "price_now_grosz": 3500,
                "price_min30_grosz": 3300,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 21,
                "lab_id": 1,
                "external_id": "package-ab-extended",
                "kind": "package",
                "name": "Package AB Extended",
                "slug": "package-ab-extended",
                "price_now_grosz": 4500,
                "price_min30_grosz": 4400,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await db_session.execute(insert(models.Item).values(items))

        relationships = [
            {"item_id": 10, "biomarker_id": 1},
            {"item_id": 11, "biomarker_id": 2},
            {"item_id": 12, "biomarker_id": 3},
            {"item_id": 13, "biomarker_id": 4},
            {"item_id": 20, "biomarker_id": 1},
            {"item_id": 20, "biomarker_id": 2},
            {"item_id": 21, "biomarker_id": 1},
            {"item_id": 21, "biomarker_id": 2},
            {"item_id": 21, "biomarker_id": 5},
            {"item_id": 21, "biomarker_id": 6},
        ]
        await db_session.execute(insert(models.ItemBiomarker).values(relationships))
        await db_session.commit()

        request = OptimizeRequest(biomarkers=["A", "B", "C", "D"])
        result = await service.solve(request)

        assert [item.kind for item in result.items] == ["single", "single", "single", "single"]
        assert len(result.addon_suggestions) == 1

        suggestion = result.addon_suggestions[0]
        assert suggestion.package.name == "Package AB Extended"
        assert suggestion.upgrade_cost == 20.0
        assert suggestion.estimated_total_now == 125.0
        assert {entry.code for entry in suggestion.covers} == {"A", "B"}
        assert {entry.code for entry in suggestion.adds} == {"E", "F"}
        assert suggestion.removes == []
        assert suggestion.keeps == []
        assert result.labels["E"] == "Marker E"
        assert result.labels["F"] == "Marker F"

    @pytest.mark.asyncio
    async def test_addon_suggestion_requires_readding_tokens(self, service, db_session):
        """Addon upgrade cost accounts for re-adding tokens not covered by the new package."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "b"},
            {"id": 3, "name": "Marker C", "elab_code": "C", "slug": "c"},
            {"id": 4, "name": "Marker D", "elab_code": "D", "slug": "d"},
            {"id": 5, "name": "Marker E", "elab_code": "E", "slug": "e"},
            {"id": 6, "name": "Marker F", "elab_code": "F", "slug": "f"},
            {"id": 7, "name": "Marker G", "elab_code": "G", "slug": "g"},
            {"id": 8, "name": "Marker H", "elab_code": "H", "slug": "h"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            # Singles for re-adding tokens
            {
                "id": 10,
                "lab_id": 1,
                "external_id": "single-a",
                "kind": "single",
                "name": "Single A",
                "slug": "single-a",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 11,
                "lab_id": 1,
                "external_id": "single-c",
                "kind": "single",
                "name": "Single C",
                "slug": "single-c",
                "price_now_grosz": 3000,
                "price_min30_grosz": 3000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 12,
                "lab_id": 1,
                "external_id": "single-f",
                "kind": "single",
                "name": "Single F",
                "slug": "single-f",
                "price_now_grosz": 9000,
                "price_min30_grosz": 9000,
                "currency": "PLN",
                "is_available": True,
            },
            # Packages selected by optimizer
            {
                "id": 20,
                "lab_id": 1,
                "external_id": "package-x",
                "kind": "package",
                "name": "Package X",
                "slug": "package-x",
                "price_now_grosz": 2000,
                "price_min30_grosz": 2000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 21,
                "lab_id": 1,
                "external_id": "package-y",
                "kind": "package",
                "name": "Package Y",
                "slug": "package-y",
                "price_now_grosz": 14500,
                "price_min30_grosz": 14500,
                "currency": "PLN",
                "is_available": True,
            },
            # Candidate package
            {
                "id": 22,
                "lab_id": 1,
                "external_id": "package-z",
                "kind": "package",
                "name": "Package Z",
                "slug": "package-z",
                "price_now_grosz": 20000,
                "price_min30_grosz": 20000,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await db_session.execute(insert(models.Item).values(items))

        relationships = [
            # Singles
            {"item_id": 10, "biomarker_id": 1},
            {"item_id": 11, "biomarker_id": 3},
            {"item_id": 12, "biomarker_id": 6},
            # Packages
            {"item_id": 20, "biomarker_id": 1},
            {"item_id": 20, "biomarker_id": 2},
            {"item_id": 21, "biomarker_id": 3},
            {"item_id": 21, "biomarker_id": 4},
            {"item_id": 21, "biomarker_id": 5},
            {"item_id": 22, "biomarker_id": 2},
            {"item_id": 22, "biomarker_id": 4},
            {"item_id": 22, "biomarker_id": 5},
            {"item_id": 22, "biomarker_id": 7},
            {"item_id": 22, "biomarker_id": 8},
        ]
        await db_session.execute(insert(models.ItemBiomarker).values(relationships))
        await db_session.commit()

        request = OptimizeRequest(biomarkers=["A", "B", "C", "D", "E", "F"])
        result = await service.solve(request)

        assert result.total_now == 255.0
        assert len(result.items) == 3  # Package X, Package Y, Single F
        assert len(result.addon_suggestions) >= 1

        suggestion = result.addon_suggestions[0]
        assert suggestion.package.name == "Package Z"
        assert pytest.approx(suggestion.upgrade_cost, rel=1e-6) == 75.0
        assert pytest.approx(suggestion.estimated_total_now, rel=1e-6) == 330.0
        assert suggestion.removes == []
        assert suggestion.keeps == []

    @pytest.mark.asyncio
    async def test_addon_skips_when_single_cheaper(self, service, db_session):
        """Do not suggest packages when added biomarkers are cheaper purchased separately."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "b"},
            {"id": 3, "name": "Marker C", "elab_code": "C", "slug": "c"},
            {"id": 4, "name": "Marker D", "elab_code": "D", "slug": "d"},
            {"id": 5, "name": "Marker E", "elab_code": "E", "slug": "e"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            {
                "id": 30,
                "lab_id": 1,
                "external_id": "package-x",
                "kind": "package",
                "name": "Package X",
                "slug": "package-x",
                "price_now_grosz": 5000,
                "price_min30_grosz": 5000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 31,
                "lab_id": 1,
                "external_id": "single-d",
                "kind": "single",
                "name": "Single D",
                "slug": "single-d",
                "price_now_grosz": 5000,
                "price_min30_grosz": 5000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 32,
                "lab_id": 1,
                "external_id": "package-y",
                "kind": "package",
                "name": "Package Y",
                "slug": "package-y",
                "price_now_grosz": 7000,
                "price_min30_grosz": 7000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 33,
                "lab_id": 1,
                "external_id": "single-e",
                "kind": "single",
                "name": "Single E",
                "slug": "single-e",
                "price_now_grosz": 500,
                "price_min30_grosz": 500,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await db_session.execute(insert(models.Item).values(items))

        relationships = [
            {"item_id": 30, "biomarker_id": 1},
            {"item_id": 30, "biomarker_id": 2},
            {"item_id": 30, "biomarker_id": 3},
            {"item_id": 31, "biomarker_id": 4},
            {"item_id": 32, "biomarker_id": 1},
            {"item_id": 32, "biomarker_id": 2},
            {"item_id": 32, "biomarker_id": 3},
            {"item_id": 32, "biomarker_id": 5},
            {"item_id": 33, "biomarker_id": 5},
        ]
        await db_session.execute(insert(models.ItemBiomarker).values(relationships))
        await db_session.commit()

        result = await service.solve(OptimizeRequest(biomarkers=["A", "B", "C", "D"]))

        assert result.total_now == 100.0
        assert len(result.items) == 2  # Package X + Single D
        assert result.addon_suggestions == []

    @pytest.mark.asyncio
    async def test_addon_suggestions_marks_removed_bonus(self, service, db_session):
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "b"},
            {"id": 3, "name": "Marker C", "elab_code": "C", "slug": "c"},
            {"id": 4, "name": "Marker D", "elab_code": "D", "slug": "d"},
            {"id": 5, "name": "Marker E", "elab_code": "E", "slug": "e"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            {
                "id": 40,
                "lab_id": 1,
                "external_id": "package-base",
                "kind": "package",
                "name": "Package Base",
                "slug": "package-base",
                "price_now_grosz": 2000,
                "price_min30_grosz": 2000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 41,
                "lab_id": 1,
                "external_id": "single-c",
                "kind": "single",
                "name": "Single C",
                "slug": "single-c",
                "price_now_grosz": 3000,
                "price_min30_grosz": 3000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 42,
                "lab_id": 1,
                "external_id": "package-upgrade",
                "kind": "package",
                "name": "Package Upgrade",
                "slug": "package-upgrade",
                "price_now_grosz": 2200,
                "price_min30_grosz": 2200,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 43,
                "lab_id": 1,
                "external_id": "single-e",
                "kind": "single",
                "name": "Single E",
                "slug": "single-e",
                "price_now_grosz": 600,
                "price_min30_grosz": 600,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await db_session.execute(insert(models.Item).values(items))

        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [
                    {"item_id": 40, "biomarker_id": 1},
                    {"item_id": 40, "biomarker_id": 2},
                    {"item_id": 40, "biomarker_id": 4},
                    {"item_id": 41, "biomarker_id": 3},
                    {"item_id": 42, "biomarker_id": 1},
                    {"item_id": 42, "biomarker_id": 2},
                    {"item_id": 42, "biomarker_id": 5},
                    {"item_id": 43, "biomarker_id": 5},
                ]
            )
        )
        await db_session.commit()

        result = await service.solve(OptimizeRequest(biomarkers=["A", "B", "C"]))

        assert result.total_now == 50.0
        assert len(result.addon_suggestions) == 1
        suggestion = result.addon_suggestions[0]
        assert suggestion.package.name == "Package Upgrade"
        assert suggestion.adds and suggestion.adds[0].code == "E"
        assert {entry.code for entry in suggestion.removes} == {"D"}
        assert suggestion.keeps == []

    @pytest.mark.asyncio
    async def test_solver_prefers_biomarker_names(self, service, db_session):
        """Returned payload should expose biomarker display names instead of slugs."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        biomarker_id = (
            await db_session.execute(
                insert(models.Biomarker)
                .returning(models.Biomarker.id)
                .values(
                    {
                        "name": "Luteotropina",
                        "elab_code": None,
                        "slug": "luteotropina",
                    }
                )
            )
        ).scalar_one()

        await db_session.execute(
            insert(models.Item).values(
                {
                    "id": 501,
                    "lab_id": 1,
                    "external_id": "diag-lut",
                    "kind": "single",
                    "name": "Luteotropina",
                    "slug": "diag-lut",
                    "price_now_grosz": 2000,
                    "price_min30_grosz": 1800,
                    "currency": "PLN",
                    "is_available": True,
                }
            )
        )
        await db_session.execute(
            insert(models.ItemBiomarker).values(
                {"item_id": 501, "biomarker_id": biomarker_id}
            )
        )
        await db_session.commit()

        response = await service.solve(OptimizeRequest(biomarkers=["luteotropina"]))

        assert response.items
        assert response.items[0].biomarkers == ["luteotropina"]
        assert list(response.explain.keys()) == ["luteotropina"]
        assert response.labels["luteotropina"] == "Luteotropina"
        assert response.uncovered == []

    @pytest.mark.asyncio
    async def test_solve_returns_empty_response_when_solver_infeasible(
        self, service, db_session, monkeypatch
    ):
        """Solver failures should surface as empty responses with uncovered tokens."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "ALT", "elab_code": "ALT", "slug": "alt"},
            ])
        )
        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 1,
                    "lab_id": 1,
                    "external_id": "1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 1000,
                    "currency": "PLN",
                    "is_available": True,
                }
            ])
        )
        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 1, "biomarker_id": 1},
            ])
        )
        await db_session.commit()

        monkeypatch.setattr(
            cp_model.CpSolver,
            "Solve",
            lambda self, *_args, **_kwargs: cp_model.INFEASIBLE,
        )

        result = await service.solve(OptimizeRequest(biomarkers=["ALT"]))

        assert result.items == []
        assert result.uncovered == ["ALT"]
        assert result.total_now == 0.0
        assert result.explain == {}

    @pytest.mark.asyncio
    async def test_solve_ignores_unavailable_items(self, service, db_session):
        """Items flagged as unavailable must not be considered by the solver."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
            ])
        )
        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 1,
                    "lab_id": 2,
                    "external_id": "1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 0,
                    "price_min30_grosz": 0,
                    "currency": "PLN",
                    "is_available": False,
                }
            ])
        )
        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 1, "biomarker_id": 1},
            ])
        )
        await db_session.commit()

        result = await service.solve(OptimizeRequest(biomarkers=["ALT"]))

        assert result.items == []
        assert result.uncovered == ["ALT"]
        assert result.total_now == 0.0

    def test_candidate_item_on_sale_property(self):
        """Test CandidateItem on_sale property."""
        item1 = make_candidate(
            id=1,
            kind="single",
            name="Test",
            slug="test",
            sale_price=None,
            regular_price=None,
        )
        assert not item1.on_sale

        # Item on sale
        item2 = make_candidate(
            id=2,
            kind="single",
            name="Test",
            slug="test",
            sale_price=800,
            regular_price=1000,
        )
        assert item2.on_sale

        # Item not on sale (sale price >= regular price)
        item3 = make_candidate(
            id=3,
            kind="single",
            name="Test",
            slug="test",
            sale_price=1000,
            regular_price=1000,
        )
        assert not item3.on_sale

    def test_item_url_generation(self):
        """Test URL generation for different item kinds."""
        single_item = make_candidate(
            id=1,
            kind="single",
            name="Test",
            slug="test-single",
        )
        assert _item_url(single_item) == "https://diag.pl/sklep/badania/test-single"

        package_item = make_candidate(
            id=2,
            kind="package",
            name="Test Package",
            slug="test-package",
        )
        assert _item_url(package_item) == "https://diag.pl/sklep/pakiety/test-package"

        alab_single = make_candidate(
            id=3,
            kind="single",
            lab_id=2,
            lab_code="alab",
            name="ALAB Test",
            slug="alab-test",
            single_url_template=None,
        )
        assert _item_url(alab_single) == "https://www.alab.pl/badanie/alab-test"

        alab_package = make_candidate(
            id=4,
            kind="package",
            lab_id=2,
            lab_code="alab",
            name="ALAB Pakiet",
            slug="alab-pakiet",
            single_url_template=None,
            package_url_template=None,
        )
        assert _item_url(alab_package) == "https://www.alab.pl/pakiet/alab-pakiet"


async def _ensure_default_labs(session):
    existing = await session.scalar(
        select(models.Lab.id).where(models.Lab.code == "diag")
    )
    if existing is not None:
        return
    await session.execute(
        insert(models.Lab).values(
            {
                "id": 1,
                "code": "diag",
                "name": "Diagnostyka",
                "slug": "diag",
                "timezone": "Europe/Warsaw",
                "single_item_url_template": "https://diag.pl/sklep/badania/{slug}",
                "package_item_url_template": "https://diag.pl/sklep/pakiety/{slug}",
            }
        )
    )
    await session.execute(
        insert(models.Lab).values(
            {
                "id": 2,
                "code": "alab",
                "name": "ALAB",
                "slug": "alab",
                "timezone": "Europe/Warsaw",
                "single_item_url_template": None,
                "package_item_url_template": None,
            }
        )
    )
    await session.commit()
