"""Add Telegram linking fields and notification state

Revision ID: 2025001010009
Revises: 2025001010008
Create Date: 2025-01-06 10:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2025001010009"
down_revision = "2025001010008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_account",
        sa.Column("telegram_chat_id", sa.String(length=64), nullable=True),
    )
    op.create_unique_constraint(
        op.f("uq_user_account_telegram_chat_id"),
        "user_account",
        ["telegram_chat_id"],
    )
    op.add_column(
        "user_account",
        sa.Column("telegram_link_token", sa.String(length=64), nullable=True),
    )
    op.create_unique_constraint(
        op.f("uq_user_account_telegram_link_token"),
        "user_account",
        ["telegram_link_token"],
    )
    op.add_column(
        "user_account",
        sa.Column("telegram_link_token_created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "user_account",
        sa.Column("telegram_linked_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column(
        "saved_list",
        sa.Column(
            "notify_on_price_drop",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "saved_list",
        sa.Column("last_known_total_grosz", sa.Integer(), nullable=True),
    )
    op.add_column(
        "saved_list",
        sa.Column("last_total_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "saved_list",
        sa.Column("last_notified_total_grosz", sa.Integer(), nullable=True),
    )
    op.add_column(
        "saved_list",
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.execute("UPDATE saved_list SET notify_on_price_drop = false WHERE notify_on_price_drop IS NULL")
    op.alter_column(
        "saved_list",
        "notify_on_price_drop",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_constraint(op.f("uq_user_account_telegram_link_token"), "user_account", type_="unique")
    op.drop_constraint(op.f("uq_user_account_telegram_chat_id"), "user_account", type_="unique")
    op.drop_column("user_account", "telegram_linked_at")
    op.drop_column("user_account", "telegram_link_token_created_at")
    op.drop_column("user_account", "telegram_link_token")
    op.drop_column("user_account", "telegram_chat_id")

    op.drop_column("saved_list", "last_notified_at")
    op.drop_column("saved_list", "last_notified_total_grosz")
    op.drop_column("saved_list", "last_total_updated_at")
    op.drop_column("saved_list", "last_known_total_grosz")
    op.drop_column("saved_list", "notify_on_price_drop")
