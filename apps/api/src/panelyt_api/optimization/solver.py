from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import cast

from ortools.sat.python import cp_model

from panelyt_api.optimization.context import CandidateItem, ResolvedBiomarker

SOLVER_TIMEOUT_SECONDS = 5.0
SOLVER_WORKERS = 8


def build_solver_model(
    candidates: Sequence[CandidateItem],
) -> tuple[cp_model.CpModel, dict[int, cp_model.IntVar]]:
    model = cp_model.CpModel()
    variables = {candidate.id: model.NewBoolVar(candidate.slug) for candidate in candidates}
    return model, variables


def build_coverage_map(
    candidates: Sequence[CandidateItem],
) -> dict[str, list[int]]:
    coverage: dict[str, list[int]] = {}
    for item in candidates:
        for token in item.coverage:
            coverage.setdefault(token, []).append(item.id)
    return coverage


def apply_coverage_constraints(
    model: cp_model.CpModel,
    variables: Mapping[int, cp_model.IntVar],
    coverage_map: Mapping[str, Sequence[int]],
    biomarkers: Sequence[ResolvedBiomarker],
) -> list[str]:
    uncovered: list[str] = []
    for biomarker in biomarkers:
        covering = coverage_map.get(biomarker.token)
        if not covering:
            uncovered.append(biomarker.token)
            continue
        model.Add(sum(variables[item_id] for item_id in covering) >= 1)
    return uncovered


def apply_objective(
    model: cp_model.CpModel,
    candidates: Sequence[CandidateItem],
    variables: Mapping[int, cp_model.IntVar],
) -> None:
    model.Minimize(
        sum(candidate.price_now * variables[candidate.id] for candidate in candidates)
    )


def solve_model(
    model: cp_model.CpModel,
) -> tuple[int, cp_model.CpSolver]:
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = SOLVER_TIMEOUT_SECONDS
    solver.parameters.num_search_workers = SOLVER_WORKERS
    status = cast(int, solver.Solve(model))
    return status, solver


def extract_selected_candidates(
    solver: cp_model.CpSolver,
    candidates: Sequence[CandidateItem],
    variables: Mapping[int, cp_model.IntVar],
) -> list[CandidateItem]:
    return [
        candidate
        for candidate in candidates
        if solver.Value(variables[candidate.id])
    ]
