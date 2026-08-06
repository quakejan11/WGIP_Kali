import json
import sys
from typing import Any, Dict, Optional

from sqlalchemy import text

try:
    from app.db.session import SessionLocal
except ImportError:
    from app.db.database import SessionLocal


def to_dict(row) -> Dict[str, Any]:
    if not row:
        return {}

    return dict(row)


def parse_json(value: Any) -> Dict[str, Any]:
    if value is None:
        return {}

    if isinstance(value, dict):
        return value

    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return {}

    return {}


def pass_fail(condition: bool) -> str:
    return "PASS" if condition else "FAIL"


def get_batch(db, batch_id: Optional[int]):
    if batch_id:
        row = db.execute(
            text(
                """
                SELECT
                    id,
                    original_filename,
                    file_hash,
                    kismet_version,
                    db_version,
                    db_module,
                    import_status,
                    manual_area_label,
                    manual_latitude,
                    manual_longitude,
                    coordinate_source,
                    device_count,
                    packet_count,
                    message_count,
                    snapshot_count,
                    alert_count,
                    datasource_count,
                    wifi_observation_count,
                    client_observation_count,
                    failed_count,
                    error_message,
                    created_at,
                    completed_at
                FROM kismet_import_batches
                WHERE id = :batch_id
                """
            ),
            {"batch_id": batch_id},
        ).mappings().first()
    else:
        row = db.execute(
            text(
                """
                SELECT
                    id,
                    original_filename,
                    file_hash,
                    kismet_version,
                    db_version,
                    db_module,
                    import_status,
                    manual_area_label,
                    manual_latitude,
                    manual_longitude,
                    coordinate_source,
                    device_count,
                    packet_count,
                    message_count,
                    snapshot_count,
                    alert_count,
                    datasource_count,
                    wifi_observation_count,
                    client_observation_count,
                    failed_count,
                    error_message,
                    created_at,
                    completed_at
                FROM kismet_import_batches
                ORDER BY created_at DESC
                LIMIT 1
                """
            )
        ).mappings().first()

    return to_dict(row)


def get_count(db, table_name: str, batch_id: int) -> int:
    row = db.execute(
        text(
            f"""
            SELECT COUNT(*) AS total
            FROM {table_name}
            WHERE import_batch_id = :batch_id
            """
        ),
        {"batch_id": batch_id},
    ).mappings().first()

    return int(row["total"] or 0)


def get_raw_device_sample(db, batch_id: int):
    row = db.execute(
        text(
            """
            SELECT
                id,
                devmac,
                device_type,
                phyname,
                strongest_signal,
                avg_lat,
                avg_lon,
                device_json
            FROM kismet_raw_devices
            WHERE import_batch_id = :batch_id
            ORDER BY id ASC
            LIMIT 1
            """
        ),
        {"batch_id": batch_id},
    ).mappings().first()

    return to_dict(row)


def get_wifi_sample(db, batch_id: int):
    row = db.execute(
        text(
            """
            SELECT
                id,
                bssid,
                ssid,
                manufacturer,
                channel,
                encryption,
                signal_dbm,
                latitude,
                longitude,
                coordinate_source,
                import_batch_id
            FROM observations
            WHERE import_batch_id = :batch_id
            ORDER BY id ASC
            LIMIT 1
            """
        ),
        {"batch_id": batch_id},
    ).mappings().first()

    return to_dict(row)


def get_client_sample(db, batch_id: int):
    row = db.execute(
        text(
            """
            SELECT
                id,
                client_mac,
                bssid,
                ssid,
                client_vendor,
                relationship_type,
                signal_dbm,
                latitude,
                longitude,
                coordinate_source,
                import_batch_id
            FROM client_observations
            WHERE import_batch_id = :batch_id
            ORDER BY id ASC
            LIMIT 1
            """
        ),
        {"batch_id": batch_id},
    ).mappings().first()

    return to_dict(row)


def print_line(label: str, value: Any):
    print(f"{label:<32}: {value}")


