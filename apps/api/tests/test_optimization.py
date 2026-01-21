from panelyt_api.optimization.candidates import prune_candidates
from panelyt_api.optimization.item_url import item_url
from panelyt_api.optimization.service import CandidateItem


def test_prune_cheapest_single_only():
    candidates = [
        CandidateItem(
            id=1,
            kind="single",
            name="ALT",
            slug="alt",
            external_id="item-1",
            price_now=1000,
            price_min30=1000,
            sale_price=None,
            regular_price=None,
            coverage={"ALT"},
        ),
        CandidateItem(
            id=2,
            kind="single",
            name="ALT premium",
            slug="alt-premium",
            external_id="item-2",
            price_now=1500,
            price_min30=1500,
            sale_price=None,
            regular_price=None,
            coverage={"ALT"},
        ),
        CandidateItem(
            id=3,
            kind="package",
            name="Liver panel",
            slug="liver-panel",
            external_id="item-3",
            price_now=2500,
            price_min30=2400,
            sale_price=None,
            regular_price=None,
            coverage={"ALT", "AST"},
        ),
    ]

    pruned = prune_candidates(candidates)
    ids = {item.id for item in pruned}
    assert ids == {1, 2, 3}


def test_item_url_builds_correct_path():
    candidate = CandidateItem(
        id=10,
        kind="package",
        name="Wellness",
        slug="wellness",
        external_id="item-10",
        price_now=1000,
        price_min30=1000,
        sale_price=None,
        regular_price=None,
        coverage={"ALT"},
    )
    assert item_url(candidate) == "https://diag.pl/sklep/pakiety/wellness"

    candidate.kind = "single"
    assert item_url(candidate) == "https://diag.pl/sklep/badania/wellness"
