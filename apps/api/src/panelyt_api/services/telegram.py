from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core.settings import Settings, get_settings
from panelyt_api.db.models import UserAccount


@dataclass(slots=True)
class TelegramLinkState:
    chat_id: str | None
    linked_at: datetime | None
    link_token: str | None
    link_token_created_at: datetime | None


class TelegramLinkService:
    """Manage Telegram chat linkage for user accounts."""

    def __init__(self, db: AsyncSession, settings: Settings | None = None) -> None:
        self._db = db
        self._settings = settings or get_settings()
        ttl_minutes = max(self._settings.telegram_link_token_ttl_minutes, 1)
        self._token_ttl = timedelta(minutes=ttl_minutes)

    async def get_state(self, user: UserAccount) -> TelegramLinkState:
        return TelegramLinkState(
            chat_id=user.telegram_chat_id,
            linked_at=user.telegram_linked_at,
            link_token=user.telegram_link_token,
            link_token_created_at=user.telegram_link_token_created_at,
        )

    async def generate_link_token(self, user: UserAccount) -> TelegramLinkState:
        token = secrets.token_urlsafe(24)
        now = datetime.now(UTC)
        user.telegram_link_token = token[:64]
        user.telegram_link_token_created_at = now
        await self._db.flush()
        return await self.get_state(user)

    async def clear_link(self, user: UserAccount) -> None:
        user.telegram_chat_id = None
        user.telegram_link_token = None
        user.telegram_link_token_created_at = None
        user.telegram_linked_at = None
        await self._db.flush()

    async def attach_chat(self, token: str, chat_id: str) -> UserAccount:
        filtered_token = token.strip()
        if not filtered_token:
            msg = "link token cannot be blank"
            raise ValueError(msg)

        statement = select(UserAccount).where(UserAccount.telegram_link_token == filtered_token)
        result = await self._db.execute(statement)
        user = result.scalar_one_or_none()
        if user is None:
            msg = "invalid link token"
            raise ValueError(msg)

        created_at = self._as_utc(user.telegram_link_token_created_at)
        if created_at is None or datetime.now(UTC) - created_at > self._token_ttl:
            msg = "link token expired"
            raise ValueError(msg)

        await self._detach_existing(chat_id, user.id)

        user.telegram_chat_id = chat_id
        user.telegram_linked_at = datetime.now(UTC)
        user.telegram_link_token = None
        user.telegram_link_token_created_at = None
        await self._db.flush()
        return user

    async def link_with_chat_id(self, user: UserAccount, chat_id: str) -> TelegramLinkState:
        cleaned = chat_id.strip()
        if not cleaned:
            msg = "chat id cannot be blank"
            raise ValueError(msg)

        await self._detach_existing(cleaned, user.id)

        user.telegram_chat_id = cleaned
        user.telegram_linked_at = datetime.now(UTC)
        user.telegram_link_token = None
        user.telegram_link_token_created_at = None
        await self._db.flush()
        return await self.get_state(user)

    async def unlink_chat(self, chat_id: str) -> None:
        statement = select(UserAccount).where(UserAccount.telegram_chat_id == chat_id)
        result = await self._db.execute(statement)
        user = result.scalar_one_or_none()
        if user is None:
            return
        await self.clear_link(user)

    async def _detach_existing(self, chat_id: str, owner_id: str) -> None:
        if not chat_id:
            return
        statement = select(UserAccount).where(UserAccount.telegram_chat_id == chat_id)
        result = await self._db.execute(statement)
        existing = result.scalar_one_or_none()
        if existing is None or existing.id == owner_id:
            return
        existing.telegram_chat_id = None
        existing.telegram_linked_at = None
        await self._db.flush()

    @staticmethod
    def _as_utc(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


__all__ = ["TelegramLinkService", "TelegramLinkState"]
