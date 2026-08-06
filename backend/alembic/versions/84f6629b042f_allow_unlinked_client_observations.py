"""allow unlinked client observations

Revision ID: 84f6629b042f
Revises: e681665aac5f
Create Date: 2026-07-20
"""

from typing import Sequence, Union

from alembic import op


revision: str = "84f6629b042f"
down_revision: Union[str, None] = "e681665aac5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.client_observations') IS NOT NULL THEN
                ALTER TABLE client_observations
                    ALTER COLUMN bssid DROP NOT NULL;

                ALTER TABLE client_observations
                    ALTER COLUMN ssid DROP NOT NULL;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.client_observations') IS NOT NULL THEN
                -- Do not restore NOT NULL automatically because actual Kismet
                -- data may contain unlinked observed devices.
                NULL;
            END IF;
        END $$;
        """
    )
