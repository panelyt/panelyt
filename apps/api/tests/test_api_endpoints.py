from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient
from sqlalchemy import insert, select, update

from panelyt_api.core.cache import freshness_cache
from panelyt_api.db import models
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID


async def insert_institution(session, institution_id: int = DEFAULT_INSTITUTION_ID) -> None:
    await session.execute(
        insert(models.Institution).values(
            {"id": institution_id, "name": f"Institution {institution_id}"}
        )
    )


async def insert_items_with_offers(
    session,
    items: list[dict],
    institution_id: int = DEFAULT_INSTITUTION_ID,
) -> None:
    await session.execute(insert(models.Item).values(items))
    now = datetime.now(timezone.utc)
    offers = [
        {
            "institution_id": institution_id,
            "item_id": item["id"],
            "is_available": item.get("is_available", True),
            "currency": item.get("currency", "PLN"),
            "price_now_grosz": item["price_now_grosz"],
            "price_min30_grosz": item.get("price_min30_grosz", item["price_now_grosz"]),
            "sale_price_grosz": item.get("sale_price_grosz"),
            "regular_price_grosz": item.get("regular_price_grosz"),
            "fetched_at": item.get("fetched_at", now),
        }
        for item in items
    ]
    await session.execute(insert(models.InstitutionItem).values(offers))


@pytest.fixture(autouse=True)
def clear_user_activity_debouncer():
    from panelyt_api.core.cache import user_activity_debouncer

    user_activity_debouncer.clear()
    yield
    user_activity_debouncer.clear()


@pytest.fixture
def activity_spy(monkeypatch) -> AsyncMock:
    spy = AsyncMock(return_value=None)
    monkeypatch.setattr(
        "panelyt_api.ingest.repository.CatalogRepository.record_user_activity",
        spy,
    )
    return spy


