from __future__ import annotations

import logging
import math
import time
from collections.abc import Iterable, Sequence

from cachetools import LRUCache
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core import metrics
from panelyt_api.core.cache import optimization_cache, optimization_context_cache
from panelyt_api.optimization.addons import AddonDependencies, compute_addon_suggestions
from panelyt_api.optimization.biomarkers import (
    apply_synthetic_coverage_overrides,
    augment_labels_for_tokens,
    bonus_price_map,
    expand_requested_tokens_raw,
    expand_synthetic_panel_biomarkers,
    get_all_biomarkers_for_items,
    token_display_map,
)
from panelyt_api.optimization.candidate_collector import CandidateCollector
from panelyt_api.optimization.candidates import prune_candidates
from panelyt_api.optimization.context import (
    CandidateItem,
    OptimizationContext,
    ResolvedBiomarker,
    SolverOutcome,
)
from panelyt_api.optimization.item_url import item_url
from panelyt_api.optimization.solver_runner import SolverRunner
from panelyt_api.schemas.optimize import (
    AddonSuggestionsRequest,
    AddonSuggestionsResponse,
    OptimizeRequest,
    OptimizeResponse,
)
from panelyt_api.services.biomarker_resolver import BiomarkerResolver

logger = logging.getLogger(__name__)


DEFAULT_CURRENCY = "PLN"
COVER_CACHE_MAXSIZE = 1000


class OptimizationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._resolver = BiomarkerResolver(session)
        self._candidate_collector = CandidateCollector(session)
        self._solver_runner = SolverRunner(session, empty_response=self._empty_response)
        self._cover_cache: LRUCache[
            tuple[frozenset[str], frozenset[int]], tuple[float, frozenset[int]]
        ] = LRUCache(maxsize=COVER_CACHE_MAXSIZE)
        self._last_context: OptimizationContext | None = None

    async def solve(
        self, payload: OptimizeRequest, institution_id: int
    ) -> OptimizeResponse:
        start_time = time.perf_counter()
        try:
            resolved, unresolved_inputs = await self._resolver.resolve_tokens(payload.biomarkers)
            if not resolved:
                return self._empty_response(payload.biomarkers)

            candidates = await self._collect_candidates(resolved, institution_id)
            if not candidates:
                return self._empty_response(payload.biomarkers)

            context = self._prepare_context(resolved, unresolved_inputs, candidates)
            if context is None:
                fallback_uncovered = self._fallback_uncovered_tokens(resolved, unresolved_inputs)
                return self._empty_response(fallback_uncovered)

            self._last_context = context
            outcome = await self._run_solver(
                context.candidates, context.resolved, institution_id
            )
            if not outcome.has_selection:
                fallback_uncovered = self._fallback_uncovered_tokens(
                    resolved, unresolved_inputs
                )
                base_response = self._empty_response(fallback_uncovered)
            else:
                combined_uncovered = self._combine_uncovered_tokens(
                    context.unresolved_inputs, outcome.uncovered_tokens
                )
                resolved_labels = token_display_map(context.resolved)
                base_response = outcome.response.model_copy(
                    update={
                        "uncovered": combined_uncovered,
                        "labels": outcome.labels | resolved_labels,
                    }
                )

            return await self._finalize_response(base_response)
        finally:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            metrics.increment("optimization.solve", mode="single")
            logger.info(
                "Optimization solve finished duration_ms=%s",
                duration_ms,
            )

    async def solve_cached(
        self, payload: OptimizeRequest, institution_id: int
    ) -> OptimizeResponse:
        """Solve optimization with caching.

        Returns cached result if available for the same biomarkers.
        Cache has 1-hour TTL since prices change at most once daily.
        Also caches the OptimizationContext for faster addon computation.
        """
        cache_key = optimization_cache.make_key(payload.biomarkers, institution_id)

        cached = optimization_cache.get(cache_key)
        if cached is not None:
            return cached

        result = await self.solve(payload, institution_id)
        optimization_cache.set(cache_key, result)

        if self._last_context is not None:
            context_key = optimization_context_cache.make_key(
                payload.biomarkers, institution_id
            )
            optimization_context_cache.set(context_key, self._last_context)

        return result

    async def compute_addons(
        self, payload: AddonSuggestionsRequest, institution_id: int
    ) -> AddonSuggestionsResponse:
        """Compute addon suggestions for a given set of selected items.

        This is called separately from solve() to allow lazy loading of addon
        suggestions after the main optimization result is displayed.

        Uses cached OptimizationContext from prior solve() call when available,
        avoiding expensive re-computation of candidates.
        """
        context_key = optimization_context_cache.make_key(
            payload.biomarkers, institution_id
        )
        context = optimization_context_cache.get(context_key)

        if context is not None:
            logger.debug("Using cached context for addon computation")
        else:
            logger.debug("Cache miss - computing context for addons")
            resolved, _ = await self._resolver.resolve_tokens(payload.biomarkers)
            if not resolved:
                return AddonSuggestionsResponse()

            candidates = await self._collect_candidates(resolved, institution_id)
            if not candidates:
                return AddonSuggestionsResponse()

            context = self._prepare_context(resolved, [], candidates)
            if context is None:
                return AddonSuggestionsResponse()

            optimization_context_cache.set(context_key, context)

        # Find chosen items from candidates by ID
        selected_ids = set(payload.selected_item_ids)
        chosen_items: list[CandidateItem] = []
        for candidate in context.candidates:
            if candidate.id in selected_ids:
                chosen_items.append(candidate)

        if not chosen_items:
            return AddonSuggestionsResponse()

        # Build labels from resolved biomarkers
        existing_labels = token_display_map(context.resolved)

        deps = AddonDependencies(
            minimal_cover_subset=self._minimal_cover_subset,
            expand_requested_tokens_raw=expand_requested_tokens_raw,
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
            token_display_map=token_display_map,
            item_url=item_url,
        )

        suggestions, suggestion_labels = await compute_addon_suggestions(
            context,
            chosen_items,
            existing_labels,
            institution_id,
            deps,
            currency=DEFAULT_CURRENCY,
        )

        return AddonSuggestionsResponse(
            addon_suggestions=suggestions,
            labels={**existing_labels, **suggestion_labels},
        )

    async def _collect_candidates(
        self, biomarkers: Sequence[ResolvedBiomarker], institution_id: int
    ) -> list[CandidateItem]:
        return await self._candidate_collector.collect(biomarkers, institution_id)

    def _prepare_context(
        self,
        resolved: list[ResolvedBiomarker],
        unresolved_inputs: list[str],
        candidates: list[CandidateItem],
    ) -> OptimizationContext | None:
        pruned = prune_candidates(candidates)
        if not pruned:
            return None
        token_to_original = {entry.token: entry.original for entry in resolved}
        return OptimizationContext(
            resolved=list(resolved),
            unresolved_inputs=list(unresolved_inputs),
            candidates=pruned,
            token_to_original=token_to_original,
        )

    async def _run_solver(
        self,
        candidates: Sequence[CandidateItem],
        biomarkers: Sequence[ResolvedBiomarker],
        institution_id: int,
    ) -> SolverOutcome:
        return await self._solver_runner.run(
            candidates, biomarkers, institution_id, currency=DEFAULT_CURRENCY
        )

    async def _finalize_response(
        self,
        response: OptimizeResponse,
    ) -> OptimizeResponse:
        # Addon suggestions are computed lazily via separate endpoint
        return response.model_copy(
            update={
                "addon_suggestions": [],
            }
        )

    def _minimal_cover_subset(
        self,
        tokens: set[str],
        items: Sequence[CandidateItem],
    ) -> tuple[float, set[int]]:
        if not tokens:
            return 0, set()

        cache_key = (frozenset(tokens), frozenset(item.id for item in items))
        cached = self._cover_cache.get(cache_key)
        if cached is not None:
            cost, selection = cached
            return cost, set(selection)

        ordered_tokens = sorted(tokens)
        token_index = {token: idx for idx, token in enumerate(ordered_tokens)}
        target_mask = (1 << len(ordered_tokens)) - 1

        dp: dict[int, tuple[int, frozenset[int]]] = {0: (0, frozenset())}

        for item in items:
            mask = 0
            for token in item.coverage:
                idx = token_index.get(token)
                if idx is not None:
                    mask |= 1 << idx
            if mask == 0:
                continue

            current_states = list(dp.items())
            for state_mask, (cost, selection) in current_states:
                new_mask = state_mask | mask
                new_cost = cost + int(item.price_now)
                existing = dp.get(new_mask)
                if existing is not None and existing[0] <= new_cost:
                    continue
                dp[new_mask] = (new_cost, selection | frozenset({item.id}))

        result = dp.get(target_mask)
        if result is None:
            self._cover_cache[cache_key] = (math.inf, frozenset())
            return math.inf, set()

        cost, selection = result
        self._cover_cache[cache_key] = (float(cost), selection)
        return int(cost), set(selection)

    @staticmethod
    def _combine_uncovered_tokens(
        unresolved_inputs: Sequence[str], uncovered_tokens: Iterable[str]
    ) -> list[str]:
        return list(dict.fromkeys(list(unresolved_inputs) + sorted(uncovered_tokens)))

    @staticmethod
    def _fallback_uncovered_tokens(
        resolved: Sequence[ResolvedBiomarker], unresolved_inputs: Sequence[str]
    ) -> list[str]:
        tokens = [biomarker.token for biomarker in resolved]
        return list(dict.fromkeys(list(unresolved_inputs) + tokens))

    @staticmethod
    def _empty_response(uncovered: Sequence[str]) -> OptimizeResponse:
        return OptimizeResponse(
            total_now=0.0,
            total_min30=0.0,
            currency=DEFAULT_CURRENCY,
            items=[],
            bonus_total_now=0.0,
            explain={},
            uncovered=list(uncovered),
            labels={},
        )

    def _uncovered_tokens(
        self, biomarkers: Sequence[ResolvedBiomarker], candidates: Sequence[CandidateItem]
    ) -> set[str]:
        available = set()
        for item in candidates:
            available.update(item.coverage)
        tokens = {b.token for b in biomarkers}
        return tokens - available
