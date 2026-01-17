import pytest

from panelyt_api.testing.snapshots import assert_snapshot_text


def test_snapshot_missing_requires_update_flag(tmp_path, monkeypatch):
    snapshot_path = tmp_path / "sample.txt"
    monkeypatch.delenv("UPDATE_SNAPSHOTS", raising=False)

    with pytest.raises(AssertionError, match="UPDATE_SNAPSHOTS"):
        assert_snapshot_text(snapshot_path, "payload")

    assert not snapshot_path.exists()


def test_snapshot_missing_updates_with_flag(tmp_path, monkeypatch):
    snapshot_path = tmp_path / "sample.txt"
    monkeypatch.setenv("UPDATE_SNAPSHOTS", "1")

    assert_snapshot_text(snapshot_path, "payload")

    assert snapshot_path.read_text(encoding="utf-8") == "payload"


def test_snapshot_mismatch_requires_update_flag(tmp_path, monkeypatch):
    snapshot_path = tmp_path / "sample.txt"
    snapshot_path.write_text("initial", encoding="utf-8")
    monkeypatch.delenv("UPDATE_SNAPSHOTS", raising=False)

    with pytest.raises(AssertionError, match="UPDATE_SNAPSHOTS"):
        assert_snapshot_text(snapshot_path, "updated")

    assert snapshot_path.read_text(encoding="utf-8") == "initial"


def test_snapshot_mismatch_updates_with_flag(tmp_path, monkeypatch):
    snapshot_path = tmp_path / "sample.txt"
    snapshot_path.write_text("initial", encoding="utf-8")
    monkeypatch.setenv("UPDATE_SNAPSHOTS", "1")

    assert_snapshot_text(snapshot_path, "updated")

    assert snapshot_path.read_text(encoding="utf-8") == "updated"
