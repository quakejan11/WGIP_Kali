from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.observation import Observation
from app.models.survey import Survey
from app.utils.mac_manufacturer import resolve_manufacturer


router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


def safe_value(value):
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.isoformat()

    return value


def get_signal(record: Observation) -> Optional[int]:
    signal_dbm = getattr(record, "signal_dbm", None)

    if signal_dbm is not None:
        return signal_dbm

    return getattr(record, "rssi", None)


def get_time(record: Observation):
    timestamp = getattr(record, "timestamp", None)

    if timestamp is not None:
        return timestamp

    return getattr(record, "created_at", None)


def get_survey_cache(db: Session) -> Dict[int, Survey]:
    surveys = db.query(Survey).all()

    return {
        survey.id: survey
        for survey in surveys
        if survey and survey.id is not None
    }


def get_location_key(record: Observation, survey_cache: Dict[int, Survey]) -> str:
    area_label = getattr(record, "area_label", None)

    if area_label:
        return area_label

    city = getattr(record, "city", None)
    province = getattr(record, "province", None)
    country = getattr(record, "country", None)

    location_parts = [
        part for part in [city, province, country]
        if part
    ]

    if location_parts:
        return ", ".join(location_parts)

    latitude = getattr(record, "latitude", None)
    longitude = getattr(record, "longitude", None)

    if latitude is not None and longitude is not None:
        return f"{float(latitude):.4f}, {float(longitude):.4f}"

    survey_id = getattr(record, "survey_id", None)

    if survey_id and survey_id in survey_cache:
        survey = survey_cache[survey_id]

        location_name = getattr(survey, "location_name", None)

        if location_name:
            return location_name

        survey_latitude = getattr(survey, "latitude", None)
        survey_longitude = getattr(survey, "longitude", None)

        if survey_latitude is not None and survey_longitude is not None:
            return f"{float(survey_latitude):.4f}, {float(survey_longitude):.4f}"

        survey_name = getattr(survey, "survey_name", None)

        if survey_name:
            return survey_name

    if survey_id:
        return f"Scan {survey_id}"

    return "Unknown Location"


def build_bssid_summary_row(
    bssid: str,
    records: List[Observation],
    survey_cache: Dict[int, Survey],
) -> Dict[str, Any]:
    ssids = set()
    scan_ids = set()
    locations = set()

    first_seen = None
    last_seen = None
    latest_signal = None
    latest_channel = None
    latest_encryption = None
    latest_manufacturer = None

    for record in records:
        ssid = getattr(record, "ssid", None)

        if ssid:
            ssids.add(ssid)

        survey_id = getattr(record, "survey_id", None)

        if survey_id is not None:
            scan_ids.add(survey_id)

        location_key = get_location_key(record, survey_cache)
        locations.add(location_key)

        record_time = get_time(record)

        if record_time is not None:
            if first_seen is None or record_time < first_seen:
                first_seen = record_time

            if last_seen is None or record_time > last_seen:
                last_seen = record_time

                latest_signal = get_signal(record)
                latest_channel = getattr(record, "channel", None)
                latest_encryption = getattr(record, "encryption", None)
                latest_manufacturer = getattr(record, "manufacturer", None)

    location_list = sorted(list(locations))
    ssid_list = sorted(list(ssids))
    scan_id_list = sorted(list(scan_ids))

    if len(location_list) > 1:
        activity_type = "Seen in multiple locations"
    elif len(records) > 1:
        activity_type = "Repeatedly detected"
    else:
        activity_type = "Single detection"

    return {
        "bssid": bssid,
        "ssid": ssid_list[0] if ssid_list else None,
        "ssids": ssid_list,
        "manufacturer": resolve_manufacturer(
            bssid,
            latest_manufacturer,
        ),
        "scan_ids": scan_id_list,
        "locations": location_list,
        "location_count": len(location_list),
        "scan_count": len(scan_id_list),
        "detection_count": len(records),
        "total_detections": len(records),
        "latest_signal": latest_signal,
        "signal_dbm": latest_signal,
        "latest_channel": latest_channel,
        "channel": latest_channel,
        "latest_encryption": latest_encryption,
        "encryption": latest_encryption,
        "first_seen": safe_value(first_seen),
        "last_seen": safe_value(last_seen),
        "activity_type": activity_type,
        "area_label": location_list[0] if location_list else "Unknown Location",
    }


@router.get("/bssid-summary")
def get_bssid_summary(
    limit: int = 5000,
    db: Session = Depends(get_db),
):
    records = (
        db.query(Observation)
        .order_by(Observation.id.desc())
        .limit(limit)
        .all()
    )

    survey_cache = get_survey_cache(db)

    grouped_records = defaultdict(list)

    for record in records:
        bssid = getattr(record, "bssid", None)

        if not bssid:
            continue

        grouped_records[bssid].append(record)

    summary_rows = [
        build_bssid_summary_row(
            bssid=bssid,
            records=bssid_records,
            survey_cache=survey_cache,
        )
        for bssid, bssid_records in grouped_records.items()
    ]

    summary_rows.sort(
        key=lambda row: row.get("last_seen") or "",
        reverse=True,
    )

    return summary_rows


@router.get("/dashboard-summary")
def get_dashboard_summary(
    db: Session = Depends(get_db),
):
    observations = db.query(Observation).all()
    survey_cache = get_survey_cache(db)

    bssids = set()
    ssids = set()
    locations = set()
    scan_ids = set()

    latest_seen = None

    for record in observations:
        bssid = getattr(record, "bssid", None)
        ssid = getattr(record, "ssid", None)
        survey_id = getattr(record, "survey_id", None)

        if bssid:
            bssids.add(bssid)

        if ssid:
            ssids.add(ssid)

        if survey_id:
            scan_ids.add(survey_id)

        locations.add(get_location_key(record, survey_cache))

        record_time = get_time(record)

        if record_time is not None:
            if latest_seen is None or record_time > latest_seen:
                latest_seen = record_time

    return {
        "total_observations": len(observations),
        "total_bssids": len(bssids),
        "total_ssids": len(ssids),
        "total_scans": len(scan_ids),
        "total_locations": len(locations),
        "latest_seen": safe_value(latest_seen),
    }


@router.get("/ssid-summary")
def get_ssid_summary(
    limit: int = 5000,
    db: Session = Depends(get_db),
):
    records = (
        db.query(Observation)
        .order_by(Observation.id.desc())
        .limit(limit)
        .all()
    )

    survey_cache = get_survey_cache(db)
    grouped_records = defaultdict(list)

    for record in records:
        ssid = getattr(record, "ssid", None) or "Hidden/Unknown"
        grouped_records[ssid].append(record)

    rows = []

    for ssid, ssid_records in grouped_records.items():
        bssids = set()
        locations = set()
        scan_ids = set()
        last_seen = None

        for record in ssid_records:
            bssid = getattr(record, "bssid", None)
            survey_id = getattr(record, "survey_id", None)

            if bssid:
                bssids.add(bssid)

            if survey_id:
                scan_ids.add(survey_id)

            locations.add(get_location_key(record, survey_cache))

            record_time = get_time(record)

            if record_time is not None:
                if last_seen is None or record_time > last_seen:
                    last_seen = record_time

        rows.append(
            {
                "ssid": ssid,
                "bssid_count": len(bssids),
                "scan_count": len(scan_ids),
                "location_count": len(locations),
                "detection_count": len(ssid_records),
                "locations": sorted(list(locations)),
                "last_seen": safe_value(last_seen),
            }
        )

    rows.sort(
        key=lambda row: row.get("last_seen") or "",
        reverse=True,
    )

    return rows
