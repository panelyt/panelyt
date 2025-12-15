"""add index on price_snapshot.snap_date for catalog meta queries

Revision ID: 2025001010013
Revises: 2025001010012
Create Date: 2025-12-15 00:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "2025001010013"
down_revision = "2025001010012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # For catalog meta queries (services/catalog.py:35-44)
    # Queries filter by snap_date >= window_start and snap_date == today
    # The existing idx_snapshot_item_date (item_id, snap_date) doesn't help
    # when snap_date is the only filter criterion
    op.create_index(
        "idx_price_snapshot_date",
        "price_snapshot",
        ["snap_date"],
    )


def downgrade() -> None:
    op.drop_index("idx_price_snapshot_date", table_name="price_snapshot")
