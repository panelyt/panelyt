from __future__ import annotations

import httpx
import pytest
from unittest.mock import AsyncMock

from panelyt_api.ingest import client as diag_client
from panelyt_api.ingest.client import DiagClient


@pytest.mark.asyncio
async def test_parse_institution_reads_city_from_address_city():
    client = DiagClient(httpx.AsyncClient())
    entry = {
        "id": 213,
        "name": "Punkt Pobran Diagnostyki - Pulawy, ul. Wojska Polskiego 7a",
        "address": {
            "fullAddress": "24-100 Pulawy, ul. Wojska Polskiego 7a",
            "city": {
                "id": 111,
                "name": "Pulawy",
            },
        },
    }

    parsed = client._parse_institution(entry)
    await client.close()

    assert parsed is not None
    assert parsed.city == "Pulawy"


@pytest.mark.asyncio
async def test_parse_institution_reads_city_slug_from_city_object():
    client = DiagClient(httpx.AsyncClient())
    entry = {
        "id": 777,
        "name": "Punkt Diagnostyki",
        "slug": "punkt-diagnostyki",
        "city": {
            "id": 155,
            "name": "Warszawa",
            "slug": "warszawa",
        },
        "address": "Main 1",
    }

    parsed = client._parse_institution(entry)
    await client.close()

    assert parsed is not None
    assert parsed.city == "Warszawa"
    assert parsed.city_slug == "warszawa"


@pytest.mark.asyncio
async def test_search_institutions_falls_back_to_diacritics(monkeypatch):
    calls: list[str] = []

    async def fake_request(_, __, *, params):
        query = params["q"]
        calls.append(query)
        if query == "pul":
            return httpx.Response(200, json={"data": []})
        if query == "puł":
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": 213,
                            "name": "Punkt Pobrań Diagnostyki – Puławy, ul. Wojska Polskiego 7a",
                            "slug": "punkt-pobran-diagnostyki-pulawy",
                            "address": {
                                "fullAddress": "24-100 Puławy, ul. Wojska Polskiego 7a",
                                "city": {"name": "Puławy"},
                            },
                        }
                    ]
                },
            )
        raise AssertionError(f"Unexpected query: {query}")

    monkeypatch.setattr(diag_client, "_retrying_request", fake_request)

    client = DiagClient(httpx.AsyncClient())
    results = await client.search_institutions("pul", page=1, limit=5)
    await client.close()

    assert calls == ["pul", "puł"]
    assert [result.city for result in results] == ["Puławy"]


@pytest.mark.asyncio
async def test_parse_institution_reads_slug_and_city_slug():
    client = DiagClient(httpx.AsyncClient())
    entry = {
        "id": 295,
        "name": "Punkt Pobrań Diagnostyki – Warszawa, al. Dwudziestolatków 3",
        "slug": "punkt-pobran-diagnostyki-warszawa-al-dwudziestolatkow-3",
        "address": {
            "fullAddress": "02-157 Warszawa, al. Dwudziestolatków 3",
            "city": {
                "id": 155,
                "name": "Warszawa",
                "slug": "warszawa",
            },
        },
    }

    parsed = client._parse_institution(entry)
    await client.close()

    assert parsed is not None
    assert parsed.slug == "punkt-pobran-diagnostyki-warszawa-al-dwudziestolatkow-3"
    assert parsed.city_slug == "warszawa"


def test_parse_institution_falls_back_to_institution_id():
    client = DiagClient(client=AsyncMock())
    entry = {
        "institutionId": "314",
        "fullName": "Diag Center",
        "address": "Main 1",
    }

    parsed = client._parse_institution(entry)
    assert parsed is not None
    assert parsed.id == 314
    assert parsed.name == "Diag Center"


def test_compose_address_uses_fallback_keys():
    client = DiagClient(client=AsyncMock())
    entry = {
        "streetName": "Main",
        "buildingNumber": "12",
        "localNumber": "5",
    }

    assert client._compose_address(entry) == "Main 12/5"


def test_compose_address_handles_missing_street():
    client = DiagClient(client=AsyncMock())
    entry = {"building": "7", "local": "2"}

    assert client._compose_address(entry) == "7/2"


def test_compose_address_returns_none_when_empty():
    client = DiagClient(client=AsyncMock())
    assert client._compose_address({}) is None


def test_extract_address_prefers_address_string():
    client = DiagClient(client=AsyncMock())
    entry = {"address": "  Main 1  "}

    assert client._extract_address(entry) == "Main 1"


def test_extract_address_falls_back_to_full_line():
    client = DiagClient(client=AsyncMock())
    entry = {"address": {"full": "Main 2"}}

    assert client._extract_address(entry) == "Main 2"


def test_extract_address_from_entry_fields():
    client = DiagClient(client=AsyncMock())
    entry = {"street": "Main", "number": "3"}

    assert client._extract_address(entry) == "Main 3"
