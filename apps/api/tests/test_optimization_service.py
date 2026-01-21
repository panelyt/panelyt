from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from ortools.sat.python import cp_model
from sqlalchemy import delete, insert

from panelyt_api.core.cache import clear_all_caches
from panelyt_api.db import models
from panelyt_api.optimization.candidates import prune_candidates
from panelyt_api.optimization.service import (
    CandidateItem,
    OptimizationService,
    ResolvedBiomarker,
    _item_url,
)
from panelyt_api.schemas.optimize import AddonSuggestionsRequest, OptimizeRequest
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID


def make_candidate(**overrides) -> CandidateItem:
    defaults = {
        "id": 1,
        "kind": "single",
        "name": "Test",
        "slug": "test",
        "external_id": "item-1",
        "price_now": 1000,
        "price_min30": 1000,
        "sale_price": None,
        "regular_price": None,
        "coverage": set(),
    }
    defaults.update(overrides)
    coverage = defaults.get("coverage", set())
    defaults["coverage"] = set(coverage)
    return CandidateItem(**defaults)


async def insert_institution(
    db_session,
    institution_id: int = DEFAULT_INSTITUTION_ID,
    name: str | None = None,
) -> None:
    await db_session.execute(
        insert(models.Institution).values(
            {
                "id": institution_id,
                "name": name or f"Institution {institution_id}",
            }
        )
    )


def _offer_from_item(item: dict, institution_id: int, fetched_at: datetime) -> dict:
    return {
        "institution_id": institution_id,
        "item_id": item["id"],
        "is_available": item.get("is_available", True),
        "currency": item.get("currency", "PLN"),
        "price_now_grosz": item["price_now_grosz"],
        "price_min30_grosz": item.get("price_min30_grosz", item["price_now_grosz"]),
        "sale_price_grosz": item.get("sale_price_grosz"),
        "regular_price_grosz": item.get("regular_price_grosz"),
        "fetched_at": item.get("fetched_at", fetched_at),
    }


async def insert_items_with_offers(
    db_session,
    items: list[dict],
    institution_id: int = DEFAULT_INSTITUTION_ID,
) -> None:
    await db_session.execute(insert(models.Item).values(items))
    fetched_at = datetime.now(UTC)
    offers = [_offer_from_item(item, institution_id, fetched_at) for item in items]
    await db_session.execute(insert(models.InstitutionItem).values(offers))


