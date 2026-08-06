"""add MAC manufacturer fields

Revision ID: add_mac_manufacturers
Revises: client_import_metadata
Create Date: 2026-07-30
"""

from typing import Sequence, Union

from alembic import op


revision: str = "add_mac_manufacturers"
down_revision: Union[str, None] = "client_import_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The newer Kismet services use "observations", while legacy API routes
    # still use "observation". Keep both compatible during the transition.
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.observations') IS NOT NULL THEN
                ALTER TABLE observations
                    ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255);

                UPDATE observations
                SET manufacturer = 'Unknown Manufacturer'
                WHERE manufacturer IS NULL
                   OR BTRIM(manufacturer) = '';

                ALTER TABLE observations
                    ALTER COLUMN manufacturer
                    SET DEFAULT 'Unknown Manufacturer';

                ALTER TABLE observations
                    ALTER COLUMN manufacturer SET NOT NULL;
            END IF;

            IF to_regclass('public.observation') IS NOT NULL THEN
                ALTER TABLE observation
                    ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255);

                UPDATE observation
                SET manufacturer = 'Unknown Manufacturer'
                WHERE manufacturer IS NULL
                   OR BTRIM(manufacturer) = '';

                ALTER TABLE observation
                    ALTER COLUMN manufacturer
                    SET DEFAULT 'Unknown Manufacturer';

                ALTER TABLE observation
                    ALTER COLUMN manufacturer SET NOT NULL;
            END IF;

            IF to_regclass('public.client_observations') IS NOT NULL THEN
                UPDATE client_observations
                SET client_vendor = 'Unknown Manufacturer'
                WHERE client_vendor IS NULL
                   OR BTRIM(client_vendor) = '';

                ALTER TABLE client_observations
                    ALTER COLUMN client_vendor
                    SET DEFAULT 'Unknown Manufacturer';

                ALTER TABLE client_observations
                    ALTER COLUMN client_vendor SET NOT NULL;
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
                ALTER TABLE client_observations
                    ALTER COLUMN client_vendor DROP NOT NULL;

                ALTER TABLE client_observations
                    ALTER COLUMN client_vendor DROP DEFAULT;
            END IF;

            IF to_regclass('public.observations') IS NOT NULL THEN
                ALTER TABLE observations
                    DROP COLUMN IF EXISTS manufacturer;
            END IF;

            IF to_regclass('public.observation') IS NOT NULL THEN
                ALTER TABLE observation
                    DROP COLUMN IF EXISTS manufacturer;
            END IF;
        END $$;
        """
    )

