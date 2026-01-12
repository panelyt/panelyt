from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "2026010900003_enforce_biomarker_slug_not_null.py"
)


def _load_migration_module():
    spec = spec_from_file_location("enforce_biomarker_slug_not_null", MIGRATION_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to load biomarker slug migration module")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _create_biomarker_table(connection) -> None:
    connection.execute(
        text(
            "CREATE TABLE biomarker ("
            "id INTEGER PRIMARY KEY, "
            "elab_code VARCHAR(64), "
            "slug VARCHAR(255), "
            "name VARCHAR(255) NOT NULL"
            ")"
        )
    )


def test_enforce_slug_not_null_raises_when_null_exists():
    module = _load_migration_module()

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        _create_biomarker_table(connection)
        connection.execute(
            text("INSERT INTO biomarker (id, elab_code, slug, name) VALUES (1, 'A1', NULL, 'Alpha')")
        )

        with pytest.raises(RuntimeError, match="biomarker.slug contains NULLs"):
            module._ensure_biomarker_slug_not_null(connection)


def test_enforce_slug_not_null_passes_when_data_clean():
    module = _load_migration_module()

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        _create_biomarker_table(connection)
        connection.execute(
            text(
                "INSERT INTO biomarker (id, elab_code, slug, name) "
                "VALUES (1, 'A1', 'alpha', 'Alpha')"
            )
        )

        module._ensure_biomarker_slug_not_null(connection)
