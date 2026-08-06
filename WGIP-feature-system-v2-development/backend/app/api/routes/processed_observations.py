"""Fast, server-paginated processed observations for the WGIP frontend."""

from __future__ import annotations

from math import ceil
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

try:
    from app.db.session import get_db
except ImportError:
    from app.db.database import get_db


router = APIRouter(
    prefix="/processed-observations",
    tags=["Processed Observations"],
)


_VALID_MAC_PATTERN = r"^([0-9A-F]{2}:){5}[0-9A-F]{2}$"

_UNIFIED_RECORDS_CTE = f"""
    WITH unified_records AS (
        SELECT
            'wifi-' || wifi.id::text AS row_id,
            wifi.id AS source_id,
            'wifi'::text AS record_type,
            'Wi-Fi'::text AS type_label,
            COALESCE(NULLIF(BTRIM(wifi.ssid), ''), 'Hidden/Unknown') AS name,
            COALESCE(
                NULLIF(BTRIM(wifi.manufacturer), ''),
                'Unknown Manufacturer'
            ) AS manufacturer,
            UPPER(wifi.bssid) AS identifier,
            NULL::text AS linked_bssid,
            COALESCE(NULLIF(BTRIM(wifi.encryption), ''), 'observed') AS relationship,
            wifi.import_batch_id AS scan_id,
            COALESCE(
                NULLIF(BTRIM(batch.manual_area_label), ''),
                NULLIF(BTRIM(batch.original_filename), ''),
                CASE
                    WHEN wifi.import_batch_id IS NULL THEN 'Unknown Scan'
                    ELSE 'Scan #' || wifi.import_batch_id::text
                END
            ) AS scan_name,
            wifi.channel AS channel,
            COALESCE(wifi.signal_dbm, wifi.rssi) AS signal,
            wifi.latitude AS latitude,
            wifi.longitude AS longitude,
            COALESCE(
                NULLIF(BTRIM(wifi.coordinate_source), ''),
                'processed'
            ) AS coordinate_source,
            COALESCE(wifi.timestamp, wifi.created_at) AS observed_at,
            1::integer AS record_weight
        FROM observations AS wifi
        LEFT JOIN kismet_import_batches AS batch
            ON batch.id = wifi.import_batch_id
        WHERE wifi.bssid ~* '{_VALID_MAC_PATTERN}'

        UNION ALL

        SELECT
            'device-' || client.id::text AS row_id,
            client.id AS source_id,
            'device'::text AS record_type,
            'Device'::text AS type_label,
            'Observed Device'::text AS name,
            COALESCE(
                NULLIF(BTRIM(client.client_vendor), ''),
                'Unknown Manufacturer'
            ) AS manufacturer,
            UPPER(client.client_mac) AS identifier,
            NULLIF(UPPER(BTRIM(client.bssid)), '') AS linked_bssid,
            COALESCE(
                NULLIF(BTRIM(client.relationship_type), ''),
                'observed'
            ) AS relationship,
            client.import_batch_id AS scan_id,
            COALESCE(
                NULLIF(BTRIM(batch.manual_area_label), ''),
                NULLIF(BTRIM(batch.original_filename), ''),
                CASE
                    WHEN client.import_batch_id IS NULL THEN 'Unknown Scan'
                    ELSE 'Scan #' || client.import_batch_id::text
                END
            ) AS scan_name,
            client.channel AS channel,
            client.signal_dbm AS signal,
            client.latitude AS latitude,
            client.longitude AS longitude,
            COALESCE(
                NULLIF(BTRIM(client.coordinate_source), ''),
                NULLIF(BTRIM(client.source), ''),
                'processed'
            ) AS coordinate_source,
            COALESCE(client.timestamp, client.created_at) AS observed_at,
            1::integer AS record_weight
        FROM client_observations AS client
        LEFT JOIN kismet_import_batches AS batch
            ON batch.id = client.import_batch_id
        WHERE client.client_mac ~* '{_VALID_MAC_PATTERN}'
    )
"""


def _build_filters(
    record_type: str,
    import_batch_id: Optional[int],
    search: str,
):
    filters = []
    parameters = {}

    if record_type != "all":
        filters.append("record_type = :record_type")
        parameters["record_type"] = record_type

    if import_batch_id is not None:
        filters.append("scan_id = :import_batch_id")
        parameters["import_batch_id"] = import_batch_id

    cleaned_search = search.strip().lower()

    if cleaned_search:
        filters.append(
            """
            LOWER(
                CONCAT_WS(
                    ' ',
                    type_label,
                    name,
                    manufacturer,
                    identifier,
                    linked_bssid,
                    relationship,
                    scan_name,
                    coordinate_source
                )
            ) LIKE :search_pattern
            """
        )
        parameters["search_pattern"] = f"%{cleaned_search}%"

    where_clause = ""

    if filters:
        where_clause = "WHERE " + " AND ".join(filters)

    return where_clause, parameters


