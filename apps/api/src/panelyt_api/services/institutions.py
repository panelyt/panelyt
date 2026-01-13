from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db.models import Institution, SavedList, UserAccount
from panelyt_api.ingest.types import DiagInstitution

DEFAULT_INSTITUTION_ID = 1135


class InstitutionService:
    """Service for managing Diagnostyka institutions."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def upsert_institution(self, payload: DiagInstitution) -> Institution:
        stmt = select(Institution).where(Institution.id == payload.id)
        result = await self._db.execute(stmt)
        institution = result.scalar_one_or_none()

        if institution is None:
            institution = Institution(id=payload.id, name=payload.name)
            self._db.add(institution)

        institution.name = payload.name
        institution.city = payload.city
        institution.address = payload.address
        await self._db.flush()
        return institution

    async def ensure_institution(self, institution_id: int) -> Institution:
        stmt = select(Institution).where(Institution.id == institution_id)
        result = await self._db.execute(stmt)
        institution = result.scalar_one_or_none()
        if institution is not None:
            return institution

        institution = Institution(
            id=institution_id,
            name=f"Institution {institution_id}",
        )
        self._db.add(institution)
        await self._db.flush()
        return institution

    async def active_institution_ids(self) -> set[int]:
        stmt = (
            select(
                func.coalesce(UserAccount.preferred_institution_id, DEFAULT_INSTITUTION_ID)
            )
            .distinct()
            .join(SavedList, SavedList.user_id == UserAccount.id)
        )
        result = await self._db.execute(stmt)
        institution_ids = {row[0] for row in result.all() if row[0] is not None}
        institution_ids.add(DEFAULT_INSTITUTION_ID)
        return institution_ids
