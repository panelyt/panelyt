"""add institutions and per-institution offers

Revision ID: 2026011200001
Revises: 2026010900003
Create Date: 2026-01-12 00:00:01.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import column, table


# revision identifiers, used by Alembic.
revision = "2026011200001"
down_revision = "2026010900003"
branch_labels = None
depends_on = None


_DEFAULT_INSTITUTION_ID = 1135


def _default_institution_row() -> dict[str, object]:
    return {
        "id": _DEFAULT_INSTITUTION_ID,
        "name": "Default / Lab office",
        "city": None,
        "address": None,
        "postal_code": None,
        "is_temporary_disabled": False,
        "attributes": None,
    }


def _backfill_institution_items(connection, institution_id: int) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO institution_item ("
            "institution_id, item_id, is_available, currency, price_now_grosz, "
            "price_min30_grosz, sale_price_grosz, regular_price_grosz, fetched_at"
            ") "
            "SELECT :institution_id, id, is_available, currency, price_now_grosz, "
            "price_min30_grosz, sale_price_grosz, regular_price_grosz, fetched_at "
            "FROM item"
        ),
        {"institution_id": institution_id},
    )


def _backfill_price_snapshots(connection, institution_id: int) -> None:
    connection.execute(
        sa.text(
            "UPDATE price_snapshot "
            "SET institution_id = :institution_id "
            "WHERE institution_id IS NULL"
        ),
        {"institution_id": institution_id},
    )
    connection.execute(
        sa.text(
            "UPDATE price_snapshot SET "
            "price_min30_grosz = ("
            "SELECT price_min30_grosz FROM item WHERE item.id = price_snapshot.item_id"
            "), "
            "sale_price_grosz = ("
            "SELECT sale_price_grosz FROM item WHERE item.id = price_snapshot.item_id"
            "), "
            "regular_price_grosz = ("
            "SELECT regular_price_grosz FROM item WHERE item.id = price_snapshot.item_id"
            ")"
        )
    )


def upgrade() -> None:
    attributes_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

    op.create_table(
        "institution",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("city", sa.String(length=255), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("postal_code", sa.String(length=32), nullable=True),
        sa.Column(
            "is_temporary_disabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("attributes", attributes_type, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "institution_item",
        sa.Column("institution_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("price_now_grosz", sa.Integer(), nullable=False),
        sa.Column("price_min30_grosz", sa.Integer(), nullable=False),
        sa.Column("sale_price_grosz", sa.Integer(), nullable=True),
        sa.Column("regular_price_grosz", sa.Integer(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["institution_id"],
            ["institution.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("institution_id", "item_id", name="uq_institution_item"),
    )

    op.add_column(
        "price_snapshot",
        sa.Column("institution_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "price_snapshot",
        sa.Column("price_min30_grosz", sa.Integer(), nullable=True),
    )
    op.add_column(
        "price_snapshot",
        sa.Column("sale_price_grosz", sa.Integer(), nullable=True),
    )
    op.add_column(
        "price_snapshot",
        sa.Column("regular_price_grosz", sa.Integer(), nullable=True),
    )

    op.create_foreign_key(
        "fk_price_snapshot_institution_id",
        "price_snapshot",
        "institution",
        ["institution_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.add_column(
        "user_account",
        sa.Column("preferred_institution_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_user_account_preferred_institution_id",
        "user_account",
        "institution",
        ["preferred_institution_id"],
        ["id"],
        ondelete="SET NULL",
    )

    institution_table = table(
        "institution",
        column("id", sa.Integer()),
        column("name", sa.String()),
        column("city", sa.String()),
        column("address", sa.String()),
        column("postal_code", sa.String()),
        column("is_temporary_disabled", sa.Boolean()),
        column("attributes", attributes_type),
    )

    op.bulk_insert(institution_table, [_default_institution_row()])

    bind = op.get_bind()
    _backfill_institution_items(bind, _DEFAULT_INSTITUTION_ID)
    _backfill_price_snapshots(bind, _DEFAULT_INSTITUTION_ID)

    op.execute("DROP INDEX IF EXISTS panelyt_idx_snap_date_item")
    op.execute("DROP INDEX IF EXISTS idx_snapshot_item_date")
    op.execute("DROP INDEX IF EXISTS idx_price_snapshot_date")

    op.alter_column(
        "price_snapshot",
        "institution_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "price_snapshot",
        "price_min30_grosz",
        existing_type=sa.Integer(),
        nullable=False,
    )

    op.drop_constraint("price_snapshot_pkey", "price_snapshot", type_="primary")
    op.create_primary_key(
        "pk_price_snapshot",
        "price_snapshot",
        ["institution_id", "item_id", "snap_date"],
    )

    op.create_index(
        "idx_price_snapshot_institution_date",
        "price_snapshot",
        ["institution_id", "snap_date"],
    )

    op.execute(
        "CREATE INDEX idx_institution_item_available "
        "ON institution_item (institution_id, is_available) "
        "WHERE is_available = true"
    )
    op.execute(
        "CREATE INDEX idx_institution_item_price "
        "ON institution_item (institution_id, price_now_grosz) "
        "WHERE is_available = true AND price_now_grosz > 0"
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade not supported for add_institutions_and_offers")


__all__ = [
    "_default_institution_row",
    "_backfill_institution_items",
    "_backfill_price_snapshots",
]
