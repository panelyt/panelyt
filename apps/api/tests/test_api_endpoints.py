from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient
from sqlalchemy import insert

from panelyt_api.db import models


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
    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    @patch("panelyt_api.services.activity.touch_user_activity")
    async def test_get_catalog_meta(
        self, mock_activity, mock_ensure_fresh, async_client: AsyncClient, db_session
    ):
        """Test catalog meta endpoint."""
        mock_activity.return_value = None
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
                    "lab_id": 1,
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
        mock_activity.assert_called_once()
        mock_ensure_fresh.assert_called_once()

    @patch("panelyt_api.services.activity.touch_user_activity")
    async def test_search_biomarkers_success(
        self, mock_activity, async_client: AsyncClient, db_session
    ):
        """Test biomarker search endpoint with valid query."""
        mock_activity.return_value = None

        # Add test biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "Alanine aminotransferase", "elab_code": "ALT", "slug": "alt"},
                {"id": 2, "name": "Aspartate aminotransferase", "elab_code": "AST", "slug": "ast"},
                {"id": 3, "name": "Total cholesterol", "elab_code": "CHOL", "slug": "cholesterol"},
            ])
        )
        await db_session.commit()

        response = await async_client.get("/catalog/biomarkers?query=ALT")
        assert response.status_code == 200

        data = response.json()
        assert "results" in data
        assert len(data["results"]) == 1
        assert data["results"][0]["elab_code"] == "ALT"
        assert data["results"][0]["name"] == "Alanine aminotransferase"

        mock_activity.assert_called_once()

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

        response = await async_client.get("/catalog/biomarkers?query=cholesterol")
        assert response.status_code == 200

        data = response.json()
        assert len(data["results"]) == 3

    async def test_search_biomarkers_empty_query(self, async_client: AsyncClient):
        """Test biomarker search with empty query."""
        response = await async_client.get("/catalog/biomarkers?query=")
        assert response.status_code == 422  # Validation error for min_length=1

    async def test_search_biomarkers_no_results(self, async_client: AsyncClient, db_session):
        """Test biomarker search with no matching results."""
        response = await async_client.get("/catalog/biomarkers?query=NONEXISTENT")
        assert response.status_code == 200

        data = response.json()
        assert data["results"] == []

    @patch("panelyt_api.services.activity.touch_user_activity")
    async def test_catalog_search_includes_templates(
        self, mock_activity, async_client: AsyncClient, db_session
    ):
        mock_activity.return_value = None

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

        active_template = models.BiomarkerListTemplate(
            slug="cholesterol-panel",
            name="Cholesterol panel",
            description=None,
            is_active=True,
        )
        inactive_template = models.BiomarkerListTemplate(
            slug="archived-template",
            name="Archived template",
            description=None,
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

        response = await async_client.get("/catalog/search?query=chol")
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


class TestOptimizeEndpoint:
    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    @patch("panelyt_api.services.activity.touch_user_activity")
    async def test_optimize_empty_biomarkers(
        self, mock_activity, mock_ensure_fresh, async_client: AsyncClient
    ):
        """Test optimization with empty biomarkers list."""
        mock_activity.return_value = None
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

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    @patch("panelyt_api.services.activity.touch_user_activity")
    async def test_optimize_unknown_biomarkers(
        self, mock_activity, mock_ensure_fresh, async_client: AsyncClient
    ):
        """Test optimization with unknown biomarkers."""
        mock_activity.return_value = None
        mock_ensure_fresh.return_value = None

        payload = {"biomarkers": ["UNKNOWN1", "UNKNOWN2"]}
        response = await async_client.post("/optimize", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert data["total_now"] == 0.0
        assert data["items"] == []
        assert data["uncovered"] == ["UNKNOWN1", "UNKNOWN2"]

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    @patch("panelyt_api.services.activity.touch_user_activity")
    async def test_optimize_successful_optimization(
        self, mock_activity, mock_ensure_fresh, async_client: AsyncClient, db_session
    ):
        """Test successful optimization scenario."""
        mock_activity.return_value = None
        mock_ensure_fresh.return_value = None

        # Add biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"id": 2, "name": "AST", "elab_code": "AST", "slug": "ast"},
            ])
        )

        # Add items
        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 1,
                    "lab_id": 1,
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
                    "lab_id": 1,
                    "external_id": "item-2",
                    "kind": "package",
                    "name": "Liver Panel",
                    "slug": "liver-panel",
                    "price_now_grosz": 1800,
                    "price_min30_grosz": 1700,
                    "currency": "PLN",
                    "is_available": True,
                },
            ])
        )

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
        assert data["lab_code"] == "diag"
        assert data["lab_name"]
        assert isinstance(data["exclusive"], dict)

        # Check explanation
        assert "ALT" in data["explain"]
        assert "AST" in data["explain"]
        assert "Liver Panel" in data["explain"]["ALT"]
        assert "Liver Panel" in data["explain"]["AST"]

    async def test_optimize_invalid_payload(self, async_client: AsyncClient):
        """Test optimization with invalid payload."""
        # Missing biomarkers field
        response = await async_client.post("/optimize", json={})
        assert response.status_code == 422

        # Invalid biomarkers type
        response = await async_client.post("/optimize", json={"biomarkers": "not a list"})
        assert response.status_code == 422

    @patch("panelyt_api.ingest.service.IngestionService.ensure_fresh_data")
    @patch("panelyt_api.services.activity.touch_user_activity")
    async def test_optimize_partial_coverage(
        self, mock_activity, mock_ensure_fresh, async_client: AsyncClient, db_session
    ):
        """Test optimization with partial biomarker coverage."""
        mock_activity.return_value = None
        mock_ensure_fresh.return_value = None

        # Add biomarkers
        await db_session.execute(
            insert(models.Biomarker).values([
                {"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
            ])
        )

        # Add item that covers ALT only
        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 1,
                    "lab_id": 1,
                    "external_id": "item-1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 900,
                    "currency": "PLN",
                    "is_available": True,
                },
            ])
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
        assert data["lab_code"] == "diag"
