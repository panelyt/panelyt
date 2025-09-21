from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class RawProduct:
    id: int
    kind: str
    name: str
    slug: str
    price_now_grosz: int
    price_min30_grosz: int
    currency: str
    is_available: bool
    biomarkers: Sequence[RawBiomarker]
    sale_price_grosz: int | None
    regular_price_grosz: int | None


@dataclass(slots=True)
class RawBiomarker:
    elab_code: str | None
    slug: str | None
    name: str


@dataclass(slots=True)
class IngestionResult:
    fetched_at: datetime
    items: list[RawProduct]
    raw_payload: dict[str, object]
    source: str
