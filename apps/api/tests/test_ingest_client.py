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
