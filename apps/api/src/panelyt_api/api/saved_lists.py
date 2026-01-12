from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from panelyt_api.api.deps import SessionDep, SessionStateDep
from panelyt_api.schemas.saved_lists import (
    SavedListCollectionResponse,
    SavedListEntryPayload,
    SavedListNotificationRequest,
    SavedListNotificationResponse,
    SavedListNotificationsBulkResponse,
    SavedListResponse,
    SavedListShareRequest,
    SavedListShareResponse,
    SavedListUpsert,
)
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID
from panelyt_api.services.saved_lists import SavedListEntryData, SavedListService

router = APIRouter(prefix="/lists", tags=["saved-lists"])


def _to_entry_data(payload: SavedListEntryPayload) -> SavedListEntryData:
    return SavedListEntryData(code=payload.code, display_name=payload.name)


@router.get("", response_model=SavedListCollectionResponse)
async def list_saved_lists(
    session_state: SessionStateDep,
    db: SessionDep,
) -> SavedListCollectionResponse:
    service = SavedListService(db)
    lists = await service.list_for_user(session_state.user.id)
    return SavedListCollectionResponse.from_iterable(lists)


@router.post("", response_model=SavedListResponse, status_code=status.HTTP_201_CREATED)
async def create_saved_list(
    payload: SavedListUpsert,
    session_state: SessionStateDep,
    db: SessionDep,
) -> SavedListResponse:
    service = SavedListService(db)
    institution_id = (
        session_state.user.preferred_institution_id or DEFAULT_INSTITUTION_ID
    )
    existing = await service.get_by_name_for_user(session_state.user.id, payload.name)
    if existing is not None:
        try:
            updated = await service.update_list(
                saved_list=existing,
                name=payload.name,
                entries=[_to_entry_data(entry) for entry in payload.biomarkers],
                institution_id=institution_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        return SavedListResponse.from_model(updated)
    try:
        saved = await service.create_list(
            user_id=session_state.user.id,
            name=payload.name,
            entries=[_to_entry_data(entry) for entry in payload.biomarkers],
            institution_id=institution_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return SavedListResponse.from_model(saved)


@router.put("/{list_id}", response_model=SavedListResponse)
async def update_saved_list(
    list_id: str,
    payload: SavedListUpsert,
    session_state: SessionStateDep,
    db: SessionDep,
) -> SavedListResponse:
    service = SavedListService(db)
    saved_list = await service.get_for_user(list_id, session_state.user.id)
    if saved_list is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="list not found")

    try:
        updated = await service.update_list(
            saved_list=saved_list,
            name=payload.name,
            entries=[_to_entry_data(entry) for entry in payload.biomarkers],
            institution_id=session_state.user.preferred_institution_id
            or DEFAULT_INSTITUTION_ID,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return SavedListResponse.from_model(updated)


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_list(
    list_id: str,
    session_state: SessionStateDep,
    db: SessionDep,
) -> None:
    service = SavedListService(db)
    saved_list = await service.get_for_user(list_id, session_state.user.id)
    if saved_list is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="list not found")

    await service.delete_list(saved_list)


@router.post("/{list_id}/share", response_model=SavedListShareResponse)
async def share_saved_list(
    list_id: str,
    payload: SavedListShareRequest,
    session_state: SessionStateDep,
    db: SessionDep,
) -> SavedListShareResponse:
    service = SavedListService(db)
    saved_list = await service.get_for_user(list_id, session_state.user.id)
    if saved_list is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="list not found")

    published = await service.publish_list(saved_list, regenerate=payload.regenerate)
    try:
        return SavedListShareResponse.from_model(published)
    except ValueError as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{list_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def unshare_saved_list(
    list_id: str,
    session_state: SessionStateDep,
    db: SessionDep,
) -> None:
    service = SavedListService(db)
    saved_list = await service.get_for_user(list_id, session_state.user.id)
    if saved_list is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="list not found")

    await service.revoke_share(saved_list)


@router.post("/notifications", response_model=SavedListNotificationsBulkResponse)
async def update_saved_lists_notifications_bulk(
    payload: SavedListNotificationRequest,
    session_state: SessionStateDep,
    db: SessionDep,
) -> SavedListNotificationsBulkResponse:
    service = SavedListService(db)
    updated = await service.set_notifications_for_user(
        session_state.user.id,
        notify=payload.notify_on_price_drop,
    )
    return SavedListNotificationsBulkResponse.from_iterable(updated)


@router.post("/{list_id}/notifications", response_model=SavedListNotificationResponse)
async def update_saved_list_notifications(
    list_id: str,
    payload: SavedListNotificationRequest,
    session_state: SessionStateDep,
    db: SessionDep,
) -> SavedListNotificationResponse:
    service = SavedListService(db)
    saved_list = await service.get_for_user(list_id, session_state.user.id)
    if saved_list is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="list not found")

    updated = await service.set_notifications(
        saved_list,
        notify=payload.notify_on_price_drop,
    )
    return SavedListNotificationResponse.from_model(updated)