class TestHealthEndpoints:
    def test_healthz_endpoint(self, client: TestClient):
        """Test liveness probe endpoint."""
        response = client.get("/healthz")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_health_endpoint(self, client: TestClient):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    async def test_health_endpoints_async(self, async_client: AsyncClient):
        """Test health endpoints with async client."""
        response = await async_client.get("/healthz")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

        response = await async_client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestCatalogEndpoints:
    @pytest.fixture(autouse=True)
    def _skip_ingestion_checks(self):
        freshness_cache.mark_checked(DEFAULT_INSTITUTION_ID)
        yield
        freshness_cache.clear(DEFAULT_INSTITUTION_ID)

    async def _attach_item(
        self,
        session,
        biomarker_id: int,
        *,
        item_id: int,
        price: int = 1000,
        institution_id: int = DEFAULT_INSTITUTION_ID,
    ) -> None:
        now = datetime.now(timezone.utc)
        existing = await session.scalar(
            select(models.Institution.id).where(models.Institution.id == institution_id)
        )
        if existing is None:
            await session.execute(
                insert(models.Institution).values(
                    {"id": institution_id, "name": f"Institution {institution_id}"}
                )
            )
        await session.execute(
            insert(models.Item).values(
                {
                    "id": item_id,
                    "external_id": f"item-{item_id}",
                    "kind": "single",
                    "name": f"Item {item_id}",
                    "slug": f"item-{item_id}",
                    "price_now_grosz": price,
                    "price_min30_grosz": price,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": now,
                }
            )
        )
        await session.execute(
            insert(models.ItemBiomarker).values(
                {
                    "item_id": item_id,
                    "biomarker_id": biomarker_id,
                }
            )
        )
        await session.execute(
            insert(models.InstitutionItem).values(
                {
                    "institution_id": institution_id,
                    "item_id": item_id,
                    "is_available": True,
                    "currency": "PLN",
                    "price_now_grosz": price,
                    "price_min30_grosz": price,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": now,
                }
            )
        )

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    async def test_get_catalog_meta(
        self,
        mock_ensure_fresh,
        async_client: AsyncClient,
        db_session,
        activity_spy: AsyncMock,
    ):
        """Test catalog meta endpoint."""
        mock_ensure_fresh.return_value = None

        # Add some test data
        await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"name": "AST", "elab_code": "AST", "slug": "ast"},
            ])
        )

        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 1,
                    "external_id": "item-1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": datetime.now(timezone.utc),
                },
            ])
        )
        await db_session.commit()

        response = await async_client.get("/catalog/meta")
        assert response.status_code == 200

        data = response.json()
        assert "item_count" in data
        assert "biomarker_count" in data
        assert "latest_fetched_at" in data
        assert "snapshot_days_covered" in data
        assert "percent_with_today_snapshot" in data

        assert data["item_count"] == 1
        assert data["biomarker_count"] == 2

        # Verify mocks were called
        activity_spy.assert_awaited_once()
        mock_ensure_fresh.assert_called_once()

    async def test_search_biomarkers_success(
        self,
        async_client: AsyncClient,
        db_session,
        activity_spy: AsyncMock,
    ):
        """Test biomarker search endpoint with valid query."""

        # Add test biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
                {"id": 2, "name": "Aspartate aminotransferase", "elab_code": "AST", "slug": "ast"},
                {"id": 3, "name": "Total cholesterol", "elab_code": "CHOL", "slug": "cholesterol"},
            ])
        )
        await db_session.commit()
        await self._attach_item(db_session, biomarker_id=1, item_id=2001, price=1000)
        await db_session.commit()

        response = await async_client.get(
            f"/catalog/biomarkers?query=ALT&institution={DEFAULT_INSTITUTION_ID}"
        )
        assert response.status_code == 200

        data = response.json()
        assert "results" in data
        assert len(data["results"]) == 1
        assert data["results"][0]["elab_code"] == "ALT"
        assert data["results"][0]["name"] == "Alanine aminotransferase"

        activity_spy.assert_awaited_once()

    async def test_batch_biomarkers_success(
        self,
        async_client: AsyncClient,
        db_session,
    ):
        await db_session.execute(
            insert(models.Biomarker).values(
                [
                    {
                        "id": 10,
                        "name": "Alanine aminotransferase",
                        "elab_code": "ALT",
                        "slug": "alt",
                    },
                    {
                        "id": 11,
                        "name": "Aspartate aminotransferase",
                        "elab_code": "AST",
                        "slug": "ast",
                    },
                ]
            )
        )
        await db_session.commit()
        await self._attach_item(db_session, biomarker_id=10, item_id=3001, price=1000)
        await self._attach_item(db_session, biomarker_id=11, item_id=3002, price=1200)
        await db_session.commit()

        response = await async_client.post(
            f"/catalog/biomarkers/batch?institution={DEFAULT_INSTITUTION_ID}",
            json={"codes": ["ALT", "AST", "MISSING"]},
        )

        assert response.status_code == 200

        data = response.json()
        assert data["results"]["ALT"]["elab_code"] == "ALT"
        assert data["results"]["ALT"]["price_now_grosz"] == 1000
        assert data["results"]["AST"]["elab_code"] == "AST"
        assert data["results"]["AST"]["price_now_grosz"] == 1200
        assert data["results"]["MISSING"] is None

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    async def test_search_biomarkers_triggers_ingestion(
        self,
        mock_ensure_fresh,
        async_client: AsyncClient,
    ):
        """Biomarker search should trigger on-demand ingestion."""
        mock_ensure_fresh.return_value = None

        response = await async_client.get(
            "/catalog/biomarkers?query=ALT&institution=2222"
        )

        assert response.status_code == 200
        mock_ensure_fresh.assert_awaited_once_with(2222)

    async def test_search_biomarkers_respects_institution(
        self,
        async_client: AsyncClient,
        db_session,
    ):
        """Institution query param should control biomarker pricing."""
        freshness_cache.mark_checked(1111)
        freshness_cache.mark_checked(2222)
        try:
            await db_session.execute(
                insert(models.Biomarker).values(
                    [
                        {
                            "id": 1,
                            "name": "Alanine aminotransferase",
                            "elab_code": "ALT",
                            "slug": "alt",
                        }
                    ]
                )
            )
            await db_session.commit()

            await self._attach_item(
                db_session,
                biomarker_id=1,
                item_id=2051,
                price=1000,
                institution_id=1111,
            )
            await db_session.execute(
                insert(models.Institution).values({"id": 2222, "name": "Institution 2222"})
            )
            await db_session.execute(
                insert(models.InstitutionItem).values(
                    {
                        "institution_id": 2222,
                        "item_id": 2051,
                        "is_available": True,
                        "currency": "PLN",
                        "price_now_grosz": 2000,
                        "price_min30_grosz": 2000,
                        "sale_price_grosz": None,
                        "regular_price_grosz": None,
                        "fetched_at": datetime.now(timezone.utc),
                    }
                )
            )
            await db_session.commit()

            response_a = await async_client.get(
                "/catalog/biomarkers?query=ALT&institution=1111"
            )
            response_b = await async_client.get(
                "/catalog/biomarkers?query=ALT&institution=2222"
            )

            assert response_a.status_code == 200
            assert response_b.status_code == 200

            data_a = response_a.json()
            data_b = response_b.json()

            assert data_a["results"][0]["price_now_grosz"] == 1000
            assert data_b["results"][0]["price_now_grosz"] == 2000
        finally:
            freshness_cache.clear(1111)
            freshness_cache.clear(2222)

    async def test_search_biomarkers_fuzzy_search(self, async_client: AsyncClient, db_session):
        """Test biomarker fuzzy search functionality."""
        # Add test biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Total cholesterol", "elab_code": "CHOL", "slug": "cholesterol"},
                {"id": 2, "name": "LDL cholesterol", "elab_code": "LDL", "slug": "ldl-cholesterol"},
                {"id": 3, "name": "HDL cholesterol", "elab_code": "HDL", "slug": "hdl-cholesterol"},
            ])
        )
        await db_session.commit()
        await self._attach_item(db_session, biomarker_id=1, item_id=2101, price=1000)
        await self._attach_item(db_session, biomarker_id=2, item_id=2102, price=1050)
        await self._attach_item(db_session, biomarker_id=3, item_id=2103, price=980)
        await db_session.commit()

        response = await async_client.get(
            f"/catalog/biomarkers?query=cholesterol&institution={DEFAULT_INSTITUTION_ID}"
        )
        assert response.status_code == 200

        data = response.json()
        assert len(data["results"]) == 3

    async def test_search_biomarkers_empty_query(self, async_client: AsyncClient):
        """Test biomarker search with empty query."""
        response = await async_client.get(
            f"/catalog/biomarkers?query=&institution={DEFAULT_INSTITUTION_ID}"
        )
        assert response.status_code == 422  # Validation error for min_length=1

    async def test_search_biomarkers_no_results(self, async_client: AsyncClient, db_session):
        """Test biomarker search with no matching results."""
        response = await async_client.get(
            f"/catalog/biomarkers?query=NONEXISTENT&institution={DEFAULT_INSTITUTION_ID}"
        )
        assert response.status_code == 200

        data = response.json()
        assert data["results"] == []

    async def test_catalog_search_includes_templates(
        self, async_client: AsyncClient, db_session
    ):

        await db_session.execute(
            insert(models.Biomarker).values(
                {
                    "id": 1,
                    "name": "Total cholesterol",
                    "elab_code": "CHOL",
                    "slug": "cholesterol",
                }
            )
        )
        await db_session.commit()
        await self._attach_item(db_session, biomarker_id=1, item_id=2201, price=1000)
        
        active_template = models.BiomarkerListTemplate(
            slug="cholesterol-panel",
            name_en="Cholesterol panel",
            name_pl="Panel cholesterolu",
            description_en=None,
            description_pl=None,
            is_active=True,
        )
        inactive_template = models.BiomarkerListTemplate(
            slug="archived-template",
            name_en="Archived template",
            name_pl="Zarchiwizowany szablon",
            description_en=None,
            description_pl=None,
            is_active=False,
        )
        db_session.add_all([active_template, inactive_template])
        await db_session.flush()

        db_session.add_all(
            [
                models.BiomarkerListTemplateEntry(
                    template_id=active_template.id,
                    code="CHOL",
                    display_name="Total cholesterol",
                    sort_order=0,
                ),
                models.BiomarkerListTemplateEntry(
                    template_id=active_template.id,
                    code="HDL",
                    display_name="HDL cholesterol",
                    sort_order=1,
                ),
                models.BiomarkerListTemplateEntry(
                    template_id=inactive_template.id,
                    code="LDL",
                    display_name="LDL cholesterol",
                    sort_order=0,
                ),
            ]
        )
        await db_session.commit()

        response = await async_client.get(
            f"/catalog/search?query=chol&institution={DEFAULT_INSTITUTION_ID}"
        )
        assert response.status_code == 200

        payload = response.json()
        assert "results" in payload

        templates = [item for item in payload["results"] if item["type"] == "template"]
        biomarkers = [item for item in payload["results"] if item["type"] == "biomarker"]

        assert any(item["slug"] == "cholesterol" for item in biomarkers)
        assert len(templates) == 1
        template_entry = templates[0]
        assert template_entry["slug"] == "cholesterol-panel"
        assert template_entry["biomarker_count"] == 2

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    async def test_catalog_search_triggers_ingestion(
        self,
        mock_ensure_fresh,
        async_client: AsyncClient,
    ):
        """Catalog search should trigger on-demand ingestion."""
        mock_ensure_fresh.return_value = None

        response = await async_client.get(
            "/catalog/search?query=chol&institution=3333"
        )

        assert response.status_code == 200
        mock_ensure_fresh.assert_awaited_once_with(3333)


