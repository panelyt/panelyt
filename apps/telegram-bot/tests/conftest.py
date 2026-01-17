from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import pytest


class StubMessage:
    def __init__(self) -> None:
        self.replies: list[dict[str, Any]] = []

    async def reply_text(self, text: str, parse_mode: str | None = None) -> None:
        self.replies.append({"text": text, "parse_mode": parse_mode})


class StubBot:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def send_message(
        self,
        *,
        chat_id: int,
        text: str,
        parse_mode: str | None = None,
    ) -> None:
        self.messages.append({"chat_id": chat_id, "text": text, "parse_mode": parse_mode})


@dataclass(slots=True)
class StubChat:
    id: int


@dataclass(slots=True)
class StubUser:
    id: int
    username: str | None
    first_name: str
    last_name: str | None
    language_code: str | None


class StubUpdate:
    def __init__(
        self,
        *,
        chat: StubChat | None,
        user: StubUser | None,
        message: StubMessage | None,
    ) -> None:
        self.effective_chat = chat
        self.effective_user = user
        self.effective_message = message


class StubApplication:
    def __init__(self, bot_data: dict[str, Any]) -> None:
        self.bot_data = bot_data


class StubContext:
    def __init__(
        self,
        *,
        args: list[str],
        bot: StubBot,
        application: StubApplication,
    ) -> None:
        self.args = args
        self.bot = bot
        self.application = application


@pytest.fixture
def stub_bot() -> StubBot:
    return StubBot()


@pytest.fixture
def stub_message() -> StubMessage:
    return StubMessage()


@pytest.fixture
def stub_chat() -> StubChat:
    return StubChat(id=12345)


@pytest.fixture
def stub_user() -> StubUser:
    return StubUser(
        id=42,
        username="tester",
        first_name="Test",
        last_name=None,
        language_code="en",
    )


@pytest.fixture
def make_update(
    stub_chat: StubChat,
    stub_user: StubUser,
    stub_message: StubMessage,
) -> Callable[..., StubUpdate]:
    def _make_update(
        *,
        chat: StubChat | None = stub_chat,
        user: StubUser | None = stub_user,
        message: StubMessage | None = stub_message,
    ) -> StubUpdate:
        return StubUpdate(chat=chat, user=user, message=message)

    return _make_update


@pytest.fixture
def make_context(stub_bot: StubBot) -> Callable[..., StubContext]:
    def _make_context(*, args: list[str] | None = None, client: Any | None = None) -> StubContext:
        bot_data = {"client": client} if client is not None else {}
        application = StubApplication(bot_data=bot_data)
        return StubContext(args=args or [], bot=stub_bot, application=application)

    return _make_context
