from __future__ import annotations

from pydantic import BaseModel, Field

from panelyt_api.schemas.common import APIModel, ItemOut


class OptimizeRequest(BaseModel):
    biomarkers: list[str]


class OptimizeResponse(APIModel):
    total_now: float
    total_min30: float
    currency: str = "PLN"
    items: list[ItemOut]
    explain: dict[str, list[str]]
    uncovered: list[str]
    lab_code: str = ""
    lab_name: str = ""
    exclusive: dict[str, str] = Field(default_factory=dict)
