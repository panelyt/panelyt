from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator

from panelyt_api.db.models import SavedList


class SavedListEntryPayload(BaseModel):
    code: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=1, max_length=255)

    @field_validator("code")
    @classmethod
    def _normalize_code(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("code cannot be blank")
        return normalized

    @field_validator("name")
    @classmethod
    def _normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("name cannot be blank")
        return normalized


class SavedListUpsert(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    biomarkers: list[SavedListEntryPayload] = Field(default_factory=list, max_length=100)

    @field_validator("name")
    @classmethod
    def _normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("name cannot be blank")
        return normalized


class SavedListEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    display_name: str
    sort_order: int
    biomarker_id: int | None
    created_at: datetime


class SavedListResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
    biomarkers: list[SavedListEntryResponse]

    @classmethod
    def from_model(cls, model: SavedList) -> Self:
        sorted_entries = sorted(model.entries, key=lambda entry: entry.sort_order)
        return cls(
            id=model.id,
            name=model.name,
            created_at=model.created_at,
            updated_at=model.updated_at,
            biomarkers=[SavedListEntryResponse.model_validate(entry) for entry in sorted_entries],
        )


class SavedListCollectionResponse(BaseModel):
    lists: list[SavedListResponse]

    @classmethod
    def from_iterable(cls, lists: Iterable[SavedList]) -> Self:
        return cls(lists=[SavedListResponse.from_model(item) for item in lists])


__all__ = [
    "SavedListCollectionResponse",
    "SavedListEntryPayload",
    "SavedListEntryResponse",
    "SavedListResponse",
    "SavedListUpsert",
]
