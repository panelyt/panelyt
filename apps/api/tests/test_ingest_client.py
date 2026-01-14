from __future__ import annotations

import httpx
import pytest

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
