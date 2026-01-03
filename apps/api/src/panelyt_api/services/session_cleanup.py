from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core import metrics
from panelyt_api.db import models

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class SessionCleanupSummary:
    expired_sessions: int
    anonymous_users: int


class SessionCleanupService:
    def __init__(self, session: AsyncSession, retention_days: int) -> None:
        self._session = session
        self._retention_days = max(retention_days, 1)

    async def run(self, *, now: datetime | None = None) -> SessionCleanupSummary:
        timestamp = now or datetime.now(UTC)
        expired_sessions = await self._prune_expired_sessions(timestamp)
        anonymous_users = await self._prune_anonymous_users(timestamp)
        await self._session.flush()

        metrics.increment("cleanup.run")
        if expired_sessions:
            metrics.increment("cleanup.expired_sessions", value=expired_sessions)
        if anonymous_users:
            metrics.increment("cleanup.anonymous_users", value=anonymous_users)

        logger.info(
            "Session cleanup summary expired_sessions=%s anonymous_users=%s",
            expired_sessions,
            anonymous_users,
        )

        return SessionCleanupSummary(
            expired_sessions=expired_sessions,
            anonymous_users=anonymous_users,
        )

    async def _prune_expired_sessions(self, timestamp: datetime) -> int:
        result = await self._session.execute(
            delete(models.UserSession).where(models.UserSession.expires_at < timestamp)
        )
        return int(result.rowcount or 0)

    async def _prune_anonymous_users(self, timestamp: datetime) -> int:
        cutoff = timestamp - timedelta(days=self._retention_days)
        has_list = (
            select(models.SavedList.id)
            .where(models.SavedList.user_id == models.UserAccount.id)
            .exists()
        )
        result = await self._session.execute(
            delete(models.UserAccount).where(
                models.UserAccount.created_at < cutoff,
                models.UserAccount.username.is_(None),
                models.UserAccount.email.is_(None),
                models.UserAccount.password_hash.is_(None),
                models.UserAccount.telegram_chat_id.is_(None),
                models.UserAccount.telegram_linked_at.is_(None),
                ~has_list,
            )
        )
        return int(result.rowcount or 0)


__all__ = ["SessionCleanupService", "SessionCleanupSummary"]
