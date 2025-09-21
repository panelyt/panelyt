from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from panelyt_api.db.base import Base


class Biomarker(Base):
    __tablename__ = "biomarker"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    elab_code: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    slug: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    items: Mapped[list[ItemBiomarker]] = relationship("ItemBiomarker", back_populates="biomarker")
    aliases: Mapped[list[BiomarkerAlias]] = relationship(
        "BiomarkerAlias", back_populates="biomarker", cascade="all, delete-orphan"
    )


class BiomarkerAlias(Base):
    __tablename__ = "biomarker_alias"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    biomarker_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("biomarker.id", ondelete="CASCADE"), nullable=False
    )
    alias: Mapped[str] = mapped_column(String(255), nullable=False)
    alias_type: Mapped[str] = mapped_column(String(32), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    biomarker: Mapped[Biomarker] = relationship("Biomarker", back_populates="aliases")


class Item(Base):
    __tablename__ = "item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="PLN")
    price_now_grosz: Mapped[int] = mapped_column(Integer, nullable=False)
    price_min30_grosz: Mapped[int] = mapped_column(Integer, nullable=False)
    sale_price_grosz: Mapped[int | None] = mapped_column(Integer, nullable=True)
    regular_price_grosz: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    biomarkers: Mapped[list[ItemBiomarker]] = relationship(
        "ItemBiomarker", back_populates="item", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list[PriceSnapshot]] = relationship(
        "PriceSnapshot", back_populates="item", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("kind IN ('package', 'single')", name="item_kind_check"),
    )


class ItemBiomarker(Base):
    __tablename__ = "item_biomarker"

    item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("item.id", ondelete="CASCADE"), primary_key=True
    )
    biomarker_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("biomarker.id", ondelete="CASCADE"), primary_key=True
    )

    item: Mapped[Item] = relationship("Item", back_populates="biomarkers")
    biomarker: Mapped[Biomarker] = relationship("Biomarker", back_populates="items")


class PriceSnapshot(Base):
    __tablename__ = "price_snapshot"

    item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("item.id", ondelete="CASCADE"), primary_key=True
    )
    snap_date: Mapped[date] = mapped_column(Date, primary_key=True)
    price_now_grosz: Mapped[int] = mapped_column(Integer, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    item: Mapped[Item] = relationship("Item", back_populates="snapshots")


class RawSnapshot(Base):
    __tablename__ = "raw_snapshot"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)


class IngestionLog(Base):
    __tablename__ = "ingestion_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="started")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class AppActivity(Base):
    __tablename__ = "app_activity"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


__all__ = [
    "AppActivity",
    "Biomarker",
    "BiomarkerAlias",
    "IngestionLog",
    "Item",
    "ItemBiomarker",
    "PriceSnapshot",
    "RawSnapshot",
]
