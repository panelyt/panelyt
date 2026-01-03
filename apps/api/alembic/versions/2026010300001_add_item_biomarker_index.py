"""add composite index for item_biomarker lookups

Revision ID: 2026010300001
Revises: 2026010200001
Create Date: 2026-01-03 00:00:01.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "2026010300001"
down_revision = "2026010200001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "idx_item_biomarker_biomarker_item",
        "item_biomarker",
        ["biomarker_id", "item_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_item_biomarker_biomarker_item", table_name="item_biomarker")
