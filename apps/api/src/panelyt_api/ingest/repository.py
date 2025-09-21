from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db import models
from panelyt_api.ingest.types import RawBiomarker, RawProduct

RetentionWindow = timedelta(days=35)


class IngestionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def latest_fetched_at(self) -> datetime | None:
        return await self.session.scalar(select(func.max(models.Item.fetched_at)))

    async def latest_snapshot_date(self) -> date | None:
        return await self.session.scalar(select(func.max(models.PriceSnapshot.snap_date)))

    async def create_run_log(self, started_at: datetime, reason: str) -> int:
        stmt = (
            insert(models.IngestionLog)
            .values(started_at=started_at, status='started', note=reason)
            .returning(models.IngestionLog.id)
        )
        return int(await self.session.scalar(stmt))

    async def finalize_run_log(self, log_id: int, status: str, note: str | None = None) -> None:
        values = {
            'finished_at': datetime.now(UTC),
            'status': status,
        }
        if note is not None:
            values['note'] = note
        stmt = (
            update(models.IngestionLog)
            .where(models.IngestionLog.id == log_id)
            .values(**values)
        )
        await self.session.execute(stmt)

    async def upsert_catalog(self, items: Iterable[RawProduct], fetched_at: datetime) -> None:
        items = list(items)
        biomarker_records = self._collect_biomarkers(items)
        await self._upsert_biomarkers(biomarker_records)
        biomarker_lookup = await self._fetch_biomarker_lookup(biomarker_records)

        for product in items:
            await self._upsert_item(product, fetched_at)
            await self._replace_item_biomarkers(product, biomarker_lookup)
            await self._upsert_snapshot(product, fetched_at.date())

    async def write_raw_snapshot(self, source: str, payload: dict[str, object]) -> None:
        stmt = insert(models.RawSnapshot).values(source=source, payload=payload)
        await self.session.execute(stmt)

    async def prune_snapshots(self, reference_date: date) -> None:
        cutoff = reference_date - RetentionWindow
        stmt = delete(models.PriceSnapshot).where(models.PriceSnapshot.snap_date < cutoff)
        await self.session.execute(stmt)

    async def last_user_activity(self) -> datetime | None:
        return await self.session.scalar(
            select(models.AppActivity.occurred_at).where(models.AppActivity.name == "user_touch")
        )

    async def record_user_activity(self, timestamp: datetime) -> None:
        stmt = insert(models.AppActivity).values(name="user_touch", occurred_at=timestamp)
        stmt = stmt.on_conflict_do_update(index_elements=["name"], set_={"occurred_at": timestamp})
        await self.session.execute(stmt)

    def _collect_biomarkers(
        self, items: Iterable[RawProduct]
    ) -> dict[tuple[str | None, str | None], RawBiomarker]:
        lookup: dict[tuple[str | None, str | None], RawBiomarker] = {}
        for item in items:
            for biomarker in item.biomarkers:
                key = _biomarker_key(biomarker)
                if key not in lookup and any(key):
                    lookup[key] = biomarker
        return lookup

    async def _upsert_biomarkers(
        self, lookup: dict[tuple[str | None, str | None], RawBiomarker]
    ) -> None:
        with_codes = [
            {
                "elab_code": biomarker.elab_code,
                "slug": biomarker.slug,
                "name": biomarker.name,
            }
            for (elab_code, _), biomarker in lookup.items()
            if elab_code
        ]
        with_slugs = [
            {
                "elab_code": biomarker.elab_code,
                "slug": biomarker.slug,
                "name": biomarker.name,
            }
            for (_, slug), biomarker in lookup.items()
            if slug and not biomarker.elab_code
        ]

        if with_codes:
            stmt = insert(models.Biomarker).values(with_codes)
            stmt = stmt.on_conflict_do_update(
                index_elements=["elab_code"],
                set_={
                    "name": stmt.excluded.name,
                    "slug": stmt.excluded.slug,
                },
            )
            await self.session.execute(stmt)

        if with_slugs:
            stmt = insert(models.Biomarker).values(with_slugs)
            stmt = stmt.on_conflict_do_update(
                index_elements=["slug"],
                set_={
                    "name": stmt.excluded.name,
                    "elab_code": stmt.excluded.elab_code,
                },
            )
            await self.session.execute(stmt)

    async def _fetch_biomarker_lookup(
        self, lookup: dict[tuple[str | None, str | None], RawBiomarker]
    ) -> dict[tuple[str | None, str | None], int]:
        keys_with_code = [code for code, _ in lookup.keys() if code]
        keys_with_slug = [slug for code, slug in lookup.keys() if slug and not code]
        mapping: dict[tuple[str | None, str | None], int] = {}

        if keys_with_code:
            statement = select(models.Biomarker.id, models.Biomarker.elab_code).where(
                models.Biomarker.elab_code.in_(keys_with_code)
            )
            for biomarker_id, elab_code in (await self.session.execute(statement)).all():
                mapping[(elab_code, None)] = biomarker_id

        if keys_with_slug:
            statement = select(models.Biomarker.id, models.Biomarker.slug).where(
                models.Biomarker.slug.in_(keys_with_slug)
            )
            for biomarker_id, slug in (await self.session.execute(statement)).all():
                mapping[(None, slug)] = biomarker_id

        return mapping

    async def _upsert_item(self, product: RawProduct, fetched_at: datetime) -> None:
        stmt = insert(models.Item).values(
            id=product.id,
            kind=product.kind,
            name=product.name,
            slug=product.slug,
            is_available=product.is_available,
            currency=product.currency,
            price_now_grosz=product.price_now_grosz,
            price_min30_grosz=product.price_min30_grosz,
            sale_price_grosz=product.sale_price_grosz,
            regular_price_grosz=product.regular_price_grosz,
            fetched_at=fetched_at,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "kind": stmt.excluded.kind,
                "name": stmt.excluded.name,
                "slug": stmt.excluded.slug,
                "is_available": stmt.excluded.is_available,
                "currency": stmt.excluded.currency,
                "price_now_grosz": stmt.excluded.price_now_grosz,
                "price_min30_grosz": stmt.excluded.price_min30_grosz,
                "sale_price_grosz": stmt.excluded.sale_price_grosz,
                "regular_price_grosz": stmt.excluded.regular_price_grosz,
                "fetched_at": stmt.excluded.fetched_at,
            },
        )
        await self.session.execute(stmt)

    async def _replace_item_biomarkers(
        self, product: RawProduct, biomarker_lookup: dict[tuple[str | None, str | None], int]
    ) -> None:
        await self.session.execute(
            delete(models.ItemBiomarker).where(models.ItemBiomarker.item_id == product.id)
        )

        entries = []
        for biomarker in product.biomarkers:
            key = _biomarker_key(biomarker)
            biomarker_id = biomarker_lookup.get(key)
            if biomarker_id:
                entries.append({"item_id": product.id, "biomarker_id": biomarker_id})
        if entries:
            stmt = insert(models.ItemBiomarker).values(entries)
            stmt = stmt.on_conflict_do_nothing()
            await self.session.execute(stmt)

    async def _upsert_snapshot(self, product: RawProduct, snap_date: date) -> None:
        stmt = insert(models.PriceSnapshot).values(
            item_id=product.id,
            snap_date=snap_date,
            price_now_grosz=product.price_now_grosz,
            is_available=product.is_available,
        )
        stmt = stmt.on_conflict_do_nothing()
        await self.session.execute(stmt)


__all__ = ["IngestionRepository"]


def _biomarker_key(biomarker: RawBiomarker) -> tuple[str | None, str | None]:
    if biomarker.elab_code:
        return (biomarker.elab_code, None)
    return (None, biomarker.slug)
