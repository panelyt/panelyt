from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db.session import get_session

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


__all__ = ["SessionDep", "get_db_session"]
