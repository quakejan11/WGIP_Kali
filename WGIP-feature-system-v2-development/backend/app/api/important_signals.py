from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.client_observation import ClientObservation
from app.utils.mac_manufacturer import resolve_manufacturer


router = APIRouter(tags=["Important Signals"])


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


def build_signal(
    signal_id: str,
    signal_type: str,
    title: str,
    subject_type: str,
    subject_id: str,
    summary: str,
    first_seen,
    last_seen,
    seen_count: int,
    severity: str = "notice",
    device_id: Optional[str] = None,
    wifi_access_point_id: Optional[str] = None,
    wifi_name: Optional[str] = None,
    survey_count: int = 0,
    wifi_count: int = 0,
    location_count: int = 0,
    recommended_action: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "id": signal_id,
        "signal_type": signal_type,
        "title": title,
        "severity": severity,
        "subject_type": subject_type,
        "subject_id": subject_id,
        "device_id": device_id,
        "wifi_access_point_id": wifi_access_point_id,
        "manufacturer": resolve_manufacturer(
            device_id or wifi_access_point_id,
        ),
        "wifi_name": wifi_name,
        "first_seen": format_datetime(first_seen),
        "last_seen": format_datetime(last_seen),
        "seen_count": seen_count,
        "survey_count": survey_count,
        "wifi_count": wifi_count,
        "location_count": location_count,
        "summary": summary,
        "recommended_action": recommended_action
        or "Review the related timeline to confirm whether this is recurring or meaningful activity.",
    }


def get_first_last(records: List[ClientObservation]):
    sorted_records = sorted(records, key=lambda item: item.timestamp)
    return sorted_records[0], sorted_records[-1]


