from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

try:
    from app.db.session import get_db
except ImportError:
    from app.db.database import get_db

from app.services.kismet_import_service import (
    import_kismet_file,
    save_upload_to_temp,
)


router = APIRouter(prefix="/kismet-imports", tags=["Kismet Imports"])


def rows_to_dicts(rows):
    return [dict(row) for row in rows]


def get_import_batch_or_404(import_batch_id: int, db: Session):
    row = db.execute(
        text(
            """
            SELECT
                id,
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
                created_at,
                completed_at
            FROM kismet_import_batches
            WHERE id = :import_batch_id
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Kismet import not found")

    return dict(row)


@router.post("/upload")
def upload_kismet_file(
    file: UploadFile = File(...),
    survey_id: Optional[int] = Form(default=None),
    manual_area_label: Optional[str] = Form(default=None),
    manual_latitude: Optional[float] = Form(default=None),
    manual_longitude: Optional[float] = Form(default=None),
    import_packets: bool = Form(default=True),
    db: Session = Depends(get_db),
):
    """
    Upload and import an actual Kismet .kismet SQLite file.

    What this endpoint does:
    - saves original Kismet SQLite tables into kismet_raw_* tables
    - creates one kismet_import_batches row
    - extracts processed Wi-Fi/device records when target tables exist

    Safety note:
    This only stores observed wireless scan records. It does not identify device owners.
    """

    original_filename = file.filename or "uploaded.kismet"
    suffix = Path(original_filename).suffix.lower()

    if suffix != ".kismet":
        raise HTTPException(
            status_code=400,
            detail="Only .kismet files are supported by this endpoint.",
        )

    temp_path = None

    try:
        temp_path = save_upload_to_temp(file)

        result = import_kismet_file(
            db,
            uploaded_file_path=temp_path,
            original_filename=original_filename,
            survey_id=survey_id,
            manual_area_label=manual_area_label,
            manual_latitude=manual_latitude,
            manual_longitude=manual_longitude,
            import_packets=import_packets,
        )

        return result

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Kismet import failed: {exc}",
        ) from exc

    finally:
        if temp_path:
            try:
                temp_dir = temp_path.parent
                temp_path.unlink(missing_ok=True)
                temp_dir.rmdir()
            except Exception:
                pass


@router.get("")
@router.get("/")
def list_kismet_imports(
    db: Session = Depends(get_db),
):
    """
    List recent Kismet import batches.
    """

    rows = db.execute(
        text(
            """
            SELECT
                id,
                survey_id,
                original_filename,
                file_size,
                file_hash,
                kismet_version,
                db_version,
                db_module,
                import_status,
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
                created_at,
                completed_at
            FROM kismet_import_batches
            ORDER BY created_at DESC
            LIMIT 100
            """
        )
    ).mappings().all()

    return rows_to_dicts(rows)


@router.get("/{import_batch_id}")
def get_kismet_import(
    import_batch_id: int,
    db: Session = Depends(get_db),
):
    """
    Get one Kismet import batch summary.
    """

    return get_import_batch_or_404(import_batch_id, db)


@router.get("/{import_batch_id}/processed-summary")
def get_kismet_processed_summary(
    import_batch_id: int,
    db: Session = Depends(get_db),
):
    """
    View-ready processed summary for one imported Kismet batch.

    This endpoint is for the frontend details page:
    - Wi-Fi networks observed in the imported scan
    - observed client/device records
    - raw device type breakdown
    - simple review items
    """

    batch = get_import_batch_or_404(import_batch_id, db)

    wifi_rows = db.execute(
        text(
            """
            SELECT
                id,
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
                created_at,
                notes,
                city,
                province,
                country,
                area_label,
                coordinate_source
            FROM observations
            WHERE import_batch_id = :import_batch_id
            ORDER BY timestamp ASC NULLS LAST, id ASC
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().all()

    client_rows = db.execute(
        text(
            """
            SELECT
                id,
                survey_id,
                import_batch_id,
                bssid,
                ssid,
                channel,
                client_mac,
                client_vendor,
                client_vendor AS manufacturer,
                timestamp,
                latitude,
                longitude,
                signal_dbm,
                relationship_type,
                coordinate_source
            FROM client_observations
            WHERE import_batch_id = :import_batch_id
            ORDER BY timestamp ASC NULLS LAST, id ASC
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().all()

    raw_type_rows = db.execute(
        text(
            """
            SELECT
                COALESCE(device_type, 'Unknown') AS device_type,
                COUNT(*) AS total
            FROM kismet_raw_devices
            WHERE import_batch_id = :import_batch_id
            GROUP BY COALESCE(device_type, 'Unknown')
            ORDER BY total DESC, device_type ASC
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().all()

    raw_preview_rows = db.execute(
        text(
            """
            SELECT
                id,
                import_batch_id,
                first_time,
                last_time,
                devkey,
                phyname,
                devmac,
                strongest_signal,
                avg_lat,
                avg_lon,
                bytes_data,
                device_type,
                device_json,
                created_at
            FROM kismet_raw_devices
            WHERE import_batch_id = :import_batch_id
            ORDER BY id ASC
            LIMIT 20
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().all()

    bssid_review_rows = db.execute(
        text(
            """
            SELECT
                o.bssid,
                MAX(o.ssid) AS ssid,
                MAX(o.manufacturer) AS manufacturer,
                MAX(o.channel) AS channel,
                MAX(o.encryption) AS encryption,
                MAX(o.signal_dbm) AS signal_dbm,
                MAX(o.latitude) AS latitude,
                MAX(o.longitude) AS longitude,
                MAX(o.area_label) AS area_label,
                COUNT(c.id) AS observed_device_count
            FROM observations o
            LEFT JOIN client_observations c
                ON c.import_batch_id = o.import_batch_id
                AND LOWER(c.bssid) = LOWER(o.bssid)
            WHERE o.import_batch_id = :import_batch_id
            GROUP BY o.bssid
            ORDER BY observed_device_count DESC, o.bssid ASC
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().all()

    stats_row = db.execute(
        text(
            """
            SELECT
                COUNT(*) AS wifi_observations,
                COUNT(DISTINCT bssid) AS unique_bssids,
                COUNT(DISTINCT ssid) AS unique_ssids
            FROM observations
            WHERE import_batch_id = :import_batch_id
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().first()

    client_stats_row = db.execute(
        text(
            """
            SELECT
                COUNT(*) AS client_observations,
                COUNT(DISTINCT client_mac) AS unique_clients,
                COUNT(DISTINCT bssid) AS linked_bssids
            FROM client_observations
            WHERE import_batch_id = :import_batch_id
            """
        ),
        {"import_batch_id": import_batch_id},
    ).mappings().first()

    return {
        "batch": batch,
        "stats": {
            "wifi_observations": int(stats_row["wifi_observations"] or 0),
            "unique_bssids": int(stats_row["unique_bssids"] or 0),
            "unique_ssids": int(stats_row["unique_ssids"] or 0),
            "client_observations": int(client_stats_row["client_observations"] or 0),
            "unique_clients": int(client_stats_row["unique_clients"] or 0),
            "linked_bssids": int(client_stats_row["linked_bssids"] or 0),
        },
        "wifi_observations": rows_to_dicts(wifi_rows),
        "client_observations": rows_to_dicts(client_rows),
        "raw_device_type_breakdown": rows_to_dicts(raw_type_rows),
        "raw_device_preview": rows_to_dicts(raw_preview_rows),
        "review_items": rows_to_dicts(bssid_review_rows),
        "safety_note": (
            "This view shows observed wireless scan records only. "
            "It does not identify device owners."
        ),
    }


@router.get("/{import_batch_id}/raw-devices")
def get_kismet_raw_devices(
    import_batch_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    Preview raw Kismet device rows from one import batch.
    """

    safe_limit = max(1, min(limit, 500))

    rows = db.execute(
        text(
            """
            SELECT
                id,
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
            FROM kismet_raw_devices
            WHERE import_batch_id = :import_batch_id
            ORDER BY id ASC
            LIMIT :limit
            """
        ),
        {
            "import_batch_id": import_batch_id,
            "limit": safe_limit,
        },
    ).mappings().all()

    return rows_to_dicts(rows)


@router.get("/{import_batch_id}/raw-packets")
def get_kismet_raw_packets(
    import_batch_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    Preview raw Kismet packet rows from one import batch.
    """

    safe_limit = max(1, min(limit, 500))

    rows = db.execute(
        text(
            """
            SELECT
                id,
                import_batch_id,
                ts_sec,
                ts_usec,
                phyname,
                sourcemac,
                destmac,
                transmac,
                frequency,
                devkey,
                lat,
                lon,
                alt,
                speed,
                heading,
                packet_len,
                signal,
                datasource,
                dlt,
                error,
                tags,
                datarate,
                packet_hash,
                packetid,
                packet_full_len,
                created_at
            FROM kismet_raw_packets
            WHERE import_batch_id = :import_batch_id
            ORDER BY id ASC
            LIMIT :limit
            """
        ),
        {
            "import_batch_id": import_batch_id,
            "limit": safe_limit,
        },
    ).mappings().all()

    return rows_to_dicts(rows)


@router.get("/{import_batch_id}/raw-alerts")
def get_kismet_raw_alerts(
    import_batch_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    Preview raw Kismet alert rows from one import batch.
    """

    safe_limit = max(1, min(limit, 500))

    rows = db.execute(
        text(
            """
            SELECT
                id,
                import_batch_id,
                ts_sec,
                ts_usec,
                phyname,
                devmac,
                lat,
                lon,
                header,
                alert_json,
                created_at
            FROM kismet_raw_alerts
            WHERE import_batch_id = :import_batch_id
            ORDER BY id ASC
            LIMIT :limit
            """
        ),
        {
            "import_batch_id": import_batch_id,
            "limit": safe_limit,
        },
    ).mappings().all()

    return rows_to_dicts(rows)