def main():
    batch_id = None

    if len(sys.argv) >= 2:
        try:
            batch_id = int(sys.argv[1])
        except ValueError:
            print("ERROR: Batch ID must be a number.")
            sys.exit(1)

    db = SessionLocal()

    try:
        batch = get_batch(db, batch_id)

        if not batch:
            print("ERROR: No Kismet import batch found.")
            sys.exit(1)

        current_batch_id = int(batch["id"])

        raw_device_count = get_count(db, "kismet_raw_devices", current_batch_id)
        raw_packet_count = get_count(db, "kismet_raw_packets", current_batch_id)
        raw_message_count = get_count(db, "kismet_raw_messages", current_batch_id)
        raw_snapshot_count = get_count(db, "kismet_raw_snapshots", current_batch_id)
        raw_alert_count = get_count(db, "kismet_raw_alerts", current_batch_id)
        raw_datasource_count = get_count(db, "kismet_raw_datasources", current_batch_id)
        wifi_count = get_count(db, "observations", current_batch_id)
        client_count = get_count(db, "client_observations", current_batch_id)

        raw_device_sample = get_raw_device_sample(db, current_batch_id)
        wifi_sample = get_wifi_sample(db, current_batch_id)
        client_sample = get_client_sample(db, current_batch_id)

        device_json = parse_json(raw_device_sample.get("device_json"))

        has_kismet_filename = str(batch.get("original_filename") or "").lower().endswith(
            ".kismet"
        )
        has_kismet_version = bool(batch.get("kismet_version"))
        has_kismet_module = str(batch.get("db_module") or "").lower() == "kismetlog"
        has_file_hash = bool(batch.get("file_hash"))
        has_raw_devices = raw_device_count > 0
        has_raw_kismet_json = any(
            key.startswith("kismet.device.") or key.startswith("dot11.device.")
            for key in device_json.keys()
        )
        has_processed_wifi = wifi_count > 0
        has_processed_clients = client_count > 0
        has_wifi_manufacturer = bool(wifi_sample.get("manufacturer"))
        has_client_manufacturer = bool(client_sample.get("client_vendor"))

        print("")
        print("WGIP KISMET IMPORT VERIFICATION")
        print("=" * 70)
        print("")

        print("IMPORT BATCH")
        print("-" * 70)
        print_line("Batch ID", current_batch_id)
        print_line("Original filename", batch.get("original_filename"))
        print_line("Kismet version", batch.get("kismet_version"))
        print_line("Kismet DB module", batch.get("db_module"))
        print_line("DB version", batch.get("db_version"))
        print_line("File hash", batch.get("file_hash"))
        print_line("Import status", batch.get("import_status"))
        print_line("Created at", batch.get("created_at"))
        print_line("Completed at", batch.get("completed_at"))
        print("")

        print("RAW KISMET TABLE COUNTS")
        print("-" * 70)
        print_line("Raw devices", raw_device_count)
        print_line("Raw packets", raw_packet_count)
        print_line("Raw messages", raw_message_count)
        print_line("Raw snapshots", raw_snapshot_count)
        print_line("Raw alerts", raw_alert_count)
        print_line("Raw datasources", raw_datasource_count)
        print("")

        print("PROCESSED WGIP RECORD COUNTS")
        print("-" * 70)
        print_line("Wi-Fi observations", wifi_count)
        print_line("Observed device records", client_count)
        print("")

        print("LOCATION SOURCE")
        print("-" * 70)
        print_line("Coordinate source", batch.get("coordinate_source"))
        print_line("Manual area label", batch.get("manual_area_label"))
        print_line("Manual latitude", batch.get("manual_latitude"))
        print_line("Manual longitude", batch.get("manual_longitude"))
        print("")

        print("RAW KISMET DEVICE SAMPLE")
        print("-" * 70)
        print_line("Raw row ID", raw_device_sample.get("id"))
        print_line("Device MAC", raw_device_sample.get("devmac"))
        print_line("Device type", raw_device_sample.get("device_type"))
        print_line("PHY name", raw_device_sample.get("phyname"))
        print_line("Strongest signal", raw_device_sample.get("strongest_signal"))
        print_line("Average latitude", raw_device_sample.get("avg_lat"))
        print_line("Average longitude", raw_device_sample.get("avg_lon"))
        print_line("JSON key count", len(device_json.keys()))
        print_line(
            "Sample JSON keys",
            ", ".join(list(device_json.keys())[:8]) if device_json else "None",
        )
        print("")

        print("PROCESSED WI-FI SAMPLE")
        print("-" * 70)
        if wifi_sample:
            print_line("BSSID", wifi_sample.get("bssid"))
            print_line("SSID", wifi_sample.get("ssid"))
            print_line("Manufacturer", wifi_sample.get("manufacturer"))
            print_line("Channel", wifi_sample.get("channel"))
            print_line("Encryption", wifi_sample.get("encryption"))
            print_line("Signal", wifi_sample.get("signal_dbm"))
            print_line("Coordinates", f"{wifi_sample.get('latitude')}, {wifi_sample.get('longitude')}")
            print_line("Coordinate source", wifi_sample.get("coordinate_source"))
            print_line("Import batch ID", wifi_sample.get("import_batch_id"))
        else:
            print("No processed Wi-Fi sample found.")
        print("")

        print("PROCESSED OBSERVED DEVICE SAMPLE")
        print("-" * 70)
        if client_sample:
            print_line("Client MAC", client_sample.get("client_mac"))
            print_line("Linked BSSID", client_sample.get("bssid"))
            print_line("SSID", client_sample.get("ssid"))
            print_line("Manufacturer", client_sample.get("client_vendor"))
            print_line("Relationship", client_sample.get("relationship_type"))
            print_line("Signal", client_sample.get("signal_dbm"))
            print_line("Coordinates", f"{client_sample.get('latitude')}, {client_sample.get('longitude')}")
            print_line("Coordinate source", client_sample.get("coordinate_source"))
            print_line("Import batch ID", client_sample.get("import_batch_id"))
        else:
            print("No processed observed device sample found.")
        print("")

        print("VERIFICATION RESULT")
        print("-" * 70)
        print_line("Filename is .kismet", pass_fail(has_kismet_filename))
        print_line("Has Kismet version", pass_fail(has_kismet_version))
        print_line("DB module is kismetlog", pass_fail(has_kismet_module))
        print_line("Has file hash", pass_fail(has_file_hash))
        print_line("Has raw Kismet devices", pass_fail(has_raw_devices))
        print_line("Has raw Kismet JSON keys", pass_fail(has_raw_kismet_json))
        print_line("Has processed Wi-Fi records", pass_fail(has_processed_wifi))
        print_line("Has processed device records", pass_fail(has_processed_clients))
        print_line("Has Wi-Fi manufacturer", pass_fail(has_wifi_manufacturer))
        print_line("Has device manufacturer", pass_fail(has_client_manufacturer))
        print("")

        if (
            has_kismet_filename
            and has_kismet_version
            and has_kismet_module
            and has_file_hash
            and has_raw_devices
            and has_raw_kismet_json
            and has_processed_wifi
        ):
            print("FINAL STATUS: ACTUAL KISMET IMPORT CONFIRMED")
        else:
            print("FINAL STATUS: NEEDS REVIEW")
            print("Some checks failed. Review the missing fields above.")

        print("")

    finally:
        db.close()


if __name__ == "__main__":
    main()
