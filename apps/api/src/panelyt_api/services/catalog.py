from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core.settings import get_settings
from panelyt_api.db import models
from panelyt_api.schemas.common import BiomarkerOut, BiomarkerSearchResponse, CatalogMeta


async def get_catalog_meta(session: AsyncSession) -> CatalogMeta:
    item_count = (await session.scalar(select(func.count()).select_from(models.Item))) or 0
    biomarker_count = (
        await session.scalar(select(func.count()).select_from(models.Biomarker))
    ) or 0
    latest_fetched_at = await session.scalar(select(func.max(models.Item.fetched_at)))

    settings = get_settings()
    tz = ZoneInfo(settings.timezone)
    today = datetime.now(tz=tz).date()
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


async def search_biomarkers(
    session: AsyncSession, query: str, limit: int = 10
) -> BiomarkerSearchResponse:
    normalized = query.strip().lower()
    if not normalized:
        return BiomarkerSearchResponse(results=[])

    like_pattern = f"%{normalized}%"
    statement = (
        select(models.Biomarker)
        .where(
            func.lower(models.Biomarker.name).like(like_pattern)
            | func.lower(func.coalesce(models.Biomarker.elab_code, "")).like(like_pattern)
        )
        .order_by(models.Biomarker.name.asc())
        .limit(limit)
    )
    results = (await session.execute(statement)).scalars().all()
    payload = [
        BiomarkerOut(id=row.id, name=row.name, elab_code=row.elab_code, slug=row.slug)
        for row in results
    ]
    return BiomarkerSearchResponse(results=payload)
