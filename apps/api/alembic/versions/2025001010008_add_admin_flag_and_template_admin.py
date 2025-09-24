"""Add admin flag to users and expand template management

Revision ID: 2025001010008
Revises: 2025001010007
Create Date: 2025-01-05 15:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2025001010008"
down_revision = "2025001010007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_account",
        sa.Column(
            "is_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.alter_column(
        "user_account",
        "is_admin",
        server_default=None,
    )

    # Ensure existing rows default to false explicitly
    op.execute("UPDATE user_account SET is_admin = false WHERE is_admin IS NULL")


def downgrade() -> None:
    op.drop_column("user_account", "is_admin")
