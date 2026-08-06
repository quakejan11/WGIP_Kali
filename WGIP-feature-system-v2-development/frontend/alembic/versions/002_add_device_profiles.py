"""add device profiles

Revision ID: 002_add_device_profiles
Revises: 001_add_client_observations
Create Date: 2026-07-09
"""

from alembic import op
import sqlalchemy as sa


revision = "002_add_device_profiles"
down_revision = "001_add_client_observations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "device_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_mac", sa.String(length=32), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_mac"),
    )

    op.create_index(
        op.f("ix_device_profiles_id"),
        "device_profiles",
        ["id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_device_profiles_client_mac"),
        "device_profiles",
        ["client_mac"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_device_profiles_client_mac"), table_name="device_profiles")
    op.drop_index(op.f("ix_device_profiles_id"), table_name="device_profiles")
    op.drop_table("device_profiles")