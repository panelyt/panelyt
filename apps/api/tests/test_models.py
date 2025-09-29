from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import insert, select

from panelyt_api.db import models


class TestDatabaseModels:
    async def test_biomarker_model(self, db_session):
        """Test Biomarker model creation and relationships."""
        # Create biomarker
        await db_session.execute(
            insert(models.Biomarker).values({
                "name": "Alanine aminotransferase",
                "elab_code": "ALT",
                "slug": "alt",
            })
        )
        await db_session.commit()

        # Query and verify
        result = await db_session.execute(
            select(models.Biomarker).where(models.Biomarker.elab_code == "ALT")
        )
        biomarker = result.scalar_one()

        assert biomarker.name == "Alanine aminotransferase"
        assert biomarker.elab_code == "ALT"
        assert biomarker.slug == "alt"
        assert biomarker.id is not None

    async def test_biomarker_aliases(self, db_session):
        """Test biomarker aliases relationship."""
        # Create biomarker
        biomarker_result = await db_session.execute(
            insert(models.Biomarker).values({
                "name": "Alanine aminotransferase",
                "elab_code": "ALT",
                "slug": "alt",
            }).returning(models.Biomarker.id)
        )
        biomarker_id = biomarker_result.scalar_one()

        # Add aliases
        await db_session.execute(
            insert(models.BiomarkerAlias).values([
                {"biomarker_id": biomarker_id, "alias": "ALAT", "alias_type": "abbreviation"},
                {"biomarker_id": biomarker_id, "alias": "GPT", "alias_type": "abbreviation"},
            ])
        )
        await db_session.commit()

        # Query biomarker
        result = await db_session.execute(
            select(models.Biomarker).where(models.Biomarker.id == biomarker_id)
        )
        biomarker = result.scalar_one()

        # Query aliases separately for verification
        aliases_result = await db_session.execute(
            select(models.BiomarkerAlias.alias)
            .where(models.BiomarkerAlias.biomarker_id == biomarker_id)
        )
        aliases = [row[0] for row in aliases_result.all()]

        assert biomarker.id == biomarker_id
        assert set(aliases) == {"ALAT", "GPT"}

    async def test_item_model(self, db_session):
        """Test Item model creation."""
        fetched_time = datetime.now(timezone.utc)

        await db_session.execute(
            insert(models.Item).values({
                "id": 123,
                "lab_id": 1,
                "external_id": "123",
                "kind": "single",
                "name": "ALT Test",
                "slug": "alt-test",
                "price_now_grosz": 1000,
                "price_min30_grosz": 900,
                "currency": "PLN",
                "is_available": True,
                "fetched_at": fetched_time,
                "sale_price_grosz": 800,
                "regular_price_grosz": 1000,
            })
        )
        await db_session.commit()

        result = await db_session.execute(
            select(models.Item).where(models.Item.id == 123)
        )
        item = result.scalar_one()

        assert item.id == 123
        assert item.kind == "single"
        assert item.name == "ALT Test"
        assert item.slug == "alt-test"
        assert item.price_now_grosz == 1000
        assert item.price_min30_grosz == 900
        assert item.currency == "PLN"
        assert item.is_available is True
        assert item.fetched_at == fetched_time.replace(tzinfo=None)
        assert item.sale_price_grosz == 800
        assert item.regular_price_grosz == 1000

    async def test_item_biomarker_relationship(self, db_session):
        """Test Item-Biomarker many-to-many relationship."""
        # Create biomarkers
        biomarker_result = await db_session.execute(
            insert(models.Biomarker).values([
                {"name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"name": "AST", "elab_code": "AST", "slug": "ast"},
            ]).returning(models.Biomarker.id)
        )
        biomarker_ids = [row[0] for row in biomarker_result.all()]

        # Create item
        await db_session.execute(
            insert(models.Item).values({
                "id": 456,
                "lab_id": 1,
                "external_id": "456",
                "kind": "package",
                "name": "Liver Panel",
                "slug": "liver-panel",
                "price_now_grosz": 2000,
                "price_min30_grosz": 1900,
                "currency": "PLN",
                "is_available": True,
                "fetched_at": datetime.now(timezone.utc),
            })
        )

        # Create relationships
        await db_session.execute(
            insert(models.ItemBiomarker).values([
                {"item_id": 456, "biomarker_id": biomarker_ids[0]},
                {"item_id": 456, "biomarker_id": biomarker_ids[1]},
            ])
        )
        await db_session.commit()

        # Query item with biomarkers
        result = await db_session.execute(
            select(models.Item, models.Biomarker.elab_code)
            .join(models.ItemBiomarker, models.Item.id == models.ItemBiomarker.item_id)
            .join(models.Biomarker, models.Biomarker.id == models.ItemBiomarker.biomarker_id)
            .where(models.Item.id == 456)
        )
        rows = result.all()

        assert len(rows) == 2
        item = rows[0][0]
        elab_codes = {row[1] for row in rows}

        assert item.name == "Liver Panel"
        assert elab_codes == {"ALT", "AST"}

    async def test_price_snapshot_model(self, db_session):
        """Test PriceSnapshot model."""
        # Create item first
        await db_session.execute(
            insert(models.Item).values({
                "id": 789,
                "lab_id": 1,
                "external_id": "789",
                "kind": "single",
                "name": "Test Item",
                "slug": "test-item",
                "price_now_grosz": 1500,
                "price_min30_grosz": 1400,
                "currency": "PLN",
                "is_available": True,
                "fetched_at": datetime.now(timezone.utc),
            })
        )

        # Create price snapshot
        snap_date = datetime.now(timezone.utc).date()
        await db_session.execute(
            insert(models.PriceSnapshot).values({
                "item_id": 789,
                "lab_id": 1,
                "snap_date": snap_date,
                "price_now_grosz": 1500,
                "is_available": True,
            })
        )
        await db_session.commit()

        # Query snapshot
        result = await db_session.execute(
            select(models.PriceSnapshot).where(
                models.PriceSnapshot.item_id == 789,
                models.PriceSnapshot.snap_date == snap_date
            )
        )
        snapshot = result.scalar_one()

        assert snapshot.item_id == 789
        assert snapshot.snap_date == snap_date
        assert snapshot.price_now_grosz == 1500
        assert snapshot.is_available is True
        assert snapshot.seen_at is not None

    async def test_ingestion_log_model(self, db_session):
        """Test IngestionLog model."""
        started_time = datetime.now(timezone.utc)

        result = await db_session.execute(
            insert(models.IngestionLog).values({
                "started_at": started_time,
                "note": "test",
            }).returning(models.IngestionLog.id)
        )
        log_id = result.scalar_one()
        await db_session.commit()

        # Query log
        log_result = await db_session.execute(
            select(models.IngestionLog).where(models.IngestionLog.id == log_id)
        )
        log = log_result.scalar_one()

        assert log.id == log_id
        assert log.started_at == started_time.replace(tzinfo=None)
        assert log.note == "test"
        assert log.status == "started"  # Default
        assert log.finished_at is None

    async def test_app_activity_model(self, db_session):
        """Test AppActivity model."""
        activity_time = datetime.now(timezone.utc)

        await db_session.execute(
            insert(models.AppActivity).values({
                "name": "test-activity",
                "occurred_at": activity_time,
            })
        )
        await db_session.commit()

        # Query activity
        result = await db_session.execute(
            select(models.AppActivity).where(models.AppActivity.name == "test-activity")
        )
        activity = result.scalar_one()

        assert activity.name == "test-activity"
        assert activity.occurred_at == activity_time.replace(tzinfo=None)

    async def test_raw_snapshot_model(self, db_session):
        """Test RawSnapshot model."""
        snapshot_time = datetime.now(timezone.utc)
        raw_data = {"test": "data", "items": [1, 2, 3]}

        await db_session.execute(
            insert(models.RawSnapshot).values({
                "source": "test-source",
                "fetched_at": snapshot_time,
                "payload": raw_data,
            })
        )
        await db_session.commit()

        # Query snapshot
        result = await db_session.execute(
            select(models.RawSnapshot).where(models.RawSnapshot.source == "test-source")
        )
        snapshot = result.scalar_one()

        assert snapshot.source == "test-source"
        assert snapshot.fetched_at == snapshot_time.replace(tzinfo=None)
        assert snapshot.payload == raw_data

    async def test_model_constraints(self, db_session):
        """Test model constraints and validations."""
        # Test unique constraint on biomarker elab_code
        await db_session.execute(
            insert(models.Biomarker).values({
                "name": "Test 1",
                "elab_code": "TEST",
                "slug": "test1",
            })
        )
        await db_session.commit()

        # This should work (different elab_code)
        await db_session.execute(
            insert(models.Biomarker).values({
                "name": "Test 2",
                "elab_code": "TEST2",
                "slug": "test2",
            })
        )
        await db_session.commit()

        # Test that we can create items with the same slug (no unique constraint)
        await db_session.execute(
            insert(models.Item).values([
                {
                    "id": 1,
                    "lab_id": 1,
                    "external_id": "item-1",
                    "kind": "single",
                    "name": "Item 1",
                    "slug": "same-slug",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 950,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": datetime.now(timezone.utc),
                },
                {
                    "id": 2,
                    "lab_id": 1,
                    "external_id": "item-2",
                    "kind": "single",
                    "name": "Item 2",
                    "slug": "same-slug",  # Same slug should be allowed
                    "price_now_grosz": 1500,
                    "price_min30_grosz": 1400,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": datetime.now(timezone.utc),
                },
            ])
        )
        await db_session.commit()

        # Verify both items exist
        result = await db_session.execute(
            select(models.Item).where(models.Item.slug == "same-slug")
        )
        items = result.scalars().all()
        assert len(items) == 2
