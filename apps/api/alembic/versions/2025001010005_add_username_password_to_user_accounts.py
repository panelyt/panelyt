"""Add username/password to user accounts

Revision ID: 2025001010005
Revises: 2025001010004
Create Date: 2025-01-05 16:00:00.000000
"""

from __future__ import annotations

from typing import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2025001010005"
down_revision = "2025001010004"
branch_labels = None
depends_on = None


USER_TABLE = sa.table(
    "user_account",
    sa.column("id", sa.String(length=36)),
    sa.column("username", sa.String(length=64)),
    sa.column("password_hash", sa.String(length=255)),
)


def _generate_legacy_username(identifier: str) -> str:
    compact = identifier.replace("-", "")
    return f"legacy-{compact[:16]}"


def upgrade() -> None:
    op.add_column("user_account", sa.Column("username", sa.String(length=64), nullable=True))
    op.add_column("user_account", sa.Column("password_hash", sa.String(length=255), nullable=True))

    bind = op.get_bind()
    rows: Sequence[tuple[str]] = bind.execute(sa.select(USER_TABLE.c.id)).fetchall()
    for (identifier,) in rows:
        bind.execute(
            USER_TABLE.update()
            .where(USER_TABLE.c.id == identifier)
            .values(
                username=_generate_legacy_username(identifier),
                password_hash="!legacy!",
            )
        )

    bind.execute(sa.text("DELETE FROM user_session"))

    op.alter_column("user_account", "username", nullable=False)
    op.alter_column("user_account", "password_hash", nullable=False)
    op.create_unique_constraint("uq_user_account_username", "user_account", ["username"])


def downgrade() -> None:
    op.drop_constraint("uq_user_account_username", "user_account", type_="unique")
    op.drop_column("user_account", "password_hash")
    op.drop_column("user_account", "username")
