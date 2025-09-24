from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core.settings import get_settings
from panelyt_api.db.session import get_session
from panelyt_api.services.accounts import AccountService, SessionState

SessionDependency = Annotated[
    AbstractAsyncContextManager[AsyncSession] | AsyncSession,
    Depends(get_session),
]


async def get_db_session(
    session_or_context: SessionDependency,
) -> AsyncIterator[AsyncSession]:
    """Yield a database session for request handlers.

    Supports both the default async context manager returned by
    ``get_session`` and direct session instances provided by tests via
    dependency overrides.
    """

    if isinstance(session_or_context, AsyncSession):
        yield session_or_context
    else:
        async with session_or_context as session:
            yield session


SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


async def get_session_state(
    request: Request,
    response: Response,
    db: SessionDep,
) -> SessionState:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    account_service = AccountService(db, settings=settings)
    session_state = await account_service.ensure_session(token)
    account_service.apply_cookie(response, session_state.token)
    return session_state


SessionStateDep = Annotated[SessionState, Depends(get_session_state)]


__all__ = ["SessionDep", "SessionStateDep", "get_db_session", "get_session_state"]
