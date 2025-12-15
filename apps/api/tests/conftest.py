from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator, Iterator
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import insert, select

from panelyt_api.core.settings import Settings, get_settings
from panelyt_api.db.base import Base
from panelyt_api.db import models
from panelyt_api.main import create_app


@pytest.fixture(scope="session")
def event_loop() -> Iterator[asyncio.AbstractEventLoop]:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def test_settings() -> Settings:
    """Test settings with SQLite database."""
    settings = Settings(
        database_url="sqlite+aiosqlite:///test.db",
        db_schema=None,
        testing=True,
        cors_origins=["http://localhost:3000"],
        log_level="DEBUG",
        ADMIN_USERNAMES=["admin"],
    )
    assert settings.admin_usernames == ["admin"]
    settings.telegram_bot_token = None
    settings.telegram_api_secret = None
    settings.telegram_bot_username = None
    settings.telegram_bot_link_url = None
    return settings


@pytest.fixture
async def db_session(test_settings: Settings) -> AsyncIterator[AsyncSession]:
    """Create a database session for testing."""
    engine = create_async_engine(test_settings.database_url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_maker() as session:
        yield session

    await engine.dispose()

    # Clean up test database
    if os.path.exists("test.db"):
        os.remove("test.db")


@pytest.fixture(autouse=True)
async def ensure_default_labs(db_session: AsyncSession):
    existing = await db_session.scalar(select(models.Lab.id))
    if existing:
        return
    await db_session.execute(
        insert(models.Lab),
        [
            {
                "id": 1,
                "code": "diag",
                "name": "Diagnostyka",
                "slug": "diag",
                "timezone": "Europe/Warsaw",
                "website_url": "https://diag.pl",
                "single_item_url_template": "https://diag.pl/sklep/badania/{slug}",
                "package_item_url_template": "https://diag.pl/sklep/pakiety/{slug}",
            },
            {
                "id": 2,
                "code": "alab",
                "name": "ALAB",
                "slug": "alab",
                "timezone": "Europe/Warsaw",
                "website_url": "https://www.alablaboratoria.pl",
                "single_item_url_template": None,
                "package_item_url_template": None,
            },
        ],
    )
    await db_session.commit()


@pytest.fixture
def override_get_settings(test_settings: Settings):
    """Override settings dependency for testing."""
    from functools import lru_cache
    from panelyt_api.core import settings as settings_module

    original_get_settings = settings_module.get_settings

    @lru_cache
    def _patched_get_settings() -> Settings:  # type: ignore[override]
        return test_settings

    settings_module.get_settings = _patched_get_settings  # type: ignore[assignment]

    def _override_get_settings():
        return test_settings

    yield _override_get_settings

    settings_module.get_settings = original_get_settings
    settings_module.get_settings.cache_clear()


@pytest.fixture
def override_get_db_session(db_session: AsyncSession):
    """Override database session dependency for testing."""
    async def _override_get_db_session():
        yield db_session
    return _override_get_db_session


@pytest.fixture
def app(override_get_settings, override_get_db_session):
    """Create FastAPI app for testing."""
    from panelyt_api.api.deps import get_db_session
    app = create_app()
    app.dependency_overrides[get_settings] = override_get_settings
    app.dependency_overrides[get_db_session] = override_get_db_session
    return app


@pytest.fixture
def client(app) -> TestClient:
    """Create test client."""
    return TestClient(app)


@pytest.fixture
async def async_client(app) -> AsyncIterator[AsyncClient]:
    """Create async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client


@pytest.fixture
def mock_ingestion_service():
    """Mock ingestion service for testing."""
    mock = AsyncMock()
    mock.ensure_fresh_data = AsyncMock()
    mock.ingest_all = AsyncMock()
    mock.is_data_stale = AsyncMock(return_value=False)
    return mock


@pytest.fixture
def sample_biomarkers():
    """Sample biomarker data for testing."""
    return [
        {
            "id": 1,
            "name": "Alanine aminotransferase",
            "elab_code": "ALT",
            "aliases": ["ALAT", "GPT"],
            "description": "Liver enzyme test",
        },
        {
            "id": 2,
            "name": "Aspartate aminotransferase",
            "elab_code": "AST",
            "aliases": ["ASAT", "GOT"],
            "description": "Liver enzyme test",
        },
        {
            "id": 3,
            "name": "Total cholesterol",
            "elab_code": "CHOL",
            "aliases": ["TC", "Total Chol"],
            "description": "Cholesterol level test",
        },
    ]


@pytest.fixture
def sample_items():
    """Sample lab items for testing."""
    return [
        {
            "id": 1,
            "kind": "single",
            "name": "ALT",
            "slug": "alt",
            "price_now": 1000,
            "price_min30": 1000,
            "biomarker_codes": ["ALT"],
        },
        {
            "id": 2,
            "kind": "single",
            "name": "AST",
            "slug": "ast",
            "price_now": 1200,
            "price_min30": 1100,
            "biomarker_codes": ["AST"],
        },
        {
            "id": 3,
            "kind": "package",
            "name": "Liver Panel",
            "slug": "liver-panel",
            "price_now": 2000,
            "price_min30": 1900,
            "biomarker_codes": ["ALT", "AST"],
        },
    ]