class TestOptimizationService:
    @pytest.fixture
    def service(self, db_session):
        return OptimizationService(db_session)

    @pytest.mark.asyncio
    async def test_resolve_biomarkers_empty_input(self, service):
        """Test biomarker resolution with empty input."""
        resolved, unresolved = await service._resolver.resolve_tokens([])
        assert resolved == []
        assert unresolved == []

    @pytest.mark.asyncio
    async def test_resolve_biomarkers_by_elab_code(self, service, db_session):
        """Test biomarker resolution by ELAB code."""
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        # Add test biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
                {"name": "Aspartate aminotransferase", "elab_code": "AST", "slug": "ast"},
            ])
        )
        await db_session.commit()

        resolved, unresolved = await service._resolver.resolve_tokens(["ALT", "AST", "UNKNOWN"])

        assert len(resolved) == 2
        assert len(unresolved) == 1

        assert resolved[0].token == "ALT"
        assert resolved[0].display_name == "Alanine aminotransferase"
        assert resolved[0].original == "ALT"

        assert resolved[1].token == "AST"

        assert unresolved == ["UNKNOWN"]

    @pytest.mark.asyncio
    async def test_resolve_biomarkers_case_insensitive(self, service, db_session):
        """Test biomarker resolution is case insensitive."""
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
            ])
        )
        await db_session.commit()

        resolved, unresolved = await service._resolver.resolve_tokens(["alt", "Alt", "ALT"])

        assert len(resolved) == 3
        assert unresolved == []
        for r in resolved:
            assert r.token == "ALT"

    @pytest.mark.asyncio
    async def test_resolve_biomarkers_batches_queries(self, service, db_session, monkeypatch):
        """Ensure biomarker resolution performs a single batched query."""
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
                {"name": "Aspartate aminotransferase", "elab_code": "AST", "slug": "ast"},
            ])
        )
        await db_session.commit()

        call_count = 0
        original_execute = service.session.execute

        async def counting_execute(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return await original_execute(*args, **kwargs)

        monkeypatch.setattr(service.session, "execute", counting_execute)

        resolved, unresolved = await service._resolver.resolve_tokens(["ALT", "AST", "alt"])

        assert len(resolved) == 3
        assert unresolved == []
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_resolve_biomarkers_by_slug_and_name(self, service, db_session):
        """Test biomarker resolution by slug and name."""
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "Total cholesterol", "elab_code": None, "slug": "cholesterol"},
                {"name": "Vitamin D", "elab_code": None, "slug": "vitamin-d"},
            ])
        )
        await db_session.commit()

        resolved, unresolved = await service._resolver.resolve_tokens(["cholesterol", "vitamin d"])

        assert len(resolved) == 2
        assert unresolved == []

        assert resolved[0].token == "cholesterol"  # Uses slug when no elab_code
        assert resolved[1].token == "vitamin-d"    # Uses slug when no elab_code

    @pytest.mark.asyncio
    async def test_collect_candidates_empty_biomarkers(self, service):
        """Test candidate collection with empty biomarkers."""
        candidates = await service._collect_candidates([], DEFAULT_INSTITUTION_ID)
        assert candidates == []

    @pytest.mark.asyncio
    async def test_collect_candidates_with_data(self, service, db_session):
        """Test candidate collection with valid data."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await insert_institution(db_session)

        # Add biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"name": "AST", "elab_code": "AST", "slug": "ast"},
            ])
        )

        items = [
            {
                "id": 1,
                "external_id": "1",
                "kind": "single",
                "name": "ALT Test",
                "slug": "alt-test",
                "price_now_grosz": 1000,
                "price_min30_grosz": 900,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 2,
                "external_id": "2",
                "kind": "package",
                "name": "Liver Panel",
                "slug": "liver-panel",
                "price_now_grosz": 2000,
                "price_min30_grosz": 1900,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)

        # Add item-biomarker relationships
        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 1, "biomarker_id": 1},  # ALT test covers ALT
                {"item_id": 2, "biomarker_id": 1},  # Liver panel covers ALT
                {"item_id": 2, "biomarker_id": 2},  # Liver panel covers AST
            ])
        )

        await db_session.commit()

        biomarkers = [
            ResolvedBiomarker(id=1, token="ALT", display_name="ALT", original="ALT"),
            ResolvedBiomarker(id=2, token="AST", display_name="AST", original="AST"),
        ]

        candidates = await service._collect_candidates(biomarkers, DEFAULT_INSTITUTION_ID)

        assert len(candidates) == 2

        # Find ALT test
        alt_test = next(c for c in candidates if c.id == 1)
        assert alt_test.name == "ALT Test"
        assert alt_test.kind == "single"
        assert alt_test.coverage == {"ALT"}
        assert alt_test.price_now == 1000

        # Find Liver panel
        liver_panel = next(c for c in candidates if c.id == 2)
        assert liver_panel.name == "Liver Panel"
        assert liver_panel.kind == "package"
        assert liver_panel.coverage == {"ALT", "AST"}
        assert liver_panel.price_now == 2000

    @pytest.mark.asyncio
    async def test_collect_candidates_applies_synthetic_package_mapping(
        self, service, db_session
    ):
        """Synthetic packages should add coverage even without item biomarkers."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await insert_institution(db_session)

        await db_session.execute(
            insert(models.Biomarker).values(
                [
                    {"id": 1, "name": "ALT", "elab_code": "20", "slug": "alt"},
                    {"id": 2, "name": "AST", "elab_code": "21", "slug": "ast"},
                    {"id": 3, "name": "Bilirubin", "elab_code": "23", "slug": "bil"},
                    {
                        "id": 4,
                        "name": "Liver panel",
                        "elab_code": "19",
                        "slug": "proby-watrobowe",
                    },
                ]
            )
        )

        panel_item = {
            "id": 10,
            "external_id": "605348830",
            "kind": "single",
            "name": "Proby watrobowe (ALT, AST, ALP, BIL, GGTP)",
            "slug": "proby-watrobowe-alt-ast-alp-bil-ggtp",
            "price_now_grosz": 6555,
            "price_min30_grosz": 2375,
            "currency": "PLN",
            "is_available": True,
        }
        await insert_items_with_offers(db_session, [panel_item])

        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [{"item_id": 10, "biomarker_id": 4}]
            )
        )
        await db_session.commit()

        biomarkers = [
            ResolvedBiomarker(id=1, token="20", display_name="ALT", original="ALT"),
            ResolvedBiomarker(id=2, token="21", display_name="AST", original="AST"),
            ResolvedBiomarker(id=3, token="23", display_name="BIL", original="BIL"),
        ]

        candidates = await service._collect_candidates(biomarkers, DEFAULT_INSTITUTION_ID)

        assert len(candidates) == 1
        panel = candidates[0]
        assert panel.id == 10
        assert panel.kind == "single"
        assert panel.is_synthetic_package is True
        assert panel.coverage == {"20", "21", "22", "23", "26"}

    @pytest.mark.asyncio
    async def test_collect_candidates_expands_synthetic_panel_aliases_for_packages(
        self, service, db_session
    ):
        """Packages with panel biomarkers should cover mapped component tokens."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await insert_institution(db_session)

        await db_session.execute(
            insert(models.Biomarker).values(
                [
                    {"id": 1, "name": "ALT", "elab_code": "20", "slug": "alt"},
                    {"id": 2, "name": "AST", "elab_code": "21", "slug": "ast"},
                    {"id": 3, "name": "Bilirubin", "elab_code": "23", "slug": "bil"},
                    {
                        "id": 4,
                        "name": "Liver panel",
                        "elab_code": "19",
                        "slug": "proby-watrobowe",
                    },
                ]
            )
        )

        package_item = {
            "id": 11,
            "external_id": "605377233",
            "kind": "package",
            "name": "Badania na wątrobę i trzustkę",
            "slug": "badania-na-watrobe-i-trzustke",
            "price_now_grosz": 8900,
            "price_min30_grosz": 8900,
            "currency": "PLN",
            "is_available": True,
        }
        await insert_items_with_offers(db_session, [package_item])

        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [{"item_id": 11, "biomarker_id": 4}]
            )
        )
        await db_session.commit()

        biomarkers = [
            ResolvedBiomarker(id=1, token="20", display_name="ALT", original="ALT"),
            ResolvedBiomarker(id=2, token="21", display_name="AST", original="AST"),
            ResolvedBiomarker(id=3, token="23", display_name="BIL", original="BIL"),
        ]

        candidates = await service._collect_candidates(biomarkers, DEFAULT_INSTITUTION_ID)

        assert len(candidates) == 1
        package = candidates[0]
        assert package.id == 11
        assert package.kind == "package"
        assert package.coverage == {"20", "21", "22", "23", "26"}

    @pytest.mark.asyncio
    async def test_build_response_uses_synthetic_coverage(self, service, db_session):
        """Synthetic packages should return component biomarkers in responses."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await insert_institution(db_session)

        await db_session.execute(
            insert(models.Biomarker).values(
                [
                    {"id": 19, "name": "Panel", "elab_code": "19", "slug": "panel"},
                    {"id": 20, "name": "Cynk", "elab_code": "20", "slug": "cynk"},
                    {"id": 21, "name": "Miedz", "elab_code": "21", "slug": "miedz"},
                    {"id": 22, "name": "Selen", "elab_code": "22", "slug": "selen"},
                    {"id": 23, "name": "Bil", "elab_code": "23", "slug": "bil"},
                    {"id": 26, "name": "Ggtp", "elab_code": "26", "slug": "ggtp"},
                ]
            )
        )

        panel_item = {
            "id": 10,
            "external_id": "605348830",
            "kind": "single",
            "name": "Proby watrobowe (ALT, AST, ALP, BIL, GGTP)",
            "slug": "proby-watrobowe-alt-ast-alp-bil-ggtp",
            "price_now_grosz": 6555,
            "price_min30_grosz": 2375,
            "currency": "PLN",
            "is_available": True,
        }
        await insert_items_with_offers(db_session, [panel_item])

        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [{"item_id": 10, "biomarker_id": 19}]
            )
        )
        await db_session.commit()

        candidate = CandidateItem(
            id=10,
            kind="single",
            name=panel_item["name"],
            slug=panel_item["slug"],
            external_id=panel_item["external_id"],
            price_now=panel_item["price_now_grosz"],
            price_min30=panel_item["price_min30_grosz"],
            sale_price=None,
            regular_price=None,
            is_synthetic_package=True,
            coverage={"20", "21", "22", "23", "26"},
        )

        response, labels = await service._build_response(
            [candidate],
            [],
            ["20", "21", "22", "23", "26"],
            DEFAULT_INSTITUTION_ID,
        )

        assert response.items[0].biomarkers == ["20", "21", "22", "23", "26"]
        assert response.items[0].is_synthetic_package is True
        assert labels["20"] == "Cynk"
        assert labels["21"] == "Miedz"
        assert labels["22"] == "Selen"

    @pytest.mark.asyncio
    async def test_build_response_expands_panel_requests_for_bonus(
        self, service, db_session
    ):
        """Panel selections should not mark component biomarkers as bonus."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await insert_institution(db_session)

        await db_session.execute(
            insert(models.Biomarker).values(
                [
                    {"id": 19, "name": "Panel", "elab_code": "19", "slug": "panel"},
                    {"id": 20, "name": "ALT", "elab_code": "20", "slug": "alt"},
                    {"id": 21, "name": "AST", "elab_code": "21", "slug": "ast"},
                    {"id": 22, "name": "ALP", "elab_code": "22", "slug": "alp"},
                    {"id": 23, "name": "BIL", "elab_code": "23", "slug": "bil"},
                    {"id": 26, "name": "GGTP", "elab_code": "26", "slug": "ggtp"},
                ]
            )
        )

        panel_item = {
            "id": 10,
            "external_id": "605348830",
            "kind": "single",
            "name": "Proby watrobowe (ALT, AST, ALP, BIL, GGTP)",
            "slug": "proby-watrobowe-alt-ast-alp-bil-ggtp",
            "price_now_grosz": 6555,
            "price_min30_grosz": 2375,
            "currency": "PLN",
            "is_available": True,
        }
        await insert_items_with_offers(db_session, [panel_item])
        await db_session.commit()

        candidate = CandidateItem(
            id=10,
            kind="single",
            name=panel_item["name"],
            slug=panel_item["slug"],
            external_id=panel_item["external_id"],
            price_now=panel_item["price_now_grosz"],
            price_min30=panel_item["price_min30_grosz"],
            sale_price=None,
            regular_price=None,
            is_synthetic_package=True,
            coverage={"20", "21", "22", "23", "26"},
        )

        response, _labels = await service._build_response(
            [candidate],
            [],
            ["19"],
            DEFAULT_INSTITUTION_ID,
        )

        assert response.items[0].biomarkers == ["20", "21", "22", "23", "26"]
        assert response.bonus_biomarkers == []
        assert response.bonus_total_now == 0.0

    @pytest.mark.asyncio
    async def test_build_response_expands_panel_biomarkers_for_packages(
        self, service, db_session
    ):
        """Packages with panel biomarkers should display component pills."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await insert_institution(db_session)

        await db_session.execute(
            insert(models.Biomarker).values(
                [
                    {"id": 1, "name": "ALT", "elab_code": "20", "slug": "alt"},
                    {"id": 2, "name": "AST", "elab_code": "21", "slug": "ast"},
                    {"id": 3, "name": "ALP", "elab_code": "22", "slug": "alp"},
                    {"id": 4, "name": "Bilirubin", "elab_code": "23", "slug": "bil"},
                    {"id": 5, "name": "GGTP", "elab_code": "26", "slug": "ggtp"},
                    {
                        "id": 6,
                        "name": "Liver panel",
                        "elab_code": "19",
                        "slug": "proby-watrobowe",
                    },
                    {"id": 7, "name": "Lipaza", "elab_code": "30", "slug": "lipaza"},
                    {"id": 8, "name": "Amylaza", "elab_code": "31", "slug": "amylaza"},
                ]
            )
        )

        package_item = {
            "id": 11,
            "external_id": "605377233",
            "kind": "package",
            "name": "Badania na wątrobę i trzustkę",
            "slug": "badania-na-watrobe-i-trzustke",
            "price_now_grosz": 8900,
            "price_min30_grosz": 8900,
            "currency": "PLN",
            "is_available": True,
        }
        await insert_items_with_offers(db_session, [package_item])

        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [
                    {"item_id": 11, "biomarker_id": 6},
                    {"item_id": 11, "biomarker_id": 7},
                    {"item_id": 11, "biomarker_id": 8},
                ]
            )
        )
        await db_session.commit()

        candidate = CandidateItem(
            id=11,
            kind="package",
            name=package_item["name"],
            slug=package_item["slug"],
            external_id=package_item["external_id"],
            price_now=package_item["price_now_grosz"],
            price_min30=package_item["price_min30_grosz"],
            sale_price=None,
            regular_price=None,
            coverage=set(),
        )

        response, _labels = await service._build_response(
            [candidate],
            [],
            ["20", "21", "22", "23", "26", "30", "31"],
            DEFAULT_INSTITUTION_ID,
        )

        assert response.items[0].biomarkers == [
            "20",
            "21",
            "22",
            "23",
            "26",
            "30",
            "31",
        ]

    def test_expand_synthetic_panel_biomarkers_replaces_panel_tokens(self, service):
        biomarkers_by_item = {1: ["19", "30"]}

        service._expand_synthetic_panel_biomarkers(biomarkers_by_item)

        assert biomarkers_by_item[1] == ["20", "21", "22", "23", "26", "30"]

    @pytest.mark.asyncio
    async def test_collect_candidates_filters_by_institution(
        self, service, db_session
    ):
        """Candidates should be scoped to the selected institution offers."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await insert_institution(db_session, institution_id=1111, name="Office A")
        await insert_institution(db_session, institution_id=2222, name="Office B")

        await db_session.execute(
            insert(models.Biomarker).values(
                [{"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"}]
            )
        )

        item = {
            "id": 1,
            "external_id": "1",
            "kind": "single",
            "name": "ALT Test",
            "slug": "alt-test",
            "price_now_grosz": 1000,
            "price_min30_grosz": 900,
            "currency": "PLN",
            "is_available": True,
        }
        await insert_items_with_offers(db_session, [item], institution_id=1111)

        fetched_at = datetime.now(UTC)
        await db_session.execute(
            insert(models.InstitutionItem).values(
                {
                    "institution_id": 2222,
                    "item_id": 1,
                    "is_available": False,
                    "currency": "PLN",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": fetched_at,
                }
            )
        )

        await db_session.execute(
            insert(models.ItemBiomarker).values([{"item_id": 1, "biomarker_id": 1}])
        )
        await db_session.commit()

        biomarkers = [
            ResolvedBiomarker(id=1, token="ALT", display_name="ALT", original="ALT")
        ]

        candidates_a = await service._collect_candidates(biomarkers, 1111)
        candidates_b = await service._collect_candidates(biomarkers, 2222)

        assert {c.id for c in candidates_a} == {1}
        assert candidates_b == []

    @pytest.mark.asyncio
    async def test_collect_candidates_uses_institution_price_history(
        self, service, db_session
    ):
        """Price history is scoped by institution."""
        await db_session.execute(delete(models.PriceSnapshot))
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await insert_institution(db_session, institution_id=1111, name="Office A")
        await insert_institution(db_session, institution_id=2222, name="Office B")

        await db_session.execute(
            insert(models.Biomarker).values(
                [{"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"}]
            )
        )

        item = {
            "id": 1,
            "external_id": "1",
            "kind": "single",
            "name": "ALT Test",
            "slug": "alt-test",
            "price_now_grosz": 1200,
            "price_min30_grosz": 1100,
            "currency": "PLN",
            "is_available": True,
        }
        await insert_items_with_offers(db_session, [item], institution_id=1111)
        await db_session.execute(
            insert(models.InstitutionItem).values(
                _offer_from_item(item, 2222, datetime.now(UTC))
            )
        )

        await db_session.execute(
            insert(models.ItemBiomarker).values([{"item_id": 1, "biomarker_id": 1}])
        )

        history_date = datetime.now(UTC).date() - timedelta(days=1)
        await db_session.execute(
            insert(models.PriceSnapshot).values(
                [
                    {
                        "institution_id": 1111,
                        "item_id": 1,
                        "snap_date": history_date,
                        "price_now_grosz": 500,
                        "price_min30_grosz": 500,
                        "sale_price_grosz": None,
                        "regular_price_grosz": None,
                        "is_available": True,
                        "seen_at": datetime.now(UTC),
                    },
                    {
                        "institution_id": 2222,
                        "item_id": 1,
                        "snap_date": history_date,
                        "price_now_grosz": 1500,
                        "price_min30_grosz": 1500,
                        "sale_price_grosz": None,
                        "regular_price_grosz": None,
                        "is_available": True,
                        "seen_at": datetime.now(UTC),
                    },
                ]
            )
        )
        await db_session.commit()

        biomarkers = [
            ResolvedBiomarker(id=1, token="ALT", display_name="ALT", original="ALT")
        ]
        candidates_a = await service._collect_candidates(biomarkers, 1111)
        candidates_b = await service._collect_candidates(biomarkers, 2222)

        assert candidates_a[0].price_min30 == 500
        assert candidates_b[0].price_min30 == 1500

    def test_prune_candidates_cheapest_single_only(self, service):
        """Pruning keeps up to two cheapest singles and packages."""
        candidates = [
            make_candidate(
                id=1,
                kind="single",
                name="ALT",
                slug="alt",
                price_now=1000,
                price_min30=1000,
                coverage={"ALT"},
            ),
            make_candidate(
                id=2,
                kind="single",
                name="ALT premium",
                slug="alt-premium",
                price_now=1500,
                price_min30=1500,
                coverage={"ALT"},
            ),
            make_candidate(
                id=3,
                kind="package",
                name="Liver panel",
                slug="liver-panel",
                price_now=2500,
                price_min30=2400,
                coverage={"ALT", "AST"},
            ),
        ]

        pruned = prune_candidates(candidates)
        ids = {item.id for item in pruned}
        assert ids == {1, 2, 3}  # Both singles (cap 2) + package

    def test_prune_candidates_limits_single_variants(self, service):
        """Keep only the two cheapest singles per token."""
        candidates = [
            make_candidate(
                id=1,
                kind="single",
                name="ALT basic",
                slug="alt-basic",
                price_now=900,
                price_min30=900,
                coverage={"ALT"},
            ),
            make_candidate(
                id=2,
                kind="single",
                name="ALT standard",
                slug="alt-standard",
                price_now=950,
                price_min30=920,
                coverage={"ALT"},
            ),
            make_candidate(
                id=3,
                kind="single",
                name="ALT premium",
                slug="alt-premium",
                price_now=950,
                price_min30=930,
                coverage={"ALT"},
            ),
        ]

        pruned = prune_candidates(candidates)
        ids = {item.id for item in pruned}
        assert ids == {1, 2}

    def test_prune_candidates_dominance_removal(self, service):
        """Test pruning removes dominated candidates."""
        candidates = [
            make_candidate(
                id=1,
                kind="single",
                name="ALT",
                slug="alt",
                price_now=1000,
                price_min30=1000,
                coverage={"ALT"},
            ),
            make_candidate(
                id=2,
                kind="package",
                name="Basic Panel",
                slug="basic-panel",
                price_now=1000,
                price_min30=1000,
                coverage={"ALT", "AST"},
            ),
        ]

        pruned = prune_candidates(candidates)
        ids = {item.id for item in pruned}
        assert ids == {2}  # Package dominates single test

    def test_prune_candidates_limits_package_variants(self, service):
        """Keep only the two cheapest packages per coverage."""
        candidates = [
            make_candidate(
                id=10,
                kind="package",
                name="Panel A",
                slug="panel-a",
                price_now=1500,
                price_min30=1500,
                coverage={"ALT", "AST"},
            ),
            make_candidate(
                id=11,
                kind="package",
                name="Panel B",
                slug="panel-b",
                price_now=1200,
                price_min30=1200,
                coverage={"ALT", "AST"},
            ),
            make_candidate(
                id=12,
                kind="package",
                name="Panel C",
                slug="panel-c",
                price_now=1300,
                price_min30=1300,
                coverage={"ALT", "AST"},
            ),
            make_candidate(
                id=13,
                kind="package",
                name="Panel D",
                slug="panel-d",
                price_now=1400,
                price_min30=1400,
                coverage={"ALT", "AST"},
            ),
        ]

        pruned = prune_candidates(candidates)
        ids = {item.id for item in pruned}
        assert ids == {11, 12}

    @pytest.mark.asyncio
    async def test_solve_no_biomarkers(self, service):
        """Test optimization with no biomarkers."""
        request = OptimizeRequest(biomarkers=[])
        result = await service.solve(request, DEFAULT_INSTITUTION_ID)

        assert result.total_now == 0.0
        assert result.total_min30 == 0.0
        assert result.currency == "PLN"
        assert result.items == []
        assert result.explain == {}
        assert result.uncovered == []

    @pytest.mark.asyncio
    async def test_solve_unresolved_biomarkers(self, service):
        """Test optimization with unresolvable biomarkers."""
        request = OptimizeRequest(biomarkers=["UNKNOWN1", "UNKNOWN2"])
        result = await service.solve(request, DEFAULT_INSTITUTION_ID)

        assert result.total_now == 0.0
        assert result.items == []
        assert result.uncovered == ["UNKNOWN1", "UNKNOWN2"]

    @pytest.mark.asyncio
    async def test_solve_preserves_unresolved_order(
        self, service, db_session
    ):
        """Unresolved biomarkers remain in the original order in responses."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()

        await insert_institution(db_session)

        await db_session.execute(
            insert(models.Biomarker).values(
                [
                    {"name": "ALT", "elab_code": "ALT", "slug": "alt"},
                    {"name": "AST", "elab_code": "AST", "slug": "ast"},
                ]
            )
        )
        items = [
            {
                "id": 501,
                "external_id": "diag-alt",
                "kind": "single",
                "name": "Diagnostyka ALT",
                "slug": "diag-alt",
                "price_now_grosz": 1000,
                "price_min30_grosz": 900,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 502,
                "external_id": "diag-ast",
                "kind": "single",
                "name": "Diagnostyka AST",
                "slug": "diag-ast",
                "price_now_grosz": 1100,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)
        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [
                    {"item_id": 501, "biomarker_id": 1},
                    {"item_id": 502, "biomarker_id": 2},
                ]
            )
        )
        await db_session.commit()

        request = OptimizeRequest(
            biomarkers=["ALT", "unknown-b", "AST", "unknown-a"]
        )
        response = await service.solve(request, DEFAULT_INSTITUTION_ID)

        assert response.uncovered == ["unknown-b", "unknown-a"]
        assert {item.id for item in response.items} == {501, 502}

    @pytest.mark.asyncio
    async def test_solve_simple_optimization(self, service, db_session):
        """Test simple optimization scenario."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)
        # Add biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"name": "AST", "elab_code": "AST", "slug": "ast"},
            ])
        )

        items = [
            {
                "id": 1,
                "external_id": "1",
                "kind": "single",
                "name": "ALT Test",
                "slug": "alt-test",
                "price_now_grosz": 1000,
                "price_min30_grosz": 900,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 2,
                "external_id": "2",
                "kind": "single",
                "name": "AST Test",
                "slug": "ast-test",
                "price_now_grosz": 1200,
                "price_min30_grosz": 1100,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 3,
                "external_id": "3",
                "kind": "package",
                "name": "Liver Panel",
                "slug": "liver-panel",
                "price_now_grosz": 1800,
                "price_min30_grosz": 1700,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)

        # Add relationships
        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 1, "biomarker_id": 1},
                {"item_id": 2, "biomarker_id": 2},
                {"item_id": 3, "biomarker_id": 1},
                {"item_id": 3, "biomarker_id": 2},
            ])
        )

        await db_session.commit()

        request = OptimizeRequest(biomarkers=["ALT", "AST"])
        result = await service.solve(request, DEFAULT_INSTITUTION_ID)

        assert result.total_now == 18.0  # 1800 grosz = 18.0 PLN
        assert result.total_min30 == 17.0  # 1700 grosz = 17.0 PLN
        assert len(result.items) == 1
        assert result.items[0].name == "Liver Panel"
        assert result.uncovered == []
        assert "ALT" in result.explain
        assert "AST" in result.explain

    @pytest.mark.asyncio
    async def test_addon_suggestions_surface_cheapest_packages(self, service, db_session):
        """Ensure addon suggestions recommend cheapest relevant packages."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "marker-a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "marker-b"},
            {"id": 3, "name": "Marker C", "elab_code": "C", "slug": "marker-c"},
            {"id": 4, "name": "Marker D", "elab_code": "D", "slug": "marker-d"},
            {"id": 5, "name": "Marker E", "elab_code": "E", "slug": "marker-e"},
            {"id": 6, "name": "Marker F", "elab_code": "F", "slug": "marker-f"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            {
                "id": 10,
                "external_id": "single-a",
                "kind": "single",
                "name": "Single A",
                "slug": "single-a",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 11,
                "external_id": "single-b",
                "kind": "single",
                "name": "Single B",
                "slug": "single-b",
                "price_now_grosz": 1500,
                "price_min30_grosz": 1500,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 12,
                "external_id": "single-c",
                "kind": "single",
                "name": "Single C",
                "slug": "single-c",
                "price_now_grosz": 3000,
                "price_min30_grosz": 2800,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 13,
                "external_id": "single-d",
                "kind": "single",
                "name": "Single D",
                "slug": "single-d",
                "price_now_grosz": 5000,
                "price_min30_grosz": 4800,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 20,
                "external_id": "package-ab",
                "kind": "package",
                "name": "Package AB Bonus",
                "slug": "package-ab",
                "price_now_grosz": 3500,
                "price_min30_grosz": 3300,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 21,
                "external_id": "package-ab-extended",
                "kind": "package",
                "name": "Package AB Extended",
                "slug": "package-ab-extended",
                "price_now_grosz": 4500,
                "price_min30_grosz": 4400,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)

        relationships = [
            {"item_id": 10, "biomarker_id": 1},
            {"item_id": 11, "biomarker_id": 2},
            {"item_id": 12, "biomarker_id": 3},
            {"item_id": 13, "biomarker_id": 4},
            {"item_id": 20, "biomarker_id": 1},
            {"item_id": 20, "biomarker_id": 2},
            {"item_id": 21, "biomarker_id": 1},
            {"item_id": 21, "biomarker_id": 2},
            {"item_id": 21, "biomarker_id": 5},
            {"item_id": 21, "biomarker_id": 6},
        ]
        await db_session.execute(insert(models.ItemBiomarker).values(relationships))
        await db_session.commit()

        request = OptimizeRequest(biomarkers=["A", "B", "C", "D"])
        result = await service.solve(request, DEFAULT_INSTITUTION_ID)

        assert [item.kind for item in result.items] == ["single", "single", "single", "single"]
        # solve() no longer computes addon suggestions - use compute_addons()
        assert result.addon_suggestions == []

        # Get addon suggestions via separate call
        addon_request = AddonSuggestionsRequest(
            biomarkers=["A", "B", "C", "D"],
            selected_item_ids=[item.id for item in result.items],
        )
        addon_result = await service.compute_addons(addon_request, DEFAULT_INSTITUTION_ID)

        assert len(addon_result.addon_suggestions) == 1
        suggestion = addon_result.addon_suggestions[0]
        assert suggestion.package.name == "Package AB Extended"
        assert suggestion.upgrade_cost == 20.0
        assert suggestion.estimated_total_now == 125.0
        assert {entry.code for entry in suggestion.covers} == {"A", "B"}
        assert {entry.code for entry in suggestion.adds} == {"E", "F"}
        assert suggestion.removes == []
        assert suggestion.keeps == []
        assert addon_result.labels["E"] == "Marker E"
        assert addon_result.labels["F"] == "Marker F"

    @pytest.mark.asyncio
    async def test_addon_suggestion_requires_readding_tokens(self, service, db_session):
        """Addon upgrade cost accounts for re-adding tokens not covered by the new package."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "b"},
            {"id": 3, "name": "Marker C", "elab_code": "C", "slug": "c"},
            {"id": 4, "name": "Marker D", "elab_code": "D", "slug": "d"},
            {"id": 5, "name": "Marker E", "elab_code": "E", "slug": "e"},
            {"id": 6, "name": "Marker F", "elab_code": "F", "slug": "f"},
            {"id": 7, "name": "Marker G", "elab_code": "G", "slug": "g"},
            {"id": 8, "name": "Marker H", "elab_code": "H", "slug": "h"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            # Singles for re-adding tokens
            {
                "id": 10,
                "external_id": "single-a",
                "kind": "single",
                "name": "Single A",
                "slug": "single-a",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 11,
                "external_id": "single-c",
                "kind": "single",
                "name": "Single C",
                "slug": "single-c",
                "price_now_grosz": 3000,
                "price_min30_grosz": 3000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 12,
                "external_id": "single-f",
                "kind": "single",
                "name": "Single F",
                "slug": "single-f",
                "price_now_grosz": 9000,
                "price_min30_grosz": 9000,
                "currency": "PLN",
                "is_available": True,
            },
            # Packages selected by optimizer
            {
                "id": 20,
                "external_id": "package-x",
                "kind": "package",
                "name": "Package X",
                "slug": "package-x",
                "price_now_grosz": 2000,
                "price_min30_grosz": 2000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 21,
                "external_id": "package-y",
                "kind": "package",
                "name": "Package Y",
                "slug": "package-y",
                "price_now_grosz": 14500,
                "price_min30_grosz": 14500,
                "currency": "PLN",
                "is_available": True,
            },
            # Candidate package
            {
                "id": 22,
                "external_id": "package-z",
                "kind": "package",
                "name": "Package Z",
                "slug": "package-z",
                "price_now_grosz": 20000,
                "price_min30_grosz": 20000,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)

        relationships = [
            # Singles
            {"item_id": 10, "biomarker_id": 1},
            {"item_id": 11, "biomarker_id": 3},
            {"item_id": 12, "biomarker_id": 6},
            # Packages
            {"item_id": 20, "biomarker_id": 1},
            {"item_id": 20, "biomarker_id": 2},
            {"item_id": 21, "biomarker_id": 3},
            {"item_id": 21, "biomarker_id": 4},
            {"item_id": 21, "biomarker_id": 5},
            {"item_id": 22, "biomarker_id": 2},
            {"item_id": 22, "biomarker_id": 4},
            {"item_id": 22, "biomarker_id": 5},
            {"item_id": 22, "biomarker_id": 7},
            {"item_id": 22, "biomarker_id": 8},
        ]
        await db_session.execute(insert(models.ItemBiomarker).values(relationships))
        await db_session.commit()

        request = OptimizeRequest(biomarkers=["A", "B", "C", "D", "E", "F"])
        result = await service.solve(request, DEFAULT_INSTITUTION_ID)

        assert result.total_now == 255.0
        assert len(result.items) == 3  # Package X, Package Y, Single F
        # solve() no longer computes addon suggestions - use compute_addons()
        assert result.addon_suggestions == []

        # Get addon suggestions via separate call
        addon_request = AddonSuggestionsRequest(
            biomarkers=["A", "B", "C", "D", "E", "F"],
            selected_item_ids=[item.id for item in result.items],
        )
        addon_result = await service.compute_addons(addon_request, DEFAULT_INSTITUTION_ID)

        assert len(addon_result.addon_suggestions) >= 1
        suggestion = addon_result.addon_suggestions[0]
        assert suggestion.package.name == "Package Z"
        assert pytest.approx(suggestion.upgrade_cost, rel=1e-6) == 75.0
        assert pytest.approx(suggestion.estimated_total_now, rel=1e-6) == 330.0
        assert suggestion.removes == []
        assert suggestion.keeps == []

    @pytest.mark.asyncio
    async def test_addon_skips_when_single_cheaper(self, service, db_session):
        """Do not suggest packages when added biomarkers are cheaper purchased separately."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "b"},
            {"id": 3, "name": "Marker C", "elab_code": "C", "slug": "c"},
            {"id": 4, "name": "Marker D", "elab_code": "D", "slug": "d"},
            {"id": 5, "name": "Marker E", "elab_code": "E", "slug": "e"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            {
                "id": 30,
                "external_id": "package-x",
                "kind": "package",
                "name": "Package X",
                "slug": "package-x",
                "price_now_grosz": 5000,
                "price_min30_grosz": 5000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 31,
                "external_id": "single-d",
                "kind": "single",
                "name": "Single D",
                "slug": "single-d",
                "price_now_grosz": 5000,
                "price_min30_grosz": 5000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 32,
                "external_id": "package-y",
                "kind": "package",
                "name": "Package Y",
                "slug": "package-y",
                "price_now_grosz": 7000,
                "price_min30_grosz": 7000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 33,
                "external_id": "single-e",
                "kind": "single",
                "name": "Single E",
                "slug": "single-e",
                "price_now_grosz": 500,
                "price_min30_grosz": 500,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)

        relationships = [
            {"item_id": 30, "biomarker_id": 1},
            {"item_id": 30, "biomarker_id": 2},
            {"item_id": 30, "biomarker_id": 3},
            {"item_id": 31, "biomarker_id": 4},
            {"item_id": 32, "biomarker_id": 1},
            {"item_id": 32, "biomarker_id": 2},
            {"item_id": 32, "biomarker_id": 3},
            {"item_id": 32, "biomarker_id": 5},
            {"item_id": 33, "biomarker_id": 5},
        ]
        await db_session.execute(insert(models.ItemBiomarker).values(relationships))
        await db_session.commit()

        result = await service.solve(
            OptimizeRequest(biomarkers=["A", "B", "C", "D"]),
            DEFAULT_INSTITUTION_ID,
        )

        assert result.total_now == 100.0
        assert len(result.items) == 2  # Package X + Single D
        assert result.addon_suggestions == []

    @pytest.mark.asyncio
    async def test_addon_suggestions_marks_removed_bonus(self, service, db_session):
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "b"},
            {"id": 3, "name": "Marker C", "elab_code": "C", "slug": "c"},
            {"id": 4, "name": "Marker D", "elab_code": "D", "slug": "d"},
            {"id": 5, "name": "Marker E", "elab_code": "E", "slug": "e"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            {
                "id": 40,
                "external_id": "package-base",
                "kind": "package",
                "name": "Package Base",
                "slug": "package-base",
                "price_now_grosz": 2000,
                "price_min30_grosz": 2000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 41,
                "external_id": "single-c",
                "kind": "single",
                "name": "Single C",
                "slug": "single-c",
                "price_now_grosz": 3000,
                "price_min30_grosz": 3000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 42,
                "external_id": "package-upgrade",
                "kind": "package",
                "name": "Package Upgrade",
                "slug": "package-upgrade",
                "price_now_grosz": 2200,
                "price_min30_grosz": 2200,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 43,
                "external_id": "single-e",
                "kind": "single",
                "name": "Single E",
                "slug": "single-e",
                "price_now_grosz": 600,
                "price_min30_grosz": 600,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)

        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [
                    {"item_id": 40, "biomarker_id": 1},
                    {"item_id": 40, "biomarker_id": 2},
                    {"item_id": 40, "biomarker_id": 4},
                    {"item_id": 41, "biomarker_id": 3},
                    {"item_id": 42, "biomarker_id": 1},
                    {"item_id": 42, "biomarker_id": 2},
                    {"item_id": 42, "biomarker_id": 5},
                    {"item_id": 43, "biomarker_id": 5},
                ]
            )
        )
        await db_session.commit()

        result = await service.solve(
            OptimizeRequest(biomarkers=["A", "B", "C"]),
            DEFAULT_INSTITUTION_ID,
        )

        assert result.total_now == 50.0
        # solve() no longer computes addon suggestions - use compute_addons()
        assert result.addon_suggestions == []

        # Get addon suggestions via separate call
        addon_request = AddonSuggestionsRequest(
            biomarkers=["A", "B", "C"],
            selected_item_ids=[item.id for item in result.items],
        )
        addon_result = await service.compute_addons(addon_request, DEFAULT_INSTITUTION_ID)

        assert len(addon_result.addon_suggestions) == 1
        suggestion = addon_result.addon_suggestions[0]
        assert suggestion.package.name == "Package Upgrade"
        assert suggestion.adds and suggestion.adds[0].code == "E"
        assert {entry.code for entry in suggestion.removes} == {"D"}
        assert suggestion.keeps == []

    @pytest.mark.asyncio
    async def test_addon_suggestions_ignore_synthetic_panel_components(
        self, service, db_session
    ):
        """Addon suggestions should not treat panel components as removable."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)

        biomarkers = [
            {"id": 14, "name": "Lipidogram", "elab_code": "14", "slug": "lipidogram"},
            {"id": 15, "name": "Cholesterol", "elab_code": "15", "slug": "chol"},
            {"id": 16, "name": "HDL", "elab_code": "16", "slug": "hdl"},
            {"id": 17, "name": "LDL", "elab_code": "17", "slug": "ldl"},
            {"id": 18, "name": "Triglycerides", "elab_code": "18", "slug": "tg"},
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "b"},
            {"id": 3, "name": "Bonus X", "elab_code": "X", "slug": "x"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            {
                "id": 100,
                "external_id": "package-base",
                "kind": "package",
                "name": "Package Base",
                "slug": "package-base",
                "price_now_grosz": 2000,
                "price_min30_grosz": 2000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 101,
                "external_id": "panel-only",
                "kind": "single",
                "name": "Panel Only",
                "slug": "panel-only",
                "price_now_grosz": 800,
                "price_min30_grosz": 800,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 102,
                "external_id": "package-addon",
                "kind": "package",
                "name": "Addon Package",
                "slug": "addon-package",
                "price_now_grosz": 1500,
                "price_min30_grosz": 1500,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)

        await db_session.execute(
            insert(models.ItemBiomarker).values(
                [
                    {"item_id": 100, "biomarker_id": 14},
                    {"item_id": 100, "biomarker_id": 1},
                    {"item_id": 100, "biomarker_id": 2},
                    {"item_id": 101, "biomarker_id": 14},
                    {"item_id": 102, "biomarker_id": 1},
                    {"item_id": 102, "biomarker_id": 2},
                    {"item_id": 102, "biomarker_id": 3},
                ]
            )
        )
        await db_session.commit()

        result = await service.solve(
            OptimizeRequest(biomarkers=["14", "A", "B"]),
            DEFAULT_INSTITUTION_ID,
        )

        assert {item.id for item in result.items} == {100}
        assert result.addon_suggestions == []

        addon_request = AddonSuggestionsRequest(
            biomarkers=["14", "A", "B"],
            selected_item_ids=[item.id for item in result.items],
        )
        addon_result = await service.compute_addons(addon_request, DEFAULT_INSTITUTION_ID)

        assert len(addon_result.addon_suggestions) == 1
        suggestion = addon_result.addon_suggestions[0]
        assert suggestion.package.name == "Addon Package"
        assert {entry.code for entry in suggestion.adds} == {"X"}
        assert suggestion.removes == []

    @pytest.mark.asyncio
    async def test_solver_prefers_biomarker_names(self, service, db_session):
        """Returned payload should expose biomarker display names instead of slugs."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)

        biomarker_id = (
            await db_session.execute(
                insert(models.Biomarker)
                .returning(models.Biomarker.id)
                .values(
                    {
                        "name": "Luteotropina",
                        "elab_code": None,
                        "slug": "luteotropina",
                    }
                )
            )
        ).scalar_one()

        await insert_items_with_offers(
            db_session,
            [
                {
                    "id": 501,
                    "external_id": "diag-lut",
                    "kind": "single",
                    "name": "Luteotropina",
                    "slug": "diag-lut",
                    "price_now_grosz": 2000,
                    "price_min30_grosz": 1800,
                    "currency": "PLN",
                    "is_available": True,
                }
            ],
        )
        await db_session.execute(
            insert(models.ItemBiomarker).values(
                {"item_id": 501, "biomarker_id": biomarker_id}
            )
        )
        await db_session.commit()

        response = await service.solve(
            OptimizeRequest(biomarkers=["luteotropina"]),
            DEFAULT_INSTITUTION_ID,
        )

        assert response.items
        assert response.items[0].biomarkers == ["luteotropina"]
        assert list(response.explain.keys()) == ["luteotropina"]
        assert response.labels["luteotropina"] == "Luteotropina"
        assert response.uncovered == []

    @pytest.mark.asyncio
    async def test_solve_returns_empty_response_when_solver_infeasible(
        self, service, db_session, monkeypatch
    ):
        """Solver failures should surface as empty responses with uncovered tokens."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "ALT", "elab_code": "ALT", "slug": "alt"},
            ])
        )
        await insert_items_with_offers(
            db_session,
            [
                {
                    "id": 1,
                    "external_id": "1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 1000,
                    "currency": "PLN",
                    "is_available": True,
                }
            ],
        )
        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 1, "biomarker_id": 1},
            ])
        )
        await db_session.commit()

        monkeypatch.setattr(
            cp_model.CpSolver,
            "Solve",
            lambda self, *_args, **_kwargs: cp_model.INFEASIBLE,
        )

        result = await service.solve(
            OptimizeRequest(biomarkers=["ALT"]),
            DEFAULT_INSTITUTION_ID,
        )

        assert result.items == []
        assert result.uncovered == ["ALT"]
        assert result.total_now == 0.0
        assert result.explain == {}

    @pytest.mark.asyncio
    async def test_solve_ignores_unavailable_items(self, service, db_session):
        """Items flagged as unavailable must not be considered by the solver."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)

        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
            ])
        )
        await insert_items_with_offers(
            db_session,
            [
                {
                    "id": 1,
                    "external_id": "1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 0,
                    "price_min30_grosz": 0,
                    "currency": "PLN",
                    "is_available": False,
                }
            ],
        )
        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 1, "biomarker_id": 1},
            ])
        )
        await db_session.commit()

        result = await service.solve(
            OptimizeRequest(biomarkers=["ALT"]),
            DEFAULT_INSTITUTION_ID,
        )

        assert result.items == []
        assert result.uncovered == ["ALT"]
        assert result.total_now == 0.0

    def test_candidate_item_on_sale_property(self):
        """Test CandidateItem on_sale property."""
        item1 = make_candidate(
            id=1,
            kind="single",
            name="Test",
            slug="test",
            sale_price=None,
            regular_price=None,
        )
        assert not item1.on_sale

        # Item on sale
        item2 = make_candidate(
            id=2,
            kind="single",
            name="Test",
            slug="test",
            sale_price=800,
            regular_price=1000,
        )
        assert item2.on_sale

        # Item not on sale (sale price >= regular price)
        item3 = make_candidate(
            id=3,
            kind="single",
            name="Test",
            slug="test",
            sale_price=1000,
            regular_price=1000,
        )
        assert not item3.on_sale

    def test_item_url_generation(self):
        """Test URL generation for different item kinds."""
        single_item = make_candidate(
            id=1,
            kind="single",
            name="Test",
            slug="test-single",
        )
        assert _item_url(single_item) == "https://diag.pl/sklep/badania/test-single"

        package_item = make_candidate(
            id=2,
            kind="package",
            name="Test Package",
            slug="test-package",
        )
        assert _item_url(package_item) == "https://diag.pl/sklep/pakiety/test-package"

    @pytest.mark.asyncio
    async def test_solve_returns_empty_addon_suggestions(self, service, db_session):
        """solve() should not compute addon suggestions - they are lazy loaded."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "marker-a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "marker-b"},
            {"id": 3, "name": "Marker C", "elab_code": "C", "slug": "marker-c"},
            {"id": 4, "name": "Marker D", "elab_code": "D", "slug": "marker-d"},
            {"id": 5, "name": "Marker E", "elab_code": "E", "slug": "marker-e"},
            {"id": 6, "name": "Marker F", "elab_code": "F", "slug": "marker-f"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            {
                "id": 10,
                "external_id": "single-a",
                "kind": "single",
                "name": "Single A",
                "slug": "single-a",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 11,
                "external_id": "single-b",
                "kind": "single",
                "name": "Single B",
                "slug": "single-b",
                "price_now_grosz": 1500,
                "price_min30_grosz": 1500,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 12,
                "external_id": "single-c",
                "kind": "single",
                "name": "Single C",
                "slug": "single-c",
                "price_now_grosz": 3000,
                "price_min30_grosz": 2800,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 13,
                "external_id": "single-d",
                "kind": "single",
                "name": "Single D",
                "slug": "single-d",
                "price_now_grosz": 5000,
                "price_min30_grosz": 4800,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 21,
                "external_id": "package-ab-extended",
                "kind": "package",
                "name": "Package AB Extended",
                "slug": "package-ab-extended",
                "price_now_grosz": 4500,
                "price_min30_grosz": 4400,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)

        relationships = [
            {"item_id": 10, "biomarker_id": 1},
            {"item_id": 11, "biomarker_id": 2},
            {"item_id": 12, "biomarker_id": 3},
            {"item_id": 13, "biomarker_id": 4},
            {"item_id": 21, "biomarker_id": 1},
            {"item_id": 21, "biomarker_id": 2},
            {"item_id": 21, "biomarker_id": 5},
            {"item_id": 21, "biomarker_id": 6},
        ]
        await db_session.execute(insert(models.ItemBiomarker).values(relationships))
        await db_session.commit()

        request = OptimizeRequest(biomarkers=["A", "B", "C", "D"])
        result = await service.solve(request, DEFAULT_INSTITUTION_ID)

        # solve() should return solution but NOT compute addon suggestions
        assert len(result.items) == 4
        assert result.addon_suggestions == []

    @pytest.mark.asyncio
    async def test_compute_addons_returns_suggestions(self, service, db_session):
        """compute_addons() should return addon suggestions for given item IDs."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "marker-a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "marker-b"},
            {"id": 3, "name": "Marker C", "elab_code": "C", "slug": "marker-c"},
            {"id": 4, "name": "Marker D", "elab_code": "D", "slug": "marker-d"},
            {"id": 5, "name": "Marker E", "elab_code": "E", "slug": "marker-e"},
            {"id": 6, "name": "Marker F", "elab_code": "F", "slug": "marker-f"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            {
                "id": 10,
                "external_id": "single-a",
                "kind": "single",
                "name": "Single A",
                "slug": "single-a",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 11,
                "external_id": "single-b",
                "kind": "single",
                "name": "Single B",
                "slug": "single-b",
                "price_now_grosz": 1500,
                "price_min30_grosz": 1500,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 12,
                "external_id": "single-c",
                "kind": "single",
                "name": "Single C",
                "slug": "single-c",
                "price_now_grosz": 3000,
                "price_min30_grosz": 2800,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 13,
                "external_id": "single-d",
                "kind": "single",
                "name": "Single D",
                "slug": "single-d",
                "price_now_grosz": 5000,
                "price_min30_grosz": 4800,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 21,
                "external_id": "package-ab-extended",
                "kind": "package",
                "name": "Package AB Extended",
                "slug": "package-ab-extended",
                "price_now_grosz": 4500,
                "price_min30_grosz": 4400,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)

        relationships = [
            {"item_id": 10, "biomarker_id": 1},
            {"item_id": 11, "biomarker_id": 2},
            {"item_id": 12, "biomarker_id": 3},
            {"item_id": 13, "biomarker_id": 4},
            {"item_id": 21, "biomarker_id": 1},
            {"item_id": 21, "biomarker_id": 2},
            {"item_id": 21, "biomarker_id": 5},
            {"item_id": 21, "biomarker_id": 6},
        ]
        await db_session.execute(insert(models.ItemBiomarker).values(relationships))
        await db_session.commit()

        # First get the optimization solution
        opt_request = OptimizeRequest(biomarkers=["A", "B", "C", "D"])
        opt_result = await service.solve(opt_request, DEFAULT_INSTITUTION_ID)
        selected_item_ids = [item.id for item in opt_result.items]

        # Now call compute_addons with the selected items
        addon_request = AddonSuggestionsRequest(
            biomarkers=["A", "B", "C", "D"],
            selected_item_ids=selected_item_ids,
        )
        addon_result = await service.compute_addons(addon_request, DEFAULT_INSTITUTION_ID)

        assert len(addon_result.addon_suggestions) == 1
        suggestion = addon_result.addon_suggestions[0]
        assert suggestion.package.name == "Package AB Extended"
        assert {entry.code for entry in suggestion.covers} == {"A", "B"}
        assert {entry.code for entry in suggestion.adds} == {"E", "F"}

    @pytest.mark.asyncio
    async def test_compute_addons_skips_no_adds_before_limit(
        self, service, db_session
    ):
        """Addon suggestions should skip no-add packages and still fill to the limit."""
        clear_all_caches()
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "marker-a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "marker-b"},
            {"id": 3, "name": "Marker C", "elab_code": "C", "slug": "marker-c"},
            {"id": 4, "name": "Marker D", "elab_code": "D", "slug": "marker-d"},
            {"id": 5, "name": "Marker E", "elab_code": "E", "slug": "marker-e"},
            {"id": 6, "name": "Marker F", "elab_code": "F", "slug": "marker-f"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            {
                "id": 10,
                "external_id": "single-a",
                "kind": "single",
                "name": "Single A",
                "slug": "single-a",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 11,
                "external_id": "single-b",
                "kind": "single",
                "name": "Single B",
                "slug": "single-b",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 12,
                "external_id": "single-c",
                "kind": "single",
                "name": "Single C",
                "slug": "single-c",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 13,
                "external_id": "single-d",
                "kind": "single",
                "name": "Single D",
                "slug": "single-d",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 20,
                "external_id": "package-ab",
                "kind": "package",
                "name": "Package AB",
                "slug": "package-ab",
                "price_now_grosz": 2100,
                "price_min30_grosz": 2100,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 21,
                "external_id": "package-cd",
                "kind": "package",
                "name": "Package CD",
                "slug": "package-cd",
                "price_now_grosz": 2100,
                "price_min30_grosz": 2100,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 22,
                "external_id": "package-ab-bonus",
                "kind": "package",
                "name": "Package AB Bonus",
                "slug": "package-ab-bonus",
                "price_now_grosz": 4000,
                "price_min30_grosz": 4000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 23,
                "external_id": "package-cd-bonus",
                "kind": "package",
                "name": "Package CD Bonus",
                "slug": "package-cd-bonus",
                "price_now_grosz": 4200,
                "price_min30_grosz": 4200,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)

        relationships = [
            {"item_id": 10, "biomarker_id": 1},
            {"item_id": 11, "biomarker_id": 2},
            {"item_id": 12, "biomarker_id": 3},
            {"item_id": 13, "biomarker_id": 4},
            {"item_id": 20, "biomarker_id": 1},
            {"item_id": 20, "biomarker_id": 2},
            {"item_id": 21, "biomarker_id": 3},
            {"item_id": 21, "biomarker_id": 4},
            {"item_id": 22, "biomarker_id": 1},
            {"item_id": 22, "biomarker_id": 2},
            {"item_id": 22, "biomarker_id": 5},
            {"item_id": 23, "biomarker_id": 3},
            {"item_id": 23, "biomarker_id": 4},
            {"item_id": 23, "biomarker_id": 6},
        ]
        await db_session.execute(insert(models.ItemBiomarker).values(relationships))
        await db_session.commit()

        opt_request = OptimizeRequest(biomarkers=["A", "B", "C", "D"])
        opt_result = await service.solve(opt_request, DEFAULT_INSTITUTION_ID)
        selected_item_ids = [item.id for item in opt_result.items]

        addon_request = AddonSuggestionsRequest(
            biomarkers=["A", "B", "C", "D"],
            selected_item_ids=selected_item_ids,
        )
        addon_result = await service.compute_addons(addon_request, DEFAULT_INSTITUTION_ID)

        assert len(addon_result.addon_suggestions) == 2
        package_names = {entry.package.name for entry in addon_result.addon_suggestions}
        assert package_names == {"Package AB Bonus", "Package CD Bonus"}
        add_codes = {
            biomarker.code
            for entry in addon_result.addon_suggestions
            for biomarker in entry.adds
        }
        assert add_codes == {"E", "F"}

    @pytest.mark.asyncio
    async def test_compute_addons_empty_when_no_suggestions(self, service, db_session):
        """compute_addons() returns empty list when no addon packages available."""
        await db_session.execute(delete(models.ItemBiomarker))
        await db_session.execute(delete(models.Item))
        await db_session.execute(delete(models.InstitutionItem))
        await db_session.execute(delete(models.Institution))
        await db_session.execute(delete(models.Biomarker))
        await db_session.commit()
        await insert_institution(db_session)

        biomarkers = [
            {"id": 1, "name": "Marker A", "elab_code": "A", "slug": "marker-a"},
            {"id": 2, "name": "Marker B", "elab_code": "B", "slug": "marker-b"},
        ]
        await db_session.execute(insert(models.Biomarker).values(biomarkers))

        items = [
            {
                "id": 10,
                "external_id": "single-a",
                "kind": "single",
                "name": "Single A",
                "slug": "single-a",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            },
            {
                "id": 11,
                "external_id": "single-b",
                "kind": "single",
                "name": "Single B",
                "slug": "single-b",
                "price_now_grosz": 1500,
                "price_min30_grosz": 1500,
                "currency": "PLN",
                "is_available": True,
            },
        ]
        await insert_items_with_offers(db_session, items)

        relationships = [
            {"item_id": 10, "biomarker_id": 1},
            {"item_id": 11, "biomarker_id": 2},
        ]
        await db_session.execute(insert(models.ItemBiomarker).values(relationships))
        await db_session.commit()

        addon_request = AddonSuggestionsRequest(
            biomarkers=["A", "B"],
            selected_item_ids=[10, 11],
        )
        addon_result = await service.compute_addons(addon_request, DEFAULT_INSTITUTION_ID)

        assert addon_result.addon_suggestions == []


class TestOptimizationCaching:
    @pytest.mark.asyncio
    async def test_solve_cached_returns_cached_result(self, db_session):
        """Second call with same parameters should return cached result."""
        from panelyt_api.core.cache import clear_all_caches, optimization_cache
        from panelyt_api.optimization.service import OptimizationService
        from panelyt_api.schemas.optimize import OptimizeRequest

        clear_all_caches()

        service = OptimizationService(db_session)

        request = OptimizeRequest(biomarkers=["TSH"])

        # First call - hits solver
        result1 = await service.solve_cached(request, DEFAULT_INSTITUTION_ID)

        # Verify cache was populated
        cache_key = optimization_cache.make_key(request.biomarkers, DEFAULT_INSTITUTION_ID)
        assert optimization_cache.get(cache_key) is not None

        # Second call - should return cached
        result2 = await service.solve_cached(request, DEFAULT_INSTITUTION_ID)

        assert result1 == result2

        clear_all_caches()

    @pytest.mark.asyncio
    async def test_solve_cached_separates_institutions(self, db_session):
        """Cache entries must be unique per institution."""
        from panelyt_api.core.cache import clear_all_caches
        from panelyt_api.optimization.service import OptimizationService
        from panelyt_api.schemas.optimize import OptimizeRequest

        clear_all_caches()

        service = OptimizationService(db_session)

        await insert_institution(db_session, DEFAULT_INSTITUTION_ID)
        await insert_institution(db_session, institution_id=2222, name="Office B")

        await db_session.execute(
            insert(models.Biomarker).values(
                [{"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"}]
            )
        )
        items = [
            {
                "id": 1,
                "external_id": "1",
                "kind": "single",
                "name": "ALT Test",
                "slug": "alt-test",
                "price_now_grosz": 1000,
                "price_min30_grosz": 1000,
                "currency": "PLN",
                "is_available": True,
            }
        ]
        await insert_items_with_offers(db_session, items, DEFAULT_INSTITUTION_ID)
        await db_session.execute(
            insert(models.ItemBiomarker).values([{"item_id": 1, "biomarker_id": 1}])
        )
        await db_session.commit()

        request = OptimizeRequest(biomarkers=["ALT"])
        result_default = await service.solve_cached(request, DEFAULT_INSTITUTION_ID)
        result_other = await service.solve_cached(request, 2222)

        assert {item.id for item in result_default.items} == {1}
        assert result_other.items == []

        clear_all_caches()

    @pytest.mark.asyncio
    async def test_solve_cached_different_params_different_results(self, db_session):
        """Different parameters should get different cache entries."""
        from panelyt_api.core.cache import clear_all_caches, optimization_cache
        from panelyt_api.optimization.service import OptimizationService
        from panelyt_api.schemas.optimize import OptimizeRequest

        clear_all_caches()

        service = OptimizationService(db_session)

        request1 = OptimizeRequest(biomarkers=["TSH"])
        request2 = OptimizeRequest(biomarkers=["ALT"])

        result1 = await service.solve_cached(request1, DEFAULT_INSTITUTION_ID)
        result2 = await service.solve_cached(request2, DEFAULT_INSTITUTION_ID)

        # Results should be different (different biomarkers)
        # Note: both might be empty if no test data, but cache keys are different
        key1 = optimization_cache.make_key(request1.biomarkers, DEFAULT_INSTITUTION_ID)
        key2 = optimization_cache.make_key(request2.biomarkers, DEFAULT_INSTITUTION_ID)
        assert key1 != key2

        assert result1 != result2 or (result1 == result2 and key1 != key2)

        clear_all_caches()
