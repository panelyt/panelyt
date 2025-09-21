from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db.session import get_session


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async with get_session() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


__all__ = ["SessionDep", "get_db_session"]
