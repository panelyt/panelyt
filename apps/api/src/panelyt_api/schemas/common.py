from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class BiomarkerOut(APIModel):
    id: int
    name: str
    elab_code: str | None = None
    slug: str | None = None
    price_now_grosz: int | None = None


class ItemOut(APIModel):
    id: int
    kind: str
    name: str
    slug: str
    price_now_grosz: int
    price_min30_grosz: int
    currency: str = "PLN"
    biomarkers: list[str]
    url: str
    on_sale: bool
    is_synthetic_package: bool = False


class CatalogMeta(APIModel):
    item_count: int
    biomarker_count: int
    latest_fetched_at: datetime | None
    snapshot_days_covered: int
    percent_with_today_snapshot: float


class BiomarkerSearchResponse(APIModel):
    results: list[BiomarkerOut]


class BiomarkerBatchRequest(APIModel):
    codes: list[str] = Field(min_length=1, max_length=200)


class BiomarkerBatchResponse(APIModel):
    results: dict[str, BiomarkerOut | None] = Field(default_factory=dict)


class CatalogBiomarkerResult(APIModel):
    type: Literal["biomarker"] = "biomarker"
    id: int
    name: str
    elab_code: str | None = None
    slug: str | None = None
    price_now_grosz: int | None = None


class CatalogTemplateResult(APIModel):
    type: Literal["template"] = "template"
    id: int
    slug: str
    name_en: str
    name_pl: str
    description_en: str | None = None
    description_pl: str | None = None
    biomarker_count: int


class CatalogSearchResponse(APIModel):
    results: list[CatalogBiomarkerResult | CatalogTemplateResult]
