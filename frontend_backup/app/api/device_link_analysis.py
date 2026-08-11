from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.client_observation import ClientObservation
from app.models.device_profile import DeviceProfile
from app.models.survey import Survey
from app.schemas.device_profile import DeviceProfileUpdate


router = APIRouter(tags=["Device Link Analysis"])


def format_datetime(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.isoformat()

    return str(value)


def normalize_device_id(value: str) -> str:
    return value.strip()


def normalize_location(latitude, longitude) -> Optional[Tuple[float, float]]:
    if latitude is None or longitude is None:
        return None

    return (round(float(latitude), 5), round(float(longitude), 5))


def format_coordinate_label(latitude, longitude) -> str:
    if latitude is None or longitude is None:
        return "No coordinates recorded"

    return f"{round(float(latitude), 6)}, {round(float(longitude), 6)}"


def get_text_value(source, field_name: str) -> Optional[str]:
    if source is None:
        return None

    value = getattr(source, field_name, None)

    if value is None:
        return None

    value = str(value).strip()

    if not value:
        return None

    return value


def get_scan_name(survey: Optional[Survey], survey_id: Optional[int]) -> str:
    if survey:
        return (
            get_text_value(survey, "survey_name")
            or get_text_value(survey, "name")
            or get_text_value(survey, "title")
            or f"Scan #{survey_id}"
        )

    return f"Scan #{survey_id}" if survey_id is not None else "Unknown scan"


def get_scan_location(survey: Optional[Survey]) -> str:
    if survey:
        return (
            get_text_value(survey, "location")
            or get_text_value(survey, "location_name")
            or get_text_value(survey, "address")
            or get_text_value(survey, "description")
            or "No location recorded"
        )

    return "No location recorded"


def get_or_default_profile(
    db: Session,
    client_mac: str,
) -> Dict[str, Any]:
    profile = (
        db.query(DeviceProfile)
        .filter(DeviceProfile.client_mac == client_mac)
        .first()
    )

    if not profile:
        return {
            "client_mac": client_mac,
            "display_name": client_mac,
            "notes": None,
            "is_custom_name": False,
            "created_at": None,
            "updated_at": None,
        }

    display_name = profile.display_name.strip() if profile.display_name else client_mac

    return {
        "client_mac": profile.client_mac,
        "display_name": display_name,
        "notes": profile.notes,
        "is_custom_name": bool(profile.display_name),
        "created_at": format_datetime(profile.created_at),
        "updated_at": format_datetime(profile.updated_at),
    }


def get_survey_map(
    db: Session,
    survey_ids: List[int],
) -> Dict[int, Survey]:
    if not survey_ids:
        return {}

    surveys = db.query(Survey).filter(Survey.id.in_(survey_ids)).all()

    return {survey.id: survey for survey in surveys}


def build_timeline(records: List[ClientObservation], survey_map: Dict[int, Survey]):
    timeline = []

    sorted_records = sorted(records, key=lambda item: item.timestamp)

    for index, record in enumerate(sorted_records, start=1):
        survey = survey_map.get(record.survey_id)

        timeline.append(
            {
                "sequence": index,
                "observation_id": record.id,
                "survey_id": record.survey_id,
                "scan_name": get_scan_name(survey, record.survey_id),
                "scan_location": get_scan_location(survey),
                "timestamp": format_datetime(record.timestamp),
                "ssid": record.ssid or "Hidden/Unknown",
                "bssid": record.bssid,
                "channel": record.channel,
                "signal_dbm": record.signal_dbm,
                "relationship_type": record.relationship_type,
                "source": record.source,
                "latitude": record.latitude,
                "longitude": record.longitude,
                "coordinate_label": format_coordinate_label(
                    record.latitude,
                    record.longitude,
                ),
            }
        )

    return timeline


def build_location_history(
    records: List[ClientObservation],
    survey_map: Dict[int, Survey],
):
    grouped = defaultdict(list)

    for record in records:
        survey = survey_map.get(record.survey_id)
        scan_location = get_scan_location(survey)

        location_key = (
            record.survey_id,
            scan_location,
            normalize_location(record.latitude, record.longitude),
        )

        grouped[location_key].append(record)

    locations = []

    for index, ((survey_id, scan_location, location_key), location_records) in enumerate(
        grouped.items(),
        start=1,
    ):
        sorted_records = sorted(location_records, key=lambda item: item.timestamp)
        first_record = sorted_records[0]
        last_record = sorted_records[-1]

        survey = survey_map.get(survey_id)

        unique_wifi = {
            item.ssid or "Hidden/Unknown"
            for item in location_records
        }

        unique_bssids = {
            item.bssid
            for item in location_records
            if item.bssid
        }

        locations.append(
            {
                "sequence": index,
                "survey_id": survey_id,
                "scan_name": get_scan_name(survey, survey_id),
                "location": scan_location,
                "latitude": last_record.latitude,
                "longitude": last_record.longitude,
                "coordinate_label": format_coordinate_label(
                    last_record.latitude,
                    last_record.longitude,
                ),
                "first_seen": format_datetime(first_record.timestamp),
                "last_seen": format_datetime(last_record.timestamp),
                "observation_count": len(location_records),
                "wifi_count": len(unique_wifi),
                "bssid_count": len(unique_bssids),
                "wifi_seen": sorted(unique_wifi),
                "bssids_seen": sorted(unique_bssids),
            }
        )

    return sorted(
        locations,
        key=lambda item: item["first_seen"] or "",
    )


def build_wifi_history(records: List[ClientObservation]):
    grouped = defaultdict(list)

    for record in records:
        key = (
            record.ssid or "Hidden/Unknown",
            record.bssid,
        )

        grouped[key].append(record)

    wifi_history = []

    for (ssid, bssid), wifi_records in grouped.items():
        sorted_records = sorted(wifi_records, key=lambda item: item.timestamp)
        first_record = sorted_records[0]
        last_record = sorted_records[-1]

        locations = sorted(
            {
                format_coordinate_label(item.latitude, item.longitude)
                for item in wifi_records
            }
        )

        scan_ids = sorted(
            {
                item.survey_id
                for item in wifi_records
                if item.survey_id is not None
            }
        )

        wifi_history.append(
            {
                "ssid": ssid,
                "bssid": bssid,
                "first_seen": format_datetime(first_record.timestamp),
                "last_seen": format_datetime(last_record.timestamp),
                "observation_count": len(wifi_records),
                "scan_ids": scan_ids,
                "location_count": len(locations),
                "locations": locations,
                "last_signal_dbm": last_record.signal_dbm,
                "last_channel": last_record.channel,
            }
        )

    return sorted(
        wifi_history,
        key=lambda item: item["last_seen"] or "",
        reverse=True,
    )


def build_movement_path(location_history: List[Dict[str, Any]]):
    movement_path = []

    for index, location in enumerate(location_history, start=1):
        movement_path.append(
            {
                "sequence": index,
                "label": location["location"],
                "scan_name": location["scan_name"],
                "survey_id": location["survey_id"],
                "first_seen": location["first_seen"],
                "last_seen": location["last_seen"],
                "latitude": location["latitude"],
                "longitude": location["longitude"],
                "coordinate_label": location["coordinate_label"],
            }
        )

    return movement_path


@router.get("/devices/{client_mac}/profile")
def get_device_profile(
    client_mac: str,
    db: Session = Depends(get_db),
):
    normalized_client_mac = normalize_device_id(client_mac)

    return get_or_default_profile(
        db=db,
        client_mac=normalized_client_mac,
    )


@router.put("/devices/{client_mac}/profile")
def update_device_profile(
    client_mac: str,
    payload: DeviceProfileUpdate,
    db: Session = Depends(get_db),
):
    normalized_client_mac = normalize_device_id(client_mac)

    profile = (
        db.query(DeviceProfile)
        .filter(DeviceProfile.client_mac == normalized_client_mac)
        .first()
    )

    if not profile:
        profile = DeviceProfile(client_mac=normalized_client_mac)
        db.add(profile)

    if payload.display_name is not None:
        clean_display_name = payload.display_name.strip()

        if clean_display_name:
            profile.display_name = clean_display_name
        else:
            profile.display_name = None

    if payload.notes is not None:
        clean_notes = payload.notes.strip()

        if clean_notes:
            profile.notes = clean_notes
        else:
            profile.notes = None

    db.commit()
    db.refresh(profile)

    return get_or_default_profile(
        db=db,
        client_mac=normalized_client_mac,
    )


@router.get("/devices/{client_mac}/link-analysis")
def get_device_link_analysis(
    client_mac: str,
    db: Session = Depends(get_db),
):
    normalized_client_mac = normalize_device_id(client_mac)

    records = (
        db.query(ClientObservation)
        .filter(ClientObservation.client_mac == normalized_client_mac)
        .order_by(ClientObservation.timestamp.asc())
        .all()
    )

    if not records:
        raise HTTPException(
            status_code=404,
            detail="No observation records found for this device.",
        )

    survey_ids = sorted(
        {
            record.survey_id
            for record in records
            if record.survey_id is not None
        }
    )

    survey_map = get_survey_map(db=db, survey_ids=survey_ids)

    profile = get_or_default_profile(
        db=db,
        client_mac=normalized_client_mac,
    )

    timeline = build_timeline(
        records=records,
        survey_map=survey_map,
    )

    location_history = build_location_history(
        records=records,
        survey_map=survey_map,
    )

    wifi_history = build_wifi_history(records=records)

    movement_path = build_movement_path(location_history=location_history)

    unique_ssids = {
        record.ssid or "Hidden/Unknown"
        for record in records
    }

    unique_bssids = {
        record.bssid
        for record in records
        if record.bssid
    }

    unique_locations = {
        item["location"]
        for item in location_history
        if item["location"] != "No location recorded"
    }

    first_record = records[0]
    last_record = records[-1]

    return {
        "client_mac": normalized_client_mac,
        "display_name": profile["display_name"],
        "profile": profile,
        "summary": {
            "total_observations": len(records),
            "scan_count": len(survey_ids),
            "wifi_count": len(unique_ssids),
            "bssid_count": len(unique_bssids),
            "location_count": len(unique_locations),
            "first_seen": format_datetime(first_record.timestamp),
            "last_seen": format_datetime(last_record.timestamp),
        },
        "movement_path": movement_path,
        "location_history": location_history,
        "wifi_history": wifi_history,
        "timeline": timeline,
        "plain_language_note": (
            "This page shows where the device was observed in imported scan data. "
            "It does not identify the owner of the device."
        ),
    }