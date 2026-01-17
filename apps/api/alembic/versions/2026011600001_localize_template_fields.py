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
        sa.Column("name_en", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "biomarker_list_template",
        sa.Column("name_pl", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "biomarker_list_template",
        sa.Column("description_en", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "biomarker_list_template",
        sa.Column("description_pl", sa.String(length=512), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE biomarker_list_template
            SET name_en = name,
                name_pl = name,
                description_en = description,
                description_pl = description
            """
        )
    )
    with op.batch_alter_table("biomarker_list_template") as batch_op:
        batch_op.alter_column(
            "name_en",
            existing_type=sa.String(length=128),
            nullable=False,
        )
        batch_op.alter_column(
            "name_pl",
            existing_type=sa.String(length=128),
            nullable=False,
        )
        batch_op.drop_column("name")
        batch_op.drop_column("description")


def downgrade() -> None:
    op.add_column(
        "biomarker_list_template",
        sa.Column("name", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "biomarker_list_template",
        sa.Column("description", sa.String(length=512), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE biomarker_list_template
            SET name = name_en,
                description = description_en
            """
        )
    )
    with op.batch_alter_table("biomarker_list_template") as batch_op:
        batch_op.alter_column(
            "name",
            existing_type=sa.String(length=128),
            nullable=False,
        )
        batch_op.drop_column("description_pl")
        batch_op.drop_column("description_en")
        batch_op.drop_column("name_pl")
        batch_op.drop_column("name_en")
