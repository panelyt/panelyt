from __future__ import annotations

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

from panelyt_api.core.settings import get_settings

metadata = MetaData(schema=get_settings().db_schema)


class Base(DeclarativeBase):
    metadata = metadata
