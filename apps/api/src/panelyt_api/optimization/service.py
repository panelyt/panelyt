from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import cast

from ortools.sat.python import cp_model
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db import models
from panelyt_api.schemas.common import ItemOut
from panelyt_api.schemas.optimize import (
    AddOnSuggestion,
    LabAvailability,
    LabSelectionSummary,
    OptimizeMode,
    OptimizeRequest,
    OptimizeResponse,
)

logger = logging.getLogger(__name__)


DEFAULT_CURRENCY = "PLN"
SOLVER_TIMEOUT_SECONDS = 5.0
SOLVER_WORKERS = 8
PRICE_HISTORY_LOOKBACK_DAYS = 30
MAX_ADD_ON_SUGGESTIONS = 3


@dataclass(slots=True)
class ResolvedBiomarker:
    id: int
    token: str
    display_name: str
    original: str


@dataclass(slots=True)
class CandidateItem:
    id: int
    kind: str
    name: str
    slug: str
    external_id: str
    lab_id: int
    lab_code: str
    lab_name: str
    single_url_template: str | None
    package_url_template: str | None
    price_now: int
    price_min30: int
    sale_price: int | None
    regular_price: int | None
    coverage: set[str] = field(default_factory=set)

    @property
    def on_sale(self) -> bool:
        if self.sale_price is None or self.regular_price is None:
            return False
        return self.sale_price < self.regular_price


@dataclass(slots=True)
class NormalizedBiomarkerInput:
    raw: str
    normalized: str


@dataclass(slots=True)
class OptimizationContext:
    resolved: list[ResolvedBiomarker]
    unresolved_inputs: list[str]
    grouped_candidates: dict[int, list[CandidateItem]]
    availability_map: dict[str, set[int]]
    token_to_original: dict[str, str]
    lab_index: dict[str, int]


@dataclass(slots=True)
class LabSolution:
    lab_id: int
    total_now_grosz: int
    response: OptimizeResponse
    chosen_items: list[CandidateItem]


@dataclass(slots=True)
class MultiLabSolution:
    total_now_grosz: int
    response: OptimizeResponse
    chosen_items: list[CandidateItem]


@dataclass(slots=True)
class LabSelectionAccumulator:
    code: str
    name: str
    total_now_grosz: int = 0
    items: int = 0


@dataclass(slots=True)
class SolverOutcome:
    response: OptimizeResponse
    chosen_items: list[CandidateItem]
    uncovered_tokens: set[str]
    total_now_grosz: int
    labels: dict[str, str]

    @property
    def has_selection(self) -> bool:
        return bool(self.chosen_items)


class OptimizationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

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
            token = _normalize_token(raw)
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
                normalized = _normalize_token(candidate)
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
            code = (lab_candidates[0].lab_code or "").strip().lower()
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

        cheapest_per_token = self._cheapest_single_prices(items)
        filtered = [
            item
            for item in items
            if not self._should_skip_single_candidate(item, cheapest_per_token)
        ]
        return self._remove_dominated_candidates(filtered)

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
    def _cheapest_single_prices(items: Sequence[CandidateItem]) -> dict[tuple[int, str], int]:
        cheapest: dict[tuple[int, str], int] = {}
        for item in items:
            if item.kind != "single" or len(item.coverage) != 1:
                continue
            # coverage has exactly one token here
            token = next(iter(item.coverage))
            key = (item.lab_id, token)
            current_price = cheapest.get(key)
            if current_price is None or item.price_now < current_price:
                cheapest[key] = item.price_now
        return cheapest

    @staticmethod
    def _should_skip_single_candidate(
        item: CandidateItem, cheapest_per_token: Mapping[tuple[int, str], int]
    ) -> bool:
        if item.kind != "single" or len(item.coverage) != 1:
            return False
        token = next(iter(item.coverage), None)
        if token is None:
            return False
        key = (item.lab_id, token)
        return cheapest_per_token.get(key, item.price_now) != item.price_now

    @staticmethod
    def _remove_dominated_candidates(items: Sequence[CandidateItem]) -> list[CandidateItem]:
        retained: dict[int, CandidateItem] = {}
        seen_coverages: dict[int, list[tuple[frozenset[str], int, str]]] = {}
        ordered = sorted(
            items,
            key=lambda item: (-len(item.coverage), item.price_now, item.id),
        )

        for candidate in ordered:
            coverage = frozenset(candidate.coverage)
            lab_seen = seen_coverages.setdefault(candidate.lab_id, [])
            dominated = False
            for existing_coverage, existing_price, _existing_kind in lab_seen:
                if not existing_coverage.issuperset(coverage):
                    continue
                if existing_price <= candidate.price_now:
                    if candidate.kind == "package":
                        continue
                    dominated = True
                    break
            if dominated:
                continue
            retained[candidate.id] = candidate
            lab_seen.append((coverage, candidate.price_now, candidate.kind))

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
        normalized = lab_code.strip().lower()
        lab_id = context.lab_index.get(normalized)
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
        outcome = await self._run_solver(lab_candidates, context.resolved)
        if not outcome.has_selection:
            return None

        uncovered_tokens = outcome.uncovered_tokens | self._uncovered_tokens(
            context.resolved, lab_candidates
        )
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
        existing_tokens = self._current_coverage_tokens(response.items)
        suggestions, suggestion_labels = await self._build_add_on_suggestions(
            context, chosen_items, existing_tokens
        )
        merged_labels = response.labels | suggestion_labels
        return response.model_copy(
            update={
                "mode": mode,
                "lab_options": lab_options,
                "lab_selections": lab_selections,
                "add_on_suggestions": suggestions,
                "labels": merged_labels,
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

    async def _build_add_on_suggestions(
        self,
        context: OptimizationContext,
        chosen_items: Sequence[CandidateItem],
        existing_tokens: set[str],
    ) -> tuple[list[AddOnSuggestion], dict[str, str]]:
        if not chosen_items:
            return [], {}

        resolved_tokens = {entry.token for entry in context.resolved}
        resolved_tokens_normalized = {
            token.strip().lower() for token in resolved_tokens if isinstance(token, str)
        }
        if not resolved_tokens:
            return [], {}

        selected_ids = {item.id for item in chosen_items}
        candidate_packages: list[CandidateItem] = []
        for lab_candidates in context.grouped_candidates.values():
            for candidate in lab_candidates:
                if (
                    candidate.kind == "package"
                    and candidate.id not in selected_ids
                    and candidate.price_now > 0
                    and candidate.coverage & resolved_tokens
                ):
                    candidate_packages.append(candidate)

        if not candidate_packages:
            return [], {}

        candidate_ids = [candidate.id for candidate in candidate_packages]
        biomarkers_map, labels_map = await self._get_all_biomarkers_for_items(candidate_ids)
        cost_cache: dict[frozenset[str], int | None] = {}
        ranked: list[tuple[float, int, int, AddOnSuggestion]] = []

        for candidate in candidate_packages:
            biomarkers = biomarkers_map.get(candidate.id, [])
            if not biomarkers:
                continue

            normalized_biomarkers = self._unique_preserving_order(biomarkers)
            matched_tokens = [token for token in normalized_biomarkers if token in resolved_tokens]
            matched_set = frozenset(matched_tokens)
            if not matched_set:
                continue

            bonus_tokens = [
                token for token in normalized_biomarkers
                if token.strip().lower() not in resolved_tokens_normalized
            ]
            bonus_tokens = self._unique_preserving_order(bonus_tokens)
            if not bonus_tokens:
                continue

            coverage_cost = self._selection_cost(chosen_items, matched_set, cost_cache)
            if coverage_cost is None:
                continue

            incremental_grosz = int(candidate.price_now) - int(coverage_cost)
            if incremental_grosz <= 0:
                continue

            existing_included = [
                token
                for token in bonus_tokens
                if token.strip().lower() in existing_tokens
            ]
            existing_included = self._unique_preserving_order(existing_included)
            new_bonus_tokens = [
                token
                for token in bonus_tokens
                if token.strip().lower() not in existing_tokens
            ]
            new_bonus_tokens = self._unique_preserving_order(new_bonus_tokens)
            if not new_bonus_tokens:
                continue

            per_bonus = incremental_grosz / max(len(new_bonus_tokens), 1)
            item_out = ItemOut(
                id=candidate.id,
                kind=candidate.kind,
                name=candidate.name,
                slug=candidate.slug,
                price_now_grosz=int(candidate.price_now),
                price_min30_grosz=int(candidate.price_min30),
                currency=DEFAULT_CURRENCY,
                biomarkers=normalized_biomarkers,
                url=_item_url(candidate),
                on_sale=candidate.on_sale,
                lab_code=candidate.lab_code,
                lab_name=candidate.lab_name,
            )
            suggestion = AddOnSuggestion(
                item=item_out,
                matched_tokens=matched_tokens,
                bonus_tokens=new_bonus_tokens,
                already_included_tokens=existing_included,
                incremental_now=round(incremental_grosz / 100, 2),
                incremental_now_grosz=int(incremental_grosz),
            )
            ranked.append(
                (per_bonus, incremental_grosz, item_out.price_now_grosz, suggestion)
            )

        ranked.sort(key=lambda entry: (entry[0], entry[1], entry[2], entry[3].item.id))
        suggestions = [entry[3] for entry in ranked[:MAX_ADD_ON_SUGGESTIONS]]
        return suggestions, labels_map

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

    def _selection_cost(
        self,
        chosen_items: Sequence[CandidateItem],
        target_tokens: frozenset[str],
        cache: dict[frozenset[str], int | None],
    ) -> int | None:
        if not target_tokens:
            return None
        if target_tokens in cache:
            return cache[target_tokens]

        tokens = list(target_tokens)
        index_map = {token: idx for idx, token in enumerate(tokens)}
        target_mask = (1 << len(tokens)) - 1
        inf = 10**12
        dp = [inf] * (target_mask + 1)
        dp[0] = 0

        for item in chosen_items:
            coverage_mask = 0
            for token in item.coverage:
                idx = index_map.get(token)
                if idx is not None:
                    coverage_mask |= 1 << idx
            if coverage_mask == 0:
                continue
            cost = int(item.price_now)
            for state in range(target_mask, -1, -1):
                if dp[state] == inf:
                    continue
                new_state = state | coverage_mask
                new_cost = dp[state] + cost
                if new_cost < dp[new_state]:
                    dp[new_state] = new_cost

        final_cost = dp[target_mask]
        value: int | None = int(final_cost) if final_cost != inf else None
        cache[target_tokens] = value
        return value

    @staticmethod
    def _unique_preserving_order(values: Sequence[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            result.append(value)
        return result

    @staticmethod
    def _current_coverage_tokens(items: Sequence[ItemOut]) -> set[str]:
        coverage: set[str] = set()
        for item in items:
            for token in item.biomarkers:
                if not isinstance(token, str):
                    continue
                normalized = token.strip().lower()
                if normalized:
                    coverage.add(normalized)
        return coverage

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

        requested_normalized = {
            token.strip().lower()
            for token in requested_tokens
            if isinstance(token, str) and token.strip()
        }
        bonus_tokens: dict[str, str] = {}
        for item in chosen:
            for token in biomarkers_by_item.get(item.id, []):
                if not token:
                    continue
                normalized = token.strip().lower()
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

    async def _bonus_price_map(self, tokens: Mapping[str, str]) -> dict[str, int]:
        """Return the best-known single-test price (in grosz) for each normalized token."""
        if not tokens:
            return {}

        normalized_lookup = {
            value.strip().lower(): key
            for key, value in tokens.items()
            if isinstance(value, str) and value.strip()
        }
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

        rows = (await self.session.execute(statement)).all()
        price_map: dict[str, int] = {}

        for elab_code, slug, name, min_price in rows:
            for candidate in (elab_code, slug, name):
                if not candidate:
                    continue
                normalized = candidate.strip().lower()
                key = normalized_lookup.get(normalized)
                if key is None:
                    continue
                price_value = int(min_price or 0)
                existing = price_map.get(key)
                if existing is None or price_value < existing:
                    price_map[key] = price_value
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


def _normalize_token(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None
