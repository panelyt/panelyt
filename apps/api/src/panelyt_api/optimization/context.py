"""Dataclasses for optimization service.

Separated from service.py to avoid circular imports with cache module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from panelyt_api.schemas.optimize import OptimizeResponse


@dataclass(slots=True)
class ResolvedBiomarker:
    id: int
    token: str
    display_name: str
    original: str


@dataclass(slots=True)
class CandidateItem:
    id: int
    kind: str
    name: str
    slug: str
    external_id: str
    lab_id: int
    lab_code: str
    lab_name: str
    single_url_template: str | None
    package_url_template: str | None
    price_now: int
    price_min30: int
    sale_price: int | None
    regular_price: int | None
    coverage: set[str] = field(default_factory=set)

    @property
    def on_sale(self) -> bool:
        if self.sale_price is None or self.regular_price is None:
            return False
        return self.sale_price < self.regular_price


@dataclass(slots=True)
class NormalizedBiomarkerInput:
    raw: str
    normalized: str


@dataclass(slots=True)
class OptimizationContext:
    resolved: list[ResolvedBiomarker]
    unresolved_inputs: list[str]
    grouped_candidates: dict[int, list[CandidateItem]]
    availability_map: dict[str, set[int]]
    token_to_original: dict[str, str]
    lab_index: dict[str, int]


@dataclass(slots=True)
class LabSolution:
    lab_id: int
    total_now_grosz: int
    response: OptimizeResponse
    chosen_items: list[CandidateItem]


@dataclass(slots=True)
class MultiLabSolution:
    total_now_grosz: int
    response: OptimizeResponse
    chosen_items: list[CandidateItem]


@dataclass(slots=True)
class LabSelectionAccumulator:
    code: str
    name: str
    total_now_grosz: int = 0
    items: int = 0


@dataclass(slots=True)
class SolverOutcome:
    response: OptimizeResponse
    chosen_items: list[CandidateItem]
    uncovered_tokens: set[str]
    total_now_grosz: int
    labels: dict[str, str]

    @property
    def has_selection(self) -> bool:
        return bool(self.chosen_items)


@dataclass(slots=True)
class AddonComputation:
    candidate: CandidateItem
    covered_tokens: set[str]
    drop_cost_grosz: int
    readd_cost_grosz: int
    estimated_total_grosz: int
    dropped_item_ids: set[int]
