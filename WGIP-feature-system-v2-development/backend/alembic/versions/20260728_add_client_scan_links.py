"""add client observation scan and location source links

Revision ID: add_client_scan_links
Revises: 84f6629b042f
Create Date: 2026-07-28
"""

from typing import Sequence, Union

from alembic import op


revision: str = "add_client_scan_links"
down_revision: Union[str, None] = "84f6629b042f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.client_observations') IS NOT NULL THEN
                ALTER TABLE client_observations
                    ADD COLUMN IF NOT EXISTS import_batch_id INTEGER;

                ALTER TABLE client_observations
                    ADD COLUMN IF NOT EXISTS coordinate_source VARCHAR(100);

                UPDATE client_observations AS client
                SET import_batch_id = NULL
                WHERE client.import_batch_id IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM import_batch AS batch
                      WHERE batch.id = client.import_batch_id
                  );

                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'fk_client_observations_import_batch_id'
                ) THEN
                    ALTER TABLE client_observations
                        ADD CONSTRAINT fk_client_observations_import_batch_id
                        FOREIGN KEY (import_batch_id)
                        REFERENCES import_batch(id)
                        ON DELETE SET NULL;
                END IF;
            END IF;
        END $$;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS
            ix_client_observations_import_batch_id
        ON client_observations (import_batch_id);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS ix_client_observations_import_batch_id;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.client_observations') IS NOT NULL THEN
                ALTER TABLE client_observations
                    DROP CONSTRAINT IF EXISTS
                    fk_client_observations_import_batch_id;

                ALTER TABLE client_observations
                    DROP COLUMN IF EXISTS coordinate_source;

                ALTER TABLE client_observations
                    DROP COLUMN IF EXISTS import_batch_id;
            END IF;
        END $$;
        """
    )
