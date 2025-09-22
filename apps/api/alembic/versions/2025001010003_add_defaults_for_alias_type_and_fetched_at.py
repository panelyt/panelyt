"""Add defaults for alias type and fetched_at

Revision ID: 2025001010003
Revises: 2025001010002
Create Date: 2025-01-20 09:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2025001010003"
down_revision = "2025001010002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "biomarker_alias",
        "alias_type",
        existing_type=sa.String(length=32),
        existing_nullable=False,
        server_default=sa.text("'common_name'"),
    )
    op.alter_column(
        "item",
        "fetched_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=sa.text("NOW()"),
    )


def downgrade() -> None:
    op.alter_column(
        "item",
        "fetched_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=None,
    )
    op.alter_column(
        "biomarker_alias",
        "alias_type",
        existing_type=sa.String(length=32),
        existing_nullable=False,
        server_default=None,
    )
