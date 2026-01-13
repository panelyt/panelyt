from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import update

from panelyt_api.api.deps import SessionDep, SessionStateDep
from panelyt_api.core.settings import Settings, get_settings
from panelyt_api.db import models
from panelyt_api.schemas.account_settings import (
    AccountSettingsResponse,
    AccountSettingsUpdateRequest,
    TelegramLinkStatus,
    TelegramLinkTokenResponse,
    TelegramManualLinkRequest,
)
from panelyt_api.services.institutions import InstitutionService
from panelyt_api.services.telegram import TelegramLinkService

router = APIRouter(prefix="/account", tags=["account"])


def _link_enabled(settings: Settings) -> bool:
    return bool(settings.telegram_bot_token and settings.telegram_api_secret)


def _link_token_ttl(settings: Settings) -> timedelta:
    minutes = max(settings.telegram_link_token_ttl_minutes, 1)
    return timedelta(minutes=minutes)


@router.get("/settings", response_model=AccountSettingsResponse)
async def get_account_settings(
    session_state: SessionStateDep,
    db: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> AccountSettingsResponse:
    telegram_service = TelegramLinkService(db, settings=settings)
    state = await telegram_service.get_state(session_state.user)
    return AccountSettingsResponse(
        telegram=_render_status(state, settings),
        preferred_institution_id=session_state.user.preferred_institution_id,
    )


@router.patch("/settings", response_model=AccountSettingsResponse)
async def update_account_settings(
    payload: AccountSettingsUpdateRequest,
    session_state: SessionStateDep,
    db: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> AccountSettingsResponse:
    user = session_state.user
    if "preferred_institution_id" in payload.model_fields_set:
        new_id = payload.preferred_institution_id
        current_id = user.preferred_institution_id

        if new_id is not None:
            institution_service = InstitutionService(db)
            await institution_service.ensure_institution(new_id)

        if new_id != current_id:
            user.preferred_institution_id = new_id
            await db.execute(
                update(models.SavedList)
                .where(models.SavedList.user_id == user.id)
                .values(
                    last_known_total_grosz=None,
                    last_total_updated_at=None,
                    last_notified_total_grosz=None,
                    last_notified_at=None,
                )
            )

        await db.flush()

    telegram_service = TelegramLinkService(db, settings=settings)
    state = await telegram_service.get_state(user)
    return AccountSettingsResponse(
        telegram=_render_status(state, settings),
        preferred_institution_id=user.preferred_institution_id,
    )


@router.post("/telegram/link-token", response_model=TelegramLinkTokenResponse)
async def create_link_token(
    session_state: SessionStateDep,
    db: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TelegramLinkTokenResponse:
    if not _link_enabled(settings):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="telegram disabled",
        )

    telegram_service = TelegramLinkService(db, settings=settings)
    state = await telegram_service.generate_link_token(session_state.user)
    return TelegramLinkTokenResponse(telegram=_render_status(state, settings))


@router.post("/telegram/unlink", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_telegram_chat(
    session_state: SessionStateDep,
    db: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    if not _link_enabled(settings):
        return

    telegram_service = TelegramLinkService(db, settings=settings)
    await telegram_service.clear_link(session_state.user)


@router.post("/telegram/manual-link", response_model=TelegramLinkTokenResponse)
async def manual_link_telegram_chat(
    payload: TelegramManualLinkRequest,
    session_state: SessionStateDep,
    db: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TelegramLinkTokenResponse:
    if not _link_enabled(settings):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="telegram disabled",
        )

    telegram_service = TelegramLinkService(db, settings=settings)
    try:
        state = await telegram_service.link_with_chat_id(session_state.user, payload.chat_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return TelegramLinkTokenResponse(telegram=_render_status(state, settings))


def _render_status(state, settings: Settings) -> TelegramLinkStatus:
    return TelegramLinkStatus.from_state(
        state=state,
        enabled=_link_enabled(settings),
        bot_username=settings.telegram_bot_username,
        link_base=settings.telegram_bot_link_url,
        token_ttl=_link_token_ttl(settings),
    )
