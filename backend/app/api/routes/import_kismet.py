import csv
import io
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.survey import Survey
from app.models.import_batch import ImportBatch
from app.models.observation import Observation
from app.models.client_observation import ClientObservation
from app.utils.mac_manufacturer import resolve_manufacturer


router = APIRouter(
    prefix="/import",
    tags=["Import"],
)


def clean_text(value):
    if value is None:
        return None

    value = str(value).strip()

    if not value:
        return None

    return value


def parse_float(value):
    if value is None or value == "":
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_int(value):
    if value is None or value == "":
        return None

    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def parse_timestamp(value):
    if not value:
        return datetime.now(timezone.utc)

    if isinstance(value, datetime):
        return value

    value = str(value).strip()

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)


def get_first_value(row: Dict[str, Any], possible_keys: List[str]):
    normalized_row = {
        str(key).strip().lower(): value
        for key, value in row.items()
    }

    for key in possible_keys:
        normalized_key = key.strip().lower()

        if normalized_key in normalized_row:
            value = normalized_row[normalized_key]

            if value is not None and str(value).strip() != "":
                return value

    return None


def set_if_exists(model_object, field_name: str, value):
    if hasattr(model_object, field_name):
        setattr(model_object, field_name, value)


def parse_uploaded_file(file_content: bytes, filename: str) -> List[Dict[str, Any]]:
    filename = filename.lower()

    if filename.endswith(".json"):
        try:
            data = json.loads(file_content.decode("utf-8"))
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON file.")

        if isinstance(data, list):
            return data

        if isinstance(data, dict):
            for key in ["records", "data", "observations", "devices"]:
                if isinstance(data.get(key), list):
                    return data[key]

            return [data]

        raise HTTPException(status_code=400, detail="Unsupported JSON structure.")

    text_content = file_content.decode("utf-8-sig", errors="ignore")
    csv_reader = csv.DictReader(io.StringIO(text_content))

    rows = list(csv_reader)

    if not rows:
        raise HTTPException(status_code=400, detail="No records found in file.")

    return rows


def get_or_create_survey(
    db: Session,
    survey_id: Optional[int],
    location_name: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
) -> Survey:
    if survey_id:
        survey = db.query(Survey).filter(Survey.id == survey_id).first()

        if not survey:
            raise HTTPException(status_code=404, detail="Scan event not found.")

        if location_name and hasattr(survey, "location_name"):
            survey.location_name = location_name

        if latitude is not None and hasattr(survey, "latitude"):
            survey.latitude = latitude

        if longitude is not None and hasattr(survey, "longitude"):
            survey.longitude = longitude

        return survey

    survey = Survey(
        survey_name="Imported Scan",
        operator="Import",
        start_time=datetime.now(timezone.utc),
    )

    if hasattr(survey, "location_name"):
        survey.location_name = location_name

    if hasattr(survey, "latitude"):
        survey.latitude = latitude

    if hasattr(survey, "longitude"):
        survey.longitude = longitude

    db.add(survey)
    db.flush()

    return survey


def extract_bssid(row: Dict[str, Any]):
    return get_first_value(
        row,
        [
            "bssid",
            "BSSID",
            "mac",
            "MAC",
            "device_mac",
            "Device MAC",
            "ap_mac",
            "AP MAC",
        ],
    )


def extract_ssid(row: Dict[str, Any]):
    return get_first_value(
        row,
        [
            "ssid",
            "SSID",
            "network",
            "Network",
            "wifi_name",
            "Wi-Fi",
            "WiFi",
        ],
    )


def extract_client_mac(row: Dict[str, Any]):
    return get_first_value(
        row,
        [
            "client_mac",
            "Client MAC",
            "client",
            "Client",
            "station_mac",
            "Station MAC",
            "device",
            "Device",
            "device_id",
            "Device ID",
        ],
    )


def extract_vendor(row: Dict[str, Any]):
    return get_first_value(
        row,
        [
            "client_vendor",
            "Client Vendor",
            "vendor",
            "Vendor",
            "manufacturer",
            "Manufacturer",
        ],
    )


def extract_channel(row: Dict[str, Any]):
    return parse_int(
        get_first_value(
            row,
            [
                "channel",
                "Channel",
                "chan",
                "Chan",
            ],
        )
    )


def extract_signal(row: Dict[str, Any]):
    return parse_int(
        get_first_value(
            row,
            [
                "signal_dbm",
                "Signal dBm",
                "signal",
                "Signal",
                "rssi",
                "RSSI",
                "last_signal_dbm",
                "Last Signal",
            ],
        )
    )


def extract_encryption(row: Dict[str, Any]):
    return get_first_value(
        row,
        [
            "encryption",
            "Encryption",
            "security",
            "Security",
            "privacy",
            "Privacy",
        ],
    )


def extract_timestamp(row: Dict[str, Any]):
    return parse_timestamp(
        get_first_value(
            row,
            [
                "timestamp",
                "Timestamp",
                "time",
                "Time",
                "last_seen",
                "Last Seen",
                "first_seen",
                "First Seen",
            ],
        )
    )


def extract_latitude(row: Dict[str, Any], fallback_latitude: Optional[float]):
    value = parse_float(
        get_first_value(
            row,
            [
                "latitude",
                "Latitude",
                "lat",
                "Lat",
                "gps_lat",
                "GPS Lat",
            ],
        )
    )

    return value if value is not None else fallback_latitude


def extract_longitude(row: Dict[str, Any], fallback_longitude: Optional[float]):
    value = parse_float(
        get_first_value(
            row,
            [
                "longitude",
                "Longitude",
                "lon",
                "Lon",
                "lng",
                "Lng",
                "gps_lon",
                "GPS Lon",
                "gps_lng",
                "GPS Lng",
            ],
        )
    )

    return value if value is not None else fallback_longitude


