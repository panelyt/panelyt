from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, insert, select

from panelyt_api.db import models
from panelyt_api.services.session_cleanup import SessionCleanupService


@pytest.mark.asyncio
async def test_prune_expired_sessions(db_session) -> None:
    now = datetime.now(UTC)
    await db_session.execute(
        insert(models.UserAccount).values(
            [
                {"id": "user-a", "created_at": now},
                {"id": "user-b", "created_at": now},
            ]
        )
    )
    await db_session.execute(
        insert(models.UserSession).values(
            [
                {
                    "user_id": "user-a",
                    "token_hash": "expired-1",
                    "created_at": now - timedelta(days=2),
                    "expires_at": now - timedelta(days=1),
                    "last_seen_at": now - timedelta(days=1),
                },
                {
                    "user_id": "user-a",
                    "token_hash": "valid-1",
                    "created_at": now,
                    "expires_at": now + timedelta(days=1),
                    "last_seen_at": now,
                },
                {
                    "user_id": "user-b",
                    "token_hash": "expired-2",
                    "created_at": now - timedelta(days=3),
                    "expires_at": now - timedelta(days=2),
                    "last_seen_at": now - timedelta(days=2),
                },
            ]
        )
    )
    await db_session.commit()

    service = SessionCleanupService(db_session, retention_days=60)
    summary = await service.run(now=now)

    remaining = await db_session.scalar(
        select(func.count()).select_from(models.UserSession)
    )
    assert remaining == 1
    assert summary.expired_sessions == 2


@pytest.mark.asyncio
async def test_prune_anonymous_users(db_session) -> None:
    now = datetime.now(UTC)
    old = now - timedelta(days=61)
    recent = now - timedelta(days=10)

    await db_session.execute(
        insert(models.UserAccount).values(
            [
                {
                    "id": "old-anon",
                    "created_at": old,
                    "username": None,
                    "email": None,
                    "password_hash": None,
                    "telegram_chat_id": None,
                    "telegram_linked_at": None,
                },
                {
                    "id": "old-with-username",
                    "created_at": old,
                    "username": "egor",
                    "email": None,
                    "password_hash": None,
                    "telegram_chat_id": None,
                    "telegram_linked_at": None,
                },
                {
                    "id": "old-with-email",
                    "created_at": old,
                    "username": None,
                    "email": "egor@example.com",
                    "password_hash": None,
                    "telegram_chat_id": None,
                    "telegram_linked_at": None,
                },
                {
                    "id": "old-with-password",
                    "created_at": old,
                    "username": None,
                    "email": None,
                    "password_hash": "hash",
                    "telegram_chat_id": None,
                    "telegram_linked_at": None,
                },
                {
                    "id": "old-with-telegram",
                    "created_at": old,
                    "username": None,
                    "email": None,
                    "password_hash": None,
                    "telegram_chat_id": "123",
                    "telegram_linked_at": None,
                },
                {
                    "id": "old-with-list",
                    "created_at": old,
                    "username": None,
                    "email": None,
                    "password_hash": None,
                    "telegram_chat_id": None,
                    "telegram_linked_at": None,
                },
                {
                    "id": "recent-anon",
                    "created_at": recent,
                    "username": None,
                    "email": None,
                    "password_hash": None,
                    "telegram_chat_id": None,
                    "telegram_linked_at": None,
                },
            ]
        )
    )
    await db_session.execute(
        insert(models.SavedList).values(
            {
                "id": "list-1",
                "user_id": "old-with-list",
                "name": "List",
                "notify_on_price_drop": True,
                "created_at": now,
                "updated_at": now,
            }
        )
    )
    await db_session.commit()

    service = SessionCleanupService(db_session, retention_days=60)
    summary = await service.run(now=now)

    assert summary.anonymous_users == 1
    assert await db_session.get(models.UserAccount, "old-anon") is None
    assert await db_session.get(models.UserAccount, "old-with-username") is not None
    assert await db_session.get(models.UserAccount, "old-with-email") is not None
    assert await db_session.get(models.UserAccount, "old-with-password") is not None
    assert await db_session.get(models.UserAccount, "old-with-telegram") is not None
    assert await db_session.get(models.UserAccount, "old-with-list") is not None
    assert await db_session.get(models.UserAccount, "recent-anon") is not None
