from __future__ import annotations

import json
from pathlib import Path

from panelyt_api.testing.snapshots import assert_snapshot_text


def _serialize_openapi(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def test_openapi_snapshot(app) -> None:
    snapshot_path = Path(__file__).parent / "snapshots" / "openapi.json"
    serialized = _serialize_openapi(app.openapi())
    assert_snapshot_text(snapshot_path, serialized)
