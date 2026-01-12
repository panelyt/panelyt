from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from sqlalchemy import create_engine, text


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "2026011200001_add_institutions_and_offers.py"
)


def _load_migration_module():
    spec = spec_from_file_location("add_institutions_and_offers", MIGRATION_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to load institutions migration module")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _create_item_table(connection) -> None:
    connection.execute(
        text(
            "CREATE TABLE item ("
            "id INTEGER PRIMARY KEY, "
            "is_available BOOLEAN NOT NULL, "
            "currency TEXT NOT NULL, "
            "price_now_grosz INTEGER NOT NULL, "
            "price_min30_grosz INTEGER NOT NULL, "
            "sale_price_grosz INTEGER, "
            "regular_price_grosz INTEGER, "
            "fetched_at TIMESTAMP NOT NULL"
            ")"
        )
    )


def _create_institution_item_table(connection) -> None:
    connection.execute(
        text(
            "CREATE TABLE institution_item ("
            "institution_id INTEGER NOT NULL, "
            "item_id INTEGER NOT NULL, "
            "is_available BOOLEAN NOT NULL, "
            "currency TEXT NOT NULL, "
            "price_now_grosz INTEGER NOT NULL, "
            "price_min30_grosz INTEGER NOT NULL, "
            "sale_price_grosz INTEGER, "
            "regular_price_grosz INTEGER, "
            "fetched_at TIMESTAMP NOT NULL"
            ")"
        )
    )


def _create_price_snapshot_table(connection) -> None:
    connection.execute(
        text(
            "CREATE TABLE price_snapshot ("
            "item_id INTEGER NOT NULL, "
            "snap_date DATE NOT NULL, "
            "price_now_grosz INTEGER NOT NULL, "
            "is_available BOOLEAN NOT NULL, "
            "seen_at TIMESTAMP NOT NULL, "
            "institution_id INTEGER, "
            "price_min30_grosz INTEGER, "
            "sale_price_grosz INTEGER, "
            "regular_price_grosz INTEGER"
            ")"
        )
    )


def test_default_institution_row():
    module = _load_migration_module()

    row = module._default_institution_row()

    assert row["id"] == 1135
    assert row["name"] == "Default / Lab office"


def test_backfill_institution_items_copies_item_fields():
    module = _load_migration_module()

    engine = create_engine("sqlite://")
    fetched_at = "2026-01-12 10:00:00"

    with engine.begin() as connection:
        _create_item_table(connection)
        _create_institution_item_table(connection)
        connection.execute(
            text(
                "INSERT INTO item ("
                "id, is_available, currency, price_now_grosz, price_min30_grosz, "
                "sale_price_grosz, regular_price_grosz, fetched_at"
                ") VALUES ("
                "1, 1, 'PLN', 1200, 1000, 800, 1500, :fetched_at"
                ")"
            ),
            {"fetched_at": fetched_at},
        )

        module._backfill_institution_items(connection, 1135)

        row = connection.execute(
            text(
                "SELECT institution_id, item_id, is_available, currency, "
                "price_now_grosz, price_min30_grosz, sale_price_grosz, "
                "regular_price_grosz, fetched_at "
                "FROM institution_item"
            )
        ).one()

    assert row[0] == 1135
    assert row[1] == 1
    assert row[2] == 1
    assert row[3] == "PLN"
    assert row[4] == 1200
    assert row[5] == 1000
    assert row[6] == 800
    assert row[7] == 1500
    assert str(row[8]).startswith("2026-01-12 10:00:00")


def test_backfill_price_snapshots_sets_institution_and_prices():
    module = _load_migration_module()

    engine = create_engine("sqlite://")
    seen_at = "2026-01-12 11:00:00"

    with engine.begin() as connection:
        _create_item_table(connection)
        _create_price_snapshot_table(connection)
        connection.execute(
            text(
                "INSERT INTO item ("
                "id, is_available, currency, price_now_grosz, price_min30_grosz, "
                "sale_price_grosz, regular_price_grosz, fetched_at"
                ") VALUES ("
                "9, 1, 'PLN', 1600, 1400, 1200, 1800, :fetched_at"
                ")"
            ),
            {"fetched_at": seen_at},
        )
        connection.execute(
            text(
                "INSERT INTO price_snapshot ("
                "item_id, snap_date, price_now_grosz, is_available, seen_at"
                ") VALUES ("
                "9, '2026-01-12', 1600, 1, :seen_at"
                ")"
            ),
            {"seen_at": seen_at},
        )

        module._backfill_price_snapshots(connection, 1135)

        row = connection.execute(
            text(
                "SELECT institution_id, price_min30_grosz, sale_price_grosz, "
                "regular_price_grosz FROM price_snapshot"
            )
        ).one()

    assert row == (1135, 1400, 1200, 1800)
