"""add performance indexes for search and optimization

Revision ID: 2025001010012
Revises: 2025001010011
Create Date: 2025-12-14 00:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "2025001010012"
down_revision = "2025001010011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # For biomarker search (services/catalog.py:65-116)
    # These use LOWER() and LIKE on name, elab_code, and alias
    op.execute(
        "CREATE INDEX idx_biomarker_name_lower ON biomarker (LOWER(name))"
    )
    op.execute(
        "CREATE INDEX idx_biomarker_elab_lower ON biomarker (LOWER(elab_code))"
    )
    op.execute(
        "CREATE INDEX idx_biomarker_alias_lower ON biomarker_alias (LOWER(alias))"
    )

    # For optimization candidate collection (optimization/service.py:296-316)
    # Queries filter by lab_id + is_available
    op.execute(
        "CREATE INDEX idx_item_lab_available ON item (lab_id, is_available) "
        "WHERE is_available = true"
    )

    # Reverse lookup from item to biomarkers
    op.create_index(
        "idx_item_biomarker_item",
        "item_biomarker",
        ["item_id"],
    )

    # For price history subquery (optimization/service.py:286-293)
    # Queries by item_id ordered by snap_date DESC
    op.create_index(
        "idx_snapshot_item_date",
        "price_snapshot",
        ["item_id", "snap_date"],
    )

    # For lab price lookup (services/catalog.py:171-195)
    # Queries by lab_id with available + price filters
    op.execute(
        "CREATE INDEX idx_item_lab_price ON item (lab_id, price_now_grosz) "
        "WHERE is_available = true AND price_now_grosz > 0"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_biomarker_name_lower")
    op.execute("DROP INDEX IF EXISTS idx_biomarker_elab_lower")
    op.execute("DROP INDEX IF EXISTS idx_biomarker_alias_lower")
    op.execute("DROP INDEX IF EXISTS idx_item_lab_available")
    op.drop_index("idx_item_biomarker_item", table_name="item_biomarker")
    op.drop_index("idx_snapshot_item_date", table_name="price_snapshot")
    op.execute("DROP INDEX IF EXISTS idx_item_lab_price")
