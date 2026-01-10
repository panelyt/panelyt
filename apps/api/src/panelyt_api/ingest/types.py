from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(slots=True)
class RawDiagBiomarker:
    external_id: str
    name: str
    elab_code: str | None
    slug: str | None
    metadata: Mapping[str, Any] | None = None


@dataclass(slots=True)
class RawDiagItem:
    external_id: str
    kind: str
    name: str
    slug: str | None
    price_now_grosz: int
    price_min30_grosz: int
    currency: str
    is_available: bool
    biomarkers: Sequence[RawDiagBiomarker] = field(default_factory=list)
    sale_price_grosz: int | None = None
    regular_price_grosz: int | None = None
    metadata: Mapping[str, Any] | None = None


@dataclass(slots=True)
class DiagIngestionResult:
    fetched_at: datetime
    items: list[RawDiagItem]
    raw_payload: Mapping[str, Any]
