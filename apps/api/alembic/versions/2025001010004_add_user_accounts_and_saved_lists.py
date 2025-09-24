"""Add user accounts, sessions, and saved lists tables

Revision ID: 2025001010004
Revises: 2025001010003
Create Date: 2025-01-05 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2025001010004"
down_revision = "2025001010003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_account",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("email", name="uq_user_account_email"),
    )

    op.create_table(
        "user_session",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user_account.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_user_session_user_id", "user_session", ["user_id"])

    op.create_table(
        "saved_list",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            server_onupdate=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user_account.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_saved_list_user_id", "saved_list", ["user_id"])

    op.create_table(
        "saved_list_entry",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("list_id", sa.String(length=36), nullable=False),
        sa.Column("biomarker_id", sa.Integer(), nullable=True),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["list_id"], ["saved_list.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["biomarker_id"], ["biomarker.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("list_id", "code", name="uq_saved_list_entry_code"),
    )
    op.create_index("ix_saved_list_entry_list_id", "saved_list_entry", ["list_id"])
    op.create_index(
        "ix_saved_list_entry_biomarker_id",
        "saved_list_entry",
        ["biomarker_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_saved_list_entry_biomarker_id", table_name="saved_list_entry")
    op.drop_index("ix_saved_list_entry_list_id", table_name="saved_list_entry")
    op.drop_table("saved_list_entry")

    op.drop_index("ix_saved_list_user_id", table_name="saved_list")
    op.drop_table("saved_list")

    op.drop_index("ix_user_session_user_id", table_name="user_session")
    op.drop_table("user_session")

    op.drop_table("user_account")
