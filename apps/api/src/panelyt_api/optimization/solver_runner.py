from __future__ import annotations

import logging
from collections.abc import Callable, Sequence

from ortools.sat.python import cp_model
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.optimization.biomarkers import (
    apply_synthetic_coverage_overrides,
    augment_labels_for_tokens,
    bonus_price_map,
    expand_requested_tokens,
    expand_synthetic_panel_biomarkers,
    get_all_biomarkers_for_items,
)
from panelyt_api.optimization.context import (
    CandidateItem,
    ResolvedBiomarker,
    SolverOutcome,
)
from panelyt_api.optimization.item_url import item_url
from panelyt_api.optimization.response_builder import (
    ResponseDependencies,
    build_response_payload,
)
from panelyt_api.optimization.solver import (
    apply_coverage_constraints,
    apply_objective,
    build_coverage_map,
    build_solver_model,
    extract_selected_candidates,
    solve_model,
)
from panelyt_api.schemas.optimize import OptimizeResponse

logger = logging.getLogger(__name__)

EmptyResponseFactory = Callable[[Sequence[str]], OptimizeResponse]


class SolverRunner:
    def __init__(
        self, session: AsyncSession, empty_response: EmptyResponseFactory
    ) -> None:
        self.session = session
        self._empty_response = empty_response

    async def run(
        self,
        candidates: Sequence[CandidateItem],
        biomarkers: Sequence[ResolvedBiomarker],
        institution_id: int,
        *,
        currency: str,
    ) -> SolverOutcome:
        coverage_map = build_coverage_map(candidates)
        model, variables = build_solver_model(candidates)
        uncovered = apply_coverage_constraints(
            model, variables, coverage_map, biomarkers
        )

        if not variables:
            response = self._empty_response(uncovered)
            return SolverOutcome(
                response=response,
                chosen_items=[],
                uncovered_tokens=set(uncovered),
                total_now_grosz=0,
                labels={},
            )

        apply_objective(model, candidates, variables)
        status, solver = solve_model(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            logger.warning("CP-SAT returned status %s", status)
            fallback_uncovered = uncovered or [b.token for b in biomarkers]
            response = self._empty_response(fallback_uncovered)
            return SolverOutcome(
                response=response,
                chosen_items=[],
                uncovered_tokens=set(fallback_uncovered),
                total_now_grosz=0,
                labels={},
            )

        chosen = extract_selected_candidates(solver, candidates, variables)
        deps = ResponseDependencies(
            expand_requested_tokens=expand_requested_tokens,
            get_all_biomarkers_for_items=lambda item_ids: get_all_biomarkers_for_items(
                self.session, item_ids
            ),
            expand_synthetic_panel_biomarkers=expand_synthetic_panel_biomarkers,
            apply_synthetic_coverage_overrides=apply_synthetic_coverage_overrides,
            augment_labels_for_tokens=lambda tokens, labels: augment_labels_for_tokens(
                self.session, tokens, labels
            ),
            bonus_price_map=lambda tokens, target_id: bonus_price_map(
                self.session, tokens, target_id
            ),
            item_url=item_url,
        )
        response, labels = await build_response_payload(
            chosen,
            uncovered=uncovered,
            requested_tokens=[biomarker.token for biomarker in biomarkers],
            institution_id=institution_id,
            deps=deps,
            currency=currency,
        )
        total_now_grosz = sum(item.price_now for item in chosen)
        return SolverOutcome(
            response=response,
            chosen_items=list(chosen),
            uncovered_tokens=set(uncovered),
            total_now_grosz=int(total_now_grosz),
            labels=labels,
        )
