from __future__ import annotations

import pytest

from panelyt_api.optimization.addons import AddonDependencies, compute_addon_suggestions
from panelyt_api.optimization.context import CandidateItem, OptimizationContext, ResolvedBiomarker


def _forbid_sync(*_args, **_kwargs):
    raise AssertionError("Dependency should not be called")


async def _forbid_async(*_args, **_kwargs):
    raise AssertionError("Dependency should not be called")


@pytest.mark.asyncio
async def test_addon_suggestions_short_circuits_when_insufficient_inputs():
    context = OptimizationContext(
        resolved=[ResolvedBiomarker(id=1, token="A", display_name="A", original="A")],
        unresolved_inputs=[],
        candidates=[],
        token_to_original={},
    )
    chosen_items = [
        CandidateItem(
            id=1,
            kind="single",
            name="A",
            slug="a",
            external_id="item-1",
            price_now=100,
            price_min30=100,
            sale_price=None,
            regular_price=None,
            coverage={"A"},
        )
    ]

    deps = AddonDependencies(
        minimal_cover_subset=_forbid_sync,
        expand_requested_tokens_raw=_forbid_sync,
        get_all_biomarkers_for_items=_forbid_async,
        expand_synthetic_panel_biomarkers=_forbid_sync,
        apply_synthetic_coverage_overrides=_forbid_sync,
        augment_labels_for_tokens=_forbid_async,
        bonus_price_map=_forbid_async,
        token_display_map=_forbid_sync,
        item_url=_forbid_sync,
    )

    suggestions, labels = await compute_addon_suggestions(
        context,
        chosen_items,
        existing_labels={},
        institution_id=1,
        deps=deps,
        currency="PLN",
    )

    assert suggestions == []
    assert labels == {}
