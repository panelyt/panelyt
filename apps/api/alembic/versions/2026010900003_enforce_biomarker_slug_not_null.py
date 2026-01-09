"""enforce biomarker slug not null

Revision ID: 2026010900003
Revises: 2026010900002
Create Date: 2026-01-09 00:00:03.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2026010900003"
down_revision = "2026010900002"
branch_labels = None
depends_on = None


def _ensure_biomarker_slug_not_null(bind) -> None:
    count = bind.execute(
        sa.text("SELECT COUNT(*) FROM biomarker WHERE slug IS NULL")
    ).scalar()
    if count and int(count) > 0:
        raise RuntimeError("biomarker.slug contains NULLs")


def upgrade() -> None:
    bind = op.get_bind()
    _ensure_biomarker_slug_not_null(bind)
    op.alter_column(
        "biomarker",
        "slug",
        existing_type=sa.String(length=255),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "biomarker",
        "slug",
        existing_type=sa.String(length=255),
        nullable=True,
    )
