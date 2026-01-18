from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(..., alias="DATABASE_URL")
    db_schema: str = Field(default="panelyt", alias="DB_SCHEMA")
    cors_origins_raw: str | list[str] = Field(default_factory=list, alias="CORS_ORIGINS")
    timezone: str = Field(default="Europe/Warsaw", alias="TIMEZONE")
    ingestion_staleness_threshold_hours: int = Field(
        default=24, alias="INGESTION_STALENESS_THRESHOLD_HOURS"
    )
    ingestion_user_activity_window_hours: int = Field(
        default=24, alias="INGESTION_USER_ACTIVITY_WINDOW_HOURS"
    )
    session_cookie_name: str = Field(default="panelyt_session", alias="SESSION_COOKIE_NAME")
    session_cookie_ttl_days: int = Field(default=180, alias="SESSION_COOKIE_TTL_DAYS")
    session_cookie_secure: bool = Field(default=False, alias="SESSION_COOKIE_SECURE")
    session_cookie_domain: str | None = Field(default=None, alias="SESSION_COOKIE_DOMAIN")
    anonymous_user_retention_days: int = Field(
        default=60, alias="ANONYMOUS_USER_RETENTION_DAYS"
    )
    admin_usernames_raw: str | list[str] = Field(
        default_factory=list,
        alias="ADMIN_USERNAMES",
    )
    telegram_bot_token: str | None = Field(default=None, alias="TELEGRAM_BOT_TOKEN")
    telegram_bot_username: str | None = Field(default=None, alias="TELEGRAM_BOT_USERNAME")
    telegram_bot_link_url: str | None = Field(default=None, alias="TELEGRAM_BOT_LINK_URL")
    telegram_api_secret: str | None = Field(default=None, alias="TELEGRAM_API_SECRET")
    telegram_link_token_ttl_minutes: int = Field(
        default=30,
        alias="TELEGRAM_LINK_TOKEN_TTL_MINUTES",
    )
    web_base_url: str = Field(default="https://panelyt.pl", alias="WEB_BASE_URL")

    # Cache TTL settings (seconds)
    cache_catalog_meta_ttl: int = Field(default=300, alias="CACHE_CATALOG_META_TTL")
    cache_optimization_ttl: int = Field(default=3600, alias="CACHE_OPTIMIZATION_TTL")
    cache_optimization_maxsize: int = Field(default=1000, alias="CACHE_OPTIMIZATION_MAXSIZE")
    cache_biomarker_batch_ttl: int = Field(default=600, alias="CACHE_BIOMARKER_BATCH_TTL")
    cache_biomarker_batch_maxsize: int = Field(
        default=2000, alias="CACHE_BIOMARKER_BATCH_MAXSIZE"
    )
    cache_freshness_ttl: int = Field(default=300, alias="CACHE_FRESHNESS_TTL")
    cache_user_activity_debounce: int = Field(default=60, alias="CACHE_USER_ACTIVITY_DEBOUNCE")

    # Database pool settings (PostgreSQL only)
    db_pool_size: int = Field(default=10, alias="DB_POOL_SIZE")
    db_pool_max_overflow: int = Field(default=20, alias="DB_POOL_MAX_OVERFLOW")
    db_pool_recycle: int = Field(default=3600, alias="DB_POOL_RECYCLE")
    db_pool_timeout: int = Field(default=30, alias="DB_POOL_TIMEOUT")

    @field_validator("cors_origins_raw", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            parsed = [str(item).rstrip('/') for item in value]
        elif isinstance(value, str):
            parsed = [origin.strip().rstrip('/') for origin in value.split(",") if origin.strip()]
        else:
            parsed = []

        expanded: set[str] = set(parsed)
        for origin in parsed:
            if origin.startswith("http://localhost"):
                expanded.add(origin.replace("localhost", "127.0.0.1", 1))
        return sorted(expanded)

    @field_validator("admin_usernames_raw", mode="before")
    @classmethod
    def parse_admin_usernames(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            usernames = value
        elif isinstance(value, str):
            usernames = [item.strip() for item in value.split(",") if item.strip()]
        else:
            usernames = []
        return sorted({name.lower() for name in usernames})

    @field_validator("web_base_url", mode="before")
    @classmethod
    def normalize_web_base_url(cls, value: str) -> str:
        return str(value).rstrip("/")

    @property
    def cors_origins(self) -> list[str]:
        return self.cors_origins_raw  # type: ignore[return-value]

    @property
    def session_cookie_ttl_seconds(self) -> int:
        return max(self.session_cookie_ttl_days, 1) * 24 * 60 * 60

    @property
    def admin_usernames(self) -> list[str]:
        return self.admin_usernames_raw  # type: ignore[return-value]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


__all__ = ["Settings", "get_settings"]
