from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Telegram worker."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    telegram_bot_token: str = Field(..., alias="TELEGRAM_BOT_TOKEN")
    telegram_api_secret: str = Field(..., alias="TELEGRAM_API_SECRET")
    panelyt_api_base_url: str = Field(
        "http://localhost:8000",
        alias="PANELYT_API_BASE_URL",
    )
    panelyt_timeout_seconds: float = Field(
        10.0,
        alias="PANELYT_TIMEOUT_SECONDS",
        ge=1.0,
        le=120.0,
    )


__all__ = ["Settings"]
