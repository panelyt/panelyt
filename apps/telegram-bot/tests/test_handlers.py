from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
from telegram.constants import ParseMode

from panelyt_bot.api import PanelytAPIError, PanelytClient
from panelyt_bot.handlers import handle_link, handle_start, handle_unlink


@dataclass
class LinkCall:
    token: str
    chat_id: str
    user_payload: dict[str, Any]


class SettingsStub:
    panelyt_api_base_url = "https://api.test"
    telegram_api_secret = "secret"
    panelyt_timeout_seconds = 5.0


class FakeClient(PanelytClient):
    def __init__(self) -> None:
        super().__init__(SettingsStub())
        self.link_calls: list[LinkCall] = []
        self.unlink_calls: list[str] = []
        self.link_error: Exception | None = None
        self.unlink_error: Exception | None = None

    async def link_chat(self, *, token: str, chat_id: str, user_payload: dict[str, Any]) -> dict[str, Any]:
        if self.link_error:
            raise self.link_error
        self.link_calls.append(LinkCall(token=token, chat_id=chat_id, user_payload=user_payload))
        return {"ok": True}

    async def unlink_chat(self, *, chat_id: str) -> None:
        if self.unlink_error:
            raise self.unlink_error
        self.unlink_calls.append(chat_id)


@pytest.mark.asyncio
async def test_start_without_token_sends_instructions(make_update, make_context, stub_message) -> None:
    update = make_update()
    context = make_context()

    await handle_start(update, context)

    assert stub_message.replies == [
        {
            "text": (
                "👋 *Panelyt Telegram Alerts*\n\n"
                "• Copy your chat ID below and paste it into Panelyt if you prefer manual entry.\n"
                "• Or generate a link token on https://panelyt.com/account and send `/link <token>` here.\n"
                "\nCurrent chat ID: `12345`"
            ),
            "parse_mode": ParseMode.MARKDOWN,
        }
    ]


@pytest.mark.asyncio
async def test_start_with_token_links_chat(make_update, make_context, stub_message) -> None:
    client = FakeClient()
    update = make_update()
    context = make_context(args=["  AbCdEf  "], client=client)

    await handle_start(update, context)

    assert client.link_calls == [
        LinkCall(
            token="AbCdEf",
            chat_id="12345",
            user_payload={
                "username": "tester",
                "first_name": "Test",
                "language_code": "en",
            },
        )
    ]
    assert stub_message.replies == [
        {
            "text": (
                "✅ Chat linked!\n\n"
                "You will now receive price-drop alerts for any lists with notifications enabled."
            ),
            "parse_mode": ParseMode.MARKDOWN,
        }
    ]


@pytest.mark.asyncio
async def test_link_without_token_prompts_for_token(make_update, make_context, stub_message) -> None:
    update = make_update()
    context = make_context()

    await handle_link(update, context)

    assert stub_message.replies == [
        {
            "text": "Send `/link <token>` with the token from your Panelyt account page.",
            "parse_mode": ParseMode.MARKDOWN,
        }
    ]


@pytest.mark.asyncio
async def test_link_with_blank_token_prompts_for_token(make_update, make_context, stub_message) -> None:
    update = make_update()
    context = make_context(args=["   "], client=FakeClient())

    await handle_link(update, context)

    assert stub_message.replies == [
        {
            "text": "Provide a link token, e.g. `/link AbCdEf`.",
            "parse_mode": ParseMode.MARKDOWN,
        }
    ]


@pytest.mark.asyncio
async def test_link_when_client_missing_shows_config_error(make_update, make_context, stub_message) -> None:
    update = make_update()
    context = make_context(args=["AbCdEf"])

    await handle_link(update, context)

    assert stub_message.replies == [
        {
            "text": "⚠️ Bot configuration is missing. Please try again later.",
            "parse_mode": None,
        }
    ]


@pytest.mark.asyncio
async def test_link_surfaces_api_errors(make_update, make_context, stub_message) -> None:
    client = FakeClient()
    client.link_error = PanelytAPIError("forbidden")
    update = make_update()
    context = make_context(args=["AbCdEf"], client=client)

    await handle_link(update, context)

    assert stub_message.replies == [
        {
            "text": "⚠️ Failed to link: forbidden",
            "parse_mode": None,
        }
    ]


@pytest.mark.asyncio
async def test_unlink_success(make_update, make_context, stub_message) -> None:
    client = FakeClient()
    update = make_update()
    context = make_context(client=client)

    await handle_unlink(update, context)

    assert client.unlink_calls == ["12345"]
    assert stub_message.replies == [
        {
            "text": "🔌 Chat disconnected.\n\nRe-run `/link <token>` any time to reconnect.",
            "parse_mode": ParseMode.MARKDOWN,
        }
    ]


@pytest.mark.asyncio
async def test_unlink_surfaces_api_errors(make_update, make_context, stub_message) -> None:
    client = FakeClient()
    client.unlink_error = PanelytAPIError("not found")
    update = make_update()
    context = make_context(client=client)

    await handle_unlink(update, context)

    assert stub_message.replies == [
        {
            "text": "⚠️ Failed to unlink: not found",
            "parse_mode": None,
        }
    ]
