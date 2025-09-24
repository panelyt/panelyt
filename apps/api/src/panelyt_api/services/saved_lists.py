from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from secrets import token_urlsafe

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from panelyt_api.db.models import Biomarker, SavedList, SavedListEntry


@dataclass(slots=True)
class SavedListEntryData:
    code: str
    display_name: str


class SavedListService:
    """Coordinate CRUD operations for saved biomarker lists."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_for_user(self, user_id: str) -> list[SavedList]:
        stmt = (
            select(SavedList)
            .options(selectinload(SavedList.entries))
            .where(SavedList.user_id == user_id)
            .order_by(SavedList.created_at.asc())
        )
        result = await self._db.execute(stmt)
        lists = list(result.scalars())
        for saved in lists:
            saved.entries.sort(key=lambda entry: entry.sort_order)
        return lists

    async def get_for_user(self, list_id: str, user_id: str) -> SavedList | None:
        stmt = (
            select(SavedList)
            .options(selectinload(SavedList.entries))
            .where(SavedList.id == list_id, SavedList.user_id == user_id)
        )
        result = await self._db.execute(stmt)
        saved_list = result.scalar_one_or_none()
        if saved_list is not None:
            saved_list.entries.sort(key=lambda entry: entry.sort_order)
        return saved_list

    async def get_shared(self, share_token: str) -> SavedList | None:
        if not share_token:
            return None
        stmt = (
            select(SavedList)
            .options(selectinload(SavedList.entries))
            .where(SavedList.share_token == share_token)
        )
        result = await self._db.execute(stmt)
        saved_list = result.scalar_one_or_none()
        if saved_list is not None:
            saved_list.entries.sort(key=lambda entry: entry.sort_order)
        return saved_list

    async def create_list(
        self,
        user_id: str,
        name: str,
        entries: Sequence[SavedListEntryData],
    ) -> SavedList:
        prepared = self._prepare_entries(entries)
        biomarker_map = await self._resolve_biomarkers(prepared)

        saved_list = SavedList(user_id=user_id, name=name)
        self._db.add(saved_list)
        await self._db.flush()

        for index, entry in enumerate(prepared):
            self._db.add(
                SavedListEntry(
                    list_id=saved_list.id,
                    biomarker_id=biomarker_map.get(entry.code.lower()),
                    code=entry.code,
                    display_name=entry.display_name,
                    sort_order=index,
                )
            )

        saved_list.updated_at = datetime.now(UTC)
        if saved_list.share_token:
            saved_list.shared_at = datetime.now(UTC)
        await self._db.flush()
        await self._db.refresh(saved_list, attribute_names=["entries"])
        saved_list.entries.sort(key=lambda entry: entry.sort_order)
        return saved_list

    async def update_list(
        self,
        saved_list: SavedList,
        name: str,
        entries: Sequence[SavedListEntryData],
    ) -> SavedList:
        prepared = self._prepare_entries(entries)
        biomarker_map = await self._resolve_biomarkers(prepared)

        saved_list.name = name
        await self._db.execute(
            delete(SavedListEntry).where(SavedListEntry.list_id == saved_list.id)
        )
        await self._db.flush()

        for index, entry in enumerate(prepared):
            self._db.add(
                SavedListEntry(
                    list_id=saved_list.id,
                    biomarker_id=biomarker_map.get(entry.code.lower()),
                    code=entry.code,
                    display_name=entry.display_name,
                    sort_order=index,
                )
            )

        saved_list.updated_at = datetime.now(UTC)
        await self._db.flush()
        await self._db.refresh(saved_list, attribute_names=["entries"])
        saved_list.entries.sort(key=lambda entry: entry.sort_order)
        return saved_list

    async def delete_list(self, saved_list: SavedList) -> None:
        await self._db.delete(saved_list)
        await self._db.flush()

    async def publish_list(
        self,
        saved_list: SavedList,
        *,
        regenerate: bool = False,
    ) -> SavedList:
        if regenerate or not saved_list.share_token:
            saved_list.share_token = await self._generate_unique_share_token()
        saved_list.shared_at = datetime.now(UTC)
        saved_list.updated_at = datetime.now(UTC)
        await self._db.flush()
        await self._db.refresh(saved_list, attribute_names=["entries"])
        saved_list.entries.sort(key=lambda entry: entry.sort_order)
        return saved_list

    async def revoke_share(self, saved_list: SavedList) -> SavedList:
        saved_list.share_token = None
        saved_list.shared_at = None
        saved_list.updated_at = datetime.now(UTC)
        await self._db.flush()
        await self._db.refresh(saved_list, attribute_names=["entries"])
        saved_list.entries.sort(key=lambda entry: entry.sort_order)
        return saved_list

    def _prepare_entries(
        self,
        entries: Sequence[SavedListEntryData],
    ) -> list[SavedListEntryData]:
        seen: set[str] = set()
        prepared: list[SavedListEntryData] = []
        for entry in entries:
            code = entry.code.strip()
            display_name = entry.display_name.strip() or code
            if not code:
                raise ValueError("Biomarker code cannot be empty")
            normalized = code.lower()
            if normalized in seen:
                raise ValueError(f"Duplicate biomarker code: {code}")
            seen.add(normalized)
            prepared.append(SavedListEntryData(code=code, display_name=display_name))
        return prepared

    async def _resolve_biomarkers(
        self,
        entries: Sequence[SavedListEntryData],
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

    async def _generate_unique_share_token(self) -> str:
        while True:
            candidate = token_urlsafe(9)[:32]
            exists_stmt = select(func.count()).select_from(SavedList).where(
                SavedList.share_token == candidate
            )
            exists = await self._db.scalar(exists_stmt)
            if not exists:
                return candidate


__all__ = ["SavedListEntryData", "SavedListService"]
