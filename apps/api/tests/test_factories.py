from __future__ import annotations

from datetime import UTC, datetime, date

from tests.factories import (
    make_biomarker,
    make_institution,
    make_item,
    make_price_snapshot,
    make_raw_snapshot,
)


def test_make_item_overrides_fields() -> None:
    fetched_at = datetime(2025, 1, 1, 12, 0, 0, tzinfo=UTC)
    item = make_item(id=10, external_id="custom", fetched_at=fetched_at)

    assert item["id"] == 10
    assert item["external_id"] == "custom"
    assert item["fetched_at"] == fetched_at


def test_make_price_snapshot_defaults_and_overrides() -> None:
    snap_date = date(2025, 1, 2)
    snapshot = make_price_snapshot(
        institution_id=1135,
        item_id=1,
        snap_date=snap_date,
        price_now_grosz=1500,
    )

    assert snapshot["institution_id"] == 1135
    assert snapshot["item_id"] == 1
    assert snapshot["snap_date"] == snap_date
    assert snapshot["price_now_grosz"] == 1500


def test_make_helpers_return_expected_keys() -> None:
    assert "id" in make_institution()
    assert "name" in make_institution()
    assert "elab_code" in make_biomarker()
    assert "slug" in make_biomarker()
    assert "payload" in make_raw_snapshot()
