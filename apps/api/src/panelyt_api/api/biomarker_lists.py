from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from panelyt_api.api.deps import AdminSessionDep, SessionDep
from panelyt_api.schemas.biomarker_lists import (
    BiomarkerListTemplateCollectionResponse,
    BiomarkerListTemplateResponse,
    BiomarkerListTemplateUpsert,
    BiomarkerTemplateEntryPayload,
)
from panelyt_api.schemas.saved_lists import SavedListResponse
from panelyt_api.services.list_templates import (
    BiomarkerListTemplateService,
    TemplateEntryData,
)
from panelyt_api.services.saved_lists import SavedListService

router = APIRouter(prefix="/biomarker-lists", tags=["biomarker-lists"])
admin_router = APIRouter(prefix="/biomarker-lists/admin", tags=["biomarker-lists-admin"])


def _to_entry_data(payload: BiomarkerTemplateEntryPayload) -> TemplateEntryData:
    return TemplateEntryData(
        code=payload.code,
        display_name=payload.display_name,
        notes=payload.notes,
    )


@router.get("/templates", response_model=BiomarkerListTemplateCollectionResponse)
async def list_templates(db: SessionDep) -> BiomarkerListTemplateCollectionResponse:
    service = BiomarkerListTemplateService(db)
    templates = await service.list_active()
    return BiomarkerListTemplateCollectionResponse.from_iterable(templates)


@router.get("/templates/{slug}", response_model=BiomarkerListTemplateResponse)
async def get_template(slug: str, db: SessionDep) -> BiomarkerListTemplateResponse:
    service = BiomarkerListTemplateService(db)
    template = await service.get_active_by_slug(slug)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    return BiomarkerListTemplateResponse.from_model(template)


@router.get("/shared/{share_token}", response_model=SavedListResponse)
async def get_shared_list(share_token: str, db: SessionDep) -> SavedListResponse:
    service = SavedListService(db)
    saved_list = await service.get_shared(share_token)
    if saved_list is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="shared list not found")
    return SavedListResponse.from_model(saved_list)


@admin_router.get("/templates", response_model=BiomarkerListTemplateCollectionResponse)
async def admin_list_templates(
    _session_state: AdminSessionDep,
    db: SessionDep,
) -> BiomarkerListTemplateCollectionResponse:
    service = BiomarkerListTemplateService(db)
    templates = await service.list_all()
    return BiomarkerListTemplateCollectionResponse.from_iterable(templates)


@admin_router.get("/templates/{slug}", response_model=BiomarkerListTemplateResponse)
async def admin_get_template(
    slug: str,
    _session_state: AdminSessionDep,
    db: SessionDep,
) -> BiomarkerListTemplateResponse:
    service = BiomarkerListTemplateService(db)
    template = await service.get_by_slug(slug)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    return BiomarkerListTemplateResponse.from_model(template)


@admin_router.post(
    "/templates",
    response_model=BiomarkerListTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_template(
    payload: BiomarkerListTemplateUpsert,
    _session_state: AdminSessionDep,
    db: SessionDep,
) -> BiomarkerListTemplateResponse:
    service = BiomarkerListTemplateService(db)
    try:
        template = await service.create_template(
            slug=payload.slug,
            name_en=payload.name_en,
            name_pl=payload.name_pl,
            description_en=payload.description_en,
            description_pl=payload.description_pl,
            is_active=payload.is_active,
            entries=[_to_entry_data(entry) for entry in payload.biomarkers],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return BiomarkerListTemplateResponse.from_model(template)


@admin_router.put("/templates/{slug}", response_model=BiomarkerListTemplateResponse)
async def update_template(
    slug: str,
    payload: BiomarkerListTemplateUpsert,
    _session_state: AdminSessionDep,
    db: SessionDep,
) -> BiomarkerListTemplateResponse:
    service = BiomarkerListTemplateService(db)
    template = await service.get_by_slug(slug)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    try:
        updated = await service.update_template(
            template,
            slug=payload.slug,
            name_en=payload.name_en,
            name_pl=payload.name_pl,
            description_en=payload.description_en,
            description_pl=payload.description_pl,
            is_active=payload.is_active,
            entries=[_to_entry_data(entry) for entry in payload.biomarkers],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return BiomarkerListTemplateResponse.from_model(updated)


@admin_router.delete("/templates/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    slug: str,
    _session_state: AdminSessionDep,
    db: SessionDep,
) -> None:
    service = BiomarkerListTemplateService(db)
    template = await service.get_by_slug(slug)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")
    await service.delete_template(template)
