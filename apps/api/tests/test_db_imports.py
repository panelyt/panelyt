from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB

from panelyt_api.core import settings as settings_module
from panelyt_api.db import models


def _load_module_from_path(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _assert_json_variant(column) -> None:
    assert isinstance(column.type, JSON)
    assert "postgresql" in column.type._variant_mapping
    assert isinstance(column.type._variant_mapping["postgresql"], JSONB)


def test_db_base_import_does_not_call_get_settings(monkeypatch) -> None:
    def _boom():
        raise RuntimeError("get_settings should not be called at import time")

    monkeypatch.setattr(settings_module, "get_settings", _boom)

    base_path = (
        Path(__file__).resolve().parents[1]
        / "src"
        / "panelyt_api"
        / "db"
        / "base.py"
    )

    _load_module_from_path("panelyt_api.db.base_import_test", base_path)


def test_json_columns_use_postgres_variant() -> None:
    _assert_json_variant(models.LabBiomarker.__table__.columns.attributes)
    _assert_json_variant(models.LabItem.__table__.columns.attributes)
    _assert_json_variant(models.RawSnapshot.__table__.columns.payload)
