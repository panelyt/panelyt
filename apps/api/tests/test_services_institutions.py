from __future__ import annotations

from sqlalchemy import insert, select

from panelyt_api.db import models
from panelyt_api.ingest.types import DiagInstitution
from panelyt_api.services.institutions import InstitutionService


class TestInstitutionService:
    async def test_ensure_institution_creates_placeholder(self, db_session):
        service = InstitutionService(db_session)

        institution = await service.ensure_institution(2222)
        await db_session.commit()

        assert institution.id == 2222
        assert institution.name == "Institution 2222"

        stored = await db_session.execute(
            select(models.Institution).where(models.Institution.id == 2222)
        )
        assert stored.scalar_one().name == "Institution 2222"

    async def test_upsert_institution_updates_fields(self, db_session):
        service = InstitutionService(db_session)

        created = await service.upsert_institution(
            DiagInstitution(id=3333, name="Main Office", city="Krakow", address="Main 1")
        )
        await db_session.flush()

        assert created.name == "Main Office"
        assert created.city == "Krakow"
        assert created.address == "Main 1"

        updated = await service.upsert_institution(
            DiagInstitution(id=3333, name="Updated Office", city=None, address="Side 2")
        )
        await db_session.commit()

        assert updated.name == "Updated Office"
        assert updated.city is None
        assert updated.address == "Side 2"

        rows = await db_session.execute(
            select(models.Institution).where(models.Institution.id == 3333)
        )
        assert rows.scalar_one().name == "Updated Office"

    async def test_active_institution_ids_includes_default_and_user_preferences(
        self, db_session
    ):
        await db_session.execute(
            insert(models.Institution).values(
                [
                    {"id": 1135, "name": "Default / Lab office"},
                    {"id": 2222, "name": "Office 2222"},
                ]
            )
        )
        await db_session.execute(
            insert(models.UserAccount).values(
                [
                    {"id": "user-1", "preferred_institution_id": 2222},
                    {"id": "user-2", "preferred_institution_id": None},
                ]
            )
        )
        await db_session.execute(
            insert(models.SavedList).values(
                [
                    {"id": "list-1", "user_id": "user-1", "name": "List A"},
                    {"id": "list-2", "user_id": "user-2", "name": "List B"},
                ]
            )
        )
        await db_session.commit()

        service = InstitutionService(db_session)

        result = await service.active_institution_ids()

        assert result == {1135, 2222}
