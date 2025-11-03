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

    @pytest.mark.asyncio
    async def test_add_on_suggestions_surface_bonus_packages(self, service, db_session):
        """Suggest packages that add cheap bonus biomarkers."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1001, "name": "Ferrytyna", "elab_code": "FERR", "slug": "ferr"},
                {"id": 1002, "name": "Zelazo", "elab_code": "IRON", "slug": "iron"},
                {"id": 1003, "name": "Witamina B9", "elab_code": "B9", "slug": "b9"},
                {"id": 1004, "name": "Witamina B12", "elab_code": "B12", "slug": "b12"},
            ])
        )
        await db_session.commit()

        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 2001,
                    "lab_id": 1,
                    "external_id": "ferr-single",
                    "kind": "single",
                    "name": "Ferrytyna",
                    "slug": "ferrytyna",
                    "price_now_grosz": 2000,
                    "price_min30_grosz": 2000,
                    "currency": "PLN",
                    "is_available": True,
                },
                {
                    "id": 2002,
                    "lab_id": 1,
                    "external_id": "iron-single",
                    "kind": "single",
                    "name": "Zelazo",
                    "slug": "zelazo",
                    "price_now_grosz": 2000,
                    "price_min30_grosz": 2000,
                    "currency": "PLN",
                    "is_available": True,
                },
                {
                    "id": 2003,
                    "lab_id": 1,
                    "external_id": "combo-package",
                    "kind": "package",
                    "name": "Panel zelazo + ferrytyna + B-vitaminy",
                    "slug": "panel-zelazo-ferrytyna",
                    "price_now_grosz": 4300,
                    "price_min30_grosz": 4300,
                    "currency": "PLN",
                    "is_available": True,
                },
            ])
        )
        await db_session.commit()

        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 2001, "biomarker_id": 1001},
                {"item_id": 2002, "biomarker_id": 1002},
                {"item_id": 2003, "biomarker_id": 1001},
                {"item_id": 2003, "biomarker_id": 1002},
                {"item_id": 2003, "biomarker_id": 1003},
                {"item_id": 2003, "biomarker_id": 1004},
            ])
        )
        await db_session.commit()

        response = await service.solve(OptimizeRequest(biomarkers=["FERR", "IRON"]))

        assert len(response.items) == 2
        assert {item.id for item in response.items} == {2001, 2002}

        suggestions = response.add_on_suggestions
        assert len(suggestions) == 1
        suggestion = suggestions[0]

        assert suggestion.item.id == 2003
        assert suggestion.item.kind == "package"
        assert set(suggestion.matched_tokens) == {"FERR", "IRON"}
        assert set(suggestion.bonus_tokens) == {"B9", "B12"}
        assert suggestion.already_included_tokens == []
        assert suggestion.incremental_now_grosz == 300

    @pytest.mark.asyncio
    async def test_add_on_suggestions_respect_existing_bonus(self, service, db_session):
        """Do not count already covered bonus biomarkers as new suggestions."""
        await _ensure_default_labs(db_session)
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 4001, "name": "Ferrytyna", "elab_code": "FERR", "slug": "ferr"},
                {"id": 4002, "name": "Witamina B9", "elab_code": "B9", "slug": "b9"},
                {"id": 4003, "name": "Witamina B12", "elab_code": "B12", "slug": "b12"},
            ])
        )
        await db_session.commit()

        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 5001,
                    "lab_id": 1,
                    "external_id": "ferr-single",
                    "kind": "single",
                    "name": "Ferrytyna",
                    "slug": "ferrytyna",
                    "price_now_grosz": 4000,
                    "price_min30_grosz": 4000,
                    "currency": "PLN",
                    "is_available": True,
                },
                {
                    "id": 5002,
                    "lab_id": 1,
                    "external_id": "base-package",
                    "kind": "package",
                    "name": "Panel ferrytyna + B9",
                    "slug": "panel-ferr-b9",
                    "price_now_grosz": 2000,
                    "price_min30_grosz": 2000,
                    "currency": "PLN",
                    "is_available": True,
                },
                {
                    "id": 5003,
                    "lab_id": 1,
                    "external_id": "upgrade-package",
                    "kind": "package",
                    "name": "Panel ferrytyna + B9 + B12",
                    "slug": "panel-ferr-b9-b12",
                    "price_now_grosz": 2600,
                    "price_min30_grosz": 2600,
                    "currency": "PLN",
                    "is_available": True,
                },
            ])
        )
        await db_session.commit()

        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 5001, "biomarker_id": 4001},
                {"item_id": 5002, "biomarker_id": 4001},
                {"item_id": 5002, "biomarker_id": 4002},
                {"item_id": 5003, "biomarker_id": 4001},
                {"item_id": 5003, "biomarker_id": 4002},
                {"item_id": 5003, "biomarker_id": 4003},
            ])
        )
        await db_session.commit()

        response = await service.solve(OptimizeRequest(biomarkers=["FERR"]))

        item_ids = {item.id for item in response.items}
        assert item_ids == {5002}

        suggestions = response.add_on_suggestions
        assert len(suggestions) == 1
        suggestion = suggestions[0]
        assert suggestion.item.id == 5003
        assert suggestion.bonus_tokens == ["B12"]
        assert suggestion.already_included_tokens == ["B9"]

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
