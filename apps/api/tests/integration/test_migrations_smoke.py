from __future__ import annotations

import pytest
from sqlalchemy import create_engine, inspect


@pytest.mark.integration
def test_migrations_apply_cleanly(
    migrated_database, integration_database_url: str, integration_schema: str
) -> None:
    engine = create_engine(integration_database_url)
    inspector = inspect(engine)
    tables = inspector.get_table_names(schema=integration_schema)
    engine.dispose()

    assert "item" in tables
    assert "biomarker" in tables
