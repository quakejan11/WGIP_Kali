"""Compact, viewport-aware data endpoints for the WGIP General Map."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

try:
    from app.db.session import get_db
except ImportError:
    from app.db.database import get_db


router = APIRouter(prefix="/map-data", tags=["Map Data"])


_VALID_MAC_PATTERN = r"^([0-9A-F]{2}:){5}[0-9A-F]{2}$"

_MAP_RECORDS_CTE = f"""
    WITH client_counts AS (
        SELECT
            import_batch_id,
            UPPER(BTRIM(bssid)) AS bssid_key,
            COUNT(*)::integer AS observed_device_count
        FROM client_observations
        WHERE bssid IS NOT NULL
          AND BTRIM(bssid) <> ''
        GROUP BY import_batch_id, UPPER(BTRIM(bssid))
    ),
    map_records AS (
        SELECT
            'wifi-' || wifi.id::text AS row_id,
            'wifi'::text AS record_type,
            wifi.import_batch_id AS scan_id,
            COALESCE(
                NULLIF(BTRIM(batch.manual_area_label), ''),
                NULLIF(BTRIM(batch.original_filename), ''),
                CASE
                    WHEN wifi.import_batch_id IS NULL THEN 'Unknown Scan'
                    ELSE 'Scan #' || wifi.import_batch_id::text
                END
            ) AS scan_name,
            UPPER(BTRIM(wifi.bssid)) AS identifier,
            COALESCE(NULLIF(BTRIM(wifi.ssid), ''), 'Hidden/Unknown') AS name,
            COALESCE(
                NULLIF(BTRIM(wifi.manufacturer), ''),
                'Unknown Manufacturer'
            ) AS manufacturer,
            NULL::text AS linked_bssid,
            NULL::text AS linked_ssid,
            wifi.channel AS channel,
            COALESCE(NULLIF(BTRIM(wifi.encryption), ''), 'observed') AS relationship,
            COALESCE(wifi.signal_dbm, wifi.rssi) AS signal,
            CASE
                WHEN wifi.latitude BETWEEN -90 AND 90
                 AND wifi.longitude BETWEEN -180 AND 180
                 AND (wifi.latitude <> 0 OR wifi.longitude <> 0)
                THEN wifi.latitude
                ELSE batch.manual_latitude
            END::double precision AS latitude,
            CASE
                WHEN wifi.latitude BETWEEN -90 AND 90
                 AND wifi.longitude BETWEEN -180 AND 180
                 AND (wifi.latitude <> 0 OR wifi.longitude <> 0)
                THEN wifi.longitude
                ELSE batch.manual_longitude
            END::double precision AS longitude,
            CASE
                WHEN wifi.latitude BETWEEN -90 AND 90
                 AND wifi.longitude BETWEEN -180 AND 180
                 AND (wifi.latitude <> 0 OR wifi.longitude <> 0)
                THEN COALESCE(
                    NULLIF(BTRIM(wifi.coordinate_source), ''),
                    'record coordinate'
                )
                ELSE 'scan fallback coordinate'
            END AS coordinate_source,
            COALESCE(wifi.timestamp, wifi.created_at, batch.created_at) AS observed_at,
            COALESCE(client_counts.observed_device_count, 0)::integer
                AS observed_device_count
        FROM observations AS wifi
        LEFT JOIN kismet_import_batches AS batch
            ON batch.id = wifi.import_batch_id
        LEFT JOIN client_counts
            ON client_counts.import_batch_id = wifi.import_batch_id
           AND client_counts.bssid_key = UPPER(BTRIM(wifi.bssid))
        WHERE wifi.bssid ~* '{_VALID_MAC_PATTERN}'

        UNION ALL

        SELECT
            'device-' || client.id::text AS row_id,
            'device'::text AS record_type,
            client.import_batch_id AS scan_id,
            COALESCE(
                NULLIF(BTRIM(batch.manual_area_label), ''),
                NULLIF(BTRIM(batch.original_filename), ''),
                CASE
                    WHEN client.import_batch_id IS NULL THEN 'Unknown Scan'
                    ELSE 'Scan #' || client.import_batch_id::text
                END
            ) AS scan_name,
            UPPER(BTRIM(client.client_mac)) AS identifier,
            'Observed Device'::text AS name,
            COALESCE(
                NULLIF(BTRIM(client.client_vendor), ''),
                'Unknown Manufacturer'
            ) AS manufacturer,
            NULLIF(UPPER(BTRIM(client.bssid)), '') AS linked_bssid,
            NULLIF(BTRIM(client.ssid), '') AS linked_ssid,
            client.channel AS channel,
            COALESCE(
                NULLIF(BTRIM(client.relationship_type), ''),
                'observed'
            ) AS relationship,
            client.signal_dbm AS signal,
            CASE
                WHEN client.latitude BETWEEN -90 AND 90
                 AND client.longitude BETWEEN -180 AND 180
                 AND (client.latitude <> 0 OR client.longitude <> 0)
                THEN client.latitude
                ELSE batch.manual_latitude
            END::double precision AS latitude,
            CASE
                WHEN client.latitude BETWEEN -90 AND 90
                 AND client.longitude BETWEEN -180 AND 180
                 AND (client.latitude <> 0 OR client.longitude <> 0)
                THEN client.longitude
                ELSE batch.manual_longitude
            END::double precision AS longitude,
            CASE
                WHEN client.latitude BETWEEN -90 AND 90
                 AND client.longitude BETWEEN -180 AND 180
                 AND (client.latitude <> 0 OR client.longitude <> 0)
                THEN COALESCE(
                    NULLIF(BTRIM(client.coordinate_source), ''),
                    NULLIF(BTRIM(client.source), ''),
                    'record coordinate'
                )
                ELSE 'scan fallback coordinate'
            END AS coordinate_source,
            COALESCE(client.timestamp, client.created_at, batch.created_at) AS observed_at,
            0::integer AS observed_device_count
        FROM client_observations AS client
        LEFT JOIN kismet_import_batches AS batch
            ON batch.id = client.import_batch_id
        WHERE client.client_mac ~* '{_VALID_MAC_PATTERN}'
    ),
    valid_map_records AS (
        SELECT *
        FROM map_records
        WHERE latitude BETWEEN -90 AND 90
          AND longitude BETWEEN -180 AND 180
          AND (latitude <> 0 OR longitude <> 0)
    )
