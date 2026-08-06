from collections import defaultdict
from datetime import datetime
from math import asin, cos, radians, sin, sqrt
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.client_observation import ClientObservation
from app.models.device_profile import DeviceProfile
from app.models.survey import Survey
from app.schemas.device_profile import DeviceProfileUpdate
from app.utils.mac_manufacturer import resolve_manufacturer


router = APIRouter(tags=["Device Link Analysis"])


KNOWN_PLACES = [
    {
        "name": "Cubao",
        "latitude": 14.6196,
        "longitude": 121.0510,
    },
    {
        "name": "Ortigas",
        "latitude": 14.5869,
        "longitude": 121.0614,
    },
    {
        "name": "Quezon City",
        "latitude": 14.6760,
        "longitude": 121.0437,
    },
    {
        "name": "Diliman",
        "latitude": 14.6537,
        "longitude": 121.0685,
    },
    {
        "name": "Pasig",
        "latitude": 14.5764,
        "longitude": 121.0851,
    },
    {
        "name": "Mandaluyong",
        "latitude": 14.5794,
        "longitude": 121.0359,
    },
    {
        "name": "Makati",
        "latitude": 14.5547,
        "longitude": 121.0244,
    },
    {
        "name": "BGC / Taguig",
        "latitude": 14.5507,
        "longitude": 121.0497,
    },
    {
        "name": "Marikina",
        "latitude": 14.6507,
        "longitude": 121.1029,
    },
    {
        "name": "Manila",
        "latitude": 14.5995,
        "longitude": 120.9842,
    },
    {
        "name": "Pasay",
        "latitude": 14.5378,
        "longitude": 121.0014,
    },
    {
        "name": "Parañaque",
        "latitude": 14.4793,
        "longitude": 121.0198,
    },
]


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


