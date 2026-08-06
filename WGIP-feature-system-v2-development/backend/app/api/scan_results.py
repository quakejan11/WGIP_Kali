from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.client_observation import ClientObservation
from app.models.survey import Survey
from app.utils.mac_manufacturer import resolve_manufacturer


router = APIRouter(tags=["Scan Results"])


def format_datetime(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.isoformat()

    return str(value)


def normalize_location(latitude, longitude) -> Optional[Tuple[float, float]]:
    if latitude is None or longitude is None:
        return None

    return (round(float(latitude), 5), round(float(longitude), 5))


def format_location_label(latitude, longitude) -> str:
    if latitude is None or longitude is None:
        return "Location not available"

    return f"{round(float(latitude), 6)}, {round(float(longitude), 6)}"


def get_first_last(records: List[ClientObservation]):
    sorted_records = sorted(records, key=lambda item: item.timestamp)
    return sorted_records[0], sorted_records[-1]


def get_survey_text_value(survey, field_name: str):
    if survey is None:
        return None

    value = getattr(survey, field_name, None)

    if value is None:
        return None

    value = str(value).strip()

    if not value:
        return None

    return value


def build_scan_label(survey_id: int, survey=None) -> str:
    survey_name = (
        get_survey_text_value(survey, "survey_name")
        or get_survey_text_value(survey, "name")
        or get_survey_text_value(survey, "title")
    )

    if survey_name:
        return survey_name

    return f"Scan #{survey_id}"


def build_scan_details(survey_id: int, survey=None):
    return {
        "survey_id": survey_id,
        "scan_label": build_scan_label(survey_id, survey),
        "survey_name": (
            get_survey_text_value(survey, "survey_name")
            or get_survey_text_value(survey, "name")
            or get_survey_text_value(survey, "title")
        ),
        "operator": get_survey_text_value(survey, "operator"),
        "description": get_survey_text_value(survey, "description"),
    }


def build_area_label_from_records(
    survey_id: int,
    records: List[ClientObservation],
    survey=None,
) -> str:
    survey_name = (
        get_survey_text_value(survey, "survey_name")
        or get_survey_text_value(survey, "name")
        or get_survey_text_value(survey, "title")
    )

    if survey_name:
        return survey_name

    if not records:
        return build_scan_label(survey_id, survey)

    locations = set()

    for record in records:
        location = normalize_location(record.latitude, record.longitude)
        if location:
            locations.add(location)

    if len(locations) == 1:
        location = list(locations)[0]
        return f"Scan #{survey_id} - {location[0]}, {location[1]}"

    if len(locations) > 1:
        return f"Scan #{survey_id} - Multiple recorded points"

    return build_scan_label(survey_id, survey)


def build_device_summary(
    record: ClientObservation,
    current_scan_records: List[ClientObservation],
    all_previous_records: List[ClientObservation],
) -> Dict[str, Any]:
    same_device_current_records = [
        item for item in current_scan_records if item.client_mac == record.client_mac
    ]

    same_device_previous_records = [
        item for item in all_previous_records if item.client_mac == record.client_mac
    ]

    first_current, last_current = get_first_last(same_device_current_records)

    previously_seen = len(same_device_previous_records) > 0

    previous_seen_count = len(same_device_previous_records)
    previous_surveys = sorted(
        {
            item.survey_id
            for item in same_device_previous_records
            if item.survey_id is not None
        }
    )

    previous_locations = sorted(
        {
            format_location_label(item.latitude, item.longitude)
            for item in same_device_previous_records
        }
    )

    previous_wifi = sorted(
        {
            f"{item.ssid or 'Hidden/Unknown'} / {item.bssid}"
            for item in same_device_previous_records
            if item.bssid
        }
    )

    last_previous_record = None

    if same_device_previous_records:
        last_previous_record = sorted(
            same_device_previous_records,
            key=lambda item: item.timestamp,
        )[-1]

    manufacturer = resolve_manufacturer(
        record.client_mac,
        record.client_vendor,
    )

    return {
        "device_id": record.client_mac,
        "vendor": manufacturer,
        "manufacturer": manufacturer,
        "first_seen_in_this_scan": format_datetime(first_current.timestamp),
        "last_seen_in_this_scan": format_datetime(last_current.timestamp),
        "seen_count_in_this_scan": len(same_device_current_records),
        "last_signal_dbm": last_current.signal_dbm,
        "last_channel": last_current.channel,
        "last_location": {
            "latitude": last_current.latitude,
            "longitude": last_current.longitude,
            "label": format_location_label(
                last_current.latitude,
                last_current.longitude,
            ),
        },
        "previously_seen": previously_seen,
        "previous_seen_count": previous_seen_count,
        "previous_surveys": previous_surveys,
        "previous_locations": previous_locations,
        "previous_wifi": previous_wifi,
        "last_previous_seen": (
            {
                "survey_id": last_previous_record.survey_id,
                "scan_label": build_scan_label(last_previous_record.survey_id),
                "ssid": last_previous_record.ssid,
                "bssid": last_previous_record.bssid,
                "timestamp": format_datetime(last_previous_record.timestamp),
                "location": {
                    "latitude": last_previous_record.latitude,
                    "longitude": last_previous_record.longitude,
                    "label": format_location_label(
                        last_previous_record.latitude,
                        last_previous_record.longitude,
                    ),
                },
            }
            if last_previous_record
            else None
        ),
    }


def build_reobserved_device_alerts(
    survey_id: int,
    current_records: List[ClientObservation],
    previous_records: List[ClientObservation],
) -> List[Dict[str, Any]]:
    alerts = []

    current_by_device = defaultdict(list)
    previous_by_device = defaultdict(list)

    for record in current_records:
        current_by_device[record.client_mac].append(record)

    for record in previous_records:
        previous_by_device[record.client_mac].append(record)

    for device_id, device_current_records in current_by_device.items():
        device_previous_records = previous_by_device.get(device_id, [])

        if not device_previous_records:
            continue

        first_current, last_current = get_first_last(device_current_records)
        first_previous, last_previous = get_first_last(device_previous_records)

        previous_surveys = sorted(
            {
                item.survey_id
                for item in device_previous_records
                if item.survey_id is not None
            }
        )

        previous_locations = sorted(
            {
                format_location_label(item.latitude, item.longitude)
                for item in device_previous_records
            }
        )

        current_locations = sorted(
            {
                format_location_label(item.latitude, item.longitude)
                for item in device_current_records
            }
        )

        previous_wifi = sorted(
            {
                f"{item.ssid or 'Hidden/Unknown'} / {item.bssid}"
                for item in device_previous_records
                if item.bssid
            }
        )

        current_wifi = sorted(
            {
                f"{item.ssid or 'Hidden/Unknown'} / {item.bssid}"
                for item in device_current_records
                if item.bssid
            }
        )

        manufacturer = resolve_manufacturer(
            device_id,
            last_current.client_vendor,
        )

        alerts.append(
            {
                "alert_type": "previously_observed_device_detected",
                "title": "Previously Observed Device Detected",
                "severity": "important",
                "device_id": device_id,
                "vendor": manufacturer,
                "manufacturer": manufacturer,
                "current_survey_id": survey_id,
                "current_scan_label": build_scan_label(survey_id),
                "previous_survey_ids": previous_surveys,
                "first_previous_seen": format_datetime(first_previous.timestamp),
                "last_previous_seen": format_datetime(last_previous.timestamp),
                "first_seen_in_current_scan": format_datetime(first_current.timestamp),
                "last_seen_in_current_scan": format_datetime(last_current.timestamp),
                "previous_wifi": previous_wifi,
                "current_wifi": current_wifi,
                "previous_locations": previous_locations,
                "current_locations": current_locations,
                "summary": (
                    f"Device {device_id} was detected in this scan and was also "
                    f"seen in previous scan data."
                ),
                "plain_language_summary": (
                    "A device seen in this scan was already observed before. "
                    "Review the previous and current scan details to determine if this is relevant."
                ),
            }
        )

    return sorted(
        alerts,
        key=lambda item: item["last_seen_in_current_scan"] or "",
        reverse=True,
    )


@router.get("/scans")
def list_scans(
    db: Session = Depends(get_db),
):
    records = (
        db.query(ClientObservation)
        .order_by(ClientObservation.survey_id.asc(), ClientObservation.timestamp.asc())
        .all()
    )

    if not records:
        return {
            "total_scans": 0,
            "scans": [],
        }

    grouped_scans = defaultdict(list)

    for record in records:
        if record.survey_id is not None:
            grouped_scans[record.survey_id].append(record)

    scans = []

    for survey_id, scan_records in grouped_scans.items():
        first_record, last_record = get_first_last(scan_records)

        survey = db.query(Survey).filter(Survey.id == survey_id).first()
        scan_details = build_scan_details(survey_id, survey)

        unique_ssids = {
            record.ssid or "Hidden/Unknown"
            for record in scan_records
        }

        unique_bssids = {
            record.bssid
            for record in scan_records
            if record.bssid
        }

        unique_devices = {
            record.client_mac
            for record in scan_records
            if record.client_mac
        }

        unique_locations = {
            normalize_location(record.latitude, record.longitude)
            for record in scan_records
            if normalize_location(record.latitude, record.longitude)
        }

        scans.append(
            {
                "survey_id": survey_id,
                "scan_label": scan_details["scan_label"],
                "area_label": build_area_label_from_records(
                    survey_id=survey_id,
                    records=scan_records,
                    survey=survey,
                ),
                "survey_name": scan_details["survey_name"],
                "operator": scan_details["operator"],
                "description": scan_details["description"],
                "first_seen": format_datetime(first_record.timestamp),
                "last_seen": format_datetime(last_record.timestamp),
                "total_observation_records": len(scan_records),
                "detected_ssid_count": len(unique_ssids),
                "detected_bssid_count": len(unique_bssids),
                "observed_device_count": len(unique_devices),
                "location_count": len(unique_locations),
            }
        )

    scans = sorted(
        scans,
        key=lambda item: item["last_seen"] or "",
        reverse=True,
    )

    return {
        "total_scans": len(scans),
        "scans": scans,
    }


@router.get("/scans/{survey_id}/summary")
def get_scan_summary(
    survey_id: int,
    db: Session = Depends(get_db),
):
    current_records = (
        db.query(ClientObservation)
        .filter(ClientObservation.survey_id == survey_id)
        .order_by(ClientObservation.timestamp.asc())
        .all()
    )

    if not current_records:
        raise HTTPException(
            status_code=404,
            detail="No client observation records found for this scan.",
        )

    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    scan_details = build_scan_details(survey_id, survey)

    previous_records = (
        db.query(ClientObservation)
        .filter(ClientObservation.survey_id != survey_id)
        .order_by(ClientObservation.timestamp.asc())
        .all()
    )

    first_record, last_record = get_first_last(current_records)

    unique_ssids = {
        record.ssid or "Hidden/Unknown"
        for record in current_records
    }

    unique_bssids = {
        record.bssid
        for record in current_records
        if record.bssid
    }

    unique_devices = {
        record.client_mac
        for record in current_records
        if record.client_mac
    }

    unique_locations = {
        normalize_location(record.latitude, record.longitude)
        for record in current_records
        if normalize_location(record.latitude, record.longitude)
    }

    grouped_wifi = defaultdict(list)

    wifi_manufacturer_rows = db.execute(
        text(
            """
            SELECT
                LOWER(bssid) AS bssid_key,
                MAX(manufacturer) AS manufacturer
            FROM observations
            WHERE survey_id = :survey_id
              AND bssid IS NOT NULL
            GROUP BY LOWER(bssid)
            """
        ),
        {"survey_id": survey_id},
    ).mappings().all()

    wifi_manufacturers = {
        row["bssid_key"]: row["manufacturer"]
        for row in wifi_manufacturer_rows
        if row.get("bssid_key")
    }

    for record in current_records:
        key = (
            record.ssid or "Hidden/Unknown",
            record.bssid,
        )

        grouped_wifi[key].append(record)

    wifi_networks = []

    for (ssid, bssid), wifi_records in grouped_wifi.items():
        wifi_first, wifi_last = get_first_last(wifi_records)

        device_latest_record = {}

        for record in wifi_records:
            current_latest = device_latest_record.get(record.client_mac)

            if current_latest is None or record.timestamp > current_latest.timestamp:
                device_latest_record[record.client_mac] = record

        devices = []

        for device_id, latest_record in device_latest_record.items():
            devices.append(
                build_device_summary(
                    record=latest_record,
                    current_scan_records=current_records,
                    all_previous_records=previous_records,
                )
            )

        devices = sorted(
            devices,
            key=lambda item: item["last_seen_in_this_scan"] or "",
            reverse=True,
        )

        wifi_networks.append(
            {
                "ssid": ssid,
                "wifi_name": ssid,
                "bssid": bssid,
                "wifi_access_point_id": bssid,
                "manufacturer": (
                    wifi_manufacturers.get(str(bssid or "").lower())
                    or resolve_manufacturer(bssid)
                ),
                "first_seen_in_scan": format_datetime(wifi_first.timestamp),
                "last_seen_in_scan": format_datetime(wifi_last.timestamp),
                "observation_count": len(wifi_records),
                "observed_device_count": len(devices),
                "last_location": {
                    "latitude": wifi_last.latitude,
                    "longitude": wifi_last.longitude,
                    "label": format_location_label(
                        wifi_last.latitude,
                        wifi_last.longitude,
                    ),
                },
                "devices": devices,
            }
        )

    wifi_networks = sorted(
        wifi_networks,
        key=lambda item: item["last_seen_in_scan"] or "",
        reverse=True,
    )

    alerts = build_reobserved_device_alerts(
        survey_id=survey_id,
        current_records=current_records,
        previous_records=previous_records,
    )

    return {
        "survey_id": survey_id,
        "scan_label": scan_details["scan_label"],
        "area_label": build_area_label_from_records(
            survey_id=survey_id,
            records=current_records,
            survey=survey,
        ),
        "survey_name": scan_details["survey_name"],
        "operator": scan_details["operator"],
        "description": scan_details["description"],
        "survey_details": scan_details,
        "first_seen": format_datetime(first_record.timestamp),
        "last_seen": format_datetime(last_record.timestamp),
        "total_observation_records": len(current_records),
        "detected_ssid_count": len(unique_ssids),
        "detected_bssid_count": len(unique_bssids),
        "observed_device_count": len(unique_devices),
        "location_count": len(unique_locations),
        "wifi_networks": wifi_networks,
        "alerts": alerts,
        "alert_count": len(alerts),
        "plain_language_note": (
            "This scan result groups imported wireless observations by Wi-Fi name and "
            "access point. Devices listed here were observed during capture only and may "
            "not represent every device connected to the Wi-Fi network."
        ),
    }


@router.get("/scans/{survey_id}/ssid-devices")
def get_scan_ssid_devices(
    survey_id: int,
    db: Session = Depends(get_db),
):
    summary = get_scan_summary(survey_id=survey_id, db=db)

    return {
        "survey_id": summary["survey_id"],
        "scan_label": summary["scan_label"],
        "area_label": summary["area_label"],
        "survey_name": summary["survey_name"],
        "operator": summary["operator"],
        "description": summary["description"],
        "wifi_networks": summary["wifi_networks"],
    }


@router.get("/scans/{survey_id}/alerts")
def get_scan_alerts(
    survey_id: int,
    db: Session = Depends(get_db),
):
    summary = get_scan_summary(survey_id=survey_id, db=db)

    return {
        "survey_id": summary["survey_id"],
        "scan_label": summary["scan_label"],
        "area_label": summary["area_label"],
        "survey_name": summary["survey_name"],
        "operator": summary["operator"],
        "description": summary["description"],
        "alert_count": summary["alert_count"],
        "alerts": summary["alerts"],
    }
