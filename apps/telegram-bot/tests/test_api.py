from __future__ import annotations

import json
from dataclasses import dataclass

import httpx
import pytest
import respx

from panelyt_bot.api import PanelytAPIError, PanelytClient


@dataclass
class SettingsStub:
    panelyt_api_base_url: str = "https://api.test"
    telegram_api_secret: str = "secret-key"
    panelyt_timeout_seconds: float = 5.0


@pytest.mark.asyncio
@respx.mock
async def test_link_chat_sends_payload_and_headers() -> None:
    settings = SettingsStub()
    client = PanelytClient(settings)

    route = respx.post("https://api.test/telegram/link").mock(
        return_value=httpx.Response(200, json={"linked": True}),
    )

    response = await client.link_chat(
        token="AbCdEf",
        chat_id="12345",
        user_payload={"username": "tester"},
    )

    assert response == {"linked": True}
    assert route.called
    request = route.calls[0].request
    assert request.headers["X-Telegram-Bot-Secret"] == "secret-key"
    assert json.loads(request.content) == {
        "token": "AbCdEf",
        "chat_id": "12345",
        "username": "tester",
    }


@pytest.mark.asyncio
@respx.mock
async def test_link_chat_raises_for_error_response() -> None:
    settings = SettingsStub()
    client = PanelytClient(settings)

    respx.post("https://api.test/telegram/link").mock(
        return_value=httpx.Response(403, json={"detail": "forbidden"}),
    )

    with pytest.raises(PanelytAPIError) as exc:
        await client.link_chat(token="AbCdEf", chat_id="12345", user_payload={})

    assert str(exc.value) == "forbidden"


@pytest.mark.asyncio
@respx.mock
async def test_link_chat_raises_for_http_errors() -> None:
    settings = SettingsStub()
    client = PanelytClient(settings)

    respx.post("https://api.test/telegram/link").mock(
        side_effect=httpx.ConnectError("boom"),
    )

    with pytest.raises(PanelytAPIError) as exc:
        await client.link_chat(token="AbCdEf", chat_id="12345", user_payload={})

    assert str(exc.value) == "panelyt api request failed"


@pytest.mark.asyncio
@respx.mock
async def test_unlink_chat_accepts_no_content() -> None:
    settings = SettingsStub()
    client = PanelytClient(settings)

    route = respx.post("https://api.test/telegram/unlink").mock(
        return_value=httpx.Response(204),
    )

    await client.unlink_chat(chat_id="12345")

    assert route.called
