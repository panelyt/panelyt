"""Add user language code

Revision ID: 2026011800001
Revises: 2026011600001
Create Date: 2026-01-18 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2026011800001"
down_revision = "2026011600001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_account",
        sa.Column("language_code", sa.String(length=10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_account", "language_code")
