from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field

from panelyt_api.db.models import Biomarker, BiomarkerListTemplate, BiomarkerListTemplateEntry


class BiomarkerReference(BaseModel):
    id: int
    name: str
    elab_code: str | None
    slug: str | None

    @classmethod
    def from_model(cls, model: Biomarker) -> Self:
        return cls(id=model.id, name=model.name, elab_code=model.elab_code, slug=model.slug)


class BiomarkerListEntry(BaseModel):
    id: int
    code: str
    display_name: str
    sort_order: int
    biomarker: BiomarkerReference | None
    notes: str | None

    @classmethod
    def from_model(cls, model: BiomarkerListTemplateEntry) -> Self:
        reference = None
        if model.biomarker is not None:
            reference = BiomarkerReference.from_model(model.biomarker)
        return cls(
            id=model.id,
            code=model.code,
            display_name=model.display_name,
            sort_order=model.sort_order,
            biomarker=reference,
            notes=model.notes,
        )


class BiomarkerListTemplateResponse(BaseModel):
    id: int
    slug: str
    name_en: str
    name_pl: str
    description_en: str | None
    description_pl: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    biomarkers: list[BiomarkerListEntry]

    @classmethod
    def from_model(cls, model: BiomarkerListTemplate) -> Self:
        return cls(
            id=model.id,
            slug=model.slug,
            name_en=model.name_en,
            name_pl=model.name_pl,
            description_en=model.description_en,
            description_pl=model.description_pl,
            is_active=model.is_active,
            created_at=model.created_at,
            updated_at=model.updated_at,
            biomarkers=[BiomarkerListEntry.from_model(entry) for entry in model.entries],
        )


class BiomarkerListTemplateCollectionResponse(BaseModel):
    templates: list[BiomarkerListTemplateResponse]

    @classmethod
    def from_iterable(
        cls, templates: Iterable[BiomarkerListTemplate]
    ) -> Self:
        return cls(
            templates=[BiomarkerListTemplateResponse.from_model(item) for item in templates]
        )


class BiomarkerTemplateEntryPayload(BaseModel):
    code: str = Field(..., min_length=1, max_length=128)
    display_name: str = Field(..., min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=1024)


class BiomarkerListTemplateUpsert(BaseModel):
    slug: str = Field(..., min_length=1, max_length=128)
    name_en: str = Field(..., min_length=1, max_length=128)
    name_pl: str = Field(..., min_length=1, max_length=128)
    description_en: str | None = Field(default=None, max_length=512)
    description_pl: str | None = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)
    biomarkers: list[BiomarkerTemplateEntryPayload] = Field(default_factory=list, max_length=200)


__all__ = [
    "BiomarkerListEntry",
    "BiomarkerListTemplateCollectionResponse",
    "BiomarkerListTemplateResponse",
    "BiomarkerListTemplateUpsert",
    "BiomarkerReference",
    "BiomarkerTemplateEntryPayload",
]
