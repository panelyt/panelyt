from __future__ import annotations

from collections.abc import Iterable, Sequence

from panelyt_api.optimization.context import CandidateItem

MAX_PACKAGE_VARIANTS_PER_COVERAGE = 2
MAX_SINGLE_VARIANTS_PER_TOKEN = 2


def prune_candidates(candidates: Iterable[CandidateItem]) -> list[CandidateItem]:
    items = list(candidates)
    if not items:
        return []

    allowed_single_ids = select_single_variants(items)
    filtered = [
        item
        for item in items
        if not should_skip_single_candidate(item, allowed_single_ids)
    ]
    return remove_dominated_candidates(filtered)


def select_single_variants(items: Sequence[CandidateItem]) -> set[int]:
    """Keep only the cheapest few singles per token."""
    cheapest: dict[str, list[CandidateItem]] = {}
    for item in items:
        if item.kind != "single" or len(item.coverage) != 1:
            continue
        token = next(iter(item.coverage))
        bucket = cheapest.setdefault(token, [])
        bucket.append(item)

    allowed: set[int] = set()
    for bucket in cheapest.values():
        bucket.sort(
            key=lambda candidate: (
                candidate.price_now,
                candidate.price_min30,
                candidate.id,
            )
        )
        for candidate in bucket[:MAX_SINGLE_VARIANTS_PER_TOKEN]:
            allowed.add(candidate.id)
    return allowed


def should_skip_single_candidate(
    item: CandidateItem, allowed_single_ids: set[int]
) -> bool:
    if item.kind != "single" or len(item.coverage) != 1:
        return False
    return item.id not in allowed_single_ids


def remove_dominated_candidates(items: Sequence[CandidateItem]) -> list[CandidateItem]:
    retained: dict[int, CandidateItem] = {}
    seen_coverages: list[tuple[frozenset[str], int]] = []
    package_variant_counts: dict[frozenset[str], int] = {}
    single_variant_counts: dict[frozenset[str], int] = {}
    ordered = sorted(
        items,
        key=lambda item: (
            -len(item.coverage),
            item.price_now,
            item.price_min30,
            item.id,
        ),
    )

    for candidate in ordered:
        coverage = frozenset(candidate.coverage)
        dominated = any(
            existing_coverage.issuperset(coverage)
            and existing_price <= candidate.price_now
            for existing_coverage, existing_price in seen_coverages
        )
        if dominated and candidate.kind == "single" and not candidate.is_synthetic_package:
            equal_or_cheaper = any(
                existing_coverage == coverage
                and existing_price <= candidate.price_now
                for existing_coverage, existing_price in seen_coverages
            )
            if equal_or_cheaper:
                variants = single_variant_counts.get(coverage, 0)
                if variants < MAX_SINGLE_VARIANTS_PER_TOKEN:
                    dominated = False
        if dominated and (candidate.kind == "package" or candidate.is_synthetic_package):
            variants = package_variant_counts.get(coverage, 0)
            if variants < MAX_PACKAGE_VARIANTS_PER_COVERAGE:
                dominated = False
        if dominated:
            continue
        retained[candidate.id] = candidate
        seen_coverages.append((coverage, candidate.price_now))
        if candidate.kind == "package" or candidate.is_synthetic_package:
            package_variant_counts[coverage] = package_variant_counts.get(coverage, 0) + 1
        if candidate.kind == "single" and not candidate.is_synthetic_package:
            single_variant_counts[coverage] = single_variant_counts.get(coverage, 0) + 1

    return [item for item in items if item.id in retained]
