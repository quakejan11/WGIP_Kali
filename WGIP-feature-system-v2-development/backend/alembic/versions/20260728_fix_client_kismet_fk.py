"""fix client observation Kismet import foreign key

Revision ID: fix_client_kismet_fk
Revises: add_client_scan_links
Create Date: 2026-07-28
"""

from typing import Sequence, Union

from alembic import op


revision: str = "fix_client_kismet_fk"
down_revision: Union[str, None] = "add_client_scan_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE client_observations
            DROP CONSTRAINT IF EXISTS
            fk_client_observations_import_batch_id;
        """
    )

    op.execute(
        """
        WITH candidate_matches AS (
            SELECT
                client.id AS client_id,
                MIN(wifi.import_batch_id) AS import_batch_id,
                MAX(wifi.coordinate_source) AS coordinate_source,
                COUNT(DISTINCT wifi.import_batch_id) AS distinct_batch_count
            FROM client_observations AS client
            INNER JOIN observations AS wifi
                ON client.bssid IS NOT NULL
               AND wifi.bssid IS NOT NULL
               AND LOWER(client.bssid) = LOWER(wifi.bssid)
               AND client.timestamp IS NOT NULL
               AND wifi.timestamp IS NOT NULL
               AND ABS(
                    EXTRACT(
                        EPOCH FROM (client.timestamp - wifi.timestamp)
                    )
               ) <= 5
               AND client.latitude IS NOT NULL
               AND client.longitude IS NOT NULL
               AND wifi.latitude IS NOT NULL
               AND wifi.longitude IS NOT NULL
               AND ABS(client.latitude - wifi.latitude) <= 0.00001
               AND ABS(client.longitude - wifi.longitude) <= 0.00001
            WHERE wifi.import_batch_id IS NOT NULL
            GROUP BY client.id
        ),
        unambiguous_matches AS (
            SELECT
                candidate.client_id,
                candidate.import_batch_id,
                candidate.coordinate_source
            FROM candidate_matches AS candidate
            INNER JOIN kismet_import_batches AS batch
                ON batch.id = candidate.import_batch_id
            WHERE candidate.distinct_batch_count = 1
        )
        UPDATE client_observations AS client
        SET
            import_batch_id = matched.import_batch_id,
            coordinate_source = COALESCE(
                client.coordinate_source,
                matched.coordinate_source,
                'kismet_csv'
            )
        FROM unambiguous_matches AS matched
        WHERE client.id = matched.client_id;
        """
    )

    op.execute(
        """
        UPDATE client_observations AS client
        SET import_batch_id = NULL
        WHERE client.import_batch_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM kismet_import_batches AS batch
              WHERE batch.id = client.import_batch_id
          );
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'fk_client_observations_import_batch_id'
            ) THEN
                ALTER TABLE client_observations
                    ADD CONSTRAINT
                    fk_client_observations_import_batch_id
                    FOREIGN KEY (import_batch_id)
                    REFERENCES kismet_import_batches(id)
                    ON DELETE SET NULL;
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
        ALTER TABLE client_observations
            DROP CONSTRAINT IF EXISTS
            fk_client_observations_import_batch_id;
        """
    )
