from __future__ import annotations

import logging
import math
from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, datetime, timedelta
from typing import cast

from cachetools import LRUCache
from ortools.sat.python import cp_model
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core.cache import optimization_cache, optimization_context_cache
from panelyt_api.db import models
from panelyt_api.optimization.context import (
    AddonComputation,
    CandidateItem,
    LabSelectionAccumulator,
    LabSolution,
    MultiLabSolution,
    NormalizedBiomarkerInput,
    OptimizationContext,
    ResolvedBiomarker,
    SolverOutcome,
)
from panelyt_api.schemas.common import ItemOut
from panelyt_api.schemas.optimize import (
    AddonBiomarker,
    AddonSuggestion,
    AddonSuggestionsRequest,
    AddonSuggestionsResponse,
    LabAvailability,
    LabSelectionSummary,
    OptimizeMode,
    OptimizeRequest,
    OptimizeResponse,
)
from panelyt_api.utils.normalization import (
    create_normalized_lookup,
    normalize_token,
    normalize_tokens_set,
)

logger = logging.getLogger(__name__)


DEFAULT_CURRENCY = "PLN"
SOLVER_TIMEOUT_SECONDS = 5.0
SOLVER_WORKERS = 8
PRICE_HISTORY_LOOKBACK_DAYS = 30
MAX_PACKAGE_VARIANTS_PER_COVERAGE = 2
MAX_SINGLE_VARIANTS_PER_TOKEN = 2
COVER_CACHE_MAXSIZE = 1000


class OptimizationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._cover_cache: LRUCache[
            tuple[frozenset[str], frozenset[int]], tuple[float, frozenset[int]]
        ] = LRUCache(maxsize=COVER_CACHE_MAXSIZE)
        self._last_context: OptimizationContext | None = None

    async def solve(self, payload: OptimizeRequest) -> OptimizeResponse:
        resolved, unresolved_inputs = await self._resolve_biomarkers(payload.biomarkers)
        try:
            mode = OptimizeMode(payload.mode)
        except (ValueError, TypeError):
            mode = OptimizeMode.AUTO
        if not resolved:
            empty = self._empty_response(payload.biomarkers)
            return empty.model_copy(update={"mode": mode})

        candidates = await self._collect_candidates(resolved)
        if not candidates:
            empty = self._empty_response(payload.biomarkers)
            return empty.model_copy(update={"mode": mode})

        context = self._prepare_context(resolved, unresolved_inputs, candidates)
        if context is None:
            fallback_uncovered = self._fallback_uncovered_tokens(resolved, unresolved_inputs)
            empty = self._empty_response(fallback_uncovered)
            return empty.model_copy(update={"mode": mode})

        self._last_context = context
        fallback_uncovered = self._fallback_uncovered_tokens(resolved, unresolved_inputs)
        chosen_items: list[CandidateItem] = []

        if mode == OptimizeMode.SPLIT:
            multi_solution = await self._solve_multi_lab(context)
            if multi_solution is not None:
                chosen_items = multi_solution.chosen_items
                base_response = multi_solution.response
            else:
                base_response = self._empty_response(fallback_uncovered)
        elif mode == OptimizeMode.SINGLE_LAB:
            single_solution = await self._solve_single_lab(payload.lab_code, context)
            if single_solution is not None:
                chosen_items = single_solution.chosen_items
                base_response = single_solution.response
            else:
                base_response = self._empty_response(fallback_uncovered)
        else:
            best_solution = await self._find_best_solution(context)
            if best_solution is not None:
                chosen_items = best_solution.chosen_items
                base_response = best_solution.response
            else:
                multi_solution = await self._solve_multi_lab(context)
                if multi_solution is not None:
                    chosen_items = multi_solution.chosen_items
                    base_response = multi_solution.response
                else:
                    base_response = self._empty_response(fallback_uncovered)

        return await self._finalize_response(base_response, context, chosen_items, mode)

    async def solve_cached(self, payload: OptimizeRequest) -> OptimizeResponse:
        """Solve optimization with caching.

        Returns cached result if available for the same biomarkers + mode + lab_code.
        Cache has 1-hour TTL since prices change at most once daily.
        Also caches the OptimizationContext for faster addon computation.
        """
        cache_key = optimization_cache.make_key(
            payload.biomarkers, payload.mode, payload.lab_code
        )

        cached = optimization_cache.get(cache_key)
        if cached is not None:
            return cached

        result = await self.solve(payload)
        optimization_cache.set(cache_key, result)

        if self._last_context is not None:
            context_key = optimization_context_cache.make_key(
                payload.biomarkers, payload.lab_code
            )
            optimization_context_cache.set(context_key, self._last_context)

        return result

    async def compute_addons(
        self, payload: AddonSuggestionsRequest
    ) -> AddonSuggestionsResponse:
        """Compute addon suggestions for a given set of selected items.

        This is called separately from solve() to allow lazy loading of addon
        suggestions after the main optimization result is displayed.

        Uses cached OptimizationContext from prior solve() call when available,
        avoiding expensive re-computation of candidates.
        """
        context_key = optimization_context_cache.make_key(
            payload.biomarkers, payload.lab_code
        )
        context = optimization_context_cache.get(context_key)

        if context is not None:
            logger.debug("Using cached context for addon computation")
        else:
            logger.debug("Cache miss - computing context for addons")
            resolved, _ = await self._resolve_biomarkers(payload.biomarkers)
            if not resolved:
                return AddonSuggestionsResponse()

            candidates = await self._collect_candidates(resolved)
            if not candidates:
                return AddonSuggestionsResponse()

            context = self._prepare_context(resolved, [], candidates)
            if context is None:
                return AddonSuggestionsResponse()

            optimization_context_cache.set(context_key, context)

        # Find chosen items from candidates by ID
        selected_ids = set(payload.selected_item_ids)
        chosen_items: list[CandidateItem] = []
        for lab_candidates in context.grouped_candidates.values():
            for candidate in lab_candidates:
                if candidate.id in selected_ids:
                    chosen_items.append(candidate)

        if not chosen_items:
            return AddonSuggestionsResponse()

        # Build labels from resolved biomarkers
        existing_labels = self._token_display_map(context.resolved)

        suggestions, suggestion_labels = await self._addon_suggestions(
            context, chosen_items, payload.lab_code or "", existing_labels
        )

        return AddonSuggestionsResponse(
            addon_suggestions=suggestions,
            labels={**existing_labels, **suggestion_labels},
        )

    async def _resolve_biomarkers(
        self, inputs: Sequence[str]
    ) -> tuple[list[ResolvedBiomarker], list[str]]:
        normalized_inputs = self._normalize_biomarker_inputs(inputs)
        if not normalized_inputs:
            return [], []

        search_tokens = {entry.normalized for entry in normalized_inputs}
        match_index = await self._fetch_biomarker_matches(search_tokens)

        resolved: list[ResolvedBiomarker] = []
        unresolved: list[str] = []
        for entry in normalized_inputs:
            biomarker = self._pick_biomarker(match_index, entry.normalized)
            if biomarker is None:
                unresolved.append(entry.raw)
                continue
            resolved.append(self._build_resolved_biomarker(biomarker, entry.raw))
        return resolved, unresolved

    def _normalize_biomarker_inputs(
        self, inputs: Sequence[str]
    ) -> list[NormalizedBiomarkerInput]:
        normalized: list[NormalizedBiomarkerInput] = []
        for raw in inputs:
            token = normalize_token(raw)
            if token:
                normalized.append(NormalizedBiomarkerInput(raw=raw, normalized=token))
        return normalized

    async def _fetch_biomarker_matches(
        self, search_tokens: set[str]
    ) -> dict[str, list[tuple[int, models.Biomarker]]]:
        if not search_tokens:
            return {}

        statement = select(models.Biomarker).where(
            or_(
                func.lower(models.Biomarker.elab_code).in_(search_tokens),
                func.lower(models.Biomarker.slug).in_(search_tokens),
                func.lower(models.Biomarker.name).in_(search_tokens),
            )
        )
        rows = (await self.session.execute(statement)).scalars().all()
        return self._build_biomarker_match_index(rows, search_tokens)

    def _build_biomarker_match_index(
        self,
        rows: Sequence[models.Biomarker],
        search_tokens: set[str],
    ) -> dict[str, list[tuple[int, models.Biomarker]]]:
        match_index: dict[str, list[tuple[int, models.Biomarker]]] = {}
        for row in rows:
            for priority, candidate in enumerate((row.elab_code, row.slug, row.name)):
                normalized = normalize_token(candidate)
                if normalized and normalized in search_tokens:
                    match_index.setdefault(normalized, []).append((priority, row))

        for candidates in match_index.values():
            candidates.sort(key=lambda item: (item[0], item[1].id))
        return match_index

    @staticmethod
    def _pick_biomarker(
        match_index: dict[str, list[tuple[int, models.Biomarker]]],
        token: str,
    ) -> models.Biomarker | None:
        candidates = match_index.get(token)
        if not candidates:
            return None
        return candidates[0][1]

    @staticmethod
    def _build_resolved_biomarker(
        biomarker: models.Biomarker, original: str
    ) -> ResolvedBiomarker:
        token = biomarker.elab_code or biomarker.slug or biomarker.name
        return ResolvedBiomarker(
            id=biomarker.id,
            token=token,
            display_name=biomarker.name,
            original=original,
        )

    async def _collect_candidates(
        self, biomarkers: Sequence[ResolvedBiomarker]
    ) -> list[CandidateItem]:
        biomarker_ids = [b.id for b in biomarkers]
        if not biomarker_ids:
            return []

        window_start = datetime.now(UTC).date() - timedelta(days=PRICE_HISTORY_LOOKBACK_DAYS)
        history = (
            select(
                models.PriceSnapshot.item_id.label("item_id"),
                func.min(models.PriceSnapshot.price_now_grosz).label("hist_min"),
            )
            .where(models.PriceSnapshot.snap_date >= window_start)
            .group_by(models.PriceSnapshot.item_id)
            .subquery()
        )

        statement = (
            select(
                models.Item,
                models.Lab.code,
                models.Lab.name,
                models.Lab.single_item_url_template,
                models.Lab.package_item_url_template,
                models.ItemBiomarker.biomarker_id,
                models.Biomarker.elab_code,
                models.Biomarker.slug,
                models.Biomarker.name,
                history.c.hist_min,
            )
            .join(models.Lab, models.Lab.id == models.Item.lab_id)
            .join(models.ItemBiomarker, models.Item.id == models.ItemBiomarker.item_id)
            .join(models.Biomarker, models.Biomarker.id == models.ItemBiomarker.biomarker_id)
            .outerjoin(history, history.c.item_id == models.Item.id)
            .where(models.ItemBiomarker.biomarker_id.in_(biomarker_ids))
            .where(models.Item.is_available.is_(True))
            .where(models.Item.price_now_grosz > 0)
        )

        rows = (await self.session.execute(statement)).all()
        by_id: dict[int, CandidateItem] = {}
        id_to_token = {b.id: b.token for b in biomarkers}
        for (
            item,
            lab_code,
            lab_name,
            single_url_template,
            package_url_template,
            biomarker_id,
            _elab_code,
            _slug,
            _name,
            hist_min,
        ) in rows:
            candidate = by_id.get(item.id)
            if candidate is None:
                candidate = CandidateItem(
                    id=item.id,
                    kind=item.kind,
                    name=item.name,
                    slug=item.slug,
                    external_id=item.external_id,
                    lab_id=item.lab_id,
                    lab_code=lab_code,
                    lab_name=lab_name,
                    single_url_template=single_url_template,
                    package_url_template=package_url_template,
                    price_now=item.price_now_grosz,
                    price_min30=self._resolve_price_floor(
                        hist_min, item.price_min30_grosz, item.price_now_grosz
                    ),
                    sale_price=item.sale_price_grosz,
                    regular_price=item.regular_price_grosz,
                )
                by_id[item.id] = candidate
            token = id_to_token.get(biomarker_id)
            if token:
                candidate.coverage.add(token)
        return list(by_id.values())

    def _prepare_context(
        self,
        resolved: list[ResolvedBiomarker],
        unresolved_inputs: list[str],
        candidates: list[CandidateItem],
    ) -> OptimizationContext | None:
        availability_map = self._token_availability_map(candidates)
        pruned = self._prune_candidates(candidates)
        if not pruned:
            return None
        grouped = self._group_candidates_by_lab(pruned)
        if not grouped:
            return None
        token_to_original = {entry.token: entry.original for entry in resolved}
        lab_index: dict[str, int] = {}
        for lab_id, lab_candidates in grouped.items():
            if not lab_candidates:
                continue
            code = normalize_token(lab_candidates[0].lab_code)
            if code:
                lab_index[code] = lab_id
        return OptimizationContext(
            resolved=list(resolved),
            unresolved_inputs=list(unresolved_inputs),
            grouped_candidates=grouped,
            availability_map=availability_map,
            token_to_original=token_to_original,
            lab_index=lab_index,
        )

    @staticmethod
    def _resolve_price_floor(
        history_price: int | None, rolling_min: int | None, current_price: int
    ) -> int:
        if history_price is not None:
            return int(history_price)
        if rolling_min is not None:
            return int(rolling_min)
        return int(current_price)

    def _prune_candidates(self, candidates: Iterable[CandidateItem]) -> list[CandidateItem]:
        items = list(candidates)
        if not items:
            return []

        allowed_single_ids = self._select_single_variants(items)
        filtered = [
            item
            for item in items
            if not self._should_skip_single_candidate(item, allowed_single_ids)
        ]
        return self._remove_dominated_candidates(filtered)

    @staticmethod
    def _select_single_variants(items: Sequence[CandidateItem]) -> set[int]:
        """Keep only the cheapest few singles per lab/token."""
        cheapest: dict[tuple[int, str], list[CandidateItem]] = {}
        for item in items:
            if item.kind != "single" or len(item.coverage) != 1:
                continue
            # coverage has exactly one token here
            token = next(iter(item.coverage))
            key = (item.lab_id, token)
            bucket = cheapest.setdefault(key, [])
            bucket.append(item)

        allowed: set[int] = set()
        for bucket in cheapest.values():
            bucket.sort(
                key=lambda candidate: (
                    candidate.price_now,
                    candidate.price_min30,
                    candidate.id,
                )
            )
            for candidate in bucket[:MAX_SINGLE_VARIANTS_PER_TOKEN]:
                allowed.add(candidate.id)
        return allowed

    @staticmethod
    def _should_skip_single_candidate(
        item: CandidateItem, allowed_single_ids: set[int]
    ) -> bool:
        if item.kind != "single" or len(item.coverage) != 1:
            return False
        return item.id not in allowed_single_ids

    @staticmethod
    def _group_candidates_by_lab(
        candidates: Sequence[CandidateItem],
    ) -> dict[int, list[CandidateItem]]:
        grouped: dict[int, list[CandidateItem]] = {}
        for candidate in candidates:
            grouped.setdefault(candidate.lab_id, []).append(candidate)
        return grouped

    @staticmethod
    def _token_availability_map(
        candidates: Sequence[CandidateItem],
    ) -> dict[str, set[int]]:
        availability: dict[str, set[int]] = {}
        for candidate in candidates:
            for token in candidate.coverage:
                availability.setdefault(token, set()).add(candidate.lab_id)
        return availability

    @staticmethod
    def _exclusive_tokens(
        resolved: Sequence[ResolvedBiomarker],
        availability_map: Mapping[str, set[int]],
        lab_id: int,
    ) -> set[str]:
        exclusives: set[str] = set()
        for biomarker in resolved:
            labs = availability_map.get(biomarker.token, set())
            if labs == {lab_id}:
                exclusives.add(biomarker.token)
        return exclusives

    @staticmethod
    def _remove_dominated_candidates(items: Sequence[CandidateItem]) -> list[CandidateItem]:
        retained: dict[int, CandidateItem] = {}
        seen_coverages: dict[int, list[tuple[frozenset[str], int]]] = {}
        package_variant_counts: dict[tuple[int, frozenset[str]], int] = {}
        single_variant_counts: dict[tuple[int, frozenset[str]], int] = {}
        ordered = sorted(
            items,
            key=lambda item: (
                -len(item.coverage),
                item.price_now,
                item.price_min30,
                item.id,
            ),
        )

        for candidate in ordered:
            coverage = frozenset(candidate.coverage)
            lab_seen = seen_coverages.setdefault(candidate.lab_id, [])
            dominated = any(
                existing_coverage.issuperset(coverage)
                and existing_price <= candidate.price_now
                for existing_coverage, existing_price in lab_seen
            )
            if dominated and candidate.kind == "single":
                equal_or_cheaper = any(
                    existing_coverage == coverage and existing_price <= candidate.price_now
                    for existing_coverage, existing_price in lab_seen
                )
                if equal_or_cheaper:
                    variant_key = (candidate.lab_id, coverage)
                    variants = single_variant_counts.get(variant_key, 0)
                    if variants < MAX_SINGLE_VARIANTS_PER_TOKEN:
                        dominated = False
            if dominated and candidate.kind == "package":
                variant_key = (candidate.lab_id, coverage)
                variants = package_variant_counts.get(variant_key, 0)
                if variants < MAX_PACKAGE_VARIANTS_PER_COVERAGE:
                    dominated = False
            if dominated:
                continue
            retained[candidate.id] = candidate
            lab_seen.append((coverage, candidate.price_now))
            if candidate.kind == "package":
                variant_key = (candidate.lab_id, coverage)
                package_variant_counts[variant_key] = package_variant_counts.get(variant_key, 0) + 1
            if candidate.kind == "single":
                variant_key = (candidate.lab_id, coverage)
                single_variant_counts[variant_key] = single_variant_counts.get(variant_key, 0) + 1

        return [item for item in items if item.id in retained]

    async def _run_solver(
        self, candidates: Sequence[CandidateItem], biomarkers: Sequence[ResolvedBiomarker]
    ) -> SolverOutcome:
        coverage_map = self._build_coverage_map(candidates)
        model, variables = self._build_solver_model(candidates)
        uncovered = self._apply_coverage_constraints(
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

        self._apply_objective(model, candidates, variables)
        status, solver = self._solve_model(model)

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

        chosen = self._extract_selected_candidates(solver, candidates, variables)
        response, labels = await self._build_response(
            chosen,
            uncovered,
            [biomarker.token for biomarker in biomarkers],
        )
        total_now_grosz = sum(item.price_now for item in chosen)
        return SolverOutcome(
            response=response,
            chosen_items=list(chosen),
            uncovered_tokens=set(uncovered),
            total_now_grosz=int(total_now_grosz),
            labels=labels,
        )

    async def _find_best_solution(
        self, context: OptimizationContext
    ) -> LabSolution | None:
        best: LabSolution | None = None
        for lab_id, lab_candidates in context.grouped_candidates.items():
            solution = await self._evaluate_lab_solution(lab_id, lab_candidates, context)
            if solution is None:
                continue
            if best is None or solution.total_now_grosz < best.total_now_grosz:
                best = solution
        return best

    async def _solve_single_lab(
        self, lab_code: str | None, context: OptimizationContext
    ) -> LabSolution | None:
        if not lab_code:
            return None
        normalized = normalize_token(lab_code)
        lab_id = context.lab_index.get(normalized) if normalized else None
        if lab_id is None:
            return None
        lab_candidates = context.grouped_candidates.get(lab_id)
        if not lab_candidates:
            return None
        return await self._evaluate_lab_solution(
            lab_id,
            lab_candidates,
            context,
            allow_partial=True,
        )

    async def _solve_multi_lab(
        self, context: OptimizationContext
    ) -> MultiLabSolution | None:
        all_candidates = [
            candidate
            for lab_candidates in context.grouped_candidates.values()
            for candidate in lab_candidates
        ]
        if not all_candidates:
            return None

        outcome = await self._run_solver(all_candidates, context.resolved)
        if not outcome.has_selection:
            return None

        combined_uncovered = self._combine_uncovered_tokens(
            context.unresolved_inputs, outcome.uncovered_tokens
        )
        resolved_labels = self._token_display_map(context.resolved)
        exclusive_map = self._global_exclusive_map(context)

        response = outcome.response.model_copy(
            update={
                "uncovered": combined_uncovered,
                "lab_code": "mixed",
                "lab_name": "Multiple labs",
                "exclusive": exclusive_map,
                "labels": outcome.labels | resolved_labels,
            }
        )

        return MultiLabSolution(
            total_now_grosz=outcome.total_now_grosz,
            response=response,
            chosen_items=list(outcome.chosen_items),
        )

    async def _evaluate_lab_solution(
        self,
        lab_id: int,
        lab_candidates: Sequence[CandidateItem],
        context: OptimizationContext,
        *,
        allow_partial: bool = False,
    ) -> LabSolution | None:
        missing_tokens = self._uncovered_tokens(context.resolved, lab_candidates)
        if missing_tokens and not allow_partial:
            return None

        outcome = await self._run_solver(lab_candidates, context.resolved)
        if not outcome.has_selection:
            return None

        uncovered_tokens = outcome.uncovered_tokens | missing_tokens
        if uncovered_tokens and not allow_partial:
            return None

        lab_code = lab_candidates[0].lab_code if lab_candidates else ""
        lab_name = lab_candidates[0].lab_name if lab_candidates else ""
        exclusive_tokens = self._exclusive_tokens(
            context.resolved, context.availability_map, lab_id
        )
        exclusive_map = {token: lab_name for token in exclusive_tokens}

        combined_uncovered = self._combine_uncovered_tokens(
            context.unresolved_inputs, uncovered_tokens
        )

        resolved_labels = self._token_display_map(context.resolved)
        label_map = outcome.labels | resolved_labels

        response = outcome.response.model_copy(
            update={
                "uncovered": combined_uncovered,
                "lab_code": lab_code,
                "lab_name": lab_name,
                "exclusive": exclusive_map,
                "labels": label_map,
            }
        )
        return LabSolution(
            lab_id=lab_id,
            total_now_grosz=outcome.total_now_grosz,
            response=response,
            chosen_items=list(outcome.chosen_items),
        )

    async def _finalize_response(
        self,
        response: OptimizeResponse,
        context: OptimizationContext,
        chosen_items: Sequence[CandidateItem],
        mode: OptimizeMode,
    ) -> OptimizeResponse:
        lab_options = self._build_lab_options(context)
        lab_selections = self._lab_selection_summary(chosen_items)
        # Addon suggestions are computed lazily via separate endpoint
        return response.model_copy(
            update={
                "mode": mode,
                "lab_options": lab_options,
                "lab_selections": lab_selections,
                "addon_suggestions": [],
            }
        )

    def _build_lab_options(self, context: OptimizationContext) -> list[LabAvailability]:
        tokens = {entry.token for entry in context.resolved}
        raw_options: list[tuple[str, str, list[str]]] = []
        for lab_candidates in context.grouped_candidates.values():
            if not lab_candidates:
                continue
            coverage: set[str] = set()
            for candidate in lab_candidates:
                coverage.update(candidate.coverage)
            missing = sorted(tokens - coverage)
            code = (lab_candidates[0].lab_code or "").strip()
            name = (lab_candidates[0].lab_name or code.upper()).strip()
            raw_options.append((code, name, missing))

        raw_options.sort(key=lambda item: (item[1] or item[0]).lower())
        return [
            LabAvailability(
                code=code,
                name=name,
                covers_all=not missing,
                missing_tokens=missing,
            )
            for code, name, missing in raw_options
        ]

    def _lab_selection_summary(
        self, chosen_items: Sequence[CandidateItem]
    ) -> list[LabSelectionSummary]:
        if not chosen_items:
            return []

        aggregated: dict[int, LabSelectionAccumulator] = {}
        for item in chosen_items:
            normalized_code = (item.lab_code or "").strip()
            fallback_name = (item.lab_code or "").upper()
            normalized_name = (item.lab_name or fallback_name).strip()
            accumulator = aggregated.setdefault(
                item.lab_id,
                LabSelectionAccumulator(code=normalized_code, name=normalized_name),
            )
            accumulator.total_now_grosz += int(item.price_now)
            accumulator.items += 1

        ordered = sorted(
            aggregated.values(),
            key=lambda entry: (
                -entry.total_now_grosz,
                (entry.name or entry.code).lower(),
            ),
        )

        return [
            LabSelectionSummary(
                code=entry.code,
                name=entry.name,
                total_now_grosz=entry.total_now_grosz,
                items=entry.items,
            )
            for entry in ordered
        ]

    async def _addon_suggestions(
        self,
        context: OptimizationContext,
        chosen_items: Sequence[CandidateItem],
        lab_code: str,
        existing_labels: dict[str, str],
    ) -> tuple[list[AddonSuggestion], dict[str, str]]:
        if len(context.resolved) < 2 or not chosen_items:
            return [], {}

        selected_tokens = {entry.token for entry in context.resolved}
        chosen_items_list = list(chosen_items)

        allowed_labs: set[int] = set()
        normalized_lab_code = normalize_token(lab_code) if lab_code else ""
        if normalized_lab_code:
            lab_id = context.lab_index.get(normalized_lab_code)
            if lab_id is not None:
                allowed_labs.add(lab_id)
        if not allowed_labs:
            allowed_labs = {item.lab_id for item in chosen_items_list}
        if not allowed_labs:
            return [], {}

        filtered_items = [item for item in chosen_items_list if item.lab_id in allowed_labs]
        if not filtered_items:
            return [], {}

        lab_item_ids: dict[int, list[int]] = {}
        filtered_items_by_lab: dict[int, list[CandidateItem]] = {}
        for item in filtered_items:
            lab_item_ids.setdefault(item.lab_id, []).append(item.id)
            filtered_items_by_lab.setdefault(item.lab_id, []).append(item)

        chosen_total_grosz = sum(item.price_now for item in filtered_items)
        chosen_by_id = {item.id: item for item in filtered_items}
        baseline_coverage_by_lab: dict[int, set[str]] = {}
        for item in filtered_items:
            lab_tokens = baseline_coverage_by_lab.setdefault(item.lab_id, set())
            lab_tokens.update(
                token for token in item.coverage if token in selected_tokens
            )

        chosen_ids = set(chosen_by_id.keys())

        computations: list[AddonComputation] = []
        for lab_candidates in context.grouped_candidates.values():
            for candidate in lab_candidates:
                if candidate.kind != "package":
                    continue
                if candidate.lab_id not in allowed_labs:
                    continue
                if candidate.id in chosen_ids:
                    continue
                covered_tokens = set(candidate.coverage) & selected_tokens
                if len(covered_tokens) < 2:
                    continue
                lab_items = filtered_items_by_lab.get(candidate.lab_id, [])
                if not lab_items:
                    continue
                drop_cost, drop_ids = self._minimal_cover_subset(
                    covered_tokens, lab_items
                )
                if math.isinf(drop_cost) or not drop_ids:
                    continue

                remaining_coverage: set[str] = set()
                for item in lab_items:
                    if item.id in drop_ids:
                        continue
                    remaining_coverage.update(
                        token for token in item.coverage if token in selected_tokens
                    )

                candidate_tokens = {
                    token for token in candidate.coverage if token in selected_tokens
                }
                covered_after = remaining_coverage | candidate_tokens
                lab_baseline = baseline_coverage_by_lab.get(candidate.lab_id)
                missing_tokens = (
                    lab_baseline - covered_after if lab_baseline else set()
                )

                if missing_tokens:
                    replacement_candidates = [
                        item
                        for item in context.grouped_candidates.get(candidate.lab_id, [])
                        if item.id not in drop_ids
                        and item.id != candidate.id
                        and item.coverage & missing_tokens
                    ]
                    readd_cost, _ = self._minimal_cover_subset(
                        missing_tokens, replacement_candidates
                    )
                    if math.isinf(readd_cost):
                        continue
                else:
                    readd_cost = 0

                estimated_total = (
                    chosen_total_grosz - drop_cost + candidate.price_now + readd_cost
                )
                computations.append(
                    AddonComputation(
                        candidate=candidate,
                        covered_tokens=covered_tokens,
                        drop_cost_grosz=int(drop_cost),
                        readd_cost_grosz=int(readd_cost),
                        estimated_total_grosz=int(estimated_total),
                        dropped_item_ids=drop_ids,
                    )
                )

        if not computations:
            return [], {}

        computations.sort(
            key=lambda entry: (
                entry.estimated_total_grosz - chosen_total_grosz,
                entry.candidate.price_now,
                entry.candidate.id,
            )
        )
        top_candidates = computations[:2]
        package_ids = [entry.candidate.id for entry in top_candidates]
        if not package_ids:
            return [], {}

        lookup_ids = set(package_ids)
        lookup_ids.update({item.id for item in filtered_items})
        biomarkers_map, label_map = await self._get_all_biomarkers_for_items(list(lookup_ids))
        additional_labels: dict[str, str] = {}

        resolved_labels = self._token_display_map(context.resolved)
        combined_labels = {**resolved_labels, **existing_labels}

        lab_bonus_current: dict[int, set[str]] = {}
        for lab_id, item_ids in lab_item_ids.items():
            tokens: set[str] = set()
            for item_id in item_ids:
                for token in biomarkers_map.get(item_id, []):
                    if token not in selected_tokens:
                        tokens.add(token)
            lab_bonus_current[lab_id] = tokens

        # Pre-compute all potential bonus tokens for batched price lookup
        all_bonus_tokens: dict[str, str] = {}
        candidate_lab_ids: set[int] = set()
        for entry in top_candidates:
            item = entry.candidate
            candidate_lab_ids.add(item.lab_id)
            biomarkers = biomarkers_map.get(item.id, [])
            for token in biomarkers:
                if token not in selected_tokens:
                    normalized = normalize_token(token)
                    if normalized:
                        all_bonus_tokens.setdefault(normalized, token)

        # Make ONE batched DB query for all bonus prices
        batched_prices: dict[tuple[str, int], int] = {}
        if all_bonus_tokens and candidate_lab_ids:
            batched_prices = await self._bonus_price_map_batched(
                all_bonus_tokens, candidate_lab_ids
            )

        suggestions: list[AddonSuggestion] = []
        for entry in top_candidates:
            item = entry.candidate
            biomarkers = sorted(biomarkers_map.get(item.id, []))
            for token in biomarkers:
                label = label_map.get(token)
                if label:
                    additional_labels.setdefault(token, label)

            upgrade_cost_grosz = entry.estimated_total_grosz - chosen_total_grosz

            lab_bonus_before = lab_bonus_current.get(item.lab_id, set())
            remaining_ids = [
                item_id
                for item_id in lab_item_ids.get(item.lab_id, [])
                if item_id not in entry.dropped_item_ids
            ]
            bonus_remaining = {
                token
                for remaining_id in remaining_ids
                for token in biomarkers_map.get(remaining_id, [])
                if token not in selected_tokens
            }
            candidate_bonus_tokens = {
                token for token in biomarkers if token not in selected_tokens
            }
            bonus_after = bonus_remaining | candidate_bonus_tokens
            bonus_removed = lab_bonus_before - bonus_after
            bonus_kept = lab_bonus_before & bonus_after
            bonus_added = bonus_after - lab_bonus_before

            package_payload = ItemOut(
                id=item.id,
                kind=item.kind,
                name=item.name,
                slug=item.slug,
                price_now_grosz=item.price_now,
                price_min30_grosz=item.price_min30,
                currency=DEFAULT_CURRENCY,
                biomarkers=biomarkers,
                url=_item_url(item),
                on_sale=item.on_sale,
                lab_code=item.lab_code,
                lab_name=item.lab_name,
            )

            def resolve_display(token: str) -> str:
                for source in (
                    label_map.get(token),
                    combined_labels.get(token),
                    context.token_to_original.get(token),
                ):
                    if source:
                        return source
                normalized = token.strip()
                return normalized or token

            covers = [
                AddonBiomarker(code=token, display_name=resolve_display(token))
                for token in sorted(entry.covered_tokens)
            ]
            adds = [
                AddonBiomarker(code=token, display_name=resolve_display(token))
                for token in sorted(bonus_added)
            ]

            if not adds:
                continue

            removes = [
                AddonBiomarker(code=token, display_name=resolve_display(token))
                for token in sorted(bonus_removed)
            ]
            keeps = [
                AddonBiomarker(code=token, display_name=resolve_display(token))
                for token in sorted(bonus_kept)
            ]

            # Use batched prices instead of making individual DB queries
            extra_tokens: list[str] = []
            for addon_entry in adds:
                normalized = normalize_token(addon_entry.code)
                if normalized:
                    extra_tokens.append(normalized)

            if extra_tokens:
                singles_total = 0
                all_found = True
                for normalized in extra_tokens:
                    price = batched_prices.get((normalized, item.lab_id))
                    if price is None:
                        all_found = False
                        break
                    singles_total += price

                if all_found and singles_total and singles_total <= upgrade_cost_grosz:
                    continue

            suggestions.append(
                AddonSuggestion(
                    package=package_payload,
                    upgrade_cost_grosz=int(upgrade_cost_grosz),
                    upgrade_cost=round(upgrade_cost_grosz / 100, 2),
                    estimated_total_now_grosz=entry.estimated_total_grosz,
                    estimated_total_now=round(entry.estimated_total_grosz / 100, 2),
                    covers=covers,
                    adds=adds,
                    removes=removes,
                    keeps=keeps,
                )
            )

        return suggestions, additional_labels

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

    def _global_exclusive_map(self, context: OptimizationContext) -> dict[str, str]:
        exclusive: dict[str, str] = {}
        for token, lab_ids in context.availability_map.items():
            if len(lab_ids) != 1:
                continue
            lab_id = next(iter(lab_ids))
            lab_candidates = context.grouped_candidates.get(lab_id, [])
            if not lab_candidates:
                continue
            lab_name = (lab_candidates[0].lab_name or lab_candidates[0].lab_code.upper()).strip()
            exclusive[token] = lab_name
        return exclusive

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
    def _token_display_map(
        resolved: Sequence[ResolvedBiomarker],
    ) -> dict[str, str]:
        return {
            biomarker.token: biomarker.display_name or biomarker.token
            for biomarker in resolved
        }

    @staticmethod
    def _build_solver_model(
        candidates: Sequence[CandidateItem],
    ) -> tuple[cp_model.CpModel, dict[int, cp_model.IntVar]]:
        model = cp_model.CpModel()
        variables = {candidate.id: model.NewBoolVar(candidate.slug) for candidate in candidates}
        return model, variables

    @staticmethod
    def _build_coverage_map(
        candidates: Sequence[CandidateItem],
    ) -> dict[str, list[int]]:
        coverage: dict[str, list[int]] = {}
        for item in candidates:
            for token in item.coverage:
                coverage.setdefault(token, []).append(item.id)
        return coverage

    @staticmethod
    def _apply_coverage_constraints(
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

    @staticmethod
    def _apply_objective(
        model: cp_model.CpModel,
        candidates: Sequence[CandidateItem],
        variables: Mapping[int, cp_model.IntVar],
    ) -> None:
        model.Minimize(
            sum(candidate.price_now * variables[candidate.id] for candidate in candidates)
        )

    @staticmethod
    def _solve_model(
        model: cp_model.CpModel,
    ) -> tuple[int, cp_model.CpSolver]:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = SOLVER_TIMEOUT_SECONDS
        solver.parameters.num_search_workers = SOLVER_WORKERS
        status = cast(int, solver.Solve(model))
        return status, solver

    @staticmethod
    def _extract_selected_candidates(
        solver: cp_model.CpSolver,
        candidates: Sequence[CandidateItem],
        variables: Mapping[int, cp_model.IntVar],
    ) -> list[CandidateItem]:
        return [
            candidate
            for candidate in candidates
            if solver.Value(variables[candidate.id])
        ]

    async def _build_response(
        self,
        chosen: Sequence[CandidateItem],
        uncovered: Sequence[str],
        requested_tokens: Sequence[str],
    ) -> tuple[OptimizeResponse, dict[str, str]]:
        total_now = round(sum(item.price_now for item in chosen) / 100, 2)
        total_min30 = round(sum(item.price_min30 for item in chosen) / 100, 2)
        explain = self._build_explain_map(chosen)

        chosen_item_ids = [item.id for item in chosen]
        biomarkers_by_item, labels = await self._get_all_biomarkers_for_items(chosen_item_ids)

        requested_normalized = normalize_tokens_set(
            [t for t in requested_tokens if isinstance(t, str)]
        )
        bonus_tokens: dict[str, str] = {}
        for item in chosen:
            for token in biomarkers_by_item.get(item.id, []):
                if not token:
                    continue
                normalized = normalize_token(token)
                if not normalized or normalized in requested_normalized:
                    continue
                bonus_tokens.setdefault(normalized, token)

        bonus_price_map = await self._bonus_price_map(bonus_tokens)
        bonus_total_grosz = sum(bonus_price_map.get(key, 0) for key in bonus_tokens.keys())
        bonus_total_now = round(bonus_total_grosz / 100, 2) if bonus_total_grosz else 0.0

        items_payload = [
            ItemOut(
                id=item.id,
                kind=item.kind,
                name=item.name,
                slug=item.slug,
                price_now_grosz=item.price_now,
                price_min30_grosz=item.price_min30,
                currency=DEFAULT_CURRENCY,
                biomarkers=sorted(biomarkers_by_item.get(item.id, [])),
                url=_item_url(item),
                on_sale=item.on_sale,
                lab_code=item.lab_code,
                lab_name=item.lab_name,
            )
            for item in chosen
        ]

        response = OptimizeResponse(
            total_now=total_now,
            total_min30=total_min30,
            currency=DEFAULT_CURRENCY,
            items=items_payload,
            bonus_total_now=bonus_total_now,
            explain=explain,
            uncovered=list(uncovered),
            labels=labels,
        )
        return response, labels

    @staticmethod
    def _build_explain_map(
        chosen: Sequence[CandidateItem],
    ) -> dict[str, list[str]]:
        explain: dict[str, list[str]] = {}
        for item in chosen:
            for token in item.coverage:
                explain.setdefault(token, []).append(item.name)
        return explain

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
            lab_code="",
            lab_name="",
            exclusive={},
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

    async def _get_all_biomarkers_for_items(
        self, item_ids: list[int]
    ) -> tuple[dict[int, list[str]], dict[str, str]]:
        """Fetch biomarkers for items and provide display labels."""
        if not item_ids:
            return {}, {}

        statement = (
            select(
                models.ItemBiomarker.item_id,
                models.Biomarker.elab_code,
                models.Biomarker.slug,
                models.Biomarker.name,
            )
            .join(models.Biomarker, models.Biomarker.id == models.ItemBiomarker.biomarker_id)
            .where(models.ItemBiomarker.item_id.in_(item_ids))
        )

        rows = (await self.session.execute(statement)).all()
        result: dict[int, list[str]] = {}
        labels: dict[str, str] = {}
        for item_id, elab_code, slug, name in rows:
            token = elab_code or slug or name
            if not token:
                continue
            display_name = (name or "").strip()
            if display_name:
                labels.setdefault(token, display_name)
            result.setdefault(item_id, []).append(token)

        return result, labels

    async def _bonus_price_map(
        self, tokens: Mapping[str, str], lab_id: int | None = None
    ) -> dict[str, int]:
        """Return the best-known single-test price (in grosz) for each normalized token."""
        if not tokens:
            return {}

        normalized_lookup = create_normalized_lookup(tokens)
        raw_tokens = {
            value.strip()
            for value in tokens.values()
            if isinstance(value, str) and value.strip()
        }
        if not raw_tokens or not normalized_lookup:
            return {}

        statement = (
            select(
                models.Biomarker.elab_code,
                models.Biomarker.slug,
                models.Biomarker.name,
                func.min(models.Item.price_now_grosz).label("min_price"),
            )
            .select_from(models.Biomarker)
            .join(models.ItemBiomarker, models.ItemBiomarker.biomarker_id == models.Biomarker.id)
            .join(models.Item, models.Item.id == models.ItemBiomarker.item_id)
            .where(models.Item.kind == "single")
            .where(models.Item.is_available.is_(True))
            .where(models.Item.price_now_grosz > 0)
            .where(
                or_(
                    models.Biomarker.elab_code.in_(raw_tokens),
                    models.Biomarker.slug.in_(raw_tokens),
                    models.Biomarker.name.in_(raw_tokens),
                )
            )
            .group_by(
                models.Biomarker.id,
                models.Biomarker.elab_code,
                models.Biomarker.slug,
                models.Biomarker.name,
            )
        )

        if lab_id is not None:
            statement = statement.where(models.Item.lab_id == lab_id)

        rows = (await self.session.execute(statement)).all()
        price_map: dict[str, int] = {}

        for elab_code, slug, name, min_price in rows:
            for candidate in (elab_code, slug, name):
                if not candidate:
                    continue
                normalized = normalize_token(candidate)
                key = normalized_lookup.get(normalized) if normalized else None
                if key is None:
                    continue
                price_value = int(min_price or 0)
                existing = price_map.get(key)
                if existing is None or price_value < existing:
                    price_map[key] = price_value
                break

        return price_map

    async def _bonus_price_map_batched(
        self, tokens: Mapping[str, str], lab_ids: set[int]
    ) -> dict[tuple[str, int], int]:
        """Return single-test prices keyed by (normalized_token, lab_id).

        This batched version queries all lab_ids in ONE query, returning
        prices grouped by lab. More efficient than calling _bonus_price_map
        multiple times for different labs.
        """
        if not tokens or not lab_ids:
            return {}

        normalized_lookup = create_normalized_lookup(tokens)
        raw_tokens = {
            value.strip()
            for value in tokens.values()
            if isinstance(value, str) and value.strip()
        }
        if not raw_tokens or not normalized_lookup:
            return {}

        statement = (
            select(
                models.Biomarker.elab_code,
                models.Biomarker.slug,
                models.Biomarker.name,
                models.Item.lab_id,
                func.min(models.Item.price_now_grosz).label("min_price"),
            )
            .select_from(models.Biomarker)
            .join(models.ItemBiomarker, models.ItemBiomarker.biomarker_id == models.Biomarker.id)
            .join(models.Item, models.Item.id == models.ItemBiomarker.item_id)
            .where(models.Item.kind == "single")
            .where(models.Item.is_available.is_(True))
            .where(models.Item.price_now_grosz > 0)
            .where(models.Item.lab_id.in_(lab_ids))
            .where(
                or_(
                    models.Biomarker.elab_code.in_(raw_tokens),
                    models.Biomarker.slug.in_(raw_tokens),
                    models.Biomarker.name.in_(raw_tokens),
                )
            )
            .group_by(
                models.Biomarker.id,
                models.Biomarker.elab_code,
                models.Biomarker.slug,
                models.Biomarker.name,
                models.Item.lab_id,
            )
        )

        rows = (await self.session.execute(statement)).all()
        price_map: dict[tuple[str, int], int] = {}

        for elab_code, slug, name, lab_id, min_price in rows:
            for candidate in (elab_code, slug, name):
                if not candidate:
                    continue
                normalized = normalize_token(candidate)
                key = normalized_lookup.get(normalized) if normalized else None
                if key is None:
                    continue
                price_value = int(min_price or 0)
                cache_key = (key, lab_id)
                existing = price_map.get(cache_key)
                if existing is None or price_value < existing:
                    price_map[cache_key] = price_value
                break

        return price_map


def _item_url(item: CandidateItem) -> str:
    template = item.package_url_template if item.kind == "package" else item.single_url_template
    if template:
        try:
            return template.format(slug=item.slug, external_id=item.external_id)
        except Exception:  # pragma: no cover - fallback for malformed templates
            return template
    if item.lab_code == "alab":
        base = "https://www.alab.pl/pakiet" if item.kind == "package" else "https://www.alab.pl/badanie"
        return f"{base}/{item.slug}"
    prefix = "pakiety" if item.kind == "package" else "badania"
    return f"https://diag.pl/sklep/{prefix}/{item.slug}"
