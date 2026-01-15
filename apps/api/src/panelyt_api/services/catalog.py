from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core.cache import biomarker_batch_cache, catalog_meta_cache
from panelyt_api.db import models
from panelyt_api.schemas.common import (
    BiomarkerBatchResponse,
    BiomarkerOut,
    BiomarkerSearchResponse,
    CatalogBiomarkerResult,
    CatalogMeta,
    CatalogSearchResponse,
    CatalogTemplateResult,
)
from panelyt_api.services.list_templates import BiomarkerListTemplateService
from panelyt_api.utils.normalization import normalize_search_query, normalize_token


async def get_catalog_meta(session: AsyncSession) -> CatalogMeta:
    item_count = (await session.scalar(select(func.count()).select_from(models.Item))) or 0
    biomarker_count = (
        await session.scalar(select(func.count()).select_from(models.Biomarker))
    ) or 0
    latest_fetched_at = await session.scalar(select(func.max(models.Item.fetched_at)))

    today = datetime.now(UTC).date()
    window_start = today - timedelta(days=29)

    snapshot_days_covered = (
        await session.scalar(
            select(func.count(func.distinct(models.PriceSnapshot.snap_date))).where(
                models.PriceSnapshot.snap_date >= window_start
            )
        )
    ) or 0

    items_with_today_snapshot = (
        await session.scalar(
            select(func.count(func.distinct(models.PriceSnapshot.item_id))).where(
                models.PriceSnapshot.snap_date == today
            )
        )
    ) or 0

    percent_with_today_snapshot = (
        (items_with_today_snapshot / item_count * 100) if item_count else 0.0
    )

    return CatalogMeta(
        item_count=item_count,
        biomarker_count=biomarker_count,
        latest_fetched_at=latest_fetched_at,
        snapshot_days_covered=int(snapshot_days_covered),
        percent_with_today_snapshot=percent_with_today_snapshot,
    )


async def get_catalog_meta_cached(session: AsyncSession) -> CatalogMeta:
    """Get catalog metadata with caching.

    Returns cached value if available and not expired (5 min TTL).
    Falls back to database query on cache miss.
    """
    cached = catalog_meta_cache.get()
    if cached is not None:
        return cached

    meta = await get_catalog_meta(session)
    catalog_meta_cache.set(meta)
    return meta


async def search_biomarkers(
    session: AsyncSession, query: str, institution_id: int, limit: int = 10
) -> BiomarkerSearchResponse:
    normalized = normalize_search_query(query)
    if not normalized:
        return BiomarkerSearchResponse(results=[])

    contains_pattern = f"%{normalized}%"
    prefix_pattern = f"{normalized}%"

    elab_lower = func.lower(func.coalesce(models.Biomarker.elab_code, ""))
    slug_lower = func.lower(func.coalesce(models.Biomarker.slug, ""))
    name_lower = func.lower(models.Biomarker.name)
    alias_lower = func.lower(func.coalesce(models.BiomarkerAlias.alias, ""))

    match_rank = case(
        (elab_lower == normalized, 0),
        (slug_lower == normalized, 1),
        (name_lower == normalized, 2),
        (alias_lower == normalized, 3),
        (elab_lower.like(prefix_pattern), 4),
        (slug_lower.like(prefix_pattern), 5),
        (alias_lower.like(prefix_pattern), 6),
        (name_lower.like(prefix_pattern), 7),
        (elab_lower.like(contains_pattern), 8),
        (slug_lower.like(contains_pattern), 9),
        (alias_lower.like(contains_pattern), 10),
        (name_lower.like(contains_pattern), 11),
        else_=100,
    ).label("match_rank")

    statement = (
        select(models.Biomarker, func.min(match_rank).label("best_rank"))
        .outerjoin(models.BiomarkerAlias)
        .where(
            or_(
                name_lower.like(contains_pattern),
                elab_lower.like(contains_pattern),
                slug_lower.like(contains_pattern),
                alias_lower.like(contains_pattern),
            )
        )
        .group_by(models.Biomarker.id)
        .having(func.min(match_rank) < 100)
        .order_by(
            func.min(match_rank),
            models.Biomarker.id.asc(),
            models.Biomarker.name.asc(),
        )
        .limit(limit)
    )

    rows = (await session.execute(statement)).all()
    results = [row[0] for row in rows]
    price_map = await _fetch_prices(session, [row.id for row in results], institution_id)
    payload = []
    for row in results:
        price_now = price_map.get(row.id)
        if price_now is None:
            continue
        payload.append(
            BiomarkerOut(
                id=row.id,
                name=row.name,
                elab_code=row.elab_code,
                slug=row.slug,
                price_now_grosz=price_now,
            )
        )
    return BiomarkerSearchResponse(results=payload)


