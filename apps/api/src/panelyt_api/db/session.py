from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from panelyt_api.core.settings import get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _to_async_url(url: str) -> str:
    if "+asyncpg" in url:
        return url
    if url.startswith("postgresql+psycopg2"):
        return url.replace("postgresql+psycopg2", "postgresql+asyncpg", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def init_engine() -> AsyncEngine:
    global _engine, _session_factory
    if _engine is None:
        settings = get_settings()
        async_url = _to_async_url(settings.database_url)

        # Configure connection pool for production workloads (PostgreSQL only)
        pool_kwargs: dict[str, int] = {}
        if "postgresql" in async_url:
            pool_kwargs = {
                "pool_size": settings.db_pool_size,
                "max_overflow": settings.db_pool_max_overflow,
                "pool_recycle": settings.db_pool_recycle,
                "pool_timeout": settings.db_pool_timeout,
            }

        connect_args: dict[str, object] = {}
        if "postgresql" in async_url and settings.db_schema:
            connect_args = {"server_settings": {"search_path": settings.db_schema}}

        _engine = create_async_engine(
            async_url,
            pool_pre_ping=True,
            future=True,
            connect_args=connect_args,
            **pool_kwargs,
        )
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def dispose_engine() -> None:
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    if _session_factory is None:
        init_engine()
    assert _session_factory is not None
    session = _session_factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
