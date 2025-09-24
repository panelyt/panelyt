from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from panelyt_api.api.deps import SessionDep, SessionStateDep
from panelyt_api.schemas.saved_lists import (
    SavedListCollectionResponse,
    SavedListEntryPayload,
    SavedListResponse,
    SavedListUpsert,
)
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
    try:
        saved = await service.create_list(
            user_id=session_state.user.id,
            name=payload.name,
            entries=[_to_entry_data(entry) for entry in payload.biomarkers],
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
