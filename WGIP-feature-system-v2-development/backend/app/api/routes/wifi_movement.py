from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

try:
    from app.db.session import get_db
except ImportError:
    from app.db.database import get_db


router = APIRouter(
    prefix="/wifi-movement",
    tags=["Wi-Fi Movement"],
)


def normalize_mac(value: Any) -> str:
    return str(value or "").strip().upper()


def is_valid_coordinate(lat: Any, lon: Any) -> bool:
    try:
        numeric_lat = float(lat)
        numeric_lon = float(lon)

        return (
            -90 <= numeric_lat <= 90
            and -180 <= numeric_lon <= 180
            and not (numeric_lat == 0 and numeric_lon == 0)
        )
    except (TypeError, ValueError):
        return False


def rows_to_dicts(result) -> List[Dict[str, Any]]:
    return [dict(row._mapping) for row in result]


def normalize_timestamp(value: Any) -> Any:
    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value)).isoformat()
        except Exception:
            return str(value)

    return value


def normalize_packet_point(row: Dict[str, Any], selected_bssid: str) -> Dict[str, Any]:
    return {
        "id": row.get("id"),
        "import_batch_id": row.get("import_batch_id"),
        "bssid": selected_bssid,
        "latitude": float(row.get("lat")),
        "longitude": float(row.get("lon")),
        "timestamp": normalize_timestamp(row.get("ts_sec")),
        "ts_sec": row.get("ts_sec"),
        "ts_usec": row.get("ts_usec"),
        "source_mac": row.get("sourcemac"),
        "destination_mac": row.get("destmac"),
        "transmitter_mac": row.get("transmac"),
        "frequency": row.get("frequency"),
        "signal_dbm": row.get("signal"),
        "packet_len": row.get("packet_len"),
        "point_source": "raw packet GPS",
    }


def normalize_candidate_row(row: Dict[str, Any]) -> Dict[str, Any]:
    first_seen = row.get("first_seen")
    last_seen = row.get("last_seen")

    return {
        "bssid": normalize_mac(row.get("bssid")),
        "ssid": row.get("ssid") or "Hidden/Unknown",
        "import_batch_id": row.get("import_batch_id"),
        "packet_points": int(row.get("packet_points") or 0),
        "unique_packet_locations": int(row.get("unique_packet_locations") or 0),
        "processed_detections": int(row.get("processed_detections") or 0),
        "first_seen": normalize_timestamp(first_seen),
        "last_seen": normalize_timestamp(last_seen),
        "strongest_signal": row.get("strongest_signal"),
        "weakest_signal": row.get("weakest_signal"),
        "start_latitude": float(row.get("start_latitude")) if row.get("start_latitude") is not None else None,
        "start_longitude": float(row.get("start_longitude")) if row.get("start_longitude") is not None else None,
        "end_latitude": float(row.get("end_latitude")) if row.get("end_latitude") is not None else None,
        "end_longitude": float(row.get("end_longitude")) if row.get("end_longitude") is not None else None,
        "has_packet_movement": int(row.get("unique_packet_locations") or 0) > 1,
    }


def get_latest_import_batch_id(db: Session) -> Optional[int]:
    return db.execute(
        text(
            """
            SELECT MAX(import_batch_id)
            FROM (
                SELECT import_batch_id FROM observations
                UNION ALL
                SELECT import_batch_id FROM client_observations
                UNION ALL
                SELECT import_batch_id FROM kismet_raw_devices
                UNION ALL
                SELECT import_batch_id FROM kismet_raw_packets
            ) latest
            WHERE import_batch_id IS NOT NULL
            """
        )
    ).scalar()


