from panelyt_api.optimization.service import CandidateItem, OptimizationService, _item_url


class DummySession:
    async def execute(self, *_args, **_kwargs):  # pragma: no cover - replaced in tests
        raise NotImplementedError


def test_prune_cheapest_single_only():
    service = OptimizationService(DummySession())
    candidates = [
        CandidateItem(
            id=1,
            kind="single",
            name="ALT",
            slug="alt",
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
            price_now=2500,
            price_min30=2400,
            sale_price=None,
            regular_price=None,
            coverage={"ALT", "AST"},
        ),
    ]

    pruned = service._prune_candidates(candidates)
    ids = {item.id for item in pruned}
    assert ids == {1, 3}


def test_item_url_builds_correct_path():
    candidate = CandidateItem(
        id=10,
        kind="package",
        name="Wellness",
        slug="wellness",
        price_now=1000,
        price_min30=1000,
        sale_price=None,
        regular_price=None,
        coverage={"ALT"},
    )
    assert _item_url(candidate) == "https://diag.pl/sklep/pakiety/wellness"

    candidate.kind = "single"
    assert _item_url(candidate) == "https://diag.pl/sklep/badania/wellness"
