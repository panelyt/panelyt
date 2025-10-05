from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(slots=True)
class RawLabBiomarker:
    external_id: str
    name: str
    elab_code: str | None
    slug: str | None
    metadata: Mapping[str, Any] | None = None


@dataclass(slots=True)
class RawLabItem:
    external_id: str
    kind: str
    name: str
    slug: str | None
    price_now_grosz: int
    price_min30_grosz: int
    currency: str
    is_available: bool
    biomarkers: Sequence[RawLabBiomarker] = field(default_factory=list)
    sale_price_grosz: int | None = None
    regular_price_grosz: int | None = None
    metadata: Mapping[str, Any] | None = None


@dataclass(slots=True)
class LabIngestionResult:
    lab_code: str
    fetched_at: datetime
    items: list[RawLabItem]
    raw_payload: Mapping[str, Any]
