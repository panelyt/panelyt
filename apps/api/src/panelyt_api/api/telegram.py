from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from panelyt_api.api.deps import SessionDep, require_telegram_secret
from panelyt_api.core.settings import Settings, get_settings
from panelyt_api.schemas.account_settings import (
    TelegramLinkCompleteRequest,
    TelegramLinkCompleteResponse,
    TelegramUnlinkRequest,
)
from panelyt_api.services.telegram import TelegramLinkService

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.post("/link", response_model=TelegramLinkCompleteResponse)
async def complete_link(
    payload: TelegramLinkCompleteRequest,
    db: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
    _: None = Depends(require_telegram_secret),
) -> TelegramLinkCompleteResponse:
    telegram_service = TelegramLinkService(db, settings=settings)
    try:
        user = await telegram_service.attach_chat(payload.token, payload.chat_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    linked_at = user.telegram_linked_at or datetime.now(UTC)
    return TelegramLinkCompleteResponse(user_id=user.id, linked_at=linked_at)


@router.post("/unlink", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_chat(
    payload: TelegramUnlinkRequest,
    db: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
    _: None = Depends(require_telegram_secret),
) -> None:
    telegram_service = TelegramLinkService(db, settings=settings)
    await telegram_service.unlink_chat(payload.chat_id)