def load_movement_candidates(
    db: Session,
    import_batch_id: int,
    min_locations: int = 2,
    min_packets: int = 10,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    result = db.execute(
        text(
            """
            WITH packet_mac_points AS (
                SELECT
                    import_batch_id,
                    id AS packet_id,
                    ts_sec,
                    ts_usec,
                    UPPER(sourcemac) AS mac,
                    lat,
                    lon,
                    signal
                FROM kismet_raw_packets
                WHERE import_batch_id = :import_batch_id
                  AND sourcemac IS NOT NULL
                  AND sourcemac <> ''
                  AND sourcemac NOT IN ('FF:FF:FF:FF:FF:FF', '00:00:00:00:00:00')
                  AND lat IS NOT NULL
                  AND lon IS NOT NULL
                  AND NOT (lat = 0 AND lon = 0)

                UNION ALL

                SELECT
                    import_batch_id,
                    id AS packet_id,
                    ts_sec,
                    ts_usec,
                    UPPER(destmac) AS mac,
                    lat,
                    lon,
                    signal
                FROM kismet_raw_packets
                WHERE import_batch_id = :import_batch_id
                  AND destmac IS NOT NULL
                  AND destmac <> ''
                  AND destmac NOT IN ('FF:FF:FF:FF:FF:FF', '00:00:00:00:00:00')
                  AND lat IS NOT NULL
                  AND lon IS NOT NULL
                  AND NOT (lat = 0 AND lon = 0)

                UNION ALL

                SELECT
                    import_batch_id,
                    id AS packet_id,
                    ts_sec,
                    ts_usec,
                    UPPER(transmac) AS mac,
                    lat,
                    lon,
                    signal
                FROM kismet_raw_packets
                WHERE import_batch_id = :import_batch_id
                  AND transmac IS NOT NULL
                  AND transmac <> ''
                  AND transmac NOT IN ('FF:FF:FF:FF:FF:FF', '00:00:00:00:00:00')
                  AND lat IS NOT NULL
                  AND lon IS NOT NULL
                  AND NOT (lat = 0 AND lon = 0)
            ),
            candidate_summary AS (
                SELECT
                    import_batch_id,
                    mac AS bssid,
                    COUNT(DISTINCT packet_id) AS packet_points,
                    COUNT(
                        DISTINCT ROUND(lat::numeric, 6)::text || ',' || ROUND(lon::numeric, 6)::text
                    ) AS unique_packet_locations,
                    MIN(ts_sec) AS first_seen,
                    MAX(ts_sec) AS last_seen,
                    MAX(signal) AS strongest_signal,
                    MIN(signal) AS weakest_signal
                FROM packet_mac_points
                GROUP BY import_batch_id, mac
            ),
            start_points AS (
                SELECT DISTINCT ON (mac)
                    mac AS bssid,
                    lat AS start_latitude,
                    lon AS start_longitude
                FROM packet_mac_points
                ORDER BY mac, ts_sec ASC, ts_usec ASC, packet_id ASC
            ),
            end_points AS (
                SELECT DISTINCT ON (mac)
                    mac AS bssid,
                    lat AS end_latitude,
                    lon AS end_longitude
                FROM packet_mac_points
                ORDER BY mac, ts_sec DESC, ts_usec DESC, packet_id DESC
            ),
            observation_summary AS (
                SELECT
                    UPPER(bssid) AS bssid,
                    MAX(NULLIF(ssid, '')) AS ssid,
                    COUNT(*) AS processed_detections
                FROM observations
                WHERE import_batch_id = :import_batch_id
                  AND bssid IS NOT NULL
                GROUP BY UPPER(bssid)
            )
            SELECT
                candidate_summary.import_batch_id,
                candidate_summary.bssid,
                COALESCE(observation_summary.ssid, 'Hidden/Unknown') AS ssid,
                candidate_summary.packet_points,
                candidate_summary.unique_packet_locations,
                COALESCE(observation_summary.processed_detections, 0) AS processed_detections,
                candidate_summary.first_seen,
                candidate_summary.last_seen,
                candidate_summary.strongest_signal,
                candidate_summary.weakest_signal,
                start_points.start_latitude,
                start_points.start_longitude,
                end_points.end_latitude,
                end_points.end_longitude
            FROM candidate_summary
            LEFT JOIN observation_summary
                ON observation_summary.bssid = candidate_summary.bssid
            LEFT JOIN start_points
                ON start_points.bssid = candidate_summary.bssid
            LEFT JOIN end_points
                ON end_points.bssid = candidate_summary.bssid
            WHERE candidate_summary.unique_packet_locations >= :min_locations
              AND candidate_summary.packet_points >= :min_packets
            ORDER BY
                candidate_summary.unique_packet_locations DESC,
                candidate_summary.packet_points DESC,
                candidate_summary.last_seen DESC
            LIMIT :limit
            """
        ),
        {
            "import_batch_id": import_batch_id,
            "min_locations": min_locations,
            "min_packets": min_packets,
            "limit": limit,
        },
    )

    return [normalize_candidate_row(row) for row in rows_to_dicts(result)]


def load_packet_points(db: Session, selected_bssid: str) -> List[Dict[str, Any]]:
    result = db.execute(
        text(
            """
            SELECT
                id,
                import_batch_id,
                ts_sec,
                ts_usec,
                sourcemac,
                destmac,
                transmac,
                frequency,
                lat,
                lon,
                signal,
                packet_len,
                created_at
            FROM kismet_raw_packets
            WHERE import_batch_id = (
                SELECT MAX(import_batch_id)
                FROM kismet_raw_packets
            )
              AND (
                    LOWER(sourcemac) = LOWER(:bssid)
                 OR LOWER(destmac) = LOWER(:bssid)
                 OR LOWER(transmac) = LOWER(:bssid)
              )
              AND lat IS NOT NULL
              AND lon IS NOT NULL
              AND NOT (lat = 0 AND lon = 0)
            ORDER BY ts_sec ASC, ts_usec ASC, id ASC
            LIMIT 10000
            """
        ),
        {"bssid": selected_bssid},
    )

    rows = rows_to_dicts(result)

    points = []

    for row in rows:
        if not is_valid_coordinate(row.get("lat"), row.get("lon")):
            continue

        points.append(normalize_packet_point(row, selected_bssid))

    deduped = []
    seen = set()

    for point in points:
        key = (
            point.get("import_batch_id"),
            point.get("ts_sec"),
            point.get("ts_usec"),
            f"{point.get('latitude'):.6f}",
            f"{point.get('longitude'):.6f}",
        )

        if key in seen:
            continue

        seen.add(key)
        deduped.append(point)

    return deduped


def load_processed_records(db: Session, selected_bssid: str) -> List[Dict[str, Any]]:
    result = db.execute(
        text(
            """
            SELECT *
            FROM observations
            WHERE LOWER(bssid) = LOWER(:bssid)
            ORDER BY timestamp ASC NULLS LAST, id ASC
            LIMIT 5000
            """
        ),
        {"bssid": selected_bssid},
    )

    return rows_to_dicts(result)


def load_linked_devices(db: Session, selected_bssid: str) -> List[Dict[str, Any]]:
    result = db.execute(
        text(
            """
            SELECT *
            FROM client_observations
            WHERE bssid IS NOT NULL
              AND LOWER(bssid) = LOWER(:bssid)
            ORDER BY timestamp ASC NULLS LAST, id ASC
            LIMIT 5000
            """
        ),
        {"bssid": selected_bssid},
    )

    return rows_to_dicts(result)


def get_unique_location_count(rows: List[Dict[str, Any]]) -> int:
    locations = set()

    for row in rows:
        lat = row.get("latitude")
        lon = row.get("longitude")

        if is_valid_coordinate(lat, lon):
            locations.add(f"{float(lat):.6f},{float(lon):.6f}")

    return len(locations)


def summarize_movement(
    processed_records: List[Dict[str, Any]],
    packet_points: List[Dict[str, Any]],
    linked_devices: List[Dict[str, Any]],
) -> Dict[str, Any]:
    timestamps = [
        point.get("timestamp")
        for point in packet_points
        if point.get("timestamp")
    ]

    if not timestamps:
        timestamps = [
            row.get("timestamp") or row.get("created_at")
            for row in processed_records
            if row.get("timestamp") or row.get("created_at")
        ]

    return {
        "processed_detections": len(processed_records),
        "packet_points": len(packet_points),
        "linked_device_records": len(linked_devices),
        "unique_packet_locations": get_unique_location_count(packet_points),
        "has_packet_movement": len(packet_points) > 1
        and get_unique_location_count(packet_points) > 1,
        "first_seen": timestamps[0] if timestamps else None,
        "last_seen": timestamps[-1] if timestamps else None,
    }


@router.get("/candidates/latest")
def get_latest_wifi_movement_candidates(
    min_locations: int = Query(default=2, ge=2, le=1000),
    min_packets: int = Query(default=10, ge=1, le=100000),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    latest_import_batch_id = get_latest_import_batch_id(db)

    if latest_import_batch_id is None:
        return {
            "import_batch_id": None,
            "summary": {
                "candidate_count": 0,
                "min_locations": min_locations,
                "min_packets": min_packets,
            },
            "candidates": [],
        }

    candidates = load_movement_candidates(
        db=db,
        import_batch_id=latest_import_batch_id,
        min_locations=min_locations,
        min_packets=min_packets,
        limit=limit,
    )

    return {
        "import_batch_id": latest_import_batch_id,
        "summary": {
            "candidate_count": len(candidates),
            "min_locations": min_locations,
            "min_packets": min_packets,
        },
        "candidates": candidates,
    }


@router.get("/candidates/{import_batch_id}")
def get_wifi_movement_candidates_for_scan(
    import_batch_id: int,
    min_locations: int = Query(default=2, ge=2, le=1000),
    min_packets: int = Query(default=10, ge=1, le=100000),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    candidates = load_movement_candidates(
        db=db,
        import_batch_id=import_batch_id,
        min_locations=min_locations,
        min_packets=min_packets,
        limit=limit,
    )

    return {
        "import_batch_id": import_batch_id,
        "summary": {
            "candidate_count": len(candidates),
            "min_locations": min_locations,
            "min_packets": min_packets,
        },
        "candidates": candidates,
    }


@router.get("/{bssid}")
def get_wifi_movement(bssid: str, db: Session = Depends(get_db)):
    selected_bssid = normalize_mac(bssid)

    packet_points = load_packet_points(db, selected_bssid)
    processed_records = load_processed_records(db, selected_bssid)
    linked_devices = load_linked_devices(db, selected_bssid)

    return {
        "bssid": selected_bssid,
        "summary": summarize_movement(
            processed_records=processed_records,
            packet_points=packet_points,
            linked_devices=linked_devices,
        ),
        "packet_points": packet_points,
        "processed_records": processed_records,
        "linked_devices": linked_devices,
    }
