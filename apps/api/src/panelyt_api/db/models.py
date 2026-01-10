from __future__ import annotations

from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from panelyt_api.db.base import Base

JSON_TYPE = JSON().with_variant(JSONB, "postgresql")


class Biomarker(Base):
    __tablename__ = "biomarker"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    elab_code: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
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
    alias_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="common_name",
        server_default=text("'common_name'"),
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    biomarker: Mapped[Biomarker] = relationship("Biomarker", back_populates="aliases")


class Item(Base):
    __tablename__ = "item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    external_id: Mapped[str] = mapped_column(String(128), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="PLN")
    price_now_grosz: Mapped[int] = mapped_column(Integer, nullable=False)
    price_min30_grosz: Mapped[int] = mapped_column(Integer, nullable=False)
    sale_price_grosz: Mapped[int | None] = mapped_column(Integer, nullable=True)
    regular_price_grosz: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    biomarkers: Mapped[list[ItemBiomarker]] = relationship(
        "ItemBiomarker", back_populates="item", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list[PriceSnapshot]] = relationship(
        "PriceSnapshot", back_populates="item", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("kind IN ('package', 'single')", name="item_kind_check"),
        UniqueConstraint("external_id", name="uq_item_external_id"),
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
    payload: Mapped[dict] = mapped_column(JSON_TYPE, nullable=False)


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


class AppSetting(Base):
    __tablename__ = "app_setting"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class UserAccount(Base):
    __tablename__ = "user_account"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    username: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_admin: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    telegram_link_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    telegram_link_token_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    telegram_linked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    sessions: Mapped[list[UserSession]] = relationship(
        "UserSession", back_populates="user", cascade="all, delete-orphan"
    )
    lists: Mapped[list[SavedList]] = relationship(
        "SavedList", back_populates="user", cascade="all, delete-orphan"
    )


class UserSession(Base):
    __tablename__ = "user_session"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[UserAccount] = relationship("UserAccount", back_populates="sessions")


class SavedList(Base):
    __tablename__ = "saved_list"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    share_token: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True)
    shared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notify_on_price_drop: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    last_known_total_grosz: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_total_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_notified_total_grosz: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[UserAccount] = relationship("UserAccount", back_populates="lists")
    entries: Mapped[list[SavedListEntry]] = relationship(
        "SavedListEntry",
        back_populates="saved_list",
        cascade="all, delete-orphan",
        order_by="SavedListEntry.sort_order",
    )


class SavedListEntry(Base):
    __tablename__ = "saved_list_entry"
    __table_args__ = (
        UniqueConstraint("list_id", "code", name="uq_saved_list_entry_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    list_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saved_list.id", ondelete="CASCADE"), nullable=False
    )
    biomarker_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("biomarker.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    saved_list: Mapped[SavedList] = relationship("SavedList", back_populates="entries")
    biomarker: Mapped[Biomarker | None] = relationship("Biomarker")


class BiomarkerListTemplate(Base):
    __tablename__ = "biomarker_list_template"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    entries: Mapped[list[BiomarkerListTemplateEntry]] = relationship(
        "BiomarkerListTemplateEntry",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="BiomarkerListTemplateEntry.sort_order",
    )


class BiomarkerListTemplateEntry(Base):
    __tablename__ = "biomarker_list_template_entry"
    __table_args__ = (
        UniqueConstraint(
            "template_id",
            "code",
            name="uq_biomarker_list_template_entry_code",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("biomarker_list_template.id", ondelete="CASCADE"),
        nullable=False,
    )
    biomarker_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("biomarker.id", ondelete="SET NULL"),
        nullable=True,
    )
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    template: Mapped[BiomarkerListTemplate] = relationship(
        "BiomarkerListTemplate", back_populates="entries"
    )
    biomarker: Mapped[Biomarker | None] = relationship("Biomarker")


__all__ = [
    "AppActivity",
    "AppSetting",
    "Biomarker",
    "BiomarkerAlias",
    "BiomarkerListTemplate",
    "BiomarkerListTemplateEntry",
    "IngestionLog",
    "Item",
    "ItemBiomarker",
    "PriceSnapshot",
    "RawSnapshot",
    "SavedList",
    "SavedListEntry",
    "UserAccount",
    "UserSession",
]
