"""Add curated biomarker list templates and sharing metadata

Revision ID: 2025001010007
Revises: 2025001010006
Create Date: 2025-01-05 12:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2025001010007"
down_revision = "2025001010006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "saved_list",
        sa.Column("share_token", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "saved_list",
        sa.Column("shared_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_saved_list_share_token", "saved_list", ["share_token"]
    )

    op.create_table(
        "biomarker_list_template",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
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
            server_onupdate=sa.func.now(),
        ),
        sa.UniqueConstraint("slug", name="uq_biomarker_list_template_slug"),
    )
    op.create_index(
        "ix_biomarker_list_template_is_active",
        "biomarker_list_template",
        ["is_active"],
    )

    op.create_table(
        "biomarker_list_template_entry",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("biomarker_id", sa.Integer(), nullable=True),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["biomarker_list_template.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["biomarker_id"], ["biomarker.id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint(
            "template_id",
            "code",
            name="uq_biomarker_list_template_entry_code",
        ),
    )
    op.create_index(
        "ix_biomarker_list_template_entry_template_id",
        "biomarker_list_template_entry",
        ["template_id"],
    )
    op.create_index(
        "ix_biomarker_list_template_entry_biomarker_id",
        "biomarker_list_template_entry",
        ["biomarker_id"],
    )

    templates_table = sa.table(
        "biomarker_list_template",
        sa.column("id", sa.Integer()),
        sa.column("slug", sa.String()),
        sa.column("name", sa.String()),
        sa.column("description", sa.String()),
    )
    op.bulk_insert(
        templates_table,
        [
            {
                "id": 1,
                "slug": "bortz-blood-age",
                "name": "Bortz Blood Age",
                "description": "Panel inspired by the Bortz biological age calculation using common laboratory markers.",
            },
            {
                "id": 2,
                "slug": "cardiovascular-basic",
                "name": "Cardiovascular Basic",
                "description": "Core cardio-metabolic risk markers for baseline heart health monitoring.",
            },
            {
                "id": 3,
                "slug": "liver-checkup",
                "name": "Liver Checkup",
                "description": "Focused liver enzyme panel for lifestyle or medication monitoring.",
            },
        ],
    )

    entries_table = sa.table(
        "biomarker_list_template_entry",
        sa.column("template_id", sa.Integer()),
        sa.column("code", sa.String()),
        sa.column("display_name", sa.String()),
        sa.column("sort_order", sa.Integer()),
    )
    op.bulk_insert(
        entries_table,
        [
            # Bortz Blood Age
            {"template_id": 1, "code": "CBC", "display_name": "Complete Blood Count", "sort_order": 0},
            {"template_id": 1, "code": "CRP", "display_name": "C-Reactive Protein", "sort_order": 1},
            {"template_id": 1, "code": "ESR", "display_name": "Erythrocyte Sedimentation Rate", "sort_order": 2},
            {"template_id": 1, "code": "ALB", "display_name": "Albumin", "sort_order": 3},
            {"template_id": 1, "code": "UREA", "display_name": "Urea", "sort_order": 4},
            {"template_id": 1, "code": "CREA", "display_name": "Creatinine", "sort_order": 5},
            {"template_id": 1, "code": "ALT", "display_name": "ALT (Alanine Aminotransferase)", "sort_order": 6},
            {"template_id": 1, "code": "AST", "display_name": "AST (Aspartate Aminotransferase)", "sort_order": 7},
            # Cardiovascular Basic
            {"template_id": 2, "code": "CHOL_TOTAL", "display_name": "Total Cholesterol", "sort_order": 0},
            {"template_id": 2, "code": "CHOL_HDL", "display_name": "HDL Cholesterol", "sort_order": 1},
            {"template_id": 2, "code": "CHOL_LDL", "display_name": "LDL Cholesterol", "sort_order": 2},
            {"template_id": 2, "code": "TRIG", "display_name": "Triglycerides", "sort_order": 3},
            {"template_id": 2, "code": "GLU", "display_name": "Fasting Glucose", "sort_order": 4},
            {"template_id": 2, "code": "HSCRP", "display_name": "High-Sensitivity CRP", "sort_order": 5},
            # Liver Checkup
            {"template_id": 3, "code": "ALT", "display_name": "ALT (Alanine Aminotransferase)", "sort_order": 0},
            {"template_id": 3, "code": "AST", "display_name": "AST (Aspartate Aminotransferase)", "sort_order": 1},
            {"template_id": 3, "code": "GGT", "display_name": "GGT (Gamma-Glutamyl Transferase)", "sort_order": 2},
            {"template_id": 3, "code": "ALP", "display_name": "ALP (Alkaline Phosphatase)", "sort_order": 3},
            {"template_id": 3, "code": "BILI_TOTAL", "display_name": "Total Bilirubin", "sort_order": 4},
            {"template_id": 3, "code": "ALB", "display_name": "Albumin", "sort_order": 5},
            {"template_id": 3, "code": "PROT_TOTAL", "display_name": "Total Protein", "sort_order": 6},
        ],
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text(
                "SELECT setval(pg_get_serial_sequence('biomarker_list_template', 'id'), (SELECT COALESCE(MAX(id), 0) FROM biomarker_list_template))"
            )
        )



def downgrade() -> None:
    op.drop_index(
        "ix_biomarker_list_template_entry_biomarker_id",
        table_name="biomarker_list_template_entry",
    )
    op.drop_index(
        "ix_biomarker_list_template_entry_template_id",
        table_name="biomarker_list_template_entry",
    )
    op.drop_table("biomarker_list_template_entry")

    op.drop_index(
        "ix_biomarker_list_template_is_active",
        table_name="biomarker_list_template",
    )
    op.drop_table("biomarker_list_template")

    op.drop_constraint(
        "uq_saved_list_share_token", "saved_list", type_="unique"
    )
    op.drop_column("saved_list", "shared_at")
    op.drop_column("saved_list", "share_token")
