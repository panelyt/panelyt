from __future__ import annotations

import logging
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from ortools.sat.python import cp_model
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db import models
from panelyt_api.schemas.optimize import OptimizeRequest, OptimizeResponse

logger = logging.getLogger(__name__)


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

    def hist_min(self) -> int:
        return self.price_min30

    @property
    def on_sale(self) -> bool:
        if self.sale_price is None or self.regular_price is None:
            return False
        return self.sale_price < self.regular_price


class OptimizationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def solve(self, payload: OptimizeRequest) -> OptimizeResponse:
        resolved, unresolved_inputs = await self._resolve_biomarkers(payload.biomarkers)
        if not resolved:
            return OptimizeResponse(
                total_now=0.0,
                total_min30=0.0,
                currency="PLN",
                items=[],
                explain={},
                uncovered=payload.biomarkers,
            )

        candidates = await self._collect_candidates(resolved)
        pruned = self._prune_candidates(candidates)
        solution = self._run_solver(pruned, resolved)

        uncovered_tokens = set(solution.uncovered) | self._uncovered_tokens(resolved, pruned)
        combined_uncovered = list(dict.fromkeys(unresolved_inputs + sorted(uncovered_tokens)))

        return solution.model_copy(update={"uncovered": combined_uncovered})

    async def _resolve_biomarkers(
        self, inputs: Sequence[str]
    ) -> tuple[list[ResolvedBiomarker], list[str]]:
        resolved: list[ResolvedBiomarker] = []
        unresolved: list[str] = []
        for raw in inputs:
            normalized = raw.strip().lower()
            if not normalized:
                continue
            statement = (
                select(models.Biomarker)
                .where(
                    or_(
                        func.lower(models.Biomarker.elab_code) == normalized,
                        func.lower(models.Biomarker.slug) == normalized,
                        func.lower(models.Biomarker.name) == normalized,
                    )
                )
                .limit(1)
            )
            row = (await self.session.execute(statement)).scalar_one_or_none()
            if row is None:
                unresolved.append(raw)
                continue
            token = row.elab_code or row.slug or row.name
            resolved.append(
                ResolvedBiomarker(
                    id=row.id,
                    token=token,
                    display_name=row.name,
                    original=raw,
                )
            )
        return resolved, unresolved

    async def _collect_candidates(
        self, biomarkers: Sequence[ResolvedBiomarker]
    ) -> list[CandidateItem]:
        biomarker_ids = [b.id for b in biomarkers]
        if not biomarker_ids:
            return []

        window_start = datetime.utcnow().date() - timedelta(days=30)
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
                    price_min30=int(hist_min or item.price_min30_grosz or item.price_now_grosz),
                    sale_price=item.sale_price_grosz,
                    regular_price=item.regular_price_grosz,
                )
                by_id[item.id] = candidate
            token = id_to_token.get(biomarker_id)
            if token:
                candidate.coverage.add(token)
        return list(by_id.values())

    def _prune_candidates(self, candidates: Iterable[CandidateItem]) -> list[CandidateItem]:
        items = list(candidates)
        # Cheapest single per biomarker
        best_single: dict[str, int] = {}
        for item in items:
            if item.kind != "single" or len(item.coverage) != 1:
                continue
            token = next(iter(item.coverage))
            current_price = best_single.get(token)
            if current_price is None or item.price_now < current_price:
                best_single[token] = item.price_now

        pruned: list[CandidateItem] = []
        for item in items:
            if item.kind == "single" and len(item.coverage) == 1:
                token = next(iter(item.coverage))
                if best_single.get(token) != item.price_now:
                    continue
            pruned.append(item)

        # Dominance removal
        dominant: list[CandidateItem] = []
        for item in pruned:
            dominated = False
            for other in pruned:
                if other is item:
                    continue
                if other.coverage.issuperset(item.coverage) and other.price_now <= item.price_now:
                    dominated = True
                    break
            if not dominated:
                dominant.append(item)
        return dominant

    def _run_solver(
        self, candidates: Sequence[CandidateItem], biomarkers: Sequence[ResolvedBiomarker]
    ) -> OptimizeResponse:
        model = cp_model.CpModel()
        variables: dict[int, cp_model.IntVar] = {}
        for item in candidates:
            variables[item.id] = model.NewBoolVar(item.slug)

        coverage_map: dict[str, list[int]] = {}
        for item in candidates:
            for token in item.coverage:
                coverage_map.setdefault(token, []).append(item.id)

        uncovered: list[str] = []
        for biomarker in biomarkers:
            covering = coverage_map.get(biomarker.token, [])
            if not covering:
                uncovered.append(biomarker.token)
                continue
            model.Add(sum(variables[item_id] for item_id in covering) >= 1)

        if not variables:
            return OptimizeResponse(
                total_now=0.0,
                total_min30=0.0,
                currency="PLN",
                items=[],
                explain={},
                uncovered=uncovered,
            )

        model.Minimize(
            sum(candidate.price_now * variables[candidate.id] for candidate in candidates)
        )

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 5.0
        solver.parameters.num_search_workers = 8
        status = solver.Solve(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            logger.warning("CP-SAT returned status %s", status)
            return OptimizeResponse(
                total_now=0.0,
                total_min30=0.0,
                currency="PLN",
                items=[],
                explain={},
                uncovered=uncovered,
            )

        chosen: list[CandidateItem] = []
        for item in candidates:
            if solver.Value(variables[item.id]):
                chosen.append(item)

        total_now = round(sum(item.price_now for item in chosen) / 100, 2)
        total_min30 = round(sum(item.price_min30 for item in chosen) / 100, 2)

        explain: dict[str, list[str]] = {}
        for item in chosen:
            for token in item.coverage:
                explain.setdefault(token, []).append(item.name)

        items_payload = [
            {
                "id": item.id,
                "kind": item.kind,
                "name": item.name,
                "slug": item.slug,
                "price_now_grosz": item.price_now,
                "price_min30_grosz": item.price_min30,
                "currency": "PLN",
                "biomarkers": sorted(item.coverage),
                "url": _item_url(item),
                "on_sale": item.on_sale,
            }
            for item in chosen
        ]

        return OptimizeResponse(
            total_now=total_now,
            total_min30=total_min30,
            currency="PLN",
            items=items_payload,
            explain=explain,
            uncovered=uncovered,
        )

    def _uncovered_tokens(
        self, biomarkers: Sequence[ResolvedBiomarker], candidates: Sequence[CandidateItem]
    ) -> set[str]:
        available = set()
        for item in candidates:
            available.update(item.coverage)
        tokens = {b.token for b in biomarkers}
        return tokens - available


def _item_url(item: CandidateItem) -> str:
    prefix = "pakiety" if item.kind == "package" else "badania"
    return f"https://diag.pl/sklep/{prefix}/{item.slug}"
