"""Add biomarker aliases table

Revision ID: 2025001010002
Revises: 2025001010001
Create Date: 2025-01-01 00:00:01.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2025001010002"
down_revision = "2025001010001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create biomarker_alias table
    op.create_table(
        "biomarker_alias",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("biomarker_id", sa.Integer(), nullable=False),
        sa.Column("alias", sa.String(length=255), nullable=False),
        sa.Column("alias_type", sa.String(length=32), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, default=1),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["biomarker_id"], ["biomarker.id"], ondelete="CASCADE"),
        sa.Index("ix_biomarker_alias_alias", "alias"),
        sa.Index("ix_biomarker_alias_biomarker_id", "biomarker_id"),
        sa.Index("ix_biomarker_alias_alias_type", "alias_type"),
        sa.UniqueConstraint("biomarker_id", "alias", name="uq_biomarker_alias")
    )


def downgrade() -> None:
    op.drop_table("biomarker_alias")

    # Drop the enum type
    alias_type_enum = sa.Enum(name='alias_type')
    alias_type_enum.drop(op.get_bind())