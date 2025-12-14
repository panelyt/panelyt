from __future__ import annotations

import pytest
from types import SimpleNamespace
from panelyt_api.db import session as session_module


@pytest.fixture(autouse=True)
def ensure_default_labs():
    """Override the autouse fixture from conftest to avoid DB setup for these unit tests."""
    return


def _reset_engine_state() -> None:
    session_module._engine = None
    session_module._session_factory = None


def test_init_engine_configures_pool_for_postgres(monkeypatch):
    _reset_engine_state()

    captured: dict[str, object] = {}

    def fake_create_async_engine(url: str, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return "engine"

    def fake_async_sessionmaker(engine, expire_on_commit=False):
        captured["session_engine"] = engine
        captured["expire_on_commit"] = expire_on_commit
        return "session_factory"

    monkeypatch.setattr(session_module, "create_async_engine", fake_create_async_engine)
    monkeypatch.setattr(session_module, "async_sessionmaker", fake_async_sessionmaker)
    monkeypatch.setattr(
        session_module,
        "get_settings",
        lambda: SimpleNamespace(
            database_url="postgresql://user:pass@localhost:5432/db",
            db_pool_size=10,
            db_pool_max_overflow=20,
            db_pool_recycle=3600,
            db_pool_timeout=30,
        ),
    )

    engine = session_module.init_engine()

    assert engine == "engine"
    assert captured["kwargs"]["pool_size"] == 10
    assert captured["kwargs"]["max_overflow"] == 20
    assert captured["kwargs"]["pool_recycle"] == 3600
    assert captured["kwargs"]["pool_timeout"] == 30
    assert captured["kwargs"]["pool_pre_ping"] is True
    assert captured["kwargs"]["future"] is True
    _reset_engine_state()


def test_init_engine_skips_pool_for_sqlite(monkeypatch):
    _reset_engine_state()

    captured: dict[str, object] = {}

    def fake_create_async_engine(url: str, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return "engine"

    def fake_async_sessionmaker(engine, expire_on_commit=False):
        captured["session_engine"] = engine
        captured["expire_on_commit"] = expire_on_commit
        return "session_factory"

    monkeypatch.setattr(session_module, "create_async_engine", fake_create_async_engine)
    monkeypatch.setattr(session_module, "async_sessionmaker", fake_async_sessionmaker)
    monkeypatch.setattr(
        session_module,
        "get_settings",
        lambda: SimpleNamespace(
            database_url="sqlite+aiosqlite:///test.db",
            db_pool_size=10,
            db_pool_max_overflow=20,
            db_pool_recycle=3600,
            db_pool_timeout=30,
        ),
    )

    engine = session_module.init_engine()

    assert engine == "engine"
    assert "pool_size" not in captured["kwargs"]
    assert "max_overflow" not in captured["kwargs"]
    assert "pool_recycle" not in captured["kwargs"]
    assert "pool_timeout" not in captured["kwargs"]
    assert captured["kwargs"]["pool_pre_ping"] is True
    assert captured["kwargs"]["future"] is True
    _reset_engine_state()
