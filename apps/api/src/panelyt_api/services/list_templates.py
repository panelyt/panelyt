from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from panelyt_api.db.models import (
    Biomarker,
    BiomarkerListTemplate,
    BiomarkerListTemplateEntry,
)


@dataclass(slots=True)
class TemplateEntryData:
    code: str
    display_name: str
    notes: str | None = None


@dataclass(slots=True)
class TemplateSearchMatch:
    id: int
    slug: str
    name: str
    description: str | None
    biomarker_count: int


class BiomarkerListTemplateService:
    """Provide read operations over curated biomarker list templates."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_active(self) -> list[BiomarkerListTemplate]:
        stmt = self._base_query().where(BiomarkerListTemplate.is_active.is_(True))
        result = await self._db.execute(stmt)
        templates = list(result.scalars())
        for template in templates:
            self._sort_entries(template)
        return templates

    async def list_all(self) -> list[BiomarkerListTemplate]:
        stmt = self._base_query()
        result = await self._db.execute(stmt)
        templates = list(result.scalars())
        for template in templates:
            self._sort_entries(template)
        return templates

    async def search_active_matches(
        self, query: str, limit: int = 5
    ) -> list[TemplateSearchMatch]:
        normalized = query.strip().lower()
        if not normalized:
            return []

        contains_pattern = f"%{normalized}%"
        prefix_pattern = f"{normalized}%"

        name_lower = func.lower(BiomarkerListTemplate.name)
        slug_lower = func.lower(BiomarkerListTemplate.slug)

        match_rank = case(
            (slug_lower == normalized, 0),
            (name_lower == normalized, 1),
            (slug_lower.like(prefix_pattern), 2),
            (name_lower.like(prefix_pattern), 3),
            else_=10,
        )

        entry_count = func.count(BiomarkerListTemplateEntry.id).label("biomarker_count")

        statement = (
            select(
                BiomarkerListTemplate.id,
                BiomarkerListTemplate.slug,
                BiomarkerListTemplate.name,
                BiomarkerListTemplate.description,
                entry_count,
            )
            .outerjoin(BiomarkerListTemplate.entries)
            .where(BiomarkerListTemplate.is_active.is_(True))
            .where(
                or_(
                    slug_lower.like(contains_pattern),
                    name_lower.like(contains_pattern),
                )
            )
            .group_by(
                BiomarkerListTemplate.id,
                BiomarkerListTemplate.slug,
                BiomarkerListTemplate.name,
                BiomarkerListTemplate.description,
            )
            .order_by(match_rank, BiomarkerListTemplate.name.asc())
            .limit(limit)
        )

        result = await self._db.execute(statement)
        matches: list[TemplateSearchMatch] = []
        for row in result:
            matches.append(
                TemplateSearchMatch(
                    id=row.id,
                    slug=row.slug,
                    name=row.name,
                    description=row.description,
                    biomarker_count=row.biomarker_count or 0,
                )
            )
        return matches

    async def get_active_by_slug(self, slug: str) -> BiomarkerListTemplate | None:
        stmt = self._base_query().where(
            BiomarkerListTemplate.slug == slug,
            BiomarkerListTemplate.is_active.is_(True),
        )
        result = await self._db.execute(stmt)
        template = result.scalars().first()
        if template is not None:
            self._sort_entries(template)
        return template

    async def get_by_slug(self, slug: str) -> BiomarkerListTemplate | None:
        stmt = self._base_query().where(BiomarkerListTemplate.slug == slug)
        result = await self._db.execute(stmt)
        template = result.scalars().first()
        if template is not None:
            self._sort_entries(template)
        return template

    async def create_template(
        self,
        *,
        slug: str,
        name: str,
        description: str | None,
        is_active: bool,
        entries: Sequence[TemplateEntryData],
    ) -> BiomarkerListTemplate:
        normalized_slug = self._normalize_slug(slug)
        await self._assert_unique_slug(normalized_slug)

        prepared_entries = self._prepare_entries(entries)
        biomarker_map = await self._resolve_biomarkers(prepared_entries)

        template = BiomarkerListTemplate(
            slug=normalized_slug,
            name=name.strip(),
            description=(description.strip() if description else None),
            is_active=is_active,
        )
        self._db.add(template)
        await self._db.flush()

        for index, entry in enumerate(prepared_entries):
            self._db.add(
                BiomarkerListTemplateEntry(
                    template_id=template.id,
                    biomarker_id=biomarker_map.get(entry.code.lower()),
                    code=entry.code,
                    display_name=entry.display_name,
                    sort_order=index,
                    notes=entry.notes,
                )
            )

        await self._db.flush()
        return await self._fetch_by_id(template.id)

    async def update_template(
        self,
        template: BiomarkerListTemplate,
        *,
        slug: str,
        name: str,
        description: str | None,
        is_active: bool,
        entries: Sequence[TemplateEntryData],
    ) -> BiomarkerListTemplate:
        normalized_slug = self._normalize_slug(slug)
        if normalized_slug != template.slug:
            await self._assert_unique_slug(normalized_slug, exclude_id=template.id)

        prepared_entries = self._prepare_entries(entries)
        biomarker_map = await self._resolve_biomarkers(prepared_entries)

        template.slug = normalized_slug
        template.name = name.strip()
        template.description = description.strip() if description else None
        template.is_active = is_active

        await self._db.execute(
            delete(BiomarkerListTemplateEntry).where(
                BiomarkerListTemplateEntry.template_id == template.id
            )
        )
        await self._db.flush()

        for index, entry in enumerate(prepared_entries):
            self._db.add(
                BiomarkerListTemplateEntry(
                    template_id=template.id,
                    biomarker_id=biomarker_map.get(entry.code.lower()),
                    code=entry.code,
                    display_name=entry.display_name,
                    sort_order=index,
                    notes=entry.notes,
                )
            )

        await self._db.flush()
        return await self._fetch_by_id(template.id)

    async def delete_template(self, template: BiomarkerListTemplate) -> None:
        await self._db.delete(template)
        await self._db.flush()

    def _base_query(self) -> Select[tuple[BiomarkerListTemplate]]:
        return (
            select(BiomarkerListTemplate)
            .options(
                selectinload(BiomarkerListTemplate.entries).selectinload(
                    BiomarkerListTemplateEntry.biomarker
                )
            )
            .order_by(BiomarkerListTemplate.name.asc())
        )

    def _sort_entries(self, template: BiomarkerListTemplate) -> None:
        template.entries.sort(key=lambda entry: entry.sort_order)

    async def _fetch_by_id(self, template_id: int) -> BiomarkerListTemplate:
        stmt = self._base_query().where(BiomarkerListTemplate.id == template_id)
        result = await self._db.execute(stmt)
        template = result.scalars().first()
        if template is None:
            raise RuntimeError("Template not found after refresh")
        self._sort_entries(template)
        return template

    @staticmethod
    def _normalize_slug(value: str) -> str:
        normalized = re.sub(r"[^a-z0-9-]+", "-", value.strip().lower())
        normalized = re.sub(r"-+", "-", normalized).strip("-")
        if not normalized:
            raise ValueError("Slug cannot be blank")
        return normalized

    def _prepare_entries(
        self,
        entries: Sequence[TemplateEntryData],
    ) -> list[TemplateEntryData]:
        prepared: list[TemplateEntryData] = []
        seen: set[str] = set()
        for entry in entries:
            code = entry.code.strip()
            display_name = entry.display_name.strip()
            notes = entry.notes.strip() if isinstance(entry.notes, str) else entry.notes
            if not code:
                raise ValueError("Biomarker code cannot be empty")
            if not display_name:
                raise ValueError("Display name cannot be empty")
            normalized = code.lower()
            if normalized in seen:
                raise ValueError(f"Duplicate biomarker code: {code}")
            seen.add(normalized)
            prepared.append(
                TemplateEntryData(code=code, display_name=display_name, notes=notes)
            )
        return prepared

    async def _resolve_biomarkers(
        self, entries: Sequence[TemplateEntryData]
    ) -> dict[str, int]:
        codes = {entry.code.lower() for entry in entries}
        if not codes:
            return {}

        stmt = select(Biomarker).where(
            or_(
                func.lower(Biomarker.elab_code).in_(codes),
                func.lower(Biomarker.slug).in_(codes),
            )
        )
        result = await self._db.execute(stmt)
        biomarker_map: dict[str, int] = {}
        for biomarker in result.scalars():
            if biomarker.elab_code:
                biomarker_map.setdefault(biomarker.elab_code.lower(), biomarker.id)
            if biomarker.slug:
                biomarker_map.setdefault(biomarker.slug.lower(), biomarker.id)
        return biomarker_map

    async def _assert_unique_slug(self, slug: str, *, exclude_id: int | None = None) -> None:
        stmt = select(BiomarkerListTemplate).where(BiomarkerListTemplate.slug == slug)
        if exclude_id is not None:
            stmt = stmt.where(BiomarkerListTemplate.id != exclude_id)
        existing = await self._db.execute(stmt)
        if existing.scalar_one_or_none() is not None:
            raise ValueError("Slug already in use")


__all__ = ["BiomarkerListTemplateService", "TemplateEntryData"]
