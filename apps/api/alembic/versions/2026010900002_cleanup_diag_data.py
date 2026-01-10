"""cleanup diag-only data after multi-lab removal

Revision ID: 2026010900002
Revises: 2026010900001
Create Date: 2026-01-09 00:00:02.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2026010900002"
down_revision = "2026010900001"
branch_labels = None
depends_on = None


def _delete_non_diag_raw_snapshots(bind) -> None:
    bind.execute(sa.text("DELETE FROM raw_snapshot WHERE source NOT LIKE 'diag:%'"))


def _delete_orphan_biomarkers(bind) -> None:
    bind.execute(
        sa.text(
            "DELETE FROM biomarker "
            "WHERE NOT EXISTS ("
            "SELECT 1 FROM item_biomarker "
            "WHERE item_biomarker.biomarker_id = biomarker.id"
            ") "
            "AND NOT EXISTS ("
            "SELECT 1 FROM saved_list_entry "
            "WHERE saved_list_entry.biomarker_id = biomarker.id"
            ") "
            "AND NOT EXISTS ("
            "SELECT 1 FROM biomarker_list_template_entry "
            "WHERE biomarker_list_template_entry.biomarker_id = biomarker.id"
            ")"
        )
    )


def upgrade() -> None:
    bind = op.get_bind()
    _delete_non_diag_raw_snapshots(bind)
    _delete_orphan_biomarkers(bind)
    op.create_index("ix_user_session_expires_at", "user_session", ["expires_at"])
    op.create_index(
        "uq_saved_list_entry_biomarker",
        "saved_list_entry",
        ["list_id", "biomarker_id"],
        unique=True,
        postgresql_where=sa.text("biomarker_id IS NOT NULL"),
    )
    op.create_index(
        "uq_biomarker_list_template_entry_biomarker",
        "biomarker_list_template_entry",
        ["template_id", "biomarker_id"],
        unique=True,
        postgresql_where=sa.text("biomarker_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_biomarker_list_template_entry_biomarker",
        table_name="biomarker_list_template_entry",
    )
    op.drop_index("uq_saved_list_entry_biomarker", table_name="saved_list_entry")
    op.drop_index("ix_user_session_expires_at", table_name="user_session")
