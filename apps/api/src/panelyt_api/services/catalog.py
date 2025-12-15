from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core.cache import catalog_meta_cache
from panelyt_api.db import models
from panelyt_api.schemas.common import (
    BiomarkerOut,
    BiomarkerSearchResponse,
    CatalogBiomarkerResult,
    CatalogMeta,
    CatalogSearchResponse,
    CatalogTemplateResult,
)
from panelyt_api.services.list_templates import BiomarkerListTemplateService
from panelyt_api.utils.normalization import normalize_search_query


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
    session: AsyncSession, query: str, limit: int = 10
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
    lab_price_map = await _fetch_lab_prices(session, [row.id for row in results])
    payload = []
    for row in results:
        prices = lab_price_map.get(row.id)
        if not prices:
            continue
        payload.append(
            BiomarkerOut(
                id=row.id,
                name=row.name,
                elab_code=row.elab_code,
                slug=row.slug,
                lab_prices=prices,
            )
        )
    return BiomarkerSearchResponse(results=payload)


async def search_catalog(
    session: AsyncSession, query: str, *, biomarker_limit: int = 10, template_limit: int = 5
) -> CatalogSearchResponse:
    """Search biomarkers and curated templates for a given query."""

    biomarker_response = await search_biomarkers(session, query, limit=biomarker_limit)

    template_service = BiomarkerListTemplateService(session)
    template_matches = await template_service.search_active_matches(query, limit=template_limit)

    biomarker_results = [
        CatalogBiomarkerResult(
            id=item.id,
            name=item.name,
            elab_code=item.elab_code,
            slug=item.slug,
            lab_prices=item.lab_prices,
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


async def _fetch_lab_prices(
    session: AsyncSession, biomarker_ids: Sequence[int]
) -> dict[int, dict[str, int]]:
    if not biomarker_ids:
        return {}

    statement = (
        select(
            models.ItemBiomarker.biomarker_id,
            models.Lab.code,
            func.min(models.Item.price_now_grosz).label("min_price"),
        )
        .join(models.Item, models.Item.id == models.ItemBiomarker.item_id)
        .join(models.Lab, models.Lab.id == models.Item.lab_id)
        .where(models.ItemBiomarker.biomarker_id.in_(biomarker_ids))
        .where(models.Item.is_available.is_(True))
        .where(models.Item.price_now_grosz > 0)
        .group_by(models.ItemBiomarker.biomarker_id, models.Lab.code)
    )

    rows = await session.execute(statement)
    mapping: dict[int, dict[str, int]] = {}
    for biomarker_id, lab_code, min_price in rows.all():
        mapping.setdefault(int(biomarker_id), {})[str(lab_code)] = int(min_price)
    return mapping