async def resolve_biomarkers_by_codes(
    session: AsyncSession,
    codes: list[str],
    institution_id: int,
) -> BiomarkerBatchResponse:
    results: dict[str, BiomarkerOut | None] = {code: None for code in codes}
    normalized_codes = {normalize_token(code) for code in codes}
    normalized_codes.discard(None)
    if not normalized_codes:
        return BiomarkerBatchResponse(results=results)

    cache_key = biomarker_batch_cache.make_key(normalized_codes, institution_id)
    cached = biomarker_batch_cache.get(cache_key)
    if cached is not None:
        for code in codes:
            normalized = normalize_token(code)
            if not normalized:
                continue
            results[code] = cached.get(normalized)
        return BiomarkerBatchResponse(results=results)

    elab_lower = func.lower(func.coalesce(models.Biomarker.elab_code, ""))
    slug_lower = func.lower(func.coalesce(models.Biomarker.slug, ""))
    name_lower = func.lower(models.Biomarker.name)
    alias_lower = func.lower(func.coalesce(models.BiomarkerAlias.alias, ""))

    statement = (
        select(models.Biomarker, models.BiomarkerAlias)
        .outerjoin(models.BiomarkerAlias)
        .where(
            or_(
                elab_lower.in_(normalized_codes),
                slug_lower.in_(normalized_codes),
                name_lower.in_(normalized_codes),
                alias_lower.in_(normalized_codes),
            )
        )
    )

    rows = (await session.execute(statement)).all()
    biomarkers_by_id: dict[int, models.Biomarker] = {}
    alias_map: dict[str, tuple[int, models.Biomarker]] = {}
    for biomarker, alias in rows:
        biomarkers_by_id[biomarker.id] = biomarker
        if alias and alias.alias:
            normalized_alias = normalize_token(alias.alias)
            if not normalized_alias:
                continue
            existing = alias_map.get(normalized_alias)
            if existing is None or alias.priority < existing[0]:
                alias_map[normalized_alias] = (alias.priority, biomarker)

    by_elab = {
        normalize_token(biomarker.elab_code): biomarker
        for biomarker in biomarkers_by_id.values()
        if normalize_token(biomarker.elab_code)
    }
    by_slug = {
        normalize_token(biomarker.slug): biomarker
        for biomarker in biomarkers_by_id.values()
        if normalize_token(biomarker.slug)
    }
    by_name = {
        normalize_token(biomarker.name): biomarker
        for biomarker in biomarkers_by_id.values()
        if normalize_token(biomarker.name)
    }
    by_alias = {alias: entry[1] for alias, entry in alias_map.items()}

    price_map = await _fetch_prices(
        session,
        [biomarker.id for biomarker in biomarkers_by_id.values()],
        institution_id,
    )

    for code in codes:
        normalized = normalize_token(code)
        if not normalized:
            continue
        match = (
            by_elab.get(normalized)
            or by_slug.get(normalized)
            or by_alias.get(normalized)
            or by_name.get(normalized)
        )
        if not match:
            continue
        price_now = price_map.get(match.id)
        if price_now is None:
            continue
        results[code] = BiomarkerOut(
            id=match.id,
            name=match.name,
            elab_code=match.elab_code,
            slug=match.slug,
            price_now_grosz=price_now,
        )

    normalized_results: dict[str, BiomarkerOut | None] = {}
    for code in codes:
        normalized = normalize_token(code)
        if not normalized:
            continue
        value = results.get(code)
        if normalized not in normalized_results or normalized_results[normalized] is None:
            normalized_results[normalized] = value
    biomarker_batch_cache.set(cache_key, normalized_results)

    return BiomarkerBatchResponse(results=results)


