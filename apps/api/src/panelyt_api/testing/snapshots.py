from __future__ import annotations

import os
from pathlib import Path

_UPDATE_ENV = "UPDATE_SNAPSHOTS"


def _can_update_snapshots() -> bool:
    return os.getenv(_UPDATE_ENV) == "1"


def assert_snapshot_text(snapshot_path: Path, content: str) -> None:
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)

    if snapshot_path.exists():
        existing = snapshot_path.read_text(encoding="utf-8")
        if existing == content:
            return
        if _can_update_snapshots():
            snapshot_path.write_text(content, encoding="utf-8")
            return
        raise AssertionError(
            f"Snapshot mismatch for {snapshot_path}. Set {_UPDATE_ENV}=1 to update.",
        )

    if _can_update_snapshots():
        snapshot_path.write_text(content, encoding="utf-8")
        return

    raise AssertionError(
        f"Snapshot missing at {snapshot_path}. Set {_UPDATE_ENV}=1 to create.",
    )
