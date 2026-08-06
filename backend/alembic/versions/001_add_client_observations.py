"""add client observations

Revision ID: 001_add_client_observations
Revises:
Create Date: 2026-07-06 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "001_add_client_observations"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_observations",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("survey_id", sa.Integer(), nullable=True),
        sa.Column("bssid", sa.String(length=32), nullable=False),
        sa.Column("ssid", sa.String(length=255), nullable=True),
        sa.Column("channel", sa.Integer(), nullable=True),
        sa.Column("client_mac", sa.String(length=32), nullable=False),
        sa.Column("client_vendor", sa.String(length=255), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("signal_dbm", sa.Integer(), nullable=True),
        sa.Column(
            "relationship_type",
            sa.String(length=100),
            nullable=False,
            server_default="observed_association",
        ),
        sa.Column(
            "source",
            sa.String(length=100),
            nullable=False,
            server_default="mock_kismet",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_client_observations_survey_id",
        "client_observations",
        ["survey_id"],
        unique=False,
    )

    op.create_index(
        "ix_client_observations_bssid",
        "client_observations",
        ["bssid"],
        unique=False,
    )

    op.create_index(
        "ix_client_observations_client_mac",
        "client_observations",
        ["client_mac"],
        unique=False,
    )

    op.create_index(
        "ix_client_observations_timestamp",
        "client_observations",
        ["timestamp"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_client_observations_timestamp",
        table_name="client_observations",
    )

    op.drop_index(
        "ix_client_observations_client_mac",
        table_name="client_observations",
    )

    op.drop_index(
        "ix_client_observations_bssid",
        table_name="client_observations",
    )

    op.drop_index(
        "ix_client_observations_survey_id",
        table_name="client_observations",
    )

    op.drop_table("client_observations")