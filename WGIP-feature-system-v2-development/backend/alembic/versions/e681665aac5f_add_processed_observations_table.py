"""add processed observations table

Revision ID: e681665aac5f
Revises: 5b8d427411c7
Create Date: 2026-07-17 03:48:06.333172+00:00

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "e681665aac5f"
down_revision: Union[str, Sequence[str], None] = "5b8d427411c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # ------------------------------------------------------------
    # Processed Wi-Fi observations table.
    # ------------------------------------------------------------
    # Ito yung clean/processed table na gagamitin ng frontend pages:
    # - Scan Results
    # - Wi-Fi History
    # - Wi-Fi Profile
    # - Map
    # - Review Items
    #
    # Raw Kismet data stays in kismet_raw_* tables.
    # This table contains only extracted Wi-Fi/AP records.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS observations (
            id SERIAL PRIMARY KEY,

            survey_id INTEGER NULL,
            import_batch_id INTEGER NULL,

            bssid VARCHAR(100) NULL,
            ssid TEXT NULL,

            channel INTEGER NULL,

            rssi INTEGER NULL,
            signal_dbm INTEGER NULL,

            encryption TEXT NULL,

            latitude DOUBLE PRECISION NULL,
            longitude DOUBLE PRECISION NULL,

            timestamp TIMESTAMP WITH TIME ZONE NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

            notes TEXT NULL,

            city TEXT NULL,
            province TEXT NULL,
            country TEXT NULL,
            area_label TEXT NULL,

            coordinate_source VARCHAR(50) NULL
        );
        """
    )

    # ------------------------------------------------------------
    # Safe column additions.
    # ------------------------------------------------------------
    # In case may old/partial observations table na existing,
    # these keep the migration safe and complete.
    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS survey_id INTEGER NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS import_batch_id INTEGER NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS bssid VARCHAR(100) NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS ssid TEXT NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS channel INTEGER NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS rssi INTEGER NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS signal_dbm INTEGER NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS encryption TEXT NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS notes TEXT NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS city TEXT NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS province TEXT NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS country TEXT NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS area_label TEXT NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE observations
        ADD COLUMN IF NOT EXISTS coordinate_source VARCHAR(50) NULL;
        """
    )

    # ------------------------------------------------------------
    # Indexes for faster frontend/API queries.
    # ------------------------------------------------------------
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_observations_survey_id
        ON observations (survey_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_observations_import_batch_id
        ON observations (import_batch_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_observations_bssid
        ON observations (bssid);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_observations_ssid
        ON observations (ssid);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_observations_timestamp
        ON observations (timestamp);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_observations_area_label
        ON observations (area_label);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_observations_lat_lon
        ON observations (latitude, longitude);
        """
    )


def downgrade() -> None:
    """Downgrade schema."""

    op.execute("DROP INDEX IF EXISTS ix_observations_lat_lon;")
    op.execute("DROP INDEX IF EXISTS ix_observations_area_label;")
    op.execute("DROP INDEX IF EXISTS ix_observations_timestamp;")
    op.execute("DROP INDEX IF EXISTS ix_observations_ssid;")
    op.execute("DROP INDEX IF EXISTS ix_observations_bssid;")
    op.execute("DROP INDEX IF EXISTS ix_observations_import_batch_id;")
    op.execute("DROP INDEX IF EXISTS ix_observations_survey_id;")

    op.execute("DROP TABLE IF EXISTS observations;")