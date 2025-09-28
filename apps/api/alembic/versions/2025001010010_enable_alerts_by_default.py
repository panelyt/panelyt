"""Enable alerts by default for saved lists

Revision ID: 2025001010010
Revises: 2025001010009
Create Date: 2025-09-27 18:05:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2025001010010"
down_revision = "2025001010009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "saved_list",
        "notify_on_price_drop",
        server_default=sa.text("true"),
        existing_type=sa.Boolean(),
        existing_nullable=False,
    )
    op.execute(
        "UPDATE saved_list SET notify_on_price_drop = true WHERE notify_on_price_drop IS NULL"
    )


def downgrade() -> None:
    op.alter_column(
        "saved_list",
        "notify_on_price_drop",
        server_default=sa.text("false"),
        existing_type=sa.Boolean(),
        existing_nullable=False,
    )
