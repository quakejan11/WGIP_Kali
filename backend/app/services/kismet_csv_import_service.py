import csv
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.utils.mac_manufacturer import resolve_manufacturer


ZERO_MAC = "00:00:00:00:00:00"


def clean_string(value: Any) -> Optional[str]:
    if value is None:
        return None

    text_value = str(value).strip()

    if text_value == "" or text_value.lower() in {"nan", "none", "null"}:
        return None

    return text_value


def safe_float(value: Any) -> Optional[float]:
    value = clean_string(value)

    if value is None:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def safe_int(value: Any) -> Optional[int]:
    value = clean_string(value)

    if value is None:
        return None

    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def extract_channel(value: Any) -> Optional[int]:
    value = clean_string(value)

    if value is None:
        return None

    match = re.search(r"\d+", value)

    if not match:
        return None

    return safe_int(match.group(0))


def is_valid_mac(value: Any) -> bool:
    value = clean_string(value)

    if not value:
        return False

    return value.lower() != ZERO_MAC.lower()


def is_valid_coordinate(lat: Any, lon: Any) -> bool:
    lat_value = safe_float(lat)
    lon_value = safe_float(lon)

    if lat_value is None or lon_value is None:
        return False

    if lat_value == 0 and lon_value == 0:
        return False

    return -90 <= lat_value <= 90 and -180 <= lon_value <= 180


def parse_epoch(value: Any) -> Optional[datetime]:
    epoch = safe_float(value)

    if epoch is None or epoch <= 0:
        return None

    try:
        return datetime.fromtimestamp(epoch, tz=timezone.utc)
    except (OSError, OverflowError, ValueError):
        return None


def parse_device_json(value: Any) -> Dict[str, Any]:
    value = clean_string(value)

    if not value:
        return {}

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}

    if isinstance(parsed, dict):
        return parsed

    return {}


def normalize_device_type(value: Any) -> str:
    value = clean_string(value) or ""

    return (
        value.lower()
        .replace(" ", "")
        .replace("-", "")
        .replace("_", "")
    )


def is_wifi_ap(device_type: Any) -> bool:
    normalized = normalize_device_type(device_type)

    return normalized in {"wifiap", "wirelessap", "ap"} or "wifiap" in normalized


def is_wifi_device(device_type: Any) -> bool:
    normalized = normalize_device_type(device_type)

    return normalized.startswith("wifi") or "wifi" in normalized


def calculate_file_hash(file_path: Path) -> str:
    sha256 = hashlib.sha256()

    with file_path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            sha256.update(chunk)

    return sha256.hexdigest()


