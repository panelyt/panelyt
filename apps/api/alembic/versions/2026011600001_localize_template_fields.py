"""Localize curated template fields

Revision ID: 2026011600001
Revises: 2026011200001
Create Date: 2026-01-16 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2026011600001"
down_revision = "2026011200001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "biomarker_list_template",
        sa.Column("name_en", sa.String(length=128), nullable=False),
    )
    op.add_column(
        "biomarker_list_template",
        sa.Column("name_pl", sa.String(length=128), nullable=False),
    )
    op.add_column(
        "biomarker_list_template",
        sa.Column("description_en", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "biomarker_list_template",
        sa.Column("description_pl", sa.String(length=512), nullable=True),
    )
    op.drop_column("biomarker_list_template", "name")
    op.drop_column("biomarker_list_template", "description")


def downgrade() -> None:
    op.add_column(
        "biomarker_list_template",
        sa.Column("name", sa.String(length=128), nullable=False),
    )
    op.add_column(
        "biomarker_list_template",
        sa.Column("description", sa.String(length=512), nullable=True),
    )
    op.drop_column("biomarker_list_template", "description_pl")
    op.drop_column("biomarker_list_template", "description_en")
    op.drop_column("biomarker_list_template", "name_pl")
    op.drop_column("biomarker_list_template", "name_en")
