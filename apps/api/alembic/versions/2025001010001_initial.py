"""Initial schema for Panelyt

Revision ID: 2025001010001
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "2025001010001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "biomarker",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("elab_code", sa.String(length=64), nullable=True),
        sa.Column("slug", sa.String(length=255), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.UniqueConstraint("elab_code", name="uq_biomarker_elab"),
        sa.UniqueConstraint("slug", name="uq_biomarker_slug"),
    )

    op.create_table(
        "item",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default=sa.text("'PLN'")),
        sa.Column("price_now_grosz", sa.Integer(), nullable=False),
        sa.Column("price_min30_grosz", sa.Integer(), nullable=False),
        sa.Column("sale_price_grosz", sa.Integer(), nullable=True),
        sa.Column("regular_price_grosz", sa.Integer(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('package','single')", name="item_kind_check"),
    )

    op.create_table(
        "item_biomarker",
        sa.Column("item_id", sa.BigInteger(), nullable=False),
        sa.Column("biomarker_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["biomarker_id"], ["biomarker.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("item_id", "biomarker_id"),
    )

    op.create_table(
        "price_snapshot",
        sa.Column("item_id", sa.BigInteger(), nullable=False),
        sa.Column("snap_date", sa.Date(), nullable=False),
        sa.Column("price_now_grosz", sa.Integer(), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("item_id", "snap_date"),
    )

    op.create_table(
        "raw_snapshot",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )

    op.create_table(
        "ingestion_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'started'")),
        sa.Column("note", sa.Text(), nullable=True),
    )

    op.create_table(
        "app_activity",
        sa.Column("name", sa.String(length=64), primary_key=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_index(
        "panelyt_idx_item_kind_avail",
        "item",
        ["kind", "is_available"],
    )
    op.create_index(
        "panelyt_idx_item_price_now",
        "item",
        ["price_now_grosz"],
    )
    op.create_index(
        "panelyt_idx_ib_biomarker",
        "item_biomarker",
        ["biomarker_id"],
    )
    op.create_index(
        "panelyt_idx_snap_date_item",
        "price_snapshot",
        ["snap_date", "item_id"],
    )


def downgrade() -> None:
    op.drop_index("panelyt_idx_snap_date_item", table_name="price_snapshot")
    op.drop_index("panelyt_idx_ib_biomarker", table_name="item_biomarker")
    op.drop_index("panelyt_idx_item_price_now", table_name="item")
    op.drop_index("panelyt_idx_item_kind_avail", table_name="item")
    op.drop_table("app_activity")
    op.drop_table("ingestion_log")
    op.drop_table("raw_snapshot")
    op.drop_table("price_snapshot")
    op.drop_table("item_biomarker")
    op.drop_table("item")
    op.drop_table("biomarker")
