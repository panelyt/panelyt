from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass

from panelyt_api.optimization.context import CandidateItem
from panelyt_api.schemas.common import ItemOut
from panelyt_api.schemas.optimize import OptimizeResponse
from panelyt_api.utils.normalization import normalize_token


@dataclass(slots=True)
class ResponseDependencies:
    expand_requested_tokens: Callable[[Sequence[str]], set[str]]
    get_all_biomarkers_for_items: Callable[
        [list[int]], Awaitable[tuple[dict[int, list[str]], dict[str, str]]]
    ]
    expand_synthetic_panel_biomarkers: Callable[[dict[int, list[str]]], None]
    apply_synthetic_coverage_overrides: Callable[
        [Sequence[CandidateItem], dict[int, list[str]]], None
    ]
    augment_labels_for_tokens: Callable[[set[str], dict[str, str]], Awaitable[None]]
    bonus_price_map: Callable[[Mapping[str, str], int], Awaitable[dict[str, int]]]
    item_url: Callable[[CandidateItem], str]


async def build_response_payload(
    chosen: Sequence[CandidateItem],
    *,
    uncovered: Sequence[str],
    requested_tokens: Sequence[str],
    institution_id: int,
    deps: ResponseDependencies,
    currency: str,
) -> tuple[OptimizeResponse, dict[str, str]]:
    total_now = round(sum(item.price_now for item in chosen) / 100, 2)
    total_min30 = round(sum(item.price_min30 for item in chosen) / 100, 2)
    explain = build_explain_map(chosen)

    chosen_item_ids = [item.id for item in chosen]
    biomarkers_by_item, labels = await deps.get_all_biomarkers_for_items(chosen_item_ids)
    deps.expand_synthetic_panel_biomarkers(biomarkers_by_item)
    deps.apply_synthetic_coverage_overrides(chosen, biomarkers_by_item)
    await deps.augment_labels_for_tokens(
        {token for tokens in biomarkers_by_item.values() for token in tokens},
        labels,
    )

    requested_normalized = deps.expand_requested_tokens(requested_tokens)
    bonus_tokens: dict[str, str] = {}
    for item in chosen:
        for token in biomarkers_by_item.get(item.id, []):
            if not token:
                continue
            normalized = normalize_token(token)
            if not normalized or normalized in requested_normalized:
                continue
            bonus_tokens.setdefault(normalized, token)

    bonus_price_map = await deps.bonus_price_map(bonus_tokens, institution_id)
    bonus_total_grosz = sum(bonus_price_map.get(key, 0) for key in bonus_tokens.keys())
    bonus_total_now = round(bonus_total_grosz / 100, 2) if bonus_total_grosz else 0.0
    bonus_biomarkers = sorted({token for token in bonus_tokens.values() if token})

    items_payload = [
        ItemOut(
            id=item.id,
            kind=item.kind,
            name=item.name,
            slug=item.slug,
            price_now_grosz=item.price_now,
            price_min30_grosz=item.price_min30,
            currency=currency,
            biomarkers=sorted(biomarkers_by_item.get(item.id, [])),
            url=deps.item_url(item),
            on_sale=item.on_sale,
            is_synthetic_package=item.is_synthetic_package,
        )
        for item in chosen
    ]

    response = OptimizeResponse(
        total_now=total_now,
        total_min30=total_min30,
        currency=currency,
        items=items_payload,
        bonus_total_now=bonus_total_now,
        bonus_biomarkers=bonus_biomarkers,
        explain=explain,
        uncovered=list(uncovered),
        labels=labels,
    )
    return response, labels


def build_explain_map(chosen: Sequence[CandidateItem]) -> dict[str, list[str]]:
    explain: dict[str, list[str]] = {}
    for item in chosen:
        for token in item.coverage:
            explain.setdefault(token, []).append(item.name)
    return explain
