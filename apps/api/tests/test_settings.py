from __future__ import annotations

from panelyt_api.core.settings import Settings


def test_settings_defaults_timezone_to_warsaw(monkeypatch):
    monkeypatch.delenv("TIMEZONE", raising=False)
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite+aiosqlite:///test.db",
        CORS_ORIGINS=[],
        ADMIN_USERNAMES=[],
    )

    assert settings.timezone == "Europe/Warsaw"


def test_settings_defaults_ingestion_staleness_to_24_hours(monkeypatch):
    monkeypatch.delenv("INGESTION_STALENESS_THRESHOLD_HOURS", raising=False)
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite+aiosqlite:///test.db",
        CORS_ORIGINS=[],
        ADMIN_USERNAMES=[],
    )

    assert settings.ingestion_staleness_threshold_hours == 24
