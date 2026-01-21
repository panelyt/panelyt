from __future__ import annotations

import logging
import math
import time
from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, datetime, timedelta

from cachetools import LRUCache
from ortools.sat.python import cp_model
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core import metrics
from panelyt_api.core.cache import optimization_cache, optimization_context_cache
from panelyt_api.core.diag import (
    DIAG_PACKAGE_ITEM_URL_TEMPLATE,
    DIAG_SINGLE_ITEM_URL_TEMPLATE,
)
from panelyt_api.db import models
from panelyt_api.optimization.addons import AddonDependencies, compute_addon_suggestions
from panelyt_api.optimization.candidates import prune_candidates
from panelyt_api.optimization.context import (
    CandidateItem,
    OptimizationContext,
    ResolvedBiomarker,
    SolverOutcome,
)
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
from panelyt_api.optimization.synthetic_packages import (
    SyntheticPackage,
    load_diag_synthetic_packages,
)
from panelyt_api.schemas.optimize import (
    AddonSuggestionsRequest,
    AddonSuggestionsResponse,
    OptimizeRequest,
    OptimizeResponse,
)
from panelyt_api.services.biomarker_resolver import BiomarkerResolver
from panelyt_api.utils.normalization import (
    create_normalized_lookup,
    normalize_token,
    normalize_tokens_set,
)

logger = logging.getLogger(__name__)


DEFAULT_CURRENCY = "PLN"
PRICE_HISTORY_LOOKBACK_DAYS = 30
COVER_CACHE_MAXSIZE = 1000


class OptimizationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._resolver = BiomarkerResolver(session)
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
                resolved_labels = self._token_display_map(context.resolved)
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
        existing_labels = self._token_display_map(context.resolved)

        deps = AddonDependencies(
            minimal_cover_subset=self._minimal_cover_subset,
            expand_requested_tokens_raw=self._expand_requested_tokens_raw,
            get_all_biomarkers_for_items=self._get_all_biomarkers_for_items,
            expand_synthetic_panel_biomarkers=self._expand_synthetic_panel_biomarkers,
            apply_synthetic_coverage_overrides=self._apply_synthetic_coverage_overrides,
            augment_labels_for_tokens=self._augment_labels_for_tokens,
            bonus_price_map=self._bonus_price_map,
            token_display_map=self._token_display_map,
            item_url=_item_url,
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
        biomarker_ids = [b.id for b in biomarkers]
        if not biomarker_ids:
            return []

        panel_ids, panel_components_by_id = await self._collect_synthetic_panel_aliases(
            biomarkers
        )
        if panel_ids:
            biomarker_ids = list({*biomarker_ids, *panel_ids})

        window_start = datetime.now(UTC).date() - timedelta(days=PRICE_HISTORY_LOOKBACK_DAYS)
        history = (
            select(
                models.PriceSnapshot.item_id.label("item_id"),
                func.min(models.PriceSnapshot.price_now_grosz).label("hist_min"),
            )
            .where(models.PriceSnapshot.snap_date >= window_start)
            .where(models.PriceSnapshot.institution_id == institution_id)
            .group_by(models.PriceSnapshot.item_id)
            .subquery()
        )

        statement = (
            select(
                models.Item,
                models.InstitutionItem,
                models.ItemBiomarker.biomarker_id,
                models.Biomarker.elab_code,
                models.Biomarker.slug,
                models.Biomarker.name,
                history.c.hist_min,
            )
            .join(
                models.InstitutionItem,
                (models.InstitutionItem.item_id == models.Item.id)
                & (models.InstitutionItem.institution_id == institution_id),
            )
            .join(models.ItemBiomarker, models.Item.id == models.ItemBiomarker.item_id)
            .join(models.Biomarker, models.Biomarker.id == models.ItemBiomarker.biomarker_id)
            .outerjoin(history, history.c.item_id == models.Item.id)
            .where(models.ItemBiomarker.biomarker_id.in_(biomarker_ids))
            .where(models.InstitutionItem.is_available.is_(True))
            .where(models.InstitutionItem.price_now_grosz > 0)
        )

        rows = (await self.session.execute(statement)).all()
        by_id: dict[int, CandidateItem] = {}
        id_to_token = {b.id: b.token for b in biomarkers}
        for (
            item,
            offer,
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
                    price_now=offer.price_now_grosz,
                    price_min30=self._resolve_price_floor(
                        hist_min, offer.price_min30_grosz, offer.price_now_grosz
                    ),
                    sale_price=offer.sale_price_grosz,
                    regular_price=offer.regular_price_grosz,
                )
                by_id[item.id] = candidate
            panel_components = panel_components_by_id.get(biomarker_id)
            if panel_components:
                candidate.coverage.update(panel_components)
            token = id_to_token.get(biomarker_id)
            if token:
                candidate.coverage.add(token)
        await self._apply_synthetic_packages(
            by_id, biomarkers, institution_id, history
        )
        return list(by_id.values())

    async def _collect_synthetic_panel_aliases(
        self, biomarkers: Sequence[ResolvedBiomarker]
    ) -> tuple[set[int], dict[int, set[str]]]:
        synthetic_packages = load_diag_synthetic_packages()
        if not synthetic_packages or not biomarkers:
            return set(), {}

        selected_lookup = create_normalized_lookup(
            {entry.token: entry.token for entry in biomarkers}
        )
        panel_components_by_code: dict[str, set[str]] = {}
        for mapping in synthetic_packages:
            panel_code = mapping.panel_elab_code
            if not panel_code:
                continue
            tokens_all = {
                normalized
                for code in mapping.component_elab_codes
                if (normalized := normalize_token(code)) is not None
            }
            if not tokens_all:
                continue
            if not any(selected_lookup.get(token) for token in tokens_all):
                continue
            panel_components_by_code.setdefault(panel_code, set()).update(
                mapping.component_elab_codes
            )

        if not panel_components_by_code:
            return set(), {}

        statement = select(models.Biomarker.id, models.Biomarker.elab_code).where(
            models.Biomarker.elab_code.in_(list(panel_components_by_code.keys()))
        )
        rows = (await self.session.execute(statement)).all()
        panel_ids: set[int] = set()
        panel_components_by_id: dict[int, set[str]] = {}
        for biomarker_id, elab_code in rows:
            panel_ids.add(biomarker_id)
            components = panel_components_by_code.get(elab_code)
            if components:
                panel_components_by_id[biomarker_id] = set(components)
        return panel_ids, panel_components_by_id

    async def _apply_synthetic_packages(
        self,
        candidates_by_id: dict[int, CandidateItem],
        biomarkers: Sequence[ResolvedBiomarker],
        institution_id: int,
        history_subquery,
    ) -> None:
        synthetic_packages = load_diag_synthetic_packages()
        if not synthetic_packages or not biomarkers:
            return

        selected_lookup = create_normalized_lookup(
            {entry.token: entry.token for entry in biomarkers}
        )

        mapping_by_external: dict[str, SyntheticPackage] = {}
        mapping_by_slug: dict[str, SyntheticPackage] = {}
        mapping_tokens: dict[SyntheticPackage, set[str]] = {}
        for mapping in synthetic_packages:
            tokens_all: set[str] = set()
            for code in mapping.component_elab_codes:
                normalized = normalize_token(code)
                if not normalized:
                    continue
                tokens_all.add(code)
            if not tokens_all:
                continue
            tokens_selected = {
                token
                for token in tokens_all
                if selected_lookup.get(normalize_token(token) or "")
            }
            if not tokens_selected:
                continue
            mapping_tokens[mapping] = tokens_all
            if mapping.external_id:
                mapping_by_external[mapping.external_id] = mapping
            if mapping.slug:
                mapping_by_slug[mapping.slug] = mapping

        if not mapping_tokens:
            return

        external_ids = list(mapping_by_external.keys())
        slugs = list(mapping_by_slug.keys())
        if not external_ids and not slugs:
            return

        filters = []
        if external_ids:
            filters.append(models.Item.external_id.in_(external_ids))
        if slugs:
            filters.append(models.Item.slug.in_(slugs))

        statement = (
            select(
                models.Item,
                models.InstitutionItem,
                history_subquery.c.hist_min,
            )
            .join(
                models.InstitutionItem,
                (models.InstitutionItem.item_id == models.Item.id)
                & (models.InstitutionItem.institution_id == institution_id),
            )
            .outerjoin(history_subquery, history_subquery.c.item_id == models.Item.id)
            .where(or_(*filters))
            .where(models.InstitutionItem.is_available.is_(True))
            .where(models.InstitutionItem.price_now_grosz > 0)
        )

        rows = (await self.session.execute(statement)).all()
        for item, offer, hist_min in rows:
            matched_mapping: SyntheticPackage | None = None
            if item.external_id in mapping_by_external:
                matched_mapping = mapping_by_external[item.external_id]
            elif item.slug in mapping_by_slug:
                matched_mapping = mapping_by_slug[item.slug]
            if matched_mapping is None:
                continue
            tokens = mapping_tokens.get(matched_mapping)
            if not tokens:
                continue
            candidate = candidates_by_id.get(item.id)
            if candidate is None:
                candidate = CandidateItem(
                    id=item.id,
                    kind=item.kind,
                    name=item.name,
                    slug=item.slug,
                    external_id=item.external_id,
                    price_now=offer.price_now_grosz,
                    price_min30=self._resolve_price_floor(
                        hist_min, offer.price_min30_grosz, offer.price_now_grosz
                    ),
                    sale_price=offer.sale_price_grosz,
                    regular_price=offer.regular_price_grosz,
                    is_synthetic_package=True,
                    coverage=set(tokens),
                )
                candidates_by_id[item.id] = candidate
            else:
                candidate.coverage = set(tokens)
                candidate.is_synthetic_package = True

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

    @staticmethod
    def _resolve_price_floor(
        history_price: int | None, rolling_min: int | None, current_price: int
    ) -> int:
        if history_price is not None:
            return int(history_price)
        if rolling_min is not None:
            return int(rolling_min)
        return int(current_price)

    async def _run_solver(
        self,
        candidates: Sequence[CandidateItem],
        biomarkers: Sequence[ResolvedBiomarker],
        institution_id: int,
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
            expand_requested_tokens=self._expand_requested_tokens,
            get_all_biomarkers_for_items=self._get_all_biomarkers_for_items,
            expand_synthetic_panel_biomarkers=self._expand_synthetic_panel_biomarkers,
            apply_synthetic_coverage_overrides=self._apply_synthetic_coverage_overrides,
            augment_labels_for_tokens=self._augment_labels_for_tokens,
            bonus_price_map=self._bonus_price_map,
            item_url=_item_url,
        )
        response, labels = await build_response_payload(
            chosen,
            uncovered=uncovered,
            requested_tokens=[biomarker.token for biomarker in biomarkers],
            institution_id=institution_id,
            deps=deps,
            currency=DEFAULT_CURRENCY,
        )
        total_now_grosz = sum(item.price_now for item in chosen)
        return SolverOutcome(
            response=response,
            chosen_items=list(chosen),
            uncovered_tokens=set(uncovered),
            total_now_grosz=int(total_now_grosz),
            labels=labels,
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
    def _token_display_map(
        resolved: Sequence[ResolvedBiomarker],
    ) -> dict[str, str]:
        return {
            biomarker.token: biomarker.display_name or biomarker.token
            for biomarker in resolved
        }

    @staticmethod
    def _apply_synthetic_coverage_overrides(
        items: Sequence[CandidateItem],
        biomarkers_by_item: dict[int, list[str]],
    ) -> None:
        for item in items:
            if not item.is_synthetic_package:
                continue
            if not item.coverage:
                continue
            biomarkers_by_item[item.id] = sorted(item.coverage)

    @staticmethod
    def _expand_synthetic_panel_biomarkers(
        biomarkers_by_item: dict[int, list[str]],
    ) -> None:
        synthetic_packages = load_diag_synthetic_packages()
        if not synthetic_packages or not biomarkers_by_item:
            return

        panel_components = OptimizationService._panel_components_by_code(synthetic_packages)
        if not panel_components:
            return

        for item_id, tokens in list(biomarkers_by_item.items()):
            if not tokens:
                continue
            expanded: list[str] = []
            seen = set()
            for token in tokens:
                normalized = normalize_token(token)
                components = panel_components.get(normalized or "")
                if components:
                    for component in components:
                        if component in seen:
                            continue
                        expanded.append(component)
                        seen.add(component)
                else:
                    if token in seen:
                        continue
                    expanded.append(token)
                    seen.add(token)
            biomarkers_by_item[item_id] = expanded

    @staticmethod
    def _panel_components_by_code(
        synthetic_packages: Sequence[SyntheticPackage],
    ) -> dict[str, tuple[str, ...]]:
        panel_components: dict[str, tuple[str, ...]] = {}
        for mapping in synthetic_packages:
            panel_code = mapping.panel_elab_code
            if not panel_code or not mapping.component_elab_codes:
                continue
            normalized_panel = normalize_token(panel_code)
            if not normalized_panel:
                continue
            panel_components[normalized_panel] = mapping.component_elab_codes
        return panel_components

    @staticmethod
    def _expand_requested_tokens(requested_tokens: Sequence[str]) -> set[str]:
        if not requested_tokens:
            return set()

        synthetic_packages = load_diag_synthetic_packages()
        if not synthetic_packages:
            return normalize_tokens_set(list(requested_tokens))

        panel_components = OptimizationService._panel_components_by_code(synthetic_packages)
        if not panel_components:
            return normalize_tokens_set(list(requested_tokens))

        expanded: list[str] = []
        for token in requested_tokens:
            normalized = normalize_token(token)
            components = panel_components.get(normalized or "")
            if components:
                expanded.extend(components)
            else:
                expanded.append(token)
        return normalize_tokens_set(expanded)

    @staticmethod
    def _expand_requested_tokens_raw(requested_tokens: Sequence[str]) -> set[str]:
        if not requested_tokens:
            return set()

        synthetic_packages = load_diag_synthetic_packages()
        if not synthetic_packages:
            return set(requested_tokens)

        panel_components = OptimizationService._panel_components_by_code(synthetic_packages)
        if not panel_components:
            return set(requested_tokens)

        expanded: list[str] = []
        for token in requested_tokens:
            normalized = normalize_token(token)
            components = panel_components.get(normalized or "")
            if components:
                expanded.extend(components)
            else:
                expanded.append(token)
        return set(expanded)

    async def _augment_labels_for_tokens(
        self,
        tokens: set[str],
        labels: dict[str, str],
    ) -> None:
        missing = {token for token in tokens if token and token not in labels}
        if not missing:
            return
        statement = (
            select(
                models.Biomarker.elab_code,
                models.Biomarker.slug,
                models.Biomarker.name,
            )
            .where(
                or_(
                    models.Biomarker.elab_code.in_(missing),
                    models.Biomarker.slug.in_(missing),
                    models.Biomarker.name.in_(missing),
                )
            )
        )
        rows = (await self.session.execute(statement)).all()
        for elab_code, slug, name in rows:
            display_name = (name or "").strip()
            if not display_name:
                continue
            for candidate in (elab_code, slug, name):
                if candidate and candidate in missing:
                    labels.setdefault(candidate, display_name)

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
        self, tokens: Mapping[str, str], institution_id: int
    ) -> dict[str, int]:
        """Return the best-known single-test price (in grosz) for each normalized token."""
        if not tokens:
            return {}

        normalized_lookup = create_normalized_lookup(tokens)
        raw_tokens = {value.strip() for value in tokens.values() if value.strip()}
        if not raw_tokens or not normalized_lookup:
            return {}

        statement = (
            select(
                models.Biomarker.elab_code,
                models.Biomarker.slug,
                models.Biomarker.name,
                func.min(models.InstitutionItem.price_now_grosz).label("min_price"),
            )
            .select_from(models.Biomarker)
            .join(models.ItemBiomarker, models.ItemBiomarker.biomarker_id == models.Biomarker.id)
            .join(models.Item, models.Item.id == models.ItemBiomarker.item_id)
            .join(
                models.InstitutionItem,
                (models.InstitutionItem.item_id == models.Item.id)
                & (models.InstitutionItem.institution_id == institution_id),
            )
            .where(models.Item.kind == "single")
            .where(models.InstitutionItem.is_available.is_(True))
            .where(models.InstitutionItem.price_now_grosz > 0)
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

def _item_url(item: CandidateItem) -> str:
    template = (
        DIAG_PACKAGE_ITEM_URL_TEMPLATE if item.kind == "package" else DIAG_SINGLE_ITEM_URL_TEMPLATE
    )
    try:
        return template.format(slug=item.slug, external_id=item.external_id)
    except Exception:  # pragma: no cover - fallback for malformed templates
        return template
