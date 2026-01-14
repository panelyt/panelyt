from __future__ import annotations

from pydantic import Field

from panelyt_api.schemas.common import APIModel


class InstitutionOut(APIModel):
    id: int
    name: str
    city: str | None = None
    address: str | None = None
    slug: str | None = None
    city_slug: str | None = None


class InstitutionSearchResponse(APIModel):
    results: list[InstitutionOut] = Field(default_factory=list)