def calculate_distance_km(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> float:
    earth_radius_km = 6371.0

    lat_a = radians(latitude_a)
    lon_a = radians(longitude_a)
    lat_b = radians(latitude_b)
    lon_b = radians(longitude_b)

    delta_lat = lat_b - lat_a
    delta_lon = lon_b - lon_a

    haversine_value = (
        sin(delta_lat / 2) ** 2
        + cos(lat_a) * cos(lat_b) * sin(delta_lon / 2) ** 2
    )

    central_angle = 2 * asin(sqrt(haversine_value))

    return earth_radius_km * central_angle


def get_auto_location_from_coordinates(latitude, longitude) -> Optional[str]:
    if latitude is None or longitude is None:
        return None

    latitude = float(latitude)
    longitude = float(longitude)

    nearest_place = None
    nearest_distance = None

    for place in KNOWN_PLACES:
        distance = calculate_distance_km(
            latitude,
            longitude,
            place["latitude"],
            place["longitude"],
        )

        if nearest_distance is None or distance < nearest_distance:
            nearest_distance = distance
            nearest_place = place

    if nearest_place is None or nearest_distance is None:
        return None

    if nearest_distance <= 1.5:
        return nearest_place["name"]

    if nearest_distance <= 4:
        return f"Near {nearest_place['name']}"

    return format_coordinate_label(latitude, longitude)


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


def get_scan_location_from_survey(survey: Optional[Survey]) -> str:
    if survey:
        return (
            get_text_value(survey, "location")
            or get_text_value(survey, "location_name")
            or get_text_value(survey, "address")
            or get_text_value(survey, "description")
            or get_text_value(survey, "notes")
            or "No location recorded"
        )

    return "No location recorded"


def get_record_location(record: ClientObservation, survey: Optional[Survey]) -> str:
    coordinate_based_location = get_auto_location_from_coordinates(
        record.latitude,
        record.longitude,
    )

    if coordinate_based_location:
        return coordinate_based_location

    return get_scan_location_from_survey(survey)


def get_or_default_profile(db: Session, client_mac: str) -> Dict[str, Any]:
    profile = (
        db.query(DeviceProfile)
        .filter(DeviceProfile.client_mac == client_mac)
        .first()
    )

    if not profile:
        return {
            "client_mac": client_mac,
            "display_name": client_mac,
            "manufacturer": resolve_manufacturer(client_mac),
            "notes": None,
            "is_custom_name": False,
            "created_at": None,
            "updated_at": None,
        }

    display_name = profile.display_name.strip() if profile.display_name else client_mac

    return {
        "client_mac": profile.client_mac,
        "display_name": display_name,
        "manufacturer": resolve_manufacturer(profile.client_mac),
        "notes": profile.notes,
        "is_custom_name": bool(profile.display_name),
        "created_at": format_datetime(profile.created_at),
        "updated_at": format_datetime(profile.updated_at),
    }


def get_survey_map(db: Session, survey_ids: List[int]) -> Dict[int, Survey]:
    if not survey_ids:
        return {}

    surveys = db.query(Survey).filter(Survey.id.in_(survey_ids)).all()

    return {survey.id: survey for survey in surveys}


def build_timeline(records: List[ClientObservation], survey_map: Dict[int, Survey]):
    timeline = []

    sorted_records = sorted(
        records,
        key=lambda item: item.timestamp or datetime.min,
    )

    for index, record in enumerate(sorted_records, start=1):
        survey = survey_map.get(record.survey_id)
        scan_location = get_record_location(record, survey)

        timeline.append(
            {
                "sequence": index,
                "observation_id": record.id,
                "survey_id": record.survey_id,
                "scan_name": get_scan_name(survey, record.survey_id),
                "scan_location": scan_location,
                "timestamp": format_datetime(record.timestamp),
                "ssid": record.ssid or "Hidden/Unknown",
                "bssid": record.bssid,
                "manufacturer": resolve_manufacturer(
                    record.client_mac,
                    record.client_vendor,
                ),
                "channel": record.channel,
                "signal_dbm": record.signal_dbm,
                "relationship_type": record.relationship_type,
                "source": getattr(record, "source", None),
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
        scan_location = get_record_location(record, survey)

        location_key = (
            scan_location,
            normalize_location(record.latitude, record.longitude),
        )

        grouped[location_key].append(record)

    locations = []

    for index, ((scan_location, location_key), location_records) in enumerate(
        grouped.items(),
        start=1,
    ):
        sorted_records = sorted(
            location_records,
            key=lambda item: item.timestamp or datetime.min,
        )

        first_record = sorted_records[0]
        last_record = sorted_records[-1]
        survey = survey_map.get(last_record.survey_id)

        unique_wifi = {
            item.ssid or "Hidden/Unknown"
            for item in location_records
        }

        unique_bssids = {
            item.bssid
            for item in location_records
            if item.bssid
        }

        scan_ids = sorted(
            {
                item.survey_id
                for item in location_records
                if item.survey_id is not None
            }
        )

        locations.append(
            {
                "sequence": index,
                "survey_id": last_record.survey_id,
                "scan_ids": scan_ids,
                "scan_name": get_scan_name(survey, last_record.survey_id),
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

    sorted_locations = sorted(
        locations,
        key=lambda item: item["first_seen"] or "",
    )

    for index, location in enumerate(sorted_locations, start=1):
        location["sequence"] = index

    return sorted_locations


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
        sorted_records = sorted(
            wifi_records,
            key=lambda item: item.timestamp or datetime.min,
        )

        first_record = sorted_records[0]
        last_record = sorted_records[-1]

        locations = sorted(
            {
                get_auto_location_from_coordinates(item.latitude, item.longitude)
                or format_coordinate_label(item.latitude, item.longitude)
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
def get_device_profile(client_mac: str, db: Session = Depends(get_db)):
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
        profile.display_name = clean_display_name if clean_display_name else None

    if payload.notes is not None:
        clean_notes = payload.notes.strip()
        profile.notes = clean_notes if clean_notes else None

    db.commit()
    db.refresh(profile)

    return get_or_default_profile(
        db=db,
        client_mac=normalized_client_mac,
    )


@router.get("/devices/{client_mac}/link-analysis")
def get_device_link_analysis(client_mac: str, db: Session = Depends(get_db)):
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

    sorted_records = sorted(
        records,
        key=lambda item: item.timestamp or datetime.min,
    )

    first_record = sorted_records[0]
    last_record = sorted_records[-1]

    return {
        "client_mac": normalized_client_mac,
        "display_name": profile["display_name"],
        "profile": profile,
        "summary": {
            "manufacturer": resolve_manufacturer(
                normalized_client_mac,
                last_record.client_vendor,
            ),
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
