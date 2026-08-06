"""repair client import metadata

Revision ID: client_import_metadata
Revises: fix_client_kismet_fk
Create Date: 2026-07-28
"""

from typing import Sequence, Union

from alembic import op


revision: str = "client_import_metadata"
down_revision: Union[str, None] = "fix_client_kismet_fk"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Restore only unlinked client rows having exactly one batch whose
    # import transaction timestamp matches the client creation timestamp.
    op.execute(
        """
        WITH exact_candidates AS (
            SELECT
                client.id AS client_id,
                MIN(batch.id) AS import_batch_id
            FROM client_observations AS client
            JOIN kismet_import_batches AS batch
                ON client.created_at = batch.created_at
                OR client.created_at = batch.completed_at
            WHERE client.import_batch_id IS NULL
            GROUP BY client.id
            HAVING COUNT(batch.id) = 1
        )
        UPDATE client_observations AS client
        SET import_batch_id = candidate.import_batch_id
        FROM exact_candidates AS candidate
        WHERE client.id = candidate.client_id
          AND client.import_batch_id IS NULL;
        """
    )

    # Correct the old mock_kismet label using the linked Kismet file type.
    op.execute(
        """
        UPDATE client_observations AS client
        SET source = CASE
            WHEN LOWER(batch.original_filename) LIKE '%.csv'
                THEN 'kismet_csv'
            WHEN LOWER(batch.original_filename) LIKE '%.kismet'
                THEN 'kismet_file'
            ELSE 'kismet_import'
        END
        FROM kismet_import_batches AS batch
        WHERE client.import_batch_id = batch.id
          AND (
              client.source IS NULL
              OR client.source = 'mock_kismet'
          );
        """
    )

    # Align database fallbacks with the SQLAlchemy model. Kismet import
    # services now supply their source explicitly.
    op.execute(
        """
        ALTER TABLE client_observations
            ALTER COLUMN source SET DEFAULT 'api';

        ALTER TABLE client_observations
            ALTER COLUMN relationship_type SET DEFAULT 'observed';
        """
    )


def downgrade() -> None:
    # Keep recovered links and provenance because they represent valid data.
    # Only restore the previous database defaults.
    op.execute(
        """
        ALTER TABLE client_observations
            ALTER COLUMN source SET DEFAULT 'mock_kismet';

        ALTER TABLE client_observations
            ALTER COLUMN relationship_type
            SET DEFAULT 'observed_association';
        """
    )
