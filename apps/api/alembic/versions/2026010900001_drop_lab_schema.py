"""drop multi lab schema for diag only

Revision ID: 2026010900001
Revises: 2026010300001
Create Date: 2026-01-09 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2026010900001"
down_revision = "2026010300001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    diag_id = bind.execute(sa.text("SELECT id FROM lab WHERE code = 'diag'")).scalar()

    if diag_id is not None:
        bind.execute(
            sa.text(
                "DELETE FROM price_snapshot "
                "WHERE item_id IN (SELECT id FROM item WHERE lab_id != :diag_id)"
            ),
            {"diag_id": diag_id},
        )
        bind.execute(
            sa.text(
                "DELETE FROM item_biomarker "
                "WHERE item_id IN (SELECT id FROM item WHERE lab_id != :diag_id)"
            ),
            {"diag_id": diag_id},
        )
        bind.execute(
            sa.text("DELETE FROM item WHERE lab_id != :diag_id"),
            {"diag_id": diag_id},
        )
        bind.execute(
            sa.text(
                "DELETE FROM lab_item_biomarker "
                "WHERE lab_item_id IN (SELECT id FROM lab_item WHERE lab_id != :diag_id)"
            ),
            {"diag_id": diag_id},
        )
        bind.execute(
            sa.text(
                "DELETE FROM biomarker_match "
                "WHERE lab_biomarker_id IN (SELECT id FROM lab_biomarker WHERE lab_id != :diag_id)"
            ),
            {"diag_id": diag_id},
        )
        bind.execute(
            sa.text("DELETE FROM lab_item WHERE lab_id != :diag_id"),
            {"diag_id": diag_id},
        )
        bind.execute(
            sa.text("DELETE FROM lab_biomarker WHERE lab_id != :diag_id"),
            {"diag_id": diag_id},
        )
        bind.execute(sa.text("DELETE FROM lab WHERE id != :diag_id"), {"diag_id": diag_id})

    op.execute("DROP INDEX IF EXISTS idx_item_lab_available")
    op.execute("DROP INDEX IF EXISTS idx_item_lab_price")

    op.drop_constraint("fk_price_snapshot_lab_id", "price_snapshot", type_="foreignkey")
    op.drop_constraint("uq_item_lab_external", "item", type_="unique")
    op.drop_constraint("fk_item_lab_item_id", "item", type_="foreignkey")
    op.drop_constraint("fk_item_lab_id", "item", type_="foreignkey")

    op.drop_column("item", "lab_item_id")
    op.drop_column("item", "lab_id")
    op.drop_column("price_snapshot", "lab_id")

    op.drop_table("lab_item_biomarker")
    op.drop_table("biomarker_match")
    op.drop_table("lab_item")
    op.drop_table("lab_biomarker")
    op.drop_table("lab")

    op.create_unique_constraint("uq_item_external_id", "item", ["external_id"])

    op.execute(
        "CREATE INDEX idx_item_available ON item (is_available) WHERE is_available = true"
    )
    op.execute(
        "CREATE INDEX idx_item_price_available ON item (price_now_grosz) "
        "WHERE is_available = true AND price_now_grosz > 0"
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade not supported for drop_lab_schema migration")