def create_import_batch(
    db: Session,
    survey_id: int,
    filename: Optional[str],
    total_records: int,
) -> ImportBatch:
    import_batch = ImportBatch(
        survey_id=survey_id,
        filename=filename,
        file_type="kismet_csv",
        total_records=total_records,
        inserted_records=0,
        status="processing",
        source="kismet_import",
    )

    db.add(import_batch)
    db.flush()

    return import_batch


def create_wifi_observation(
    db: Session,
    survey_id: int,
    import_batch_id: Optional[int],
    row: Dict[str, Any],
    fallback_latitude: Optional[float],
    fallback_longitude: Optional[float],
):
    bssid = clean_text(extract_bssid(row))

    if not bssid:
        return False

    ssid = clean_text(extract_ssid(row)) or "Hidden/Unknown"
    channel = extract_channel(row)
    signal = extract_signal(row)
    encryption = clean_text(extract_encryption(row))
    manufacturer = resolve_manufacturer(
        bssid,
        clean_text(extract_vendor(row)),
    )
    timestamp = extract_timestamp(row)
    latitude = extract_latitude(row, fallback_latitude)
    longitude = extract_longitude(row, fallback_longitude)

    observation = Observation()

    set_if_exists(observation, "survey_id", survey_id)
    set_if_exists(observation, "import_batch_id", import_batch_id)
    set_if_exists(observation, "bssid", bssid)
    set_if_exists(observation, "ssid", ssid)
    set_if_exists(observation, "manufacturer", manufacturer)
    set_if_exists(observation, "channel", channel)
    set_if_exists(observation, "rssi", signal)
    set_if_exists(observation, "signal_dbm", signal)
    set_if_exists(observation, "encryption", encryption)
    set_if_exists(observation, "timestamp", timestamp)
    set_if_exists(observation, "created_at", timestamp)
    set_if_exists(observation, "latitude", latitude)
    set_if_exists(observation, "longitude", longitude)

    db.add(observation)

    return True


def create_client_observation(
    db: Session,
    survey_id: int,
    row: Dict[str, Any],
    fallback_latitude: Optional[float],
    fallback_longitude: Optional[float],
):
    client_mac = clean_text(extract_client_mac(row))

    if not client_mac:
        return False

    bssid = clean_text(extract_bssid(row))
    ssid = clean_text(extract_ssid(row)) or "Hidden/Unknown"
    channel = extract_channel(row)
    signal = extract_signal(row)
    timestamp = extract_timestamp(row)
    latitude = extract_latitude(row, fallback_latitude)
    longitude = extract_longitude(row, fallback_longitude)
    vendor = resolve_manufacturer(
        client_mac,
        clean_text(extract_vendor(row)),
    )

    client_observation = ClientObservation(
        survey_id=survey_id,
        bssid=bssid,
        ssid=ssid,
        channel=channel,
        client_mac=client_mac,
        client_vendor=vendor,
        timestamp=timestamp,
        latitude=latitude,
        longitude=longitude,
        signal_dbm=signal,
        relationship_type="associated",
    )

    set_if_exists(client_observation, "source", "import")

    db.add(client_observation)

    return True


@router.post("/kismet")
async def import_kismet_file(
    file: UploadFile = File(...),
    survey_id: Optional[int] = Form(None),
    location_name: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    db: Session = Depends(get_db),
):
    try:
        file_content = await file.read()

        if not file_content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        rows = parse_uploaded_file(
            file_content=file_content,
            filename=file.filename or "",
        )

        clean_location_name = clean_text(location_name)

        survey = get_or_create_survey(
            db=db,
            survey_id=survey_id,
            location_name=clean_location_name,
            latitude=latitude,
            longitude=longitude,
        )

        fallback_latitude = latitude

        if fallback_latitude is None and hasattr(survey, "latitude"):
            fallback_latitude = survey.latitude

        fallback_longitude = longitude

        if fallback_longitude is None and hasattr(survey, "longitude"):
            fallback_longitude = survey.longitude

        import_batch = create_import_batch(
            db=db,
            survey_id=survey.id,
            filename=file.filename,
            total_records=len(rows),
        )

        import_batch_id = import_batch.id

        inserted_wifi = 0
        inserted_clients = 0
        skipped = 0

        for row in rows:
            wifi_inserted = create_wifi_observation(
                db=db,
                survey_id=survey.id,
                import_batch_id=import_batch_id,
                row=row,
                fallback_latitude=fallback_latitude,
                fallback_longitude=fallback_longitude,
            )

            client_inserted = create_client_observation(
                db=db,
                survey_id=survey.id,
                row=row,
                fallback_latitude=fallback_latitude,
                fallback_longitude=fallback_longitude,
            )

            if wifi_inserted:
                inserted_wifi += 1

            if client_inserted:
                inserted_clients += 1

            if not wifi_inserted and not client_inserted:
                skipped += 1

        total_inserted = inserted_wifi + inserted_clients

        import_batch.inserted_records = total_inserted
        import_batch.status = "completed"

        db.commit()

        return {
            "message": "Import completed successfully.",
            "survey_id": survey.id,
            "import_batch_id": import_batch_id,
            "location_name": getattr(survey, "location_name", None),
            "latitude": getattr(survey, "latitude", None),
            "longitude": getattr(survey, "longitude", None),
            "inserted": total_inserted,
            "inserted_wifi_observations": inserted_wifi,
            "inserted_client_observations": inserted_clients,
            "skipped": skipped,
            "total_rows": len(rows),
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as error:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Import failed: {str(error)}",
        )