def get_nested_geopoint(device_json: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    location = device_json.get("kismet.device.base.location") or {}

    possible_locations = [
        location.get("kismet.common.location.avg_loc") or {},
        location.get("kismet.common.location.last") or {},
        location.get("kismet.common.location.min_loc") or {},
        location.get("kismet.common.location.max_loc") or {},
    ]

    for item in possible_locations:
        geopoint = item.get("kismet.common.location.geopoint")

        if isinstance(geopoint, list) and len(geopoint) >= 2:
            lon = safe_float(geopoint[0])
            lat = safe_float(geopoint[1])

            if is_valid_coordinate(lat, lon):
                return lat, lon

    return None, None


def pick_coordinates(
    row: Dict[str, Any],
    device_json: Dict[str, Any],
    manual_latitude: Optional[float],
    manual_longitude: Optional[float],
) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    row_lat = safe_float(row.get("avg_lat"))
    row_lon = safe_float(row.get("avg_lon"))

    if is_valid_coordinate(row_lat, row_lon):
        return row_lat, row_lon, "kismet_csv"

    json_lat, json_lon = get_nested_geopoint(device_json)

    if is_valid_coordinate(json_lat, json_lon):
        return json_lat, json_lon, "kismet_csv"

    if is_valid_coordinate(manual_latitude, manual_longitude):
        return manual_latitude, manual_longitude, "manual"

    return None, None, None


def get_signal(row: Dict[str, Any], device_json: Dict[str, Any]) -> Optional[int]:
    row_signal = safe_int(row.get("strongest_signal"))

    if row_signal is not None:
        return row_signal

    signal = device_json.get("kismet.device.base.signal") or {}

    return (
        safe_int(signal.get("kismet.common.signal.max_signal"))
        or safe_int(signal.get("kismet.common.signal.last_signal"))
        or safe_int(signal.get("kismet.common.signal.min_signal"))
    )


def get_ap_ssid_and_encryption(device_json: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    dot11 = device_json.get("dot11.device") or {}

    last_beacon = dot11.get("dot11.device.last_beaconed_ssid_record") or {}

    ssid = clean_string(last_beacon.get("dot11.advertisedssid.ssid"))
    encryption = clean_string(last_beacon.get("dot11.advertisedssid.crypt_string"))

    if ssid or encryption:
        return ssid, encryption

    advertised_map = dot11.get("dot11.device.advertised_ssid_map") or []

    if isinstance(advertised_map, list):
        for item in advertised_map:
            if not isinstance(item, dict):
                continue

            ssid = clean_string(item.get("dot11.advertisedssid.ssid"))
            encryption = clean_string(item.get("dot11.advertisedssid.crypt_string"))

            if ssid or encryption:
                return ssid, encryption

    return None, clean_string(device_json.get("kismet.device.base.crypt"))


def get_client_probed_ssid(device_json: Dict[str, Any]) -> Optional[str]:
    dot11 = device_json.get("dot11.device") or {}

    last_probe = dot11.get("dot11.device.last_probed_ssid_record") or {}

    ssid = clean_string(last_probe.get("dot11.probedssid.ssid"))

    if ssid:
        return ssid

    probed_map = dot11.get("dot11.device.probed_ssid_map") or []

    if isinstance(probed_map, list):
        for item in probed_map:
            if not isinstance(item, dict):
                continue

            ssid = clean_string(item.get("dot11.probedssid.ssid"))

            if ssid:
                return ssid

    return None


def get_last_bssid(device_json: Dict[str, Any]) -> Optional[str]:
    dot11 = device_json.get("dot11.device") or {}

    last_bssid = clean_string(dot11.get("dot11.device.last_bssid"))

    if is_valid_mac(last_bssid):
        return last_bssid

    return None


def get_kismet_version(parsed_rows: List[Dict[str, Any]]) -> Optional[str]:
    for parsed_row in parsed_rows:
        device_json = parsed_row["device_json"]

        seen_by = device_json.get("kismet.device.base.seenby") or []

        if not isinstance(seen_by, list):
            continue

        for seen_item in seen_by:
            if not isinstance(seen_item, dict):
                continue

            source = seen_item.get("kismet.common.seenby.source") or {}
            version = clean_string(source.get("kismet.datasource.datasource_version"))

            if version:
                return version

    return None


def read_kismet_devices_csv(file_path: Path) -> List[Dict[str, Any]]:
    with file_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        rows = list(reader)

    if not rows:
        raise ValueError("CSV file is empty.")

    fieldnames = set(reader.fieldnames or [])

    if "devmac" not in fieldnames:
        raise ValueError("CSV file must include a devmac column.")

    if "device_json" not in fieldnames:
        raise ValueError("CSV file must include a device_json column.")

    parsed_rows = []

    for row in rows:
        device_json = parse_device_json(row.get("device_json"))

        device_type = (
            clean_string(row.get("type"))
            or clean_string(row.get("device_type"))
            or clean_string(device_json.get("kismet.device.base.type"))
            or "Unknown"
        )

        parsed_rows.append(
            {
                "row": row,
                "device_json": device_json,
                "device_type": device_type,
            }
        )

    return parsed_rows


def create_import_batch(
    db: Session,
    *,
    original_filename: str,
    file_path: Path,
    kismet_version: Optional[str],
    survey_id: Optional[int],
    manual_area_label: Optional[str],
    manual_latitude: Optional[float],
    manual_longitude: Optional[float],
) -> int:
    row = db.execute(
        text(
            """
            INSERT INTO kismet_import_batches (
                survey_id,
                original_filename,
                file_size,
                file_hash,
                kismet_version,
                db_version,
                db_module,
                import_status,
                import_notes,
                manual_area_label,
                manual_latitude,
                manual_longitude,
                coordinate_source,
                device_count,
                packet_count,
                message_count,
                snapshot_count,
                alert_count,
                data_count,
                datasource_count,
                wifi_observation_count,
                client_observation_count,
                failed_count,
                error_message,
                created_at
            )
            VALUES (
                :survey_id,
                :original_filename,
                :file_size,
                :file_hash,
                :kismet_version,
                NULL,
                'kismet_devices_csv',
                'processing',
                'Kismet devices CSV export import',
                :manual_area_label,
                :manual_latitude,
                :manual_longitude,
                'processing',
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                NULL,
                NOW()
            )
            RETURNING id
            """
        ),
        {
            "survey_id": survey_id,
            "original_filename": original_filename,
            "file_size": file_path.stat().st_size,
            "file_hash": calculate_file_hash(file_path),
            "kismet_version": kismet_version,
            "manual_area_label": manual_area_label,
            "manual_latitude": manual_latitude,
            "manual_longitude": manual_longitude,
        },
    ).scalar_one()

    db.commit()

    return int(row)


def insert_raw_device(
    db: Session,
    *,
    import_batch_id: int,
    row: Dict[str, Any],
    device_json: Dict[str, Any],
    device_type: str,
):
    db.execute(
        text(
            """
            INSERT INTO kismet_raw_devices (
                import_batch_id,
                first_time,
                last_time,
                devkey,
                phyname,
                devmac,
                strongest_signal,
                min_lat,
                min_lon,
                max_lat,
                max_lon,
                avg_lat,
                avg_lon,
                bytes_data,
                device_type,
                device_json,
                created_at
            )
            VALUES (
                :import_batch_id,
                :first_time,
                :last_time,
                :devkey,
                :phyname,
                :devmac,
                :strongest_signal,
                :min_lat,
                :min_lon,
                :max_lat,
                :max_lon,
                :avg_lat,
                :avg_lon,
                :bytes_data,
                :device_type,
                CAST(:device_json AS jsonb),
                NOW()
            )
            """
        ),
        {
            "import_batch_id": import_batch_id,
            "first_time": safe_int(row.get("first_time")),
            "last_time": safe_int(row.get("last_time")),
            "devkey": clean_string(row.get("devkey")),
            "phyname": clean_string(row.get("phyname")),
            "devmac": clean_string(row.get("devmac")),
            "strongest_signal": safe_int(row.get("strongest_signal")),
            "min_lat": safe_float(row.get("min_lat")),
            "min_lon": safe_float(row.get("min_lon")),
            "max_lat": safe_float(row.get("max_lat")),
            "max_lon": safe_float(row.get("max_lon")),
            "avg_lat": safe_float(row.get("avg_lat")),
            "avg_lon": safe_float(row.get("avg_lon")),
            "bytes_data": safe_int(row.get("bytes_data")),
            "device_type": device_type,
            "device_json": json.dumps(device_json),
        },
    )


def insert_wifi_observation(
    db: Session,
    *,
    import_batch_id: int,
    survey_id: Optional[int],
    row: Dict[str, Any],
    device_json: Dict[str, Any],
    manual_area_label: Optional[str],
    manual_latitude: Optional[float],
    manual_longitude: Optional[float],
) -> Optional[Dict[str, Any]]:
    bssid = clean_string(row.get("devmac")) or clean_string(
        device_json.get("kismet.device.base.macaddr")
    )

    if not is_valid_mac(bssid):
        return None

    ssid, encryption = get_ap_ssid_and_encryption(device_json)

    channel = (
        extract_channel(device_json.get("kismet.device.base.channel"))
        or extract_channel(row.get("channel"))
    )

    signal_dbm = get_signal(row, device_json)
    latitude, longitude, coordinate_source = pick_coordinates(
        row,
        device_json,
        manual_latitude,
        manual_longitude,
    )

    timestamp = parse_epoch(row.get("last_time")) or parse_epoch(
        device_json.get("kismet.device.base.last_time")
    )
    manufacturer = resolve_manufacturer(
        bssid,
        device_json.get("kismet.device.base.manuf"),
    )

    db.execute(
        text(
            """
            INSERT INTO observations (
                survey_id,
                import_batch_id,
                bssid,
                ssid,
                manufacturer,
                channel,
                rssi,
                signal_dbm,
                encryption,
                latitude,
                longitude,
                timestamp,
                notes,
                area_label,
                coordinate_source
            )
            VALUES (
                :survey_id,
                :import_batch_id,
                :bssid,
                :ssid,
                :manufacturer,
                :channel,
                :rssi,
                :signal_dbm,
                :encryption,
                :latitude,
                :longitude,
                :timestamp,
                :notes,
                :area_label,
                :coordinate_source
            )
            """
        ),
        {
            "survey_id": survey_id,
            "import_batch_id": import_batch_id,
            "bssid": bssid,
            "ssid": ssid,
            "manufacturer": manufacturer,
            "channel": channel,
            "rssi": signal_dbm,
            "signal_dbm": signal_dbm,
            "encryption": encryption,
            "latitude": latitude,
            "longitude": longitude,
            "timestamp": timestamp,
            "notes": "Imported from Kismet devices CSV export.",
            "area_label": manual_area_label,
            "coordinate_source": coordinate_source,
        },
    )

    return {
        "bssid": bssid,
        "ssid": ssid,
        "manufacturer": manufacturer,
        "channel": channel,
        "encryption": encryption,
        "latitude": latitude,
        "longitude": longitude,
        "coordinate_source": coordinate_source,
    }


def insert_client_observation(
    db: Session,
    *,
    import_batch_id: int,
    survey_id: Optional[int],
    row: Dict[str, Any],
    device_json: Dict[str, Any],
    device_type: str,
    ap_lookup: Dict[str, Dict[str, Any]],
    manual_area_label: Optional[str],
    manual_latitude: Optional[float],
    manual_longitude: Optional[float],
) -> Optional[Dict[str, Any]]:
    client_mac = clean_string(row.get("devmac")) or clean_string(
        device_json.get("kismet.device.base.macaddr")
    )

    if not is_valid_mac(client_mac):
        return None

    bssid = get_last_bssid(device_json)

    linked_ap = ap_lookup.get(bssid.lower()) if bssid else None

    ssid = (
        linked_ap.get("ssid")
        if linked_ap
        else get_client_probed_ssid(device_json)
    )

    channel = (
        linked_ap.get("channel")
        if linked_ap
        else extract_channel(device_json.get("kismet.device.base.channel"))
    )

    latitude, longitude, coordinate_source = pick_coordinates(
        row,
        device_json,
        manual_latitude,
        manual_longitude,
    )

    signal_dbm = get_signal(row, device_json)

    timestamp = parse_epoch(row.get("last_time")) or parse_epoch(
        device_json.get("kismet.device.base.last_time")
    )

    relationship_type = "observed"

    if "bridged" in normalize_device_type(device_type):
        relationship_type = "bridged"
    elif bssid:
        relationship_type = "associated"

    db.execute(
        text(
            """
            INSERT INTO client_observations (
                survey_id,
                import_batch_id,
                bssid,
                ssid,
                channel,
                client_mac,
                client_vendor,
                timestamp,
                latitude,
                longitude,
                signal_dbm,
                relationship_type,
                coordinate_source,
                source
            )
            VALUES (
                :survey_id,
                :import_batch_id,
                :bssid,
                :ssid,
                :channel,
                :client_mac,
                :client_vendor,
                :timestamp,
                :latitude,
                :longitude,
                :signal_dbm,
                :relationship_type,
                :coordinate_source,
                :source
            )
            """
        ),
        {
            "survey_id": survey_id,
            "import_batch_id": import_batch_id,
            "bssid": bssid,
            "ssid": ssid,
            "channel": channel,
            "client_mac": client_mac,
            "client_vendor": resolve_manufacturer(
                client_mac,
                device_json.get("kismet.device.base.manuf"),
            ),
            "timestamp": timestamp,
            "latitude": latitude,
            "longitude": longitude,
            "signal_dbm": signal_dbm,
            "relationship_type": relationship_type,
            "coordinate_source": coordinate_source,
            "source": "kismet_csv",
        },
    )

    return {
        "client_mac": client_mac,
        "bssid": bssid,
        "ssid": ssid,
        "relationship_type": relationship_type,
        "latitude": latitude,
        "longitude": longitude,
        "coordinate_source": coordinate_source,
    }


def update_import_batch_success(
    db: Session,
    *,
    import_batch_id: int,
    device_count: int,
    wifi_count: int,
    client_count: int,
    failed_count: int,
    coordinate_source: str,
):
    db.execute(
        text(
            """
            UPDATE kismet_import_batches
            SET
                import_status = 'completed',
                coordinate_source = :coordinate_source,
                device_count = :device_count,
                packet_count = 0,
                message_count = 0,
                snapshot_count = 0,
                alert_count = 0,
                data_count = 0,
                datasource_count = 0,
                wifi_observation_count = :wifi_count,
                client_observation_count = :client_count,
                failed_count = :failed_count,
                completed_at = NOW()
            WHERE id = :import_batch_id
            """
        ),
        {
            "import_batch_id": import_batch_id,
            "coordinate_source": coordinate_source,
            "device_count": device_count,
            "wifi_count": wifi_count,
            "client_count": client_count,
            "failed_count": failed_count,
        },
    )


def update_import_batch_failure(
    db: Session,
    *,
    import_batch_id: int,
    error_message: str,
):
    db.execute(
        text(
            """
            UPDATE kismet_import_batches
            SET
                import_status = 'failed',
                error_message = :error_message,
                completed_at = NOW()
            WHERE id = :import_batch_id
            """
        ),
        {
            "import_batch_id": import_batch_id,
            "error_message": error_message,
        },
    )


def import_kismet_devices_csv(
    db: Session,
    *,
    uploaded_file_path: Path,
    original_filename: str,
    survey_id: Optional[int] = None,
    manual_area_label: Optional[str] = None,
    manual_latitude: Optional[float] = None,
    manual_longitude: Optional[float] = None,
) -> Dict[str, Any]:
    parsed_rows = read_kismet_devices_csv(uploaded_file_path)
    kismet_version = get_kismet_version(parsed_rows)

    import_batch_id = create_import_batch(
        db,
        original_filename=original_filename,
        file_path=uploaded_file_path,
        kismet_version=kismet_version,
        survey_id=survey_id,
        manual_area_label=manual_area_label,
        manual_latitude=manual_latitude,
        manual_longitude=manual_longitude,
    )

    wifi_count = 0
    client_count = 0
    failed_count = 0
    coordinate_sources = set()

    try:
        ap_lookup: Dict[str, Dict[str, Any]] = {}

        for parsed_row in parsed_rows:
            row = parsed_row["row"]
            device_json = parsed_row["device_json"]
            device_type = parsed_row["device_type"]

            if not is_wifi_ap(device_type):
                continue

            ap_data = insert_wifi_observation(
                db,
                import_batch_id=import_batch_id,
                survey_id=survey_id,
                row=row,
                device_json=device_json,
                manual_area_label=manual_area_label,
                manual_latitude=manual_latitude,
                manual_longitude=manual_longitude,
            )

            if ap_data:
                wifi_count += 1
                ap_lookup[ap_data["bssid"].lower()] = ap_data

                if ap_data.get("coordinate_source"):
                    coordinate_sources.add(ap_data["coordinate_source"])

        for parsed_row in parsed_rows:
            row = parsed_row["row"]
            device_json = parsed_row["device_json"]
            device_type = parsed_row["device_type"]

            insert_raw_device(
                db,
                import_batch_id=import_batch_id,
                row=row,
                device_json=device_json,
                device_type=device_type,
            )

            if is_wifi_ap(device_type):
                continue

            if not is_wifi_device(device_type):
                continue

            client_data = insert_client_observation(
                db,
                import_batch_id=import_batch_id,
                survey_id=survey_id,
                row=row,
                device_json=device_json,
                device_type=device_type,
                ap_lookup=ap_lookup,
                manual_area_label=manual_area_label,
                manual_latitude=manual_latitude,
                manual_longitude=manual_longitude,
            )

            if client_data:
                client_count += 1

                if client_data.get("coordinate_source"):
                    coordinate_sources.add(client_data["coordinate_source"])

        if "kismet_csv" in coordinate_sources:
            batch_coordinate_source = "kismet_csv"
        elif "manual" in coordinate_sources:
            batch_coordinate_source = "manual"
        else:
            batch_coordinate_source = "none"

        update_import_batch_success(
            db,
            import_batch_id=import_batch_id,
            device_count=len(parsed_rows),
            wifi_count=wifi_count,
            client_count=client_count,
            failed_count=failed_count,
            coordinate_source=batch_coordinate_source,
        )

        db.commit()

        return {
            "import_batch_id": import_batch_id,
            "import_type": "kismet_devices_csv",
            "status": "completed",
            "original_filename": original_filename,
            "raw_inserted": {
                "devices": len(parsed_rows),
                "packets": 0,
                "messages": 0,
                "snapshots": 0,
                "alerts": 0,
                "datasources": 0,
            },
            "processed_inserted": {
                "wifi_observations": wifi_count,
                "client_observations": client_count,
            },
            "coordinate_source": batch_coordinate_source,
            "failed_count": failed_count,
            "note": (
                "CSV import used Kismet device export rows only. "
                "Packet/message/snapshot/alert tables are not included in this CSV format."
            ),
        }

    except Exception as exc:
        db.rollback()

        try:
            update_import_batch_failure(
                db,
                import_batch_id=import_batch_id,
                error_message=str(exc),
            )
            db.commit()
        except Exception:
            db.rollback()

        raise
