from __future__ import annotations

import math
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass

from panelyt_api.optimization.context import (
    AddonComputation,
    CandidateItem,
    OptimizationContext,
    ResolvedBiomarker,
)
from panelyt_api.schemas.common import ItemOut
from panelyt_api.schemas.optimize import AddonBiomarker, AddonSuggestion
from panelyt_api.utils.normalization import normalize_token

ADDON_SUGGESTION_LIMIT = 2
ADDON_CANDIDATE_POOL_SIZE = 10


@dataclass(slots=True)
class AddonDependencies:
    minimal_cover_subset: Callable[[set[str], Sequence[CandidateItem]], tuple[float, set[int]]]
    expand_requested_tokens_raw: Callable[[Sequence[str]], set[str]]
    get_all_biomarkers_for_items: Callable[
        [list[int]], Awaitable[tuple[dict[int, list[str]], dict[str, str]]]
    ]
    expand_synthetic_panel_biomarkers: Callable[[dict[int, list[str]]], None]
    apply_synthetic_coverage_overrides: Callable[
        [Sequence[CandidateItem], dict[int, list[str]]], None
    ]
    augment_labels_for_tokens: Callable[[set[str], dict[str, str]], Awaitable[None]]
    bonus_price_map: Callable[[Mapping[str, str], int], Awaitable[dict[str, int]]]
    token_display_map: Callable[[Sequence[ResolvedBiomarker]], dict[str, str]]
    item_url: Callable[[CandidateItem], str]


async def compute_addon_suggestions(
    context: OptimizationContext,
    chosen_items: Sequence[CandidateItem],
    existing_labels: dict[str, str],
    institution_id: int,
    deps: AddonDependencies,
    *,
    currency: str,
) -> tuple[list[AddonSuggestion], dict[str, str]]:
    if len(context.resolved) < 2 or not chosen_items:
        return [], {}

    selected_tokens = deps.expand_requested_tokens_raw(
        [entry.token for entry in context.resolved]
    )
    chosen_items_list = list(chosen_items)
    chosen_total_grosz = sum(item.price_now for item in chosen_items_list)
    chosen_by_id = {item.id: item for item in chosen_items_list}
    baseline_coverage: set[str] = set()
    for item in chosen_items_list:
        baseline_coverage.update(
            token for token in item.coverage if token in selected_tokens
        )

    chosen_ids = set(chosen_by_id.keys())

    computations: list[AddonComputation] = []
    for candidate in context.candidates:
        if candidate.kind != "package" and not candidate.is_synthetic_package:
            continue
        if candidate.id in chosen_ids:
            continue
        covered_tokens = set(candidate.coverage) & selected_tokens
        if len(covered_tokens) < 2:
            continue
        drop_cost, drop_ids = deps.minimal_cover_subset(covered_tokens, chosen_items_list)
        if math.isinf(drop_cost) or not drop_ids:
            continue

        remaining_coverage: set[str] = set()
        for item in chosen_items_list:
            if item.id in drop_ids:
                continue
            remaining_coverage.update(
                token for token in item.coverage if token in selected_tokens
            )

        candidate_tokens = {token for token in candidate.coverage if token in selected_tokens}
        covered_after = remaining_coverage | candidate_tokens
        missing_tokens = baseline_coverage - covered_after

        if missing_tokens:
            replacement_candidates = [
                item
                for item in context.candidates
                if item.id not in drop_ids
                and item.id != candidate.id
                and item.coverage & missing_tokens
            ]
            readd_cost, _ = deps.minimal_cover_subset(missing_tokens, replacement_candidates)
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
    pool_size = max(ADDON_SUGGESTION_LIMIT, ADDON_CANDIDATE_POOL_SIZE)
    candidate_pool = computations[:pool_size]
    package_ids = [entry.candidate.id for entry in candidate_pool]
    if not package_ids:
        return [], {}

    lookup_ids = set(package_ids)
    lookup_ids.update({item.id for item in chosen_items_list})
    biomarkers_map, label_map = await deps.get_all_biomarkers_for_items(list(lookup_ids))
    deps.expand_synthetic_panel_biomarkers(biomarkers_map)
    deps.apply_synthetic_coverage_overrides(
        [*chosen_items_list, *(entry.candidate for entry in candidate_pool)],
        biomarkers_map,
    )
    await deps.augment_labels_for_tokens(
        {token for tokens in biomarkers_map.values() for token in tokens},
        label_map,
    )
    additional_labels: dict[str, str] = {}

    resolved_labels = deps.token_display_map(context.resolved)
    combined_labels = {**resolved_labels, **existing_labels}

    all_bonus_tokens: dict[str, str] = {}
    for entry in candidate_pool:
        item = entry.candidate
        biomarkers = biomarkers_map.get(item.id, [])
        for token in biomarkers:
            if token not in selected_tokens:
                normalized = normalize_token(token)
                if normalized:
                    all_bonus_tokens.setdefault(normalized, token)

    bonus_price_map: dict[str, int] = {}
    if all_bonus_tokens:
        bonus_price_map = await deps.bonus_price_map(all_bonus_tokens, institution_id)

    bonus_current: set[str] = set()
    for item_id in chosen_ids:
        for token in biomarkers_map.get(item_id, []):
            if token not in selected_tokens:
                bonus_current.add(token)

    suggestions: list[AddonSuggestion] = []
    for entry in candidate_pool:
        item = entry.candidate
        biomarkers = sorted(biomarkers_map.get(item.id, []))
        remaining_ids = [
            item_id for item_id in chosen_ids if item_id not in entry.dropped_item_ids
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
        bonus_removed = bonus_current - bonus_after
        bonus_kept = bonus_current & bonus_after
        bonus_added = bonus_after - bonus_current

        package_payload = ItemOut(
            id=item.id,
            kind=item.kind,
            name=item.name,
            slug=item.slug,
            price_now_grosz=item.price_now,
            price_min30_grosz=item.price_min30,
            currency=currency,
            biomarkers=biomarkers,
            url=deps.item_url(item),
            on_sale=item.on_sale,
            is_synthetic_package=item.is_synthetic_package,
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
        for token in biomarkers:
            label = label_map.get(token)
            if label:
                additional_labels.setdefault(token, label)

        upgrade_cost_grosz = entry.estimated_total_grosz - chosen_total_grosz

        removes = [
            AddonBiomarker(code=token, display_name=resolve_display(token))
            for token in sorted(bonus_removed)
        ]
        keeps = [
            AddonBiomarker(code=token, display_name=resolve_display(token))
            for token in sorted(bonus_kept)
        ]

        extra_tokens: list[str] = []
        for addon_entry in adds:
            normalized = normalize_token(addon_entry.code)
            if normalized:
                extra_tokens.append(normalized)

        if extra_tokens:
            singles_total = 0
            all_found = True
            for normalized in extra_tokens:
                price = bonus_price_map.get(normalized)
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
        if len(suggestions) >= ADDON_SUGGESTION_LIMIT:
            break

    return suggestions, additional_labels
