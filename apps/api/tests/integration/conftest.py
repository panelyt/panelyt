from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from panelyt_api.core import settings as settings_module
from panelyt_api.db import session as session_module


def _integration_database_url() -> str | None:
    return os.getenv("INTEGRATION_DATABASE_URL")


def _validate_schema_name(schema: str) -> None:
    if schema.lower() == "public":
        raise RuntimeError("Integration schema must not be public")
    if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", schema):
        raise RuntimeError(f"Invalid integration schema name: {schema!r}")


@pytest.fixture(scope="session")
def integration_database_url() -> str:
    url = _integration_database_url()
    if not url:
        pytest.skip("INTEGRATION_DATABASE_URL is not set")
    return url


@pytest.fixture(scope="session")
def integration_schema() -> str:
    return os.getenv("INTEGRATION_DB_SCHEMA") or f"panelyt_test_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="session")
def integration_settings(integration_database_url: str, integration_schema: str):
    _validate_schema_name(integration_schema)

    previous_env = {
        "DATABASE_URL": os.getenv("DATABASE_URL"),
        "DB_SCHEMA": os.getenv("DB_SCHEMA"),
    }
    os.environ["DATABASE_URL"] = integration_database_url
    os.environ["DB_SCHEMA"] = integration_schema
    settings_module.get_settings.cache_clear()
    session_module._engine = None
    session_module._session_factory = None

    yield

    for key, value in previous_env.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    settings_module.get_settings.cache_clear()
    session_module._engine = None
    session_module._session_factory = None


@pytest.fixture(scope="session")
def alembic_config(integration_settings, integration_database_url: str) -> Config:
    base_path = Path(__file__).resolve().parents[2]
    config = Config(str(base_path / "alembic.ini"))
    config.set_main_option("script_location", str(base_path / "alembic"))
    config.set_main_option("sqlalchemy.url", integration_database_url)
    return config


@pytest.fixture(scope="session")
def migrated_database(
    alembic_config: Config,
    integration_database_url: str,
    integration_schema: str,
    integration_settings,
):
    engine = create_engine(integration_database_url)
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA IF EXISTS "{integration_schema}" CASCADE'))

    command.upgrade(alembic_config, "head")

    yield

    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA IF EXISTS "{integration_schema}" CASCADE'))
    engine.dispose()


@pytest.fixture
async def pg_session(
    migrated_database,
    integration_database_url: str,
    integration_schema: str,
) -> AsyncSession:
    async_url = session_module._to_async_url(integration_database_url)
    connect_args = {"server_settings": {"search_path": integration_schema}}
    engine = create_async_engine(async_url, connect_args=connect_args, future=True)
    session_maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_maker() as session:
        yield session
        await session.commit()

    await engine.dispose()
