"""add multi lab support tables and columns

Revision ID: 2025001010011
Revises: 2025001010010
Create Date: 2025-01-01 10:11:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column


# revision identifiers, used by Alembic.
revision = "2025001010011"
down_revision = "2025001010010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lab",
        sa.Column("id", sa.SmallInteger(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(length=32), nullable=False, unique=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False, unique=True),
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("'Europe/Warsaw'"),
        ),
        sa.Column("website_url", sa.String(length=255), nullable=True),
        sa.Column("single_item_url_template", sa.String(length=255), nullable=True),
        sa.Column("package_item_url_template", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    lab_table = table(
        "lab",
        column("id", sa.SmallInteger()),
        column("code", sa.String()),
        column("name", sa.String()),
        column("slug", sa.String()),
        column("timezone", sa.String()),
        column("website_url", sa.String()),
        column("single_item_url_template", sa.String()),
        column("package_item_url_template", sa.String()),
    )

    op.bulk_insert(
        lab_table,
        [
            {
                "id": 1,
                "code": "diag",
                "name": "Diagnostyka",
                "slug": "diag",
                "timezone": "Europe/Warsaw",
                "website_url": "https://diag.pl",
                "single_item_url_template": "https://diag.pl/sklep/badania/{slug}",
                "package_item_url_template": "https://diag.pl/sklep/pakiety/{slug}",
            },
            {
                "id": 2,
                "code": "alab",
                "name": "ALAB laboratoria",
                "slug": "alab",
                "timezone": "Europe/Warsaw",
                "website_url": "https://www.alablaboratoria.pl",
                "single_item_url_template": None,
                "package_item_url_template": None,
            },
        ],
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        sequence_name = bind.execute(
            sa.text("SELECT pg_get_serial_sequence('lab', 'id')")
        ).scalar()
        if sequence_name:
            bind.execute(
                sa.text(
                    "SELECT setval(:sequence_name, (SELECT COALESCE(MAX(id), 0) FROM lab), true)"
                ),
                {"sequence_name": sequence_name},
            )

    op.create_table(
        "lab_biomarker",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("lab_id", sa.SmallInteger(), sa.ForeignKey("lab.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("elab_code", sa.String(length=64), nullable=True),
        sa.Column("slug", sa.String(length=255), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("attributes", sa.JSON(), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("lab_id", "external_id", name="uq_lab_biomarker_external"),
    )

    op.create_table(
        "lab_item",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("lab_id", sa.SmallInteger(), sa.ForeignKey("lab.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=True),
        sa.Column(
            "currency",
            sa.String(length=8),
            nullable=False,
            server_default=sa.text("'PLN'"),
        ),
        sa.Column("price_now_grosz", sa.Integer(), nullable=False),
        sa.Column("price_min30_grosz", sa.Integer(), nullable=False),
        sa.Column("sale_price_grosz", sa.Integer(), nullable=True),
        sa.Column("regular_price_grosz", sa.Integer(), nullable=True),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("attributes", sa.JSON(), nullable=True),
        sa.UniqueConstraint("lab_id", "external_id", name="uq_lab_item_external"),
        sa.CheckConstraint("kind IN ('package', 'single')", name="lab_item_kind_check"),
    )

    op.create_table(
        "lab_item_biomarker",
        sa.Column("lab_item_id", sa.Integer(), sa.ForeignKey("lab_item.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("lab_biomarker_id", sa.Integer(), sa.ForeignKey("lab_biomarker.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "biomarker_match",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("biomarker_id", sa.Integer(), sa.ForeignKey("biomarker.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lab_biomarker_id", sa.Integer(), sa.ForeignKey("lab_biomarker.id", ondelete="CASCADE"), nullable=False),
        sa.Column("match_type", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'accepted'")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.UniqueConstraint("lab_biomarker_id", name="uq_biomarker_match_lab_biomarker"),
    )

    op.add_column(
        "item",
        sa.Column("lab_id", sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        "item",
        sa.Column("external_id", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "item",
        sa.Column("lab_item_id", sa.Integer(), nullable=True),
    )

    op.create_foreign_key(
        "fk_item_lab_id", "item", "lab", ["lab_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_foreign_key(
        "fk_item_lab_item_id", "item", "lab_item", ["lab_item_id"], ["id"], ondelete="SET NULL"
    )

    bind.execute(sa.text("UPDATE item SET lab_id = :lab_id"), {"lab_id": 1})
    bind.execute(sa.text("UPDATE item SET external_id = CAST(id AS TEXT) WHERE external_id IS NULL"))

    op.alter_column("item", "lab_id", nullable=False)
    op.alter_column("item", "external_id", nullable=False)
    op.create_unique_constraint("uq_item_lab_external", "item", ["lab_id", "external_id"])

    op.add_column(
        "price_snapshot",
        sa.Column("lab_id", sa.SmallInteger(), nullable=True),
    )
    bind.execute(
        sa.text(
            "UPDATE price_snapshot ps SET lab_id = i.lab_id FROM item i WHERE ps.item_id = i.id"
        )
    )
    op.alter_column("price_snapshot", "lab_id", nullable=False)
    op.create_foreign_key(
        "fk_price_snapshot_lab_id", "price_snapshot", "lab", ["lab_id"], ["id"], ondelete="RESTRICT"
    )


def downgrade() -> None:
    op.drop_constraint("fk_price_snapshot_lab_id", "price_snapshot", type_="foreignkey")
    op.drop_column("price_snapshot", "lab_id")

    op.drop_constraint("uq_item_lab_external", "item", type_="unique")
    op.drop_constraint("fk_item_lab_item_id", "item", type_="foreignkey")
    op.drop_constraint("fk_item_lab_id", "item", type_="foreignkey")
    op.drop_column("item", "lab_item_id")
    op.drop_column("item", "external_id")
    op.drop_column("item", "lab_id")

    op.drop_table("biomarker_match")
    op.drop_table("lab_item_biomarker")
    op.drop_table("lab_item")
    op.drop_table("lab_biomarker")
    op.drop_table("lab")
