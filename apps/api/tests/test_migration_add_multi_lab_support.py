from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "2025001010011_add_multi_lab_support.py"
)


def _load_migration_module():
    spec = spec_from_file_location("add_multi_lab_support", MIGRATION_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to load multi lab migration module")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_seeded_labs_include_only_diag():
    module = _load_migration_module()

    rows = module._lab_seed_rows()

    assert [row["code"] for row in rows] == ["diag"]
