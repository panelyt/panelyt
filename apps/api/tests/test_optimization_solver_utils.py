from __future__ import annotations

from ortools.sat.python import cp_model

from panelyt_api.optimization.context import CandidateItem, ResolvedBiomarker
from panelyt_api.optimization.solver import (
    apply_coverage_constraints,
    apply_objective,
    build_coverage_map,
    build_solver_model,
    extract_selected_candidates,
    solve_model,
)


def make_candidate(**overrides) -> CandidateItem:
    defaults = {
        "id": 1,
        "kind": "single",
        "name": "Test",
        "slug": "test",
        "external_id": "item-1",
        "price_now": 100,
        "price_min30": 100,
        "sale_price": None,
        "regular_price": None,
        "coverage": set(),
    }
    defaults.update(overrides)
    coverage = defaults.get("coverage", set())
    defaults["coverage"] = set(coverage)
    return CandidateItem(**defaults)


def make_biomarker(token: str, identifier: int) -> ResolvedBiomarker:
    return ResolvedBiomarker(
        id=identifier,
        token=token,
        display_name=token,
        original=token,
    )


def test_solver_selects_cheapest_cover():
    candidates = [
        make_candidate(
            id=1,
            kind="package",
            name="Combo",
            slug="combo",
            price_now=150,
            price_min30=150,
            coverage={"A", "B"},
        ),
        make_candidate(
            id=2,
            kind="single",
            name="A",
            slug="a",
            price_now=80,
            price_min30=80,
            coverage={"A"},
        ),
        make_candidate(
            id=3,
            kind="single",
            name="B",
            slug="b",
            price_now=90,
            price_min30=90,
            coverage={"B"},
        ),
    ]
    biomarkers = [make_biomarker("A", 1), make_biomarker("B", 2)]

    coverage_map = build_coverage_map(candidates)
    model, variables = build_solver_model(candidates)
    uncovered = apply_coverage_constraints(model, variables, coverage_map, biomarkers)
    assert uncovered == []

    apply_objective(model, candidates, variables)
    status, solver = solve_model(model)

    assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    chosen = extract_selected_candidates(solver, candidates, variables)
    assert {item.id for item in chosen} == {1}


def test_apply_coverage_constraints_reports_uncovered_tokens():
    candidates = [
        make_candidate(
            id=1,
            kind="single",
            name="A",
            slug="a",
            price_now=80,
            price_min30=80,
            coverage={"A"},
        )
    ]
    biomarkers = [make_biomarker("A", 1), make_biomarker("B", 2)]

    coverage_map = build_coverage_map(candidates)
    model, variables = build_solver_model(candidates)
    uncovered = apply_coverage_constraints(model, variables, coverage_map, biomarkers)

    assert uncovered == ["B"]
