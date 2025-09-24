"""Allow nullable username/password for anonymous users

Revision ID: 2025001010006
Revises: 2025001010005
Create Date: 2025-01-05 18:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2025001010006"
down_revision = "2025001010005"
branch_labels = None
depends_on = None

USER_TABLE = sa.table(
    "user_account",
    sa.column("id", sa.String(length=36)),
    sa.column("username", sa.String(length=64)),
    sa.column("password_hash", sa.String(length=255)),
)


def upgrade() -> None:
    op.alter_column(
        "user_account",
        "username",
        existing_type=sa.String(length=64),
        nullable=True,
    )
    op.alter_column(
        "user_account",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=True,
    )


def downgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.select(USER_TABLE.c.id, USER_TABLE.c.username, USER_TABLE.c.password_hash)).all()
    for identifier, username, password_hash in rows:
        updates: dict[str, str] = {}
        if username is None:
            updates["username"] = f"legacy-{identifier}"
        if password_hash is None:
            updates["password_hash"] = "!legacy!"
        if updates:
            bind.execute(
                USER_TABLE.update()
                .where(USER_TABLE.c.id == identifier)
                .values(**updates)
            )

    op.alter_column(
        "user_account",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.alter_column(
        "user_account",
        "username",
        existing_type=sa.String(length=64),
        nullable=False,
    )
