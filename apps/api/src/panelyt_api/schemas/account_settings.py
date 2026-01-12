from __future__ import annotations

from datetime import datetime, timedelta
from typing import Self

from pydantic import BaseModel, Field

from panelyt_api.services.telegram import TelegramLinkState


class TelegramLinkStatus(BaseModel):
    enabled: bool = Field(..., description="True when Telegram integration is configured")
    chat_id: str | None = Field(default=None, description="Linked Telegram chat identifier")
    linked_at: datetime | None = Field(
        default=None,
        description="Timestamp when Telegram chat was linked",
    )
    link_token: str | None = Field(
        default=None,
        description="Pending link token for manual entry",
    )
    link_token_expires_at: datetime | None = Field(
        default=None,
        description="Expiry timestamp for the pending link token",
    )
    bot_username: str | None = Field(
        default=None,
        description="Configured Telegram bot username",
    )
    link_url: str | None = Field(
        default=None,
        description="Deep link URL to open the bot with the pending token",
    )

    @classmethod
    def from_state(
        cls,
        *,
        state: TelegramLinkState,
        enabled: bool,
        bot_username: str | None,
        link_base: str | None,
        token_ttl: timedelta,
    ) -> Self:
        expires_at = None
        link_url = None
        if state.link_token and state.link_token_created_at is not None:
            expires_at = state.link_token_created_at + token_ttl
            base = link_base or (f"https://t.me/{bot_username}" if bot_username else None)
            if base:
                separator = "?" if "?" not in base else "&"
                link_url = f"{base}{separator}start={state.link_token}"
        return cls(
            enabled=enabled,
            chat_id=state.chat_id,
            linked_at=state.linked_at,
            link_token=state.link_token,
            link_token_expires_at=expires_at,
            bot_username=bot_username,
            link_url=link_url,
        )


class AccountSettingsResponse(BaseModel):
    telegram: TelegramLinkStatus
    preferred_institution_id: int | None = Field(
        default=None,
        description="Preferred institution (office) id for pricing",
    )


class AccountSettingsUpdateRequest(BaseModel):
    preferred_institution_id: int | None = Field(
        default=None,
        ge=1,
        description="Preferred institution (office) id for pricing",
    )


class TelegramLinkTokenResponse(BaseModel):
    telegram: TelegramLinkStatus


class TelegramLinkCompleteRequest(BaseModel):
    token: str = Field(..., min_length=3, max_length=64)
    chat_id: str = Field(..., min_length=1, max_length=64)
    username: str | None = Field(default=None, max_length=255)
    first_name: str | None = Field(default=None, max_length=255)
    last_name: str | None = Field(default=None, max_length=255)
    language_code: str | None = Field(default=None, max_length=10)


class TelegramLinkCompleteResponse(BaseModel):
    user_id: str
    linked_at: datetime


class TelegramUnlinkRequest(BaseModel):
    chat_id: str = Field(..., min_length=1, max_length=64)


class TelegramManualLinkRequest(BaseModel):
    chat_id: str = Field(..., min_length=1, max_length=64)


__all__ = [
    "AccountSettingsUpdateRequest",
    "AccountSettingsResponse",
    "TelegramLinkCompleteRequest",
    "TelegramLinkCompleteResponse",
    "TelegramLinkStatus",
    "TelegramLinkTokenResponse",
    "TelegramManualLinkRequest",
    "TelegramUnlinkRequest",
]
