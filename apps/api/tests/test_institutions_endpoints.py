from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import insert

from panelyt_api.db import models
from panelyt_api.ingest.types import DiagInstitution


class TestInstitutionEndpoints:
    @patch("panelyt_api.ingest.client.DiagClient.close", new_callable=AsyncMock)
    @patch("panelyt_api.ingest.client.DiagClient.search_institutions", new_callable=AsyncMock)
    async def test_search_institutions_returns_results(
        self,
        mock_search: AsyncMock,
        mock_close: AsyncMock,
        async_client: AsyncClient,
    ):
        mock_search.return_value = [
            DiagInstitution(id=123, name="Office A", city="Krakow", address="Main 1"),
            DiagInstitution(id=456, name="Office B", city=None, address=None),
        ]

        response = await async_client.get(
            "/institutions/search?q=krak&page=2&limit=5"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["results"] == [
            {
                "id": 123,
                "name": "Office A",
                "city": "Krakow",
                "address": "Main 1",
            },
            {
                "id": 456,
                "name": "Office B",
                "city": None,
                "address": None,
            },
        ]

        mock_search.assert_awaited_once_with("krak", page=2, limit=5)
        mock_close.assert_awaited_once()

    @patch("panelyt_api.ingest.client.DiagClient.close", new_callable=AsyncMock)
    @patch("panelyt_api.ingest.client.DiagClient.search_institutions", new_callable=AsyncMock)
    async def test_search_institutions_upstream_status_error(
        self,
        mock_search: AsyncMock,
        mock_close: AsyncMock,
        async_client: AsyncClient,
    ):
        request = httpx.Request("GET", "https://api-eshop.diag.pl")
        response = httpx.Response(500, request=request)
        mock_search.side_effect = httpx.HTTPStatusError(
            "Upstream failed", request=request, response=response
        )

        result = await async_client.get("/institutions/search?q=alt")

        assert result.status_code == 502
        payload = result.json()
        assert payload["detail"]
        mock_close.assert_awaited_once()

    @patch("panelyt_api.ingest.client.DiagClient.close", new_callable=AsyncMock)
    @patch("panelyt_api.ingest.client.DiagClient.search_institutions", new_callable=AsyncMock)
    async def test_search_institutions_network_error(
        self,
        mock_search: AsyncMock,
        mock_close: AsyncMock,
        async_client: AsyncClient,
    ):
        request = httpx.Request("GET", "https://api-eshop.diag.pl")
        mock_search.side_effect = httpx.RequestError("Network down", request=request)

        result = await async_client.get("/institutions/search?q=alt")

        assert result.status_code == 503
        payload = result.json()
        assert payload["detail"]
        mock_close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_get_institution_returns_record(self, async_client: AsyncClient, db_session):
        await db_session.execute(
            insert(models.Institution).values(
                {
                    "id": 1135,
                    "name": "Office 1135",
                    "city": "Krakow",
                    "address": "Main 1",
                }
            )
        )
        await db_session.commit()

        response = await async_client.get("/institutions/1135")

        assert response.status_code == 200
        assert response.json() == {
            "id": 1135,
            "name": "Office 1135",
            "city": "Krakow",
            "address": "Main 1",
        }

    @pytest.mark.asyncio
    async def test_get_institution_not_found(self, async_client: AsyncClient):
        response = await async_client.get("/institutions/9999")

        assert response.status_code == 404

    @patch("panelyt_api.ingest.client.DiagClient.close", new_callable=AsyncMock)
    @patch("panelyt_api.ingest.client.DiagClient.get_institution", new_callable=AsyncMock)
    @pytest.mark.asyncio
    async def test_get_institution_fetches_missing_city(
        self,
        mock_get: AsyncMock,
        mock_close: AsyncMock,
        async_client: AsyncClient,
        db_session,
    ):
        await db_session.execute(
            insert(models.Institution).values(
                {
                    "id": 213,
                    "name": "Institution 213",
                    "city": None,
                    "address": None,
                }
            )
        )
        await db_session.commit()

        mock_get.return_value = DiagInstitution(
            id=213,
            name="Punkt Pobran Diagnostyki - Pulawy, ul. Wojska Polskiego 7a",
            city="Pulawy",
            address="24-100 Pulawy, ul. Wojska Polskiego 7a",
        )

        response = await async_client.get("/institutions/213")

        assert response.status_code == 200
        assert response.json() == {
            "id": 213,
            "name": "Punkt Pobran Diagnostyki - Pulawy, ul. Wojska Polskiego 7a",
            "city": "Pulawy",
            "address": "24-100 Pulawy, ul. Wojska Polskiego 7a",
        }
        mock_get.assert_awaited_once_with(213)
        mock_close.assert_awaited_once()