"""


def _safe_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _safe_float(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


@router.get("/summary")
def get_map_summary(db: Session = Depends(get_db)):
    """Return General Map counts and geographic bounds in one query."""

    row = db.execute(
        text(
            _MAP_RECORDS_CTE
            + """
            SELECT
                COUNT(*)::bigint AS total_mapped,
                COUNT(*) FILTER (WHERE record_type = 'wifi')::bigint
                    AS wifi_mapped,
                COUNT(*) FILTER (WHERE record_type = 'device')::bigint
                    AS device_mapped,
                COUNT(DISTINCT scan_id)::bigint AS scans_on_map,
                COUNT(DISTINCT (
                    ROUND(latitude::numeric, 6),
                    ROUND(longitude::numeric, 6)
                ))::bigint AS location_count,
                MIN(latitude) AS south,
                MAX(latitude) AS north,
                MIN(longitude) AS west,
                MAX(longitude) AS east,
                (SELECT COUNT(*) FROM kismet_import_batches)::bigint
                    AS total_scans
            FROM valid_map_records
            """
        )
    ).mappings().first()

    row = row or {}

    return {
        "total_mapped": _safe_int(row.get("total_mapped")),
        "wifi_mapped": _safe_int(row.get("wifi_mapped")),
        "device_mapped": _safe_int(row.get("device_mapped")),
        "scans_on_map": _safe_int(row.get("scans_on_map")),
        "total_scans": _safe_int(row.get("total_scans")),
        "location_count": _safe_int(row.get("location_count")),
        "bounds": {
            "south": _safe_float(row.get("south")),
            "north": _safe_float(row.get("north")),
            "west": _safe_float(row.get("west")),
            "east": _safe_float(row.get("east")),
        },
    }


@router.get("/points")
def get_map_points(
    south: float = Query(ge=-90, le=90),
    north: float = Query(ge=-90, le=90),
    west: float = Query(ge=-180, le=180),
    east: float = Query(ge=-180, le=180),
    record_type: Literal["all", "wifi", "device"] = Query(default="all"),
    limit: int = Query(default=5000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    """Return compact map points inside the current Leaflet viewport."""

    if south >= north:
        raise HTTPException(status_code=422, detail="south must be below north")

    if west >= east:
        raise HTTPException(status_code=422, detail="west must be left of east")

    parameters = {
        "south": south,
        "north": north,
        "west": west,
        "east": east,
        "record_type": record_type,
        "limit": limit,
    }

    rows = db.execute(
        text(
            _MAP_RECORDS_CTE
            + """
            SELECT
                row_id,
                record_type,
                scan_id,
                scan_name,
                identifier,
                name,
                manufacturer,
                linked_bssid,
                linked_ssid,
                channel,
                relationship,
                signal,
                latitude,
                longitude,
                coordinate_source,
                observed_at,
                observed_device_count,
                COUNT(*) OVER()::bigint AS viewport_total
            FROM valid_map_records
            WHERE latitude BETWEEN :south AND :north
              AND longitude BETWEEN :west AND :east
              AND (:record_type = 'all' OR record_type = :record_type)
            ORDER BY observed_at DESC NULLS LAST, row_id ASC
            LIMIT :limit
            """
        ),
        parameters,
    ).mappings().all()

    viewport_total = _safe_int(rows[0].get("viewport_total")) if rows else 0
    items = []

    for row in rows:
        item = dict(row)
        item.pop("viewport_total", None)
        items.append(item)

    return {
        "items": items,
        "viewport_total": viewport_total,
        "returned_count": len(items),
        "truncated": viewport_total > len(items),
        "limit": limit,
    }
