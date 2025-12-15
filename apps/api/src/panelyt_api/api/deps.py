from __future__ import annotations

import secrets
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core.settings import Settings, get_settings
from panelyt_api.db.session import get_session
from panelyt_api.services.accounts import AccountService, SessionState


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """Yield a database session for request handlers.

    Uses the get_session context manager internally to handle
    commit/rollback/close lifecycle.
    """
    async with get_session() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


async def get_session_state(
    request: Request,
    response: Response,
    db: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> SessionState:
    token = request.cookies.get(settings.session_cookie_name)
    account_service = AccountService(db, settings=settings)
    session_state = await account_service.ensure_session(token)
    account_service.apply_cookie(response, session_state.token)
    return session_state


SessionStateDep = Annotated[SessionState, Depends(get_session_state)]


async def get_admin_session_state(session_state: SessionStateDep) -> SessionState:
    user = session_state.user
    if not user.is_admin or user.username is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="admin privileges required",
        )
    return session_state


AdminSessionDep = Annotated[SessionState, Depends(get_admin_session_state)]


async def require_telegram_secret(
    settings: Annotated[Settings, Depends(get_settings)],
    provided: str | None = Header(default=None, alias="X-Telegram-Bot-Secret"),
) -> None:
    expected = settings.telegram_api_secret
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="telegram disabled",
        )
    if provided is None or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid telegram secret")


__all__ = [
    "AdminSessionDep",
    "SessionDep",
    "SessionStateDep",
    "get_admin_session_state",
    "get_db_session",
    "get_session_state",
    "require_telegram_secret",
]