class TestOptimizeEndpoint:
    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    async def test_optimize_empty_biomarkers(
        self,
        mock_ensure_fresh,
        async_client: AsyncClient,
        activity_spy: AsyncMock,
    ):
        """Test optimization with empty biomarkers list."""
        mock_ensure_fresh.return_value = None

        payload = {"biomarkers": []}
        response = await async_client.post("/optimize", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert data["total_now"] == 0.0
        assert data["total_min30"] == 0.0
        assert data["currency"] == "PLN"
        assert data["items"] == []
        assert data["explain"] == {}
        assert data["uncovered"] == []
        activity_spy.assert_awaited_once()
        mock_ensure_fresh.assert_awaited_once_with(DEFAULT_INSTITUTION_ID, blocking=True)

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    async def test_optimize_unknown_biomarkers(
        self,
        mock_ensure_fresh,
        async_client: AsyncClient,
        activity_spy: AsyncMock,
    ):
        """Test optimization with unknown biomarkers."""
        mock_ensure_fresh.return_value = None

        payload = {"biomarkers": ["UNKNOWN1", "UNKNOWN2"]}
        response = await async_client.post("/optimize", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert data["total_now"] == 0.0
        assert data["items"] == []
        assert data["uncovered"] == ["UNKNOWN1", "UNKNOWN2"]
        activity_spy.assert_awaited_once()
        mock_ensure_fresh.assert_awaited_once_with(DEFAULT_INSTITUTION_ID, blocking=True)

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    async def test_optimize_successful_optimization(
        self,
        mock_ensure_fresh,
        async_client: AsyncClient,
        db_session,
        activity_spy: AsyncMock,
    ):
        """Test successful optimization scenario."""
        mock_ensure_fresh.return_value = None

        # Add biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"id": 2, "name": "AST", "elab_code": "AST", "slug": "ast"},
            ])
        )

        await insert_institution(db_session)

        items = [
            {
                "id": 1,
                "external_id": "item-1",
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
                "external_id": "item-2",
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

        # Add item-biomarker relationships
        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 1, "biomarker_id": 1},  # ALT test covers ALT
                {"item_id": 2, "biomarker_id": 1},  # Liver panel covers ALT
                {"item_id": 2, "biomarker_id": 2},  # Liver panel covers AST
            ])
        )

        await db_session.commit()

        payload = {"biomarkers": ["ALT", "AST"]}
        response = await async_client.post("/optimize", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert data["total_now"] == 18.0  # 1800 grosz = 18.0 PLN
        assert data["total_min30"] == 17.0  # 1700 grosz = 17.0 PLN
        assert data["currency"] == "PLN"
        assert len(data["items"]) == 1
        assert data["items"][0]["name"] == "Liver Panel"
        assert data["items"][0]["kind"] == "package"
        assert "url" in data["items"][0]
        assert data["uncovered"] == []
        assert set(data.keys()) == {
            "total_now",
            "total_min30",
            "currency",
            "items",
            "bonus_total_now",
            "explain",
            "uncovered",
            "labels",
            "addon_suggestions",
        }

        # Check explanation
        assert "ALT" in data["explain"]
        assert "AST" in data["explain"]
        assert "Liver Panel" in data["explain"]["ALT"]
        assert "Liver Panel" in data["explain"]["AST"]
        activity_spy.assert_awaited_once()
        mock_ensure_fresh.assert_awaited_once_with(DEFAULT_INSTITUTION_ID, blocking=True)

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    async def test_optimize_compare_returns_bundle(
        self,
        mock_ensure_fresh,
        async_client: AsyncClient,
        activity_spy: AsyncMock,
    ):
        """Test compare endpoint is removed."""
        mock_ensure_fresh.return_value = None

        payload = {"biomarkers": ["ALT", "AST"]}
        response = await async_client.post("/optimize/compare", json=payload)
        assert response.status_code == 404
        activity_spy.assert_not_called()

    async def test_optimize_invalid_payload(self, async_client: AsyncClient):
        """Test optimization with invalid payload."""
        # Missing biomarkers field
        response = await async_client.post("/optimize", json={})
        assert response.status_code == 422

        # Invalid biomarkers type
        response = await async_client.post("/optimize", json={"biomarkers": "not a list"})
        assert response.status_code == 422

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    async def test_optimize_partial_coverage(
        self,
        mock_ensure_fresh,
        async_client: AsyncClient,
        db_session,
        activity_spy: AsyncMock,
    ):
        """Test optimization with partial biomarker coverage."""
        mock_ensure_fresh.return_value = None

        # Add biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
            ])
        )

        # Add item that covers ALT only
        await insert_institution(db_session)
        await insert_items_with_offers(
            db_session,
            [
                {
                    "id": 1,
                    "external_id": "item-1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                    "currency": "PLN",
                    "is_available": True,
                },
            ],
        )

        # Add item-biomarker relationship
        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 1, "biomarker_id": 1},
            ])
        )

        await db_session.commit()

        payload = {"biomarkers": ["ALT", "UNKNOWN_BIOMARKER"]}
        response = await async_client.post("/optimize", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert data["total_now"] == 10.0  # 1000 grosz = 10.0 PLN
        assert len(data["items"]) == 1
        assert data["items"][0]["name"] == "ALT Test"
        assert data["uncovered"] == ["UNKNOWN_BIOMARKER"]
        assert "ALT" in data["explain"]
        activity_spy.assert_awaited_once()
        mock_ensure_fresh.assert_awaited_once_with(DEFAULT_INSTITUTION_ID, blocking=True)

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    async def test_optimize_uses_institution_param(
        self,
        mock_ensure_fresh,
        async_client: AsyncClient,
        db_session,
        activity_spy: AsyncMock,
    ):
        """Institution query param should scope optimization results."""
        mock_ensure_fresh.return_value = None

        await db_session.execute(
            insert(models.Biomarker).values(
                [{"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"}]
            )
        )
        await insert_institution(db_session, DEFAULT_INSTITUTION_ID)
        await insert_institution(db_session, institution_id=2222)

        items = [
            {
                "id": 1,
                "external_id": "item-1",
                "kind": "single",
                "name": "ALT Test",
                "slug": "alt-test",
                "price_now_grosz": 1000,
                "price_min30_grosz": 900,
                "currency": "PLN",
                "is_available": True,
            }
        ]
        await insert_items_with_offers(db_session, items, institution_id=2222)
        await db_session.execute(
            insert(models.ItemBiomarker).values([{"item_id": 1, "biomarker_id": 1}])
        )
        await db_session.commit()

        payload = {"biomarkers": ["ALT"]}
        response = await async_client.post("/optimize?institution=2222", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["name"] == "ALT Test"
        assert data["uncovered"] == []
        activity_spy.assert_awaited_once()
        mock_ensure_fresh.assert_awaited_once_with(2222, blocking=True)

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    async def test_optimize_uses_preferred_institution_when_param_missing(
        self,
        mock_ensure_fresh,
        async_client: AsyncClient,
        db_session,
        activity_spy: AsyncMock,
    ):
        mock_ensure_fresh.return_value = None

        await db_session.execute(
            insert(models.Biomarker).values(
                [{"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"}]
            )
        )
        preferred_institution_id = 2222
        await insert_institution(db_session, DEFAULT_INSTITUTION_ID)
        await insert_institution(db_session, institution_id=preferred_institution_id)

        items = [
            {
                "id": 1,
                "external_id": "item-1",
                "kind": "single",
                "name": "ALT Test",
                "slug": "alt-test",
                "price_now_grosz": 1000,
                "price_min30_grosz": 900,
                "currency": "PLN",
                "is_available": True,
            }
        ]
        await insert_items_with_offers(
            db_session, items, institution_id=preferred_institution_id
        )
        await db_session.execute(
            insert(models.ItemBiomarker).values([{"item_id": 1, "biomarker_id": 1}])
        )
        await db_session.commit()

        response = await async_client.post("/users/session")
        assert response.status_code == 200
        user_id = response.json()["user_id"]

        await db_session.execute(
            update(models.UserAccount)
            .where(models.UserAccount.id == user_id)
            .values(preferred_institution_id=preferred_institution_id)
        )
        await db_session.commit()

        payload = {"biomarkers": ["ALT"]}
        response = await async_client.post("/optimize", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["name"] == "ALT Test"
        assert data["uncovered"] == []
        activity_spy.assert_awaited_once()
        mock_ensure_fresh.assert_awaited_once_with(preferred_institution_id, blocking=True)
