from __future__ import annotations

from pydantic import BaseModel, Field

from panelyt_api.schemas.common import APIModel, ItemOut


class OptimizeRequest(BaseModel):
    biomarkers: list[str]


class AddonSuggestionsRequest(BaseModel):
    """Request for computing addon suggestions separately from optimization."""

    biomarkers: list[str]
    selected_item_ids: list[int]


class AddonBiomarker(APIModel):
    code: str
    display_name: str


class AddonSuggestion(APIModel):
    package: ItemOut
    upgrade_cost_grosz: int
    upgrade_cost: float
    estimated_total_now_grosz: int
    estimated_total_now: float
    covers: list[AddonBiomarker] = Field(default_factory=list)
    adds: list[AddonBiomarker] = Field(default_factory=list)
    removes: list[AddonBiomarker] = Field(default_factory=list)
    keeps: list[AddonBiomarker] = Field(default_factory=list)


class OptimizeResponse(APIModel):
    total_now: float
    total_min30: float
    currency: str = "PLN"
    items: list[ItemOut]
    bonus_total_now: float = 0.0
    explain: dict[str, list[str]]
    uncovered: list[str]
    labels: dict[str, str] = Field(default_factory=dict)
    addon_suggestions: list[AddonSuggestion] = Field(default_factory=list)


class AddonSuggestionsResponse(APIModel):
    """Response for the addon suggestions endpoint."""

    addon_suggestions: list[AddonSuggestion] = Field(default_factory=list)
    labels: dict[str, str] = Field(default_factory=dict)
