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
from panelyt_api.schemas.optimize import OptimizeRequest, OptimizeResponse

logger = logging.getLogger(__name__)


DEFAULT_CURRENCY = "PLN"
SOLVER_TIMEOUT_SECONDS = 5.0
SOLVER_WORKERS = 8
PRICE_HISTORY_LOOKBACK_DAYS = 30


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


class OptimizationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def solve(self, payload: OptimizeRequest) -> OptimizeResponse:
        resolved, unresolved_inputs = await self._resolve_biomarkers(payload.biomarkers)
        if not resolved:
            return self._empty_response(payload.biomarkers)

        candidates = await self._collect_candidates(resolved)
        pruned = self._prune_candidates(candidates)
        solution = await self._run_solver(pruned, resolved)

        uncovered_tokens = set(solution.uncovered) | self._uncovered_tokens(resolved, pruned)
        combined_uncovered = list(dict.fromkeys(unresolved_inputs + sorted(uncovered_tokens)))

        return solution.model_copy(update={"uncovered": combined_uncovered})

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
                models.ItemBiomarker.biomarker_id,
                models.Biomarker.elab_code,
                models.Biomarker.slug,
                models.Biomarker.name,
                history.c.hist_min,
            )
            .join(models.ItemBiomarker, models.Item.id == models.ItemBiomarker.item_id)
            .join(models.Biomarker, models.Biomarker.id == models.ItemBiomarker.biomarker_id)
            .outerjoin(history, history.c.item_id == models.Item.id)
            .where(models.ItemBiomarker.biomarker_id.in_(biomarker_ids))
        )

        rows = (await self.session.execute(statement)).all()
        by_id: dict[int, CandidateItem] = {}
        id_to_token = {b.id: b.token for b in biomarkers}
        for item, biomarker_id, _elab_code, _slug, _name, hist_min in rows:
            candidate = by_id.get(item.id)
            if candidate is None:
                candidate = CandidateItem(
                    id=item.id,
                    kind=item.kind,
                    name=item.name,
                    slug=item.slug,
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
    def _cheapest_single_prices(items: Sequence[CandidateItem]) -> dict[str, int]:
        cheapest: dict[str, int] = {}
        for item in items:
            if item.kind != "single" or len(item.coverage) != 1:
                continue
            # coverage has exactly one token here
            token = next(iter(item.coverage))
            current_price = cheapest.get(token)
            if current_price is None or item.price_now < current_price:
                cheapest[token] = item.price_now
        return cheapest

    @staticmethod
    def _should_skip_single_candidate(
        item: CandidateItem, cheapest_per_token: Mapping[str, int]
    ) -> bool:
        if item.kind != "single" or len(item.coverage) != 1:
            return False
        token = next(iter(item.coverage), None)
        if token is None:
            return False
        return cheapest_per_token.get(token, item.price_now) != item.price_now

    @staticmethod
    def _remove_dominated_candidates(items: Sequence[CandidateItem]) -> list[CandidateItem]:
        retained: dict[int, CandidateItem] = {}
        seen_coverages: list[tuple[frozenset[str], int]] = []
        ordered = sorted(
            items,
            key=lambda item: (-len(item.coverage), item.price_now, item.id),
        )

        for candidate in ordered:
            coverage = frozenset(candidate.coverage)
            dominated = any(
                existing_coverage.issuperset(coverage)
                and existing_price <= candidate.price_now
                for existing_coverage, existing_price in seen_coverages
            )
            if dominated:
                continue
            retained[candidate.id] = candidate
            seen_coverages.append((coverage, candidate.price_now))

        return [item for item in items if item.id in retained]

    async def _run_solver(
        self, candidates: Sequence[CandidateItem], biomarkers: Sequence[ResolvedBiomarker]
    ) -> OptimizeResponse:
        coverage_map = self._build_coverage_map(candidates)
        model, variables = self._build_solver_model(candidates)
        uncovered = self._apply_coverage_constraints(
            model, variables, coverage_map, biomarkers
        )

        if not variables:
            return self._empty_response(uncovered)

        self._apply_objective(model, candidates, variables)
        status, solver = self._solve_model(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            logger.warning("CP-SAT returned status %s", status)
            fallback_uncovered = uncovered or [b.token for b in biomarkers]
            return self._empty_response(fallback_uncovered)

        chosen = self._extract_selected_candidates(solver, candidates, variables)
        return await self._build_response(chosen, uncovered)

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
        self, chosen: Sequence[CandidateItem], uncovered: Sequence[str]
    ) -> OptimizeResponse:
        total_now = round(sum(item.price_now for item in chosen) / 100, 2)
        total_min30 = round(sum(item.price_min30 for item in chosen) / 100, 2)
        explain = self._build_explain_map(chosen)

        chosen_item_ids = [item.id for item in chosen]
        biomarkers_by_item = await self._get_all_biomarkers_for_items(chosen_item_ids)

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
            )
            for item in chosen
        ]

        return OptimizeResponse(
            total_now=total_now,
            total_min30=total_min30,
            currency=DEFAULT_CURRENCY,
            items=items_payload,
            explain=explain,
            uncovered=list(uncovered),
        )

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
            explain={},
            uncovered=list(uncovered),
        )

    def _uncovered_tokens(
        self, biomarkers: Sequence[ResolvedBiomarker], candidates: Sequence[CandidateItem]
    ) -> set[str]:
        available = set()
        for item in candidates:
            available.update(item.coverage)
        tokens = {b.token for b in biomarkers}
        return tokens - available

    async def _get_all_biomarkers_for_items(self, item_ids: list[int]) -> dict[int, list[str]]:
        """Fetch all biomarkers for the given items to show bonus biomarkers."""
        if not item_ids:
            return {}

        statement = (
            select(
                models.ItemBiomarker.item_id,
                models.Biomarker.elab_code,
            )
            .join(models.Biomarker, models.Biomarker.id == models.ItemBiomarker.biomarker_id)
            .where(models.ItemBiomarker.item_id.in_(item_ids))
            .where(models.Biomarker.elab_code.is_not(None))
        )

        rows = (await self.session.execute(statement)).all()
        result: dict[int, list[str]] = {}
        for item_id, elab_code in rows:
            result.setdefault(item_id, []).append(elab_code)

        return result


def _item_url(item: CandidateItem) -> str:
    prefix = "pakiety" if item.kind == "package" else "badania"
    return f"https://diag.pl/sklep/{prefix}/{item.slug}"


def _normalize_token(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None
