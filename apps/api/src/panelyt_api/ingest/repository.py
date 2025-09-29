from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, exists, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db import models
from panelyt_api.ingest.types import RawLabBiomarker, RawLabItem

RetentionWindow = timedelta(days=35)


@dataclass(slots=True)
class StageContext:
    lab_id: int
    lab_code: str
    fetched_at: datetime
    items: Mapping[str, RawLabItem]
    biomarkers: Mapping[str, RawLabBiomarker]
    item_to_biomarkers: Mapping[str, list[str]]
    lab_item_ids: dict[str, int] = field(default_factory=dict)
    lab_biomarker_ids: dict[str, int] = field(default_factory=dict)


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

    async def stage_lab_items(
        self,
        lab_code: str,
        items: Iterable[RawLabItem],
        *,
        fetched_at: datetime,
    ) -> StageContext:
        lab_id = await self._get_lab_id(lab_code)
        item_map: dict[str, RawLabItem] = {}
        biomarker_map: dict[str, RawLabBiomarker] = {}
        item_to_biomarkers: dict[str, list[str]] = {}

        for raw_item in items:
            external_id = raw_item.external_id.strip()
            if not external_id:
                continue
            item_map[external_id] = raw_item
            biomarker_ids: list[str] = []
            for biomarker in raw_item.biomarkers:
                biomarker_external = biomarker.external_id.strip()
                if not biomarker_external:
                    continue
                if biomarker_external not in biomarker_map:
                    biomarker_map[biomarker_external] = biomarker
                biomarker_ids.append(biomarker_external)
            item_to_biomarkers[external_id] = biomarker_ids

        context = StageContext(
            lab_id=lab_id,
            lab_code=lab_code,
            fetched_at=fetched_at,
            items=item_map,
            biomarkers=biomarker_map,
            item_to_biomarkers=item_to_biomarkers,
        )

        context.lab_biomarker_ids = await self._upsert_lab_biomarkers(
            lab_id, biomarker_map, fetched_at
        )
        context.lab_item_ids = await self._upsert_lab_items(lab_id, item_map, fetched_at)

        await self._replace_lab_item_links(context)

        if lab_code == "diag":
            await self._ensure_diag_matches(context)

        return context

    async def synchronize_catalog(self, context: StageContext) -> None:
        if not context.items:
            return

        await self._upsert_items(context)
        item_ids = await self._fetch_item_ids(context.lab_id, context.items.keys())
        await self._replace_item_biomarkers(context, item_ids)
        await self._upsert_snapshots(context, item_ids)

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

    async def _get_lab_id(self, lab_code: str) -> int:
        statement = select(models.Lab.id).where(models.Lab.code == lab_code)
        lab_id = await self.session.scalar(statement)
        if lab_id is None:
            raise ValueError(f"Unknown lab code: {lab_code}")
        return int(lab_id)

    async def _upsert_lab_biomarkers(
        self,
        lab_id: int,
        biomarker_map: Mapping[str, RawLabBiomarker],
        fetched_at: datetime,
    ) -> dict[str, int]:
        if biomarker_map:
            values = [
                {
                    "lab_id": lab_id,
                    "external_id": external_id,
                    "name": biomarker.name,
                    "slug": biomarker.slug,
                    "elab_code": biomarker.elab_code,
                    "attributes": dict(biomarker.metadata or {}),
                    "is_active": True,
                    "last_seen_at": fetched_at,
                }
                for external_id, biomarker in biomarker_map.items()
            ]
            stmt = insert(models.LabBiomarker).values(values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["lab_id", "external_id"],
                set_={
                    "name": stmt.excluded.name,
                    "slug": stmt.excluded.slug,
                    "elab_code": stmt.excluded.elab_code,
                    "attributes": stmt.excluded.attributes,
                    "is_active": True,
                    "last_seen_at": stmt.excluded.last_seen_at,
                },
            )
            await self.session.execute(stmt)

            unseen_stmt = (
                update(models.LabBiomarker)
                .where(models.LabBiomarker.lab_id == lab_id)
                .where(~models.LabBiomarker.external_id.in_(list(biomarker_map.keys())))
                .values(is_active=False)
            )
            await self.session.execute(unseen_stmt)

        return await self._fetch_lab_biomarker_ids(lab_id, biomarker_map.keys())

    async def _upsert_lab_items(
        self,
        lab_id: int,
        item_map: Mapping[str, RawLabItem],
        fetched_at: datetime,
    ) -> dict[str, int]:
        if item_map:
            values = [
                {
                    "lab_id": lab_id,
                    "external_id": external_id,
                    "kind": item.kind,
                    "name": item.name,
                    "slug": item.slug,
                    "currency": item.currency,
                    "price_now_grosz": item.price_now_grosz,
                    "price_min30_grosz": item.price_min30_grosz,
                    "sale_price_grosz": item.sale_price_grosz,
                    "regular_price_grosz": item.regular_price_grosz,
                    "is_available": item.is_available,
                    "fetched_at": fetched_at,
                    "attributes": dict(item.metadata or {}),
                }
                for external_id, item in item_map.items()
            ]
            stmt = insert(models.LabItem).values(values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["lab_id", "external_id"],
                set_={
                    "kind": stmt.excluded.kind,
                    "name": stmt.excluded.name,
                    "slug": stmt.excluded.slug,
                    "currency": stmt.excluded.currency,
                    "price_now_grosz": stmt.excluded.price_now_grosz,
                    "price_min30_grosz": stmt.excluded.price_min30_grosz,
                    "sale_price_grosz": stmt.excluded.sale_price_grosz,
                    "regular_price_grosz": stmt.excluded.regular_price_grosz,
                    "is_available": stmt.excluded.is_available,
                    "fetched_at": stmt.excluded.fetched_at,
                    "attributes": stmt.excluded.attributes,
                },
            )
            await self.session.execute(stmt)

            unseen_stmt = (
                update(models.LabItem)
                .where(models.LabItem.lab_id == lab_id)
                .where(~models.LabItem.external_id.in_(list(item_map.keys())))
                .values(is_available=False)
            )
            await self.session.execute(unseen_stmt)

        return await self._fetch_lab_item_ids(lab_id, item_map.keys())

    async def _replace_lab_item_links(self, context: StageContext) -> None:
        if not context.lab_item_ids:
            return

        await self.session.execute(
            delete(models.LabItemBiomarker).where(
                models.LabItemBiomarker.lab_item_id.in_(context.lab_item_ids.values())
            )
        )

        entries = []
        for item_external, biomarker_externals in context.item_to_biomarkers.items():
            lab_item_id = context.lab_item_ids.get(item_external)
            if not lab_item_id:
                continue
            for biomarker_external in biomarker_externals:
                lab_biomarker_id = context.lab_biomarker_ids.get(biomarker_external)
                if not lab_biomarker_id:
                    continue
                entries.append(
                    {
                        "lab_item_id": lab_item_id,
                        "lab_biomarker_id": lab_biomarker_id,
                    }
                )
        if entries:
            stmt = insert(models.LabItemBiomarker).values(entries)
            stmt = stmt.on_conflict_do_nothing()
            await self.session.execute(stmt)

    async def _ensure_diag_matches(self, context: StageContext) -> None:
        diag_biomarkers = list(context.biomarkers.items())
        if not diag_biomarkers:
            return

        prepared: list[tuple[str, RawLabBiomarker, str]] = []
        for external_id, biomarker in diag_biomarkers:
            slug = biomarker.slug or _normalize_identifier(biomarker.name) or f"diag-{external_id}"
            prepared.append((external_id, biomarker, slug))

        values = [
            {
                "elab_code": biomarker.elab_code,
                "slug": slug,
                "name": biomarker.name,
            }
            for _, biomarker, slug in prepared
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

        slugs = [slug for _, _, slug in prepared]
        biomarker_lookup: dict[str, int] = {}
        if slugs:
            statement = select(models.Biomarker.slug, models.Biomarker.id).where(
                models.Biomarker.slug.in_(slugs)
            )
            biomarker_lookup = {
                row.slug: row.id for row in (await self.session.execute(statement)).all()
            }

        match_values = []
        for external_id, _biomarker, slug in prepared:
            lab_biomarker_id = context.lab_biomarker_ids.get(external_id)
            biomarker_id = biomarker_lookup.get(slug)
            if not lab_biomarker_id or biomarker_id is None:
                continue
            match_values.append(
                {
                    "biomarker_id": biomarker_id,
                    "lab_biomarker_id": lab_biomarker_id,
                    "match_type": "auto-slug",
                    "status": "accepted",
                }
            )
        if match_values:
            stmt = insert(models.BiomarkerMatch).values(match_values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["lab_biomarker_id"],
                set_={
                    "biomarker_id": stmt.excluded.biomarker_id,
                    "match_type": stmt.excluded.match_type,
                    "status": stmt.excluded.status,
                },
            )
            await self.session.execute(stmt)

    async def prune_orphan_biomarkers(self) -> None:
        stmt = (
            delete(models.Biomarker)
            .where(
                ~exists().where(models.BiomarkerMatch.biomarker_id == models.Biomarker.id)
            )
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

    async def _upsert_items(self, context: StageContext) -> None:
        values = []
        for external_id, raw_item in context.items.items():
            lab_item_id = context.lab_item_ids.get(external_id)
            if not lab_item_id:
                continue
            slug = raw_item.slug or f"{context.lab_code}-{external_id}"
            values.append(
                {
                    "lab_id": context.lab_id,
                    "external_id": external_id,
                    "lab_item_id": lab_item_id,
                    "kind": raw_item.kind,
                    "name": raw_item.name,
                    "slug": slug,
                    "is_available": raw_item.is_available,
                    "currency": raw_item.currency,
                    "price_now_grosz": raw_item.price_now_grosz,
                    "price_min30_grosz": raw_item.price_min30_grosz,
                    "sale_price_grosz": raw_item.sale_price_grosz,
                    "regular_price_grosz": raw_item.regular_price_grosz,
                    "fetched_at": context.fetched_at,
                }
            )
        if not values:
            return

        stmt = insert(models.Item).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["lab_id", "external_id"],
            set_={
                "lab_item_id": stmt.excluded.lab_item_id,
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
        self, context: StageContext, item_ids: Mapping[str, int]
    ) -> None:
        if not item_ids:
            return

        await self.session.execute(
            delete(models.ItemBiomarker).where(
                models.ItemBiomarker.item_id.in_(item_ids.values())
            )
        )

        match_lookup = {}
        if context.lab_biomarker_ids:
            statement = select(
                models.BiomarkerMatch.lab_biomarker_id,
                models.BiomarkerMatch.biomarker_id,
            ).where(
                models.BiomarkerMatch.lab_biomarker_id.in_(context.lab_biomarker_ids.values())
            ).where(models.BiomarkerMatch.status == "accepted")
            match_lookup = {
                row.lab_biomarker_id: row.biomarker_id
                for row in (await self.session.execute(statement)).all()
            }

        entries = []
        for external_id, canonical_item_id in item_ids.items():
            biomarker_externals = context.item_to_biomarkers.get(external_id, [])
            for biomarker_external in biomarker_externals:
                lab_biomarker_id = context.lab_biomarker_ids.get(biomarker_external)
                if not lab_biomarker_id:
                    continue
                biomarker_id = match_lookup.get(lab_biomarker_id)
                if not biomarker_id:
                    continue
                entries.append(
                    {
                        "item_id": canonical_item_id,
                        "biomarker_id": biomarker_id,
                    }
                )
        if entries:
            stmt = insert(models.ItemBiomarker).values(entries)
            stmt = stmt.on_conflict_do_nothing()
            await self.session.execute(stmt)

    async def _upsert_snapshots(
        self, context: StageContext, item_ids: Mapping[str, int]
    ) -> None:
        if not item_ids:
            return

        snap_date = context.fetched_at.date()
        entries = []
        for external_id, item_id in item_ids.items():
            raw_item = context.items.get(external_id)
            if raw_item is None:
                continue
            entries.append(
                {
                    "item_id": item_id,
                    "lab_id": context.lab_id,
                    "snap_date": snap_date,
                    "price_now_grosz": raw_item.price_now_grosz,
                    "is_available": raw_item.is_available,
                }
            )
        if not entries:
            return

        stmt = insert(models.PriceSnapshot).values(entries)
        stmt = stmt.on_conflict_do_update(
            index_elements=["item_id", "snap_date"],
            set_={
                "price_now_grosz": stmt.excluded.price_now_grosz,
                "is_available": stmt.excluded.is_available,
                "lab_id": stmt.excluded.lab_id,
            },
        )
        await self.session.execute(stmt)

    async def _fetch_lab_biomarker_ids(
        self, lab_id: int, externals: Iterable[str]
    ) -> dict[str, int]:
        externals = list(externals)
        if not externals:
            return {}
        statement = (
            select(models.LabBiomarker.external_id, models.LabBiomarker.id)
            .where(models.LabBiomarker.lab_id == lab_id)
            .where(models.LabBiomarker.external_id.in_(externals))
        )
        rows = await self.session.execute(statement)
        return {external_id: identifier for external_id, identifier in rows.all()}

    async def _fetch_lab_item_ids(
        self, lab_id: int, externals: Iterable[str]
    ) -> dict[str, int]:
        externals = list(externals)
        if not externals:
            return {}
        statement = (
            select(models.LabItem.external_id, models.LabItem.id)
            .where(models.LabItem.lab_id == lab_id)
            .where(models.LabItem.external_id.in_(externals))
        )
        rows = await self.session.execute(statement)
        return {external_id: identifier for external_id, identifier in rows.all()}

    async def _fetch_item_ids(
        self, lab_id: int, externals: Iterable[str]
    ) -> dict[str, int]:
        externals = list(externals)
        if not externals:
            return {}
        statement = (
            select(models.Item.external_id, models.Item.id)
            .where(models.Item.lab_id == lab_id)
            .where(models.Item.external_id.in_(externals))
        )
        rows = await self.session.execute(statement)
        return {external_id: identifier for external_id, identifier in rows.all()}


def _normalize_identifier(value: str | None) -> str:
    if not value:
        return ""
    text = value.lower()
    text = re.sub(r"[^a-z0-9ąęółśżźćń]+", "-", text)
    return text.strip("-")


__all__ = ["IngestionRepository", "StageContext"]