async def search_catalog(
    session: AsyncSession,
    query: str,
    *,
    institution_id: int,
    biomarker_limit: int = 10,
    template_limit: int = 5,
) -> CatalogSearchResponse:
    """Search biomarkers and curated templates for a given query."""

    biomarker_response = await search_biomarkers(
        session, query, institution_id, limit=biomarker_limit
    )

    template_service = BiomarkerListTemplateService(session)
    template_matches = await template_service.search_active_matches(query, limit=template_limit)

    biomarker_results = [
        CatalogBiomarkerResult(
            id=item.id,
            name=item.name,
            elab_code=item.elab_code,
            slug=item.slug,
            price_now_grosz=item.price_now_grosz,
        )
        for item in biomarker_response.results
    ]

    template_results = [
        CatalogTemplateResult(
            id=match.id,
            slug=match.slug,
            name=match.name,
            description=match.description,
            biomarker_count=match.biomarker_count,
        )
        for match in template_matches
    ]

    return CatalogSearchResponse(results=[*biomarker_results, *template_results])


async def _fetch_prices(
    session: AsyncSession, biomarker_ids: Sequence[int], institution_id: int
) -> dict[int, int]:
    if not biomarker_ids:
        return {}

    # Prefer min price among available singles, fallback to min among all available items.
    statement = (
        select(
            models.ItemBiomarker.biomarker_id,
            func.min(models.InstitutionItem.price_now_grosz).label("min_price"),
        )
        .join(models.Item, models.Item.id == models.ItemBiomarker.item_id)
        .join(
            models.InstitutionItem,
            (models.InstitutionItem.item_id == models.Item.id)
            & (models.InstitutionItem.institution_id == institution_id),
        )
        .where(models.ItemBiomarker.biomarker_id.in_(biomarker_ids))
        .where(models.InstitutionItem.is_available.is_(True))
        .where(models.InstitutionItem.price_now_grosz > 0)
        .where(models.Item.kind == "single")
        .group_by(models.ItemBiomarker.biomarker_id)
    )

    rows = await session.execute(statement)
    mapping: dict[int, int] = {
        int(biomarker_id): int(min_price) for biomarker_id, min_price in rows.all()
    }

    remaining_ids = [bid for bid in biomarker_ids if bid not in mapping]
    if not remaining_ids:
        return mapping

    fallback_statement = (
        select(
            models.ItemBiomarker.biomarker_id,
            func.min(models.InstitutionItem.price_now_grosz).label("min_price"),
        )
        .join(models.Item, models.Item.id == models.ItemBiomarker.item_id)
        .join(
            models.InstitutionItem,
            (models.InstitutionItem.item_id == models.Item.id)
            & (models.InstitutionItem.institution_id == institution_id),
        )
        .where(models.ItemBiomarker.biomarker_id.in_(remaining_ids))
        .where(models.InstitutionItem.is_available.is_(True))
        .where(models.InstitutionItem.price_now_grosz > 0)
        .group_by(models.ItemBiomarker.biomarker_id)
    )

    fallback_rows = await session.execute(fallback_statement)
    for biomarker_id, min_price in fallback_rows.all():
        mapping[int(biomarker_id)] = int(min_price)

    return mapping