def _safe_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


@router.get("")
@router.get("/")
def list_processed_observations(
    record_type: Literal["all", "wifi", "device"] = Query(default="all"),
    import_batch_id: Optional[int] = Query(default=None, ge=1),
    search: str = Query(default="", max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Return one true page of processed Wi-Fi/device observation records."""

    where_clause, filter_parameters = _build_filters(
        record_type,
        import_batch_id,
        search,
    )

    total_row = db.execute(
        text(
            _UNIFIED_RECORDS_CTE
            + f"""
            SELECT COUNT(*) AS total
            FROM unified_records
            {where_clause}
            """
        ),
        filter_parameters,
    ).mappings().first()

    total = _safe_int(total_row["total"] if total_row else 0)
    total_pages = ceil(total / page_size) if total else 0
    safe_page = min(page, total_pages) if total_pages else 1
    offset = (safe_page - 1) * page_size

    row_parameters = {
        **filter_parameters,
        "page_size": page_size,
        "offset": offset,
    }

    rows = db.execute(
        text(
            _UNIFIED_RECORDS_CTE
            + f"""
            SELECT
                row_id,
                source_id,
                record_type,
                type_label,
                name,
                manufacturer,
                identifier,
                linked_bssid,
                relationship,
                scan_id,
                scan_name,
                channel,
                signal,
                latitude,
                longitude,
                coordinate_source,
                observed_at,
                record_weight
            FROM unified_records
            {where_clause}
            ORDER BY observed_at DESC NULLS LAST, source_id DESC
            LIMIT :page_size
            OFFSET :offset
            """
        ),
        row_parameters,
    ).mappings().all()

    stats_row = db.execute(
        text(
            f"""
            SELECT
                (
                    SELECT COUNT(*)
                    FROM observations
                    WHERE bssid ~* '{_VALID_MAC_PATTERN}'
                ) AS wifi_record_count,
                (
                    SELECT COUNT(*)
                    FROM client_observations
                    WHERE client_mac ~* '{_VALID_MAC_PATTERN}'
                ) AS device_record_count,
                (
                    SELECT COUNT(*)
                    FROM observations
                    WHERE bssid ~* '{_VALID_MAC_PATTERN}'
                      AND latitude BETWEEN -90 AND 90
                      AND longitude BETWEEN -180 AND 180
                      AND (latitude <> 0 OR longitude <> 0)
                ) + (
                    SELECT COUNT(*)
                    FROM client_observations
                    WHERE client_mac ~* '{_VALID_MAC_PATTERN}'
                      AND latitude BETWEEN -90 AND 90
                      AND longitude BETWEEN -180 AND 180
                      AND (latitude <> 0 OR longitude <> 0)
                ) AS mapped_record_count,
                (
                    SELECT COUNT(DISTINCT LOWER(bssid))
                    FROM observations
                    WHERE bssid ~* '{_VALID_MAC_PATTERN}'
                ) AS unique_bssids,
                (
                    SELECT COUNT(DISTINCT LOWER(client_mac))
                    FROM client_observations
                    WHERE client_mac ~* '{_VALID_MAC_PATTERN}'
                ) AS unique_devices
            """
        )
    ).mappings().first()

    scan_rows = db.execute(
        text(
            """
            SELECT
                id,
                COALESCE(
                    NULLIF(BTRIM(manual_area_label), ''),
                    NULLIF(BTRIM(original_filename), ''),
                    'Scan #' || id::text
                ) AS name
            FROM kismet_import_batches
            ORDER BY id DESC
            LIMIT 100
            """
        )
    ).mappings().all()

    stats = dict(stats_row or {})
    wifi_record_count = _safe_int(stats.get("wifi_record_count"))
    device_record_count = _safe_int(stats.get("device_record_count"))

    return {
        "items": [dict(row) for row in rows],
        "total": total,
        "page": safe_page,
        "page_size": page_size,
        "total_pages": total_pages,
        "stats": {
            "total_processed": wifi_record_count + device_record_count,
            "wifi_record_count": wifi_record_count,
            "device_record_count": device_record_count,
            "mapped_record_count": _safe_int(stats.get("mapped_record_count")),
            "unique_bssids": _safe_int(stats.get("unique_bssids")),
            "unique_devices": _safe_int(stats.get("unique_devices")),
        },
        "scan_options": [dict(row) for row in scan_rows],
    }
