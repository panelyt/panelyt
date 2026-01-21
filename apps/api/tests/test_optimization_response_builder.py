from __future__ import annotations

import pytest

from panelyt_api.optimization.context import CandidateItem
from panelyt_api.optimization.response_builder import build_response_payload, ResponseDependencies


def _item_url(item: CandidateItem) -> str:
    return f"/items/{item.slug}"


def _expand_requested_tokens(tokens):
    return {token.strip().upper() for token in tokens}


async def _get_all_biomarkers_for_items(item_ids):
    return {item_ids[0]: ["B"]}, {"B": "Beta"}


def _expand_synthetic_panel_biomarkers(_biomarkers_map):
    return None


def _apply_synthetic_coverage_overrides(_items, _biomarkers_map):
    return None


async def _augment_labels_for_tokens(_tokens, _labels):
    return None


async def _bonus_price_map(_tokens, _institution_id):
    return {"b": 500}


@pytest.mark.asyncio
async def test_build_response_includes_bonus_biomarkers():
    chosen = [
        CandidateItem(
            id=1,
            kind="single",
            name="Alpha",
            slug="alpha",
            external_id="item-1",
            price_now=1000,
            price_min30=900,
            sale_price=None,
            regular_price=None,
            coverage={"A"},
        )
    ]

    deps = ResponseDependencies(
        expand_requested_tokens=_expand_requested_tokens,
        get_all_biomarkers_for_items=_get_all_biomarkers_for_items,
        expand_synthetic_panel_biomarkers=_expand_synthetic_panel_biomarkers,
        apply_synthetic_coverage_overrides=_apply_synthetic_coverage_overrides,
        augment_labels_for_tokens=_augment_labels_for_tokens,
        bonus_price_map=_bonus_price_map,
        item_url=_item_url,
    )

    response, labels = await build_response_payload(
        chosen,
        uncovered=["A"],
        requested_tokens=["A"],
        institution_id=1,
        deps=deps,
        currency="PLN",
    )

    assert response.bonus_biomarkers == ["B"]
    assert response.bonus_total_now == 5.0
    assert labels == {"B": "Beta"}
