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


class AddOnSuggestion(APIModel):
    item: ItemOut
    matched_tokens: list[str] = Field(default_factory=list)
    bonus_tokens: list[str] = Field(default_factory=list)
    already_included_tokens: list[str] = Field(default_factory=list)
    incremental_now: float
    incremental_now_grosz: int


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
    add_on_suggestions: list[AddOnSuggestion] = Field(default_factory=list)
