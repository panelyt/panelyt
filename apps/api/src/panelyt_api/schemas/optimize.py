from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, model_validator

from panelyt_api.schemas.common import APIModel, ItemOut


class OptimizeMode(str, Enum):
    AUTO = "auto"
    SINGLE_LAB = "single_lab"
    SPLIT = "split"


class OptimizeRequest(BaseModel):
    biomarkers: list[str]
    mode: OptimizeMode = OptimizeMode.AUTO
    lab_code: str | None = None

    @model_validator(mode="after")
    def _validate_lab_code(self) -> OptimizeRequest:
        if self.mode == OptimizeMode.SINGLE_LAB and not (self.lab_code or "").strip():
            msg = "lab_code is required when mode is single_lab"
            raise ValueError(msg)
        if self.lab_code:
            self.lab_code = self.lab_code.strip()
        return self


class OptimizeCompareRequest(BaseModel):
    biomarkers: list[str]


class AddonSuggestionsRequest(BaseModel):
    """Request for computing addon suggestions separately from optimization."""

    biomarkers: list[str]
    selected_item_ids: list[int]
    lab_code: str | None = None


class LabAvailability(APIModel):
    code: str
    name: str
    covers_all: bool
    missing_tokens: list[str] = Field(default_factory=list)


class LabSelectionSummary(APIModel):
    code: str
    name: str
    total_now_grosz: int
    items: int


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
    lab_code: str = ""
    lab_name: str = ""
    exclusive: dict[str, str] = Field(default_factory=dict)
    labels: dict[str, str] = Field(default_factory=dict)
    mode: OptimizeMode = OptimizeMode.AUTO
    lab_options: list[LabAvailability] = Field(default_factory=list)
    lab_selections: list[LabSelectionSummary] = Field(default_factory=list)
    addon_suggestions: list[AddonSuggestion] = Field(default_factory=list)


class OptimizeCompareResponse(APIModel):
    auto: OptimizeResponse
    split: OptimizeResponse
    by_lab: dict[str, OptimizeResponse] = Field(default_factory=dict)
    lab_options: list[LabAvailability] = Field(default_factory=list)


class AddonSuggestionsResponse(APIModel):
    """Response for the addon suggestions endpoint."""

    addon_suggestions: list[AddonSuggestion] = Field(default_factory=list)
    labels: dict[str, str] = Field(default_factory=dict)
