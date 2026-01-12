from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, date, datetime, timedelta
from typing import TypeVar

from sqlalchemy import delete, exists, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core.diag import DIAG_CODE
from panelyt_api.db import models
from panelyt_api.ingest.types import RawDiagBiomarker, RawDiagItem
from panelyt_api.utils.slugify import slugify_identifier_pl

RetentionWindow = timedelta(days=35)
_UPSERT_BATCH_SIZE = 500


T = TypeVar("T")


def _chunked(items: Sequence[T], size: int) -> Iterable[Sequence[T]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _truncate(value: str | None, length: int) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if len(trimmed) <= length:
        return trimmed
    return trimmed[:length]


class CatalogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def latest_fetched_at(self, institution_id: int) -> datetime | None:
        return await self.session.scalar(
            select(func.max(models.InstitutionItem.fetched_at)).where(
                models.InstitutionItem.institution_id == institution_id
            )
        )

    async def latest_snapshot_date(self, institution_id: int) -> date | None:
        return await self.session.scalar(
            select(func.max(models.PriceSnapshot.snap_date)).where(
                models.PriceSnapshot.institution_id == institution_id
            )
        )

    async def create_run_log(self, started_at: datetime, reason: str) -> int:
        stmt = (
            insert(models.IngestionLog)
            .values(started_at=started_at, status="started", note=reason)
            .returning(models.IngestionLog.id)
        )
        return int(await self.session.scalar(stmt))

    async def finalize_run_log(self, log_id: int, status: str, note: str | None = None) -> None:
        values = {
            "finished_at": datetime.now(UTC),
            "status": status,
        }
        if note is not None:
            values["note"] = note
        stmt = (
            update(models.IngestionLog)
            .where(models.IngestionLog.id == log_id)
            .values(**values)
        )
        await self.session.execute(stmt)

    async def upsert_catalog(
        self,
        institution_id: int,
        *,
        singles: Sequence[RawDiagItem],
        packages: Sequence[RawDiagItem],
        fetched_at: datetime,
    ) -> None:
        items = [*singles, *packages]
        if not items:
            return

        item_map: dict[str, RawDiagItem] = {}
        biomarker_map: dict[str, RawDiagBiomarker] = {}
        item_to_biomarkers: dict[str, list[str]] = {}

        for raw_item in items:
            external_id = raw_item.external_id.strip()
            if not external_id:
                continue
            item_map[external_id] = raw_item
            biomarker_slugs: list[str] = []
            for biomarker in raw_item.biomarkers:
                slug = _resolve_diag_biomarker_slug(biomarker)
                if not slug:
                    continue
                biomarker_slugs.append(slug)
                biomarker_map.setdefault(slug, biomarker)
            item_to_biomarkers[external_id] = biomarker_slugs

        if not item_map:
            return

        biomarker_ids = await self._upsert_diag_biomarkers(biomarker_map)
        item_ids = await self._upsert_diag_items(item_map, fetched_at)
        await self._replace_diag_item_biomarkers(item_ids, item_to_biomarkers, biomarker_ids)
        await self._upsert_institution_items(institution_id, item_map, item_ids, fetched_at)
        await self._upsert_institution_snapshots(
            institution_id, item_map, item_ids, fetched_at
        )

    # Deprecated: use upsert_catalog.
    upsert_diag_catalog = upsert_catalog

    async def write_raw_snapshot(self, source: str, payload: dict[str, object]) -> None:
        stmt = insert(models.RawSnapshot).values(source=source, payload=payload)
        await self.session.execute(stmt)

    async def prune_snapshots(self, reference_date: date) -> None:
        cutoff = reference_date - RetentionWindow
        stmt = delete(models.PriceSnapshot).where(models.PriceSnapshot.snap_date < cutoff)
        await self.session.execute(stmt)

    async def last_user_activity(self) -> datetime | None:
        result = await self.session.scalar(
            select(models.AppActivity.occurred_at).where(models.AppActivity.name == "user_touch")
        )
        return result if isinstance(result, datetime) else None

    async def record_user_activity(self, timestamp: datetime) -> None:
        stmt = insert(models.AppActivity).values(name="user_touch", occurred_at=timestamp)
        stmt = stmt.on_conflict_do_update(index_elements=["name"], set_={"occurred_at": timestamp})
        await self.session.execute(stmt)


    async def prune_orphan_biomarkers(self) -> None:
        stmt = (
            delete(models.Biomarker)
            .where(
                ~exists().where(models.ItemBiomarker.biomarker_id == models.Biomarker.id)
            )
            .where(
                ~exists().where(
                    models.SavedListEntry.biomarker_id == models.Biomarker.id
                )
            )
            .where(
                ~exists().where(
                    models.BiomarkerListTemplateEntry.biomarker_id == models.Biomarker.id
                )
            )
        )
        await self.session.execute(stmt)

    async def prune_missing_offers(
        self, institution_id: int, external_ids: Sequence[str]
    ) -> None:
        externals = [external_id.strip() for external_id in external_ids if external_id]
        if not externals:
            return
        unique_externals = list(dict.fromkeys(externals))
        available_items = select(models.Item.id).where(
            models.Item.external_id.in_(unique_externals)
        )
        stmt = (
            update(models.InstitutionItem)
            .where(models.InstitutionItem.institution_id == institution_id)
            .where(~models.InstitutionItem.item_id.in_(available_items))
            .values(is_available=False)
        )
        await self.session.execute(stmt)

    async def _upsert_diag_biomarkers(
        self, biomarker_map: Mapping[str, RawDiagBiomarker]
    ) -> dict[str, int]:
        biomarker_pairs = list(biomarker_map.items())
        if biomarker_pairs:
            for batch in _chunked(biomarker_pairs, _UPSERT_BATCH_SIZE):
                values = [
                    {
                        "slug": _truncate(slug, 255) or slug,
                        "name": _truncate(biomarker.name, 255) or slug,
                        "elab_code": _truncate(biomarker.elab_code, 64),
                    }
                    for slug, biomarker in batch
                ]
                stmt = insert(models.Biomarker).values(values)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["slug"],
                    set_={
                        "name": stmt.excluded.name,
                        "elab_code": stmt.excluded.elab_code,
                    },
                )
                await self.session.execute(stmt)

        slugs = [slug for slug, _ in biomarker_pairs]
        if not slugs:
            return {}
        statement = select(models.Biomarker.slug, models.Biomarker.id).where(
            models.Biomarker.slug.in_(slugs)
        )
        rows = await self.session.execute(statement)
        return {slug: identifier for slug, identifier in rows.all()}

    async def _upsert_diag_items(
        self,
        item_map: Mapping[str, RawDiagItem],
        fetched_at: datetime,
    ) -> dict[str, int]:
        values = []
        for external_id, raw_item in item_map.items():
            slug = _resolve_diag_item_slug(raw_item, external_id)
            values.append(
                {
                    "external_id": _truncate(external_id, 128) or "",
                    "kind": raw_item.kind,
                    "name": _truncate(raw_item.name, 255) or "",
                    "slug": _truncate(slug, 255) or slug,
                    "is_available": raw_item.is_available,
                    "currency": _truncate(raw_item.currency, 8) or "PLN",
                    "price_now_grosz": raw_item.price_now_grosz,
                    "price_min30_grosz": raw_item.price_min30_grosz,
                    "sale_price_grosz": raw_item.sale_price_grosz,
                    "regular_price_grosz": raw_item.regular_price_grosz,
                    "fetched_at": fetched_at,
                }
            )
        if not values:
            return {}

        for batch in _chunked(values, _UPSERT_BATCH_SIZE):
            stmt = insert(models.Item).values(list(batch))
            stmt = stmt.on_conflict_do_update(
                index_elements=["external_id"],
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

        return await self._fetch_item_ids(item_map.keys())

    async def _replace_diag_item_biomarkers(
        self,
        item_ids: Mapping[str, int],
        item_to_biomarkers: Mapping[str, list[str]],
        biomarker_ids: Mapping[str, int],
    ) -> None:
        if not item_ids:
            return

        await self.session.execute(
            delete(models.ItemBiomarker).where(
                models.ItemBiomarker.item_id.in_(item_ids.values())
            )
        )

        entries = []
        for external_id, item_id in item_ids.items():
            for slug in item_to_biomarkers.get(external_id, []):
                biomarker_id = biomarker_ids.get(slug)
                if not biomarker_id:
                    continue
                entries.append(
                    {
                        "item_id": item_id,
                        "biomarker_id": biomarker_id,
                    }
                )
        if entries:
            for batch in _chunked(entries, _UPSERT_BATCH_SIZE):
                stmt = insert(models.ItemBiomarker).values(list(batch))
                stmt = stmt.on_conflict_do_nothing()
                await self.session.execute(stmt)

    async def _upsert_institution_items(
        self,
        institution_id: int,
        item_map: Mapping[str, RawDiagItem],
        item_ids: Mapping[str, int],
        fetched_at: datetime,
    ) -> None:
        if not item_ids:
            return

        entries = []
        for external_id, item_id in item_ids.items():
            raw_item = item_map.get(external_id)
            if raw_item is None:
                continue
            entries.append(
                {
                    "institution_id": institution_id,
                    "item_id": item_id,
                    "is_available": raw_item.is_available,
                    "currency": raw_item.currency,
                    "price_now_grosz": raw_item.price_now_grosz,
                    "price_min30_grosz": raw_item.price_min30_grosz,
                    "sale_price_grosz": raw_item.sale_price_grosz,
                    "regular_price_grosz": raw_item.regular_price_grosz,
                    "fetched_at": fetched_at,
                }
            )
        if not entries:
            return

        for batch in _chunked(entries, _UPSERT_BATCH_SIZE):
            stmt = insert(models.InstitutionItem).values(list(batch))
            stmt = stmt.on_conflict_do_update(
                index_elements=["institution_id", "item_id"],
                set_={
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

    async def _upsert_institution_snapshots(
        self,
        institution_id: int,
        item_map: Mapping[str, RawDiagItem],
        item_ids: Mapping[str, int],
        fetched_at: datetime,
    ) -> None:
        if not item_ids:
            return

        snap_date = fetched_at.date()
        entries = []
        for external_id, item_id in item_ids.items():
            raw_item = item_map.get(external_id)
            if raw_item is None:
                continue
            entries.append(
                {
                    "institution_id": institution_id,
                    "item_id": item_id,
                    "snap_date": snap_date,
                    "price_now_grosz": raw_item.price_now_grosz,
                    "price_min30_grosz": raw_item.price_min30_grosz,
                    "sale_price_grosz": raw_item.sale_price_grosz,
                    "regular_price_grosz": raw_item.regular_price_grosz,
                    "is_available": raw_item.is_available,
                }
            )
        if not entries:
            return

        for batch in _chunked(entries, _UPSERT_BATCH_SIZE):
            stmt = insert(models.PriceSnapshot).values(list(batch))
            stmt = stmt.on_conflict_do_update(
                index_elements=["institution_id", "item_id", "snap_date"],
                set_={
                    "price_now_grosz": stmt.excluded.price_now_grosz,
                    "price_min30_grosz": stmt.excluded.price_min30_grosz,
                    "sale_price_grosz": stmt.excluded.sale_price_grosz,
                    "regular_price_grosz": stmt.excluded.regular_price_grosz,
                    "is_available": stmt.excluded.is_available,
                },
            )
            await self.session.execute(stmt)
    async def _fetch_item_ids(self, externals: Iterable[str]) -> dict[str, int]:
        externals = list(externals)
        if not externals:
            return {}
        statement = (
            select(models.Item.external_id, models.Item.id)
            .where(models.Item.external_id.in_(externals))
        )
        rows = await self.session.execute(statement)
        return {external_id: identifier for external_id, identifier in rows.all()}


def _resolve_diag_item_slug(raw_item: RawDiagItem, external_id: str) -> str:
    slug = _truncate(raw_item.slug, 255)
    if slug:
        return slug
    name_slug = slugify_identifier_pl(raw_item.name)
    if name_slug:
        return name_slug
    external_slug = slugify_identifier_pl(external_id)
    if external_slug:
        return external_slug
    return f"{DIAG_CODE}-{external_id}"


def _resolve_diag_biomarker_slug(biomarker: RawDiagBiomarker) -> str:
    slug = _truncate(biomarker.slug, 255)
    if slug:
        return slug
    name_slug = slugify_identifier_pl(biomarker.name)
    if name_slug:
        return name_slug
    code_slug = slugify_identifier_pl(biomarker.elab_code)
    if code_slug:
        return code_slug
    external_slug = slugify_identifier_pl(biomarker.external_id)
    if external_slug:
        return external_slug
    return f"{DIAG_CODE}-{biomarker.external_id}"


__all__ = ["CatalogRepository"]
