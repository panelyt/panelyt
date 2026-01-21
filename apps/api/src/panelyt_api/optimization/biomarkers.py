from __future__ import annotations

from collections.abc import Mapping, Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db import models
from panelyt_api.optimization.context import CandidateItem, ResolvedBiomarker
from panelyt_api.optimization.synthetic_packages import (
    SyntheticPackage,
    load_diag_synthetic_packages,
)
from panelyt_api.utils.normalization import (
    create_normalized_lookup,
    normalize_token,
    normalize_tokens_set,
)


def token_display_map(resolved: Sequence[ResolvedBiomarker]) -> dict[str, str]:
    return {
        biomarker.token: biomarker.display_name or biomarker.token
        for biomarker in resolved
    }


def apply_synthetic_coverage_overrides(
    items: Sequence[CandidateItem],
    biomarkers_by_item: dict[int, list[str]],
) -> None:
    for item in items:
        if not item.is_synthetic_package:
            continue
        if not item.coverage:
            continue
        biomarkers_by_item[item.id] = sorted(item.coverage)


def expand_synthetic_panel_biomarkers(
    biomarkers_by_item: dict[int, list[str]],
) -> None:
    synthetic_packages = load_diag_synthetic_packages()
    if not synthetic_packages or not biomarkers_by_item:
        return

    panel_components = panel_components_by_code(synthetic_packages)
    if not panel_components:
        return

    for item_id, tokens in list(biomarkers_by_item.items()):
        if not tokens:
            continue
        expanded: list[str] = []
        seen = set()
        for token in tokens:
            normalized = normalize_token(token)
            components = panel_components.get(normalized or "")
            if components:
                for component in components:
                    if component in seen:
                        continue
                    expanded.append(component)
                    seen.add(component)
            else:
                if token in seen:
                    continue
                expanded.append(token)
                seen.add(token)
        biomarkers_by_item[item_id] = expanded


def panel_components_by_code(
    synthetic_packages: Sequence[SyntheticPackage],
) -> dict[str, tuple[str, ...]]:
    panel_components: dict[str, tuple[str, ...]] = {}
    for mapping in synthetic_packages:
        panel_code = mapping.panel_elab_code
        if not panel_code or not mapping.component_elab_codes:
            continue
        normalized_panel = normalize_token(panel_code)
        if not normalized_panel:
            continue
        panel_components[normalized_panel] = mapping.component_elab_codes
    return panel_components


def expand_requested_tokens(requested_tokens: Sequence[str]) -> set[str]:
    if not requested_tokens:
        return set()

    synthetic_packages = load_diag_synthetic_packages()
    if not synthetic_packages:
        return normalize_tokens_set(list(requested_tokens))

    panel_components = panel_components_by_code(synthetic_packages)
    if not panel_components:
        return normalize_tokens_set(list(requested_tokens))

    expanded: list[str] = []
    for token in requested_tokens:
        normalized = normalize_token(token)
        components = panel_components.get(normalized or "")
        if components:
            expanded.extend(components)
        else:
            expanded.append(token)
    return normalize_tokens_set(expanded)


def expand_requested_tokens_raw(requested_tokens: Sequence[str]) -> set[str]:
    if not requested_tokens:
        return set()

    synthetic_packages = load_diag_synthetic_packages()
    if not synthetic_packages:
        return set(requested_tokens)

    panel_components = panel_components_by_code(synthetic_packages)
    if not panel_components:
        return set(requested_tokens)

    expanded: list[str] = []
    for token in requested_tokens:
        normalized = normalize_token(token)
        components = panel_components.get(normalized or "")
        if components:
            expanded.extend(components)
        else:
            expanded.append(token)
    return set(expanded)


async def augment_labels_for_tokens(
    session: AsyncSession,
    tokens: set[str],
    labels: dict[str, str],
) -> None:
    missing = {token for token in tokens if token and token not in labels}
    if not missing:
        return
    statement = (
        select(
            models.Biomarker.elab_code,
            models.Biomarker.slug,
            models.Biomarker.name,
        )
        .where(
            or_(
                models.Biomarker.elab_code.in_(missing),
                models.Biomarker.slug.in_(missing),
                models.Biomarker.name.in_(missing),
            )
        )
    )
    rows = (await session.execute(statement)).all()
    for elab_code, slug, name in rows:
        display_name = (name or "").strip()
        if not display_name:
            continue
        for candidate in (elab_code, slug, name):
            if candidate and candidate in missing:
                labels.setdefault(candidate, display_name)


async def get_all_biomarkers_for_items(
    session: AsyncSession, item_ids: list[int]
) -> tuple[dict[int, list[str]], dict[str, str]]:
    """Fetch biomarkers for items and provide display labels."""
    if not item_ids:
        return {}, {}

    statement = (
        select(
            models.ItemBiomarker.item_id,
            models.Biomarker.elab_code,
            models.Biomarker.slug,
            models.Biomarker.name,
        )
        .join(models.Biomarker, models.Biomarker.id == models.ItemBiomarker.biomarker_id)
        .where(models.ItemBiomarker.item_id.in_(item_ids))
    )

    rows = (await session.execute(statement)).all()
    result: dict[int, list[str]] = {}
    labels: dict[str, str] = {}
    for item_id, elab_code, slug, name in rows:
        token = elab_code or slug or name
        if not token:
            continue
        display_name = (name or "").strip()
        if display_name:
            labels.setdefault(token, display_name)
        result.setdefault(item_id, []).append(token)

    return result, labels


async def bonus_price_map(
    session: AsyncSession, tokens: Mapping[str, str], institution_id: int
) -> dict[str, int]:
    """Return the best-known single-test price (in grosz) for each normalized token."""
    if not tokens:
        return {}

    normalized_lookup = create_normalized_lookup(tokens)
    raw_tokens = {value.strip() for value in tokens.values() if value.strip()}
    if not raw_tokens or not normalized_lookup:
        return {}

    statement = (
        select(
            models.Biomarker.elab_code,
            models.Biomarker.slug,
            models.Biomarker.name,
            func.min(models.InstitutionItem.price_now_grosz).label("min_price"),
        )
        .select_from(models.Biomarker)
        .join(models.ItemBiomarker, models.ItemBiomarker.biomarker_id == models.Biomarker.id)
        .join(models.Item, models.Item.id == models.ItemBiomarker.item_id)
        .join(
            models.InstitutionItem,
            (models.InstitutionItem.item_id == models.Item.id)
            & (models.InstitutionItem.institution_id == institution_id),
        )
        .where(models.Item.kind == "single")
        .where(models.InstitutionItem.is_available.is_(True))
        .where(models.InstitutionItem.price_now_grosz > 0)
        .where(
            or_(
                models.Biomarker.elab_code.in_(raw_tokens),
                models.Biomarker.slug.in_(raw_tokens),
                models.Biomarker.name.in_(raw_tokens),
            )
        )
        .group_by(
            models.Biomarker.id,
            models.Biomarker.elab_code,
            models.Biomarker.slug,
            models.Biomarker.name,
        )
    )

    rows = (await session.execute(statement)).all()
    price_map: dict[str, int] = {}

    for elab_code, slug, name, min_price in rows:
        for candidate in (elab_code, slug, name):
            if not candidate:
                continue
            normalized = normalize_token(candidate)
            key = normalized_lookup.get(normalized) if normalized else None
            if key is None:
                continue
            price_value = int(min_price or 0)
            existing = price_map.get(key)
            if existing is None or price_value < existing:
                price_map[key] = price_value
            break

    return price_map
