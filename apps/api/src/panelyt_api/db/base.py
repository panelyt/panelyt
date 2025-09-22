from __future__ import annotations

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

from panelyt_api.core.settings import get_settings


def _get_schema():
    settings = get_settings()
    # SQLite doesn't support schemas, so return None for SQLite databases
    if settings.database_url.startswith("sqlite"):
        return None
    return settings.db_schema

metadata = MetaData(schema=_get_schema())


class Base(DeclarativeBase):
    metadata = metadata
