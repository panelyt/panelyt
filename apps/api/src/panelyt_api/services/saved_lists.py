from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from secrets import token_urlsafe

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from panelyt_api.db.models import SavedList, SavedListEntry, UserAccount
from panelyt_api.optimization.service import OptimizationService
from panelyt_api.schemas.optimize import OptimizeRequest
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID
from panelyt_api.services.biomarker_resolver import BiomarkerResolver


@dataclass(slots=True)
class SavedListEntryData:
    code: str
    display_name: str


class SavedListService:
    """Coordinate CRUD operations for saved biomarker lists."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._resolver = BiomarkerResolver(db)
        self._optimizer = OptimizationService(db)

    async def list_for_user(self, user_id: str) -> list[SavedList]:
        stmt = (
            select(SavedList)
            .options(selectinload(SavedList.entries))
            .where(SavedList.user_id == user_id)
            .order_by(SavedList.created_at.asc())
        )
        result = await self._db.execute(stmt)
        return list(result.scalars())

    async def get_for_user(self, list_id: str, user_id: str) -> SavedList | None:
        stmt = (
            select(SavedList)
            .options(selectinload(SavedList.entries))
            .where(SavedList.id == list_id, SavedList.user_id == user_id)
        )
        result = await self._db.execute(stmt)
        saved_list = result.scalar_one_or_none()
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
        return saved_list

    async def get_by_name_for_user(self, user_id: str, name: str) -> SavedList | None:
        stmt = (
            select(SavedList)
            .options(selectinload(SavedList.entries))
            .where(
                SavedList.user_id == user_id,
                func.lower(SavedList.name) == name.lower(),
            )
            .order_by(SavedList.created_at.asc())
        )
        result = await self._db.execute(stmt)
        saved_list = result.scalars().first()
        return saved_list

    async def create_list(
        self,
        user_id: str,
        name: str,
        entries: Sequence[SavedListEntryData],
    ) -> SavedList:
        prepared = self._prepare_entries(entries)
        biomarker_map = await self._resolver.resolve_for_list_entries(prepared)

        saved_list = SavedList(
            user_id=user_id,
            name=name,
            notify_on_price_drop=True,
        )
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

        await self._refresh_list_totals(saved_list, prepared)
        saved_list.updated_at = datetime.now(UTC)
        await self._db.flush()
        await self._db.refresh(saved_list, attribute_names=["entries"])
        return saved_list

    async def update_list(
        self,
        saved_list: SavedList,
        name: str,
        entries: Sequence[SavedListEntryData],
    ) -> SavedList:
        prepared = self._prepare_entries(entries)
        biomarker_map = await self._resolver.resolve_for_list_entries(prepared)

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

        await self._refresh_list_totals(saved_list, prepared)
        saved_list.updated_at = datetime.now(UTC)
        await self._db.flush()
        await self._db.refresh(saved_list, attribute_names=["entries"])
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
        return saved_list

    async def revoke_share(self, saved_list: SavedList) -> SavedList:
        saved_list.share_token = None
        saved_list.shared_at = None
        saved_list.updated_at = datetime.now(UTC)
        await self._db.flush()
        await self._db.refresh(saved_list, attribute_names=["entries"])
        return saved_list

    async def set_notifications(self, saved_list: SavedList, *, notify: bool) -> SavedList:
        saved_list.notify_on_price_drop = notify
        if not notify:
            saved_list.last_notified_total_grosz = None
            saved_list.last_notified_at = None
        await self._db.flush()
        await self._db.refresh(saved_list)
        return saved_list

    async def set_notifications_for_user(
        self,
        user_id: str,
        *,
        notify: bool,
    ) -> list[SavedList]:
        lists = await self.list_for_user(user_id)
        if not lists:
            return []

        for saved_list in lists:
            saved_list.notify_on_price_drop = notify
            if not notify:
                saved_list.last_notified_total_grosz = None
                saved_list.last_notified_at = None

        await self._db.flush()
        return lists

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

    async def _refresh_list_totals(
        self,
        saved_list: SavedList,
        entries: Sequence[SavedListEntryData],
    ) -> None:
        codes = [entry.code for entry in entries]
        timestamp = datetime.now(UTC)
        if not codes:
            saved_list.last_known_total_grosz = 0
            saved_list.last_total_updated_at = timestamp
            return

        institution_id = await self._resolve_institution_id(saved_list.user_id)
        response = await self._optimizer.solve(
            OptimizeRequest(biomarkers=codes),
            institution_id,
        )
        if response.uncovered:
            saved_list.last_known_total_grosz = None
            saved_list.last_total_updated_at = timestamp
            return

        saved_list.last_known_total_grosz = sum(
            item.price_now_grosz for item in response.items
        )
        saved_list.last_total_updated_at = timestamp

    async def _generate_unique_share_token(self) -> str:
        while True:
            candidate = token_urlsafe(9)[:32]
            exists_stmt = select(func.count()).select_from(SavedList).where(
                SavedList.share_token == candidate
            )
            exists = await self._db.scalar(exists_stmt)
            if not exists:
                return candidate

    async def _resolve_institution_id(self, user_id: str) -> int:
        stmt = select(UserAccount.preferred_institution_id).where(UserAccount.id == user_id)
        result = await self._db.execute(stmt)
        preferred = result.scalar_one_or_none()
        return preferred or DEFAULT_INSTITUTION_ID


__all__ = ["SavedListEntryData", "SavedListService"]
