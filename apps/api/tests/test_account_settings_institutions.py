from __future__ import annotations

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from panelyt_api.db import models


@pytest.mark.asyncio
async def test_update_preferred_institution_persists_and_resets(
    async_client: AsyncClient,
    db_session,
):
    session_response = await async_client.post("/users/session")
    assert session_response.status_code == 200
    user_id = session_response.json()["user_id"]

    saved_list = models.SavedList(
        user_id=user_id,
        name="My list",
        last_known_total_grosz=12300,
        last_total_updated_at=datetime.now(UTC),
        last_notified_total_grosz=12000,
        last_notified_at=datetime.now(UTC),
    )
    db_session.add(saved_list)
    await db_session.commit()

    response = await async_client.patch(
        "/account/settings",
        json={"preferred_institution_id": 2222},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["preferred_institution_id"] == 2222

    stored_user = await db_session.get(models.UserAccount, user_id)
    assert stored_user is not None
    assert stored_user.preferred_institution_id == 2222

    institution = await db_session.get(models.Institution, 2222)
    assert institution is not None

    refreshed = await db_session.execute(
        select(models.SavedList).where(models.SavedList.id == saved_list.id)
    )
    updated_list = refreshed.scalar_one()
    assert updated_list.last_known_total_grosz is None
    assert updated_list.last_total_updated_at is None
    assert updated_list.last_notified_total_grosz is None
    assert updated_list.last_notified_at is None