@router.get("/signals/important")
def get_important_signals(
    db: Session = Depends(get_db),
):
    records = (
        db.query(ClientObservation)
        .order_by(ClientObservation.timestamp.asc())
        .all()
    )

    signals: List[Dict[str, Any]] = []

    if not records:
        return {
            "total_signals": 0,
            "signals": [],
        }

    records_by_client: Dict[str, List[ClientObservation]] = defaultdict(list)
    records_by_bssid: Dict[str, List[ClientObservation]] = defaultdict(list)
    records_by_client_bssid: Dict[Tuple[str, str], List[ClientObservation]] = defaultdict(list)

    for record in records:
        records_by_client[record.client_mac].append(record)
        records_by_bssid[record.bssid].append(record)
        records_by_client_bssid[(record.client_mac, record.bssid)].append(record)

    for client_mac, client_records in records_by_client.items():
        if len(client_records) <= 1:
            continue

        first_record, last_record = get_first_last(client_records)

        unique_bssids: Set[str] = set()
        unique_surveys: Set[int] = set()
        unique_locations: Set[Tuple[float, float]] = set()

        for record in client_records:
            if record.bssid:
                unique_bssids.add(record.bssid)

            if record.survey_id is not None:
                unique_surveys.add(record.survey_id)

            location = normalize_location(record.latitude, record.longitude)
            if location:
                unique_locations.add(location)

        signals.append(
            build_signal(
                signal_id=f"client-recurring-{client_mac}",
                signal_type="recurring_device_activity",
                title="Recurring Device Activity",
                subject_type="device",
                subject_id=client_mac,
                device_id=client_mac,
                first_seen=first_record.timestamp,
                last_seen=last_record.timestamp,
                seen_count=len(client_records),
                survey_count=len(unique_surveys),
                wifi_count=len(unique_bssids),
                location_count=len(unique_locations),
                severity="notice",
                summary=(
                    f"Device {client_mac} was seen {len(client_records)} times "
                    f"during the available survey data."
                ),
                recommended_action=(
                    "Open the device timeline to check where and when this device was observed."
                ),
            )
        )

        if len(unique_bssids) > 1:
            signals.append(
                build_signal(
                    signal_id=f"client-multiple-wifi-{client_mac}",
                    signal_type="device_seen_with_multiple_wifi",
                    title="Device Seen With Multiple Wi-Fi Access Points",
                    subject_type="device",
                    subject_id=client_mac,
                    device_id=client_mac,
                    first_seen=first_record.timestamp,
                    last_seen=last_record.timestamp,
                    seen_count=len(client_records),
                    survey_count=len(unique_surveys),
                    wifi_count=len(unique_bssids),
                    location_count=len(unique_locations),
                    severity="important",
                    summary=(
                        f"Device {client_mac} was observed with "
                        f"{len(unique_bssids)} different Wi-Fi access point(s)."
                    ),
                    recommended_action=(
                        "Review the device timeline to determine whether this indicates recurring presence or movement across survey areas."
                    ),
                )
            )

        if len(unique_locations) > 1:
            signals.append(
                build_signal(
                    signal_id=f"client-multiple-locations-{client_mac}",
                    signal_type="device_seen_in_multiple_locations",
                    title="Device Seen In Multiple Locations",
                    subject_type="device",
                    subject_id=client_mac,
                    device_id=client_mac,
                    first_seen=first_record.timestamp,
                    last_seen=last_record.timestamp,
                    seen_count=len(client_records),
                    survey_count=len(unique_surveys),
                    wifi_count=len(unique_bssids),
                    location_count=len(unique_locations),
                    severity="important",
                    summary=(
                        f"Device {client_mac} was observed in "
                        f"{len(unique_locations)} different recorded location(s)."
                    ),
                    recommended_action=(
                        "Compare the locations and timestamps to determine whether the activity is relevant to the survey objective."
                    ),
                )
            )

    for (client_mac, bssid), association_records in records_by_client_bssid.items():
        if len(association_records) <= 1:
            continue

        first_record, last_record = get_first_last(association_records)

        unique_surveys: Set[int] = set()
        unique_locations: Set[Tuple[float, float]] = set()

        for record in association_records:
            if record.survey_id is not None:
                unique_surveys.add(record.survey_id)

            location = normalize_location(record.latitude, record.longitude)
            if location:
                unique_locations.add(location)

        signals.append(
            build_signal(
                signal_id=f"association-recurring-{client_mac}-{bssid}",
                signal_type="recurring_device_wifi_association",
                title="Recurring Device and Wi-Fi Association",
                subject_type="device_wifi_association",
                subject_id=f"{client_mac} / {bssid}",
                device_id=client_mac,
                wifi_access_point_id=bssid,
                wifi_name=last_record.ssid,
                first_seen=first_record.timestamp,
                last_seen=last_record.timestamp,
                seen_count=len(association_records),
                survey_count=len(unique_surveys),
                wifi_count=1,
                location_count=len(unique_locations),
                severity="notice",
                summary=(
                    f"Device {client_mac} was seen with Wi-Fi access point {bssid} "
                    f"{len(association_records)} times."
                ),
                recommended_action=(
                    "Open the BSSID profile or device timeline to review the repeated association."
                ),
            )
        )

    for bssid, bssid_records in records_by_bssid.items():
        if len(bssid_records) <= 1:
            continue

        first_record, last_record = get_first_last(bssid_records)

        unique_clients: Set[str] = set()
        unique_surveys: Set[int] = set()
        unique_locations: Set[Tuple[float, float]] = set()

        for record in bssid_records:
            if record.client_mac:
                unique_clients.add(record.client_mac)

            if record.survey_id is not None:
                unique_surveys.add(record.survey_id)

            location = normalize_location(record.latitude, record.longitude)
            if location:
                unique_locations.add(location)

        signals.append(
            build_signal(
                signal_id=f"bssid-recurring-{bssid}",
                signal_type="recurring_wifi_activity",
                title="Recurring Wi-Fi Activity",
                subject_type="wifi_access_point",
                subject_id=bssid,
                wifi_access_point_id=bssid,
                wifi_name=last_record.ssid,
                first_seen=first_record.timestamp,
                last_seen=last_record.timestamp,
                seen_count=len(bssid_records),
                survey_count=len(unique_surveys),
                wifi_count=1,
                location_count=len(unique_locations),
                severity="notice",
                summary=(
                    f"Wi-Fi access point {bssid} has "
                    f"{len(bssid_records)} device activity record(s)."
                ),
                recommended_action=(
                    "Open the BSSID profile to review connected devices and activity history."
                ),
            )
        )

        if len(unique_clients) > 1:
            signals.append(
                build_signal(
                    signal_id=f"bssid-multiple-devices-{bssid}",
                    signal_type="wifi_with_multiple_devices_seen",
                    title="Wi-Fi With Multiple Devices Seen",
                    subject_type="wifi_access_point",
                    subject_id=bssid,
                    wifi_access_point_id=bssid,
                    wifi_name=last_record.ssid,
                    first_seen=first_record.timestamp,
                    last_seen=last_record.timestamp,
                    seen_count=len(bssid_records),
                    survey_count=len(unique_surveys),
                    wifi_count=1,
                    location_count=len(unique_locations),
                    severity="important",
                    summary=(
                        f"Wi-Fi access point {bssid} had "
                        f"{len(unique_clients)} different device(s) observed."
                    ),
                    recommended_action=(
                        "Review the observed connected devices under the BSSID profile."
                    ),
                )
            )

    severity_rank = {
        "important": 1,
        "notice": 2,
        "info": 3,
    }

    signals = sorted(
        signals,
        key=lambda item: (
            severity_rank.get(item["severity"], 99),
            item["last_seen"] or "",
        ),
        reverse=False,
    )

    return {
        "total_signals": len(signals),
        "signals": signals,
    }
