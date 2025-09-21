from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.ingest.repository import IngestionRepository


async def touch_user_activity(session: AsyncSession) -> None:
    repo = IngestionRepository(session)
    await repo.record_user_activity(datetime.now(timezone.utc))
