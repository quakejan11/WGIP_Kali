"""add kismet raw import tables

Revision ID: 5b8d427411c7
Revises: 001_add_client_observations
Create Date: 2026-07-16 12:58:44.110835+00:00

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "5b8d427411c7"
down_revision: Union[str, Sequence[str], None] = "001_add_client_observations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # ------------------------------------------------------------
    # Parent table for every imported .kismet file.
    # ------------------------------------------------------------
    # Ito yung main tracking table per uploaded Kismet file.
    # One .kismet file = one import batch row.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS kismet_import_batches (
            id SERIAL PRIMARY KEY,
            survey_id INTEGER NULL,
            original_filename TEXT NOT NULL,
            file_size BIGINT NULL,
            file_hash TEXT NULL,
            kismet_version TEXT NULL,
            db_version INTEGER NULL,
            db_module TEXT NULL,
            import_status VARCHAR(50) NOT NULL DEFAULT 'pending',
            import_notes TEXT NULL,
            manual_area_label TEXT NULL,
            manual_latitude DOUBLE PRECISION NULL,
            manual_longitude DOUBLE PRECISION NULL,
            coordinate_source VARCHAR(50) NULL,
            device_count INTEGER NOT NULL DEFAULT 0,
            packet_count INTEGER NOT NULL DEFAULT 0,
            message_count INTEGER NOT NULL DEFAULT 0,
            snapshot_count INTEGER NOT NULL DEFAULT 0,
            alert_count INTEGER NOT NULL DEFAULT 0,
            data_count INTEGER NOT NULL DEFAULT 0,
            datasource_count INTEGER NOT NULL DEFAULT 0,
            wifi_observation_count INTEGER NOT NULL DEFAULT 0,
            client_observation_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMP WITH TIME ZONE NULL
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_import_batches_survey_id
        ON kismet_import_batches (survey_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_import_batches_file_hash
        ON kismet_import_batches (file_hash);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_import_batches_status
        ON kismet_import_batches (import_status);
        """
    )

    # ------------------------------------------------------------
    # Raw Kismet devices table.
    # Source table from .kismet SQLite: devices
    # ------------------------------------------------------------
    # Dito ise-save yung original Kismet device rows.
    # device_blob = raw Kismet JSON/blob.
    # device_json = parsed JSONB version for future querying.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS kismet_raw_devices (
            id SERIAL PRIMARY KEY,
            import_batch_id INTEGER NOT NULL REFERENCES kismet_import_batches(id) ON DELETE CASCADE,
            first_time BIGINT NULL,
            last_time BIGINT NULL,
            devkey TEXT NULL,
            phyname TEXT NULL,
            devmac TEXT NULL,
            strongest_signal INTEGER NULL,
            min_lat DOUBLE PRECISION NULL,
            min_lon DOUBLE PRECISION NULL,
            max_lat DOUBLE PRECISION NULL,
            max_lon DOUBLE PRECISION NULL,
            avg_lat DOUBLE PRECISION NULL,
            avg_lon DOUBLE PRECISION NULL,
            bytes_data BIGINT NULL,
            device_type TEXT NULL,
            device_blob BYTEA NULL,
            device_json JSONB NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_devices_batch
        ON kismet_raw_devices (import_batch_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_devices_devmac
        ON kismet_raw_devices (devmac);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_devices_type
        ON kismet_raw_devices (device_type);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_devices_phyname
        ON kismet_raw_devices (phyname);
        """
    )

    # ------------------------------------------------------------
    # Raw Kismet packets table.
    # Source table from .kismet SQLite: packets
    # ------------------------------------------------------------
    # Usually ito ang pinakamalaking table.
    # BIGSERIAL gamit dahil packets can be thousands/millions.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS kismet_raw_packets (
            id BIGSERIAL PRIMARY KEY,
            import_batch_id INTEGER NOT NULL REFERENCES kismet_import_batches(id) ON DELETE CASCADE,
            ts_sec BIGINT NULL,
            ts_usec BIGINT NULL,
            phyname TEXT NULL,
            sourcemac TEXT NULL,
            destmac TEXT NULL,
            transmac TEXT NULL,
            frequency DOUBLE PRECISION NULL,
            devkey TEXT NULL,
            lat DOUBLE PRECISION NULL,
            lon DOUBLE PRECISION NULL,
            alt DOUBLE PRECISION NULL,
            speed DOUBLE PRECISION NULL,
            heading DOUBLE PRECISION NULL,
            packet_len INTEGER NULL,
            signal INTEGER NULL,
            datasource TEXT NULL,
            dlt INTEGER NULL,
            packet_blob BYTEA NULL,
            error INTEGER NULL,
            tags TEXT NULL,
            datarate DOUBLE PRECISION NULL,
            packet_hash BIGINT NULL,
            packetid BIGINT NULL,
            packet_full_len INTEGER NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_packets_batch
        ON kismet_raw_packets (import_batch_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_packets_sourcemac
        ON kismet_raw_packets (sourcemac);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_packets_destmac
        ON kismet_raw_packets (destmac);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_packets_transmac
        ON kismet_raw_packets (transmac);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_packets_devkey
        ON kismet_raw_packets (devkey);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_packets_ts
        ON kismet_raw_packets (ts_sec, ts_usec);
        """
    )

    # ------------------------------------------------------------
    # Raw Kismet messages table.
    # Source table from .kismet SQLite: messages
    # ------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS kismet_raw_messages (
            id SERIAL PRIMARY KEY,
            import_batch_id INTEGER NOT NULL REFERENCES kismet_import_batches(id) ON DELETE CASCADE,
            ts_sec BIGINT NULL,
            lat DOUBLE PRECISION NULL,
            lon DOUBLE PRECISION NULL,
            msgtype TEXT NULL,
            message TEXT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_messages_batch
        ON kismet_raw_messages (import_batch_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_messages_type
        ON kismet_raw_messages (msgtype);
        """
    )

    # ------------------------------------------------------------
    # Raw Kismet snapshots table.
    # Source table from .kismet SQLite: snapshots
    # ------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS kismet_raw_snapshots (
            id SERIAL PRIMARY KEY,
            import_batch_id INTEGER NOT NULL REFERENCES kismet_import_batches(id) ON DELETE CASCADE,
            ts_sec BIGINT NULL,
            ts_usec BIGINT NULL,
            lat DOUBLE PRECISION NULL,
            lon DOUBLE PRECISION NULL,
            snaptype TEXT NULL,
            json_blob BYTEA NULL,
            snapshot_json JSONB NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_snapshots_batch
        ON kismet_raw_snapshots (import_batch_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_snapshots_type
        ON kismet_raw_snapshots (snaptype);
        """
    )

    # ------------------------------------------------------------
    # Raw Kismet alerts table.
    # Source table from .kismet SQLite: alerts
    # ------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS kismet_raw_alerts (
            id SERIAL PRIMARY KEY,
            import_batch_id INTEGER NOT NULL REFERENCES kismet_import_batches(id) ON DELETE CASCADE,
            ts_sec BIGINT NULL,
            ts_usec BIGINT NULL,
            phyname TEXT NULL,
            devmac TEXT NULL,
            lat DOUBLE PRECISION NULL,
            lon DOUBLE PRECISION NULL,
            header TEXT NULL,
            json_blob BYTEA NULL,
            alert_json JSONB NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_alerts_batch
        ON kismet_raw_alerts (import_batch_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_alerts_devmac
        ON kismet_raw_alerts (devmac);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_alerts_header
        ON kismet_raw_alerts (header);
        """
    )

    # ------------------------------------------------------------
    # Raw Kismet data table.
    # Source table from .kismet SQLite: data
    # ------------------------------------------------------------
    # data_type is used instead of type para iwas confusing/reserved naming.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS kismet_raw_data (
            id SERIAL PRIMARY KEY,
            import_batch_id INTEGER NOT NULL REFERENCES kismet_import_batches(id) ON DELETE CASCADE,
            ts_sec BIGINT NULL,
            ts_usec BIGINT NULL,
            phyname TEXT NULL,
            devmac TEXT NULL,
            lat DOUBLE PRECISION NULL,
            lon DOUBLE PRECISION NULL,
            alt DOUBLE PRECISION NULL,
            speed DOUBLE PRECISION NULL,
            heading DOUBLE PRECISION NULL,
            datasource TEXT NULL,
            data_type TEXT NULL,
            json_blob BYTEA NULL,
            data_json JSONB NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_data_batch
        ON kismet_raw_data (import_batch_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_data_devmac
        ON kismet_raw_data (devmac);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_data_type
        ON kismet_raw_data (data_type);
        """
    )

    # ------------------------------------------------------------
    # Raw Kismet datasources table.
    # Source table from .kismet SQLite: datasources
    # ------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS kismet_raw_datasources (
            id SERIAL PRIMARY KEY,
            import_batch_id INTEGER NOT NULL REFERENCES kismet_import_batches(id) ON DELETE CASCADE,
            uuid TEXT NULL,
            typestring TEXT NULL,
            definition TEXT NULL,
            name TEXT NULL,
            interface TEXT NULL,
            json_blob BYTEA NULL,
            datasource_json JSONB NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_datasources_batch
        ON kismet_raw_datasources (import_batch_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_kismet_raw_datasources_uuid
        ON kismet_raw_datasources (uuid);
        """
    )

    # ------------------------------------------------------------
    # Add import tracking fields to existing processed tables.
    # ------------------------------------------------------------
    # Safe ito kahit wala pa yung observations/client_observations table.
    # Kapag existing yung table, saka lang siya mag-a-add ng columns/indexes.
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.observations') IS NOT NULL THEN
                ALTER TABLE observations
                ADD COLUMN IF NOT EXISTS import_batch_id INTEGER NULL;

                ALTER TABLE observations
                ADD COLUMN IF NOT EXISTS coordinate_source VARCHAR(50) NULL;

                CREATE INDEX IF NOT EXISTS ix_observations_import_batch_id
                ON observations (import_batch_id);
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.client_observations') IS NOT NULL THEN
                ALTER TABLE client_observations
                ADD COLUMN IF NOT EXISTS import_batch_id INTEGER NULL;

                ALTER TABLE client_observations
                ADD COLUMN IF NOT EXISTS coordinate_source VARCHAR(50) NULL;

                CREATE INDEX IF NOT EXISTS ix_client_observations_import_batch_id
                ON client_observations (import_batch_id);
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    """Downgrade schema."""

    # ------------------------------------------------------------
    # Remove indexes/columns added to existing processed tables.
    # ------------------------------------------------------------
    # Safe ito kahit wala yung observations/client_observations table.
    op.execute("DROP INDEX IF EXISTS ix_client_observations_import_batch_id;")
    op.execute("DROP INDEX IF EXISTS ix_observations_import_batch_id;")

    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.client_observations') IS NOT NULL THEN
                ALTER TABLE client_observations
                DROP COLUMN IF EXISTS coordinate_source;

                ALTER TABLE client_observations
                DROP COLUMN IF EXISTS import_batch_id;
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.observations') IS NOT NULL THEN
                ALTER TABLE observations
                DROP COLUMN IF EXISTS coordinate_source;

                ALTER TABLE observations
                DROP COLUMN IF EXISTS import_batch_id;
            END IF;
        END
        $$;
        """
    )

    # ------------------------------------------------------------
    # Drop raw Kismet tables.
    # ------------------------------------------------------------
    # Order matters because raw tables depend on kismet_import_batches.
    op.execute("DROP TABLE IF EXISTS kismet_raw_datasources;")
    op.execute("DROP TABLE IF EXISTS kismet_raw_data;")
    op.execute("DROP TABLE IF EXISTS kismet_raw_alerts;")
    op.execute("DROP TABLE IF EXISTS kismet_raw_snapshots;")
    op.execute("DROP TABLE IF EXISTS kismet_raw_messages;")
    op.execute("DROP TABLE IF EXISTS kismet_raw_packets;")
    op.execute("DROP TABLE IF EXISTS kismet_raw_devices;")
    op.execute("DROP TABLE IF EXISTS kismet_import_batches;")