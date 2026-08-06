"""Backfill manufacturer values for existing WGIP MAC records.

Run without --apply for a dry run. Add --apply to commit updates.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List

from sqlalchemy import text

BACKEND_ROOT = Path(__file__).resolve().parents[1]

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.database import SessionLocal
from app.utils.mac_manufacturer import (
    POSSIBLE_RANDOMIZED_SUFFIX,
    UNKNOWN_MANUFACTURER,
    UNKNOWN_RANDOMIZED_MANUFACTURER,
    clean_manufacturer,
    resolve_manufacturer,
)


WIFI_TABLES = ("observations", "observation")


def table_exists(db, table_name: str) -> bool:
    row = db.execute(
        text("SELECT to_regclass(:table_name) IS NOT NULL AS present"),
        {"table_name": f"public.{table_name}"},
    ).mappings().first()

    return bool(row and row["present"])


def fetch_wifi_rows(db, table_name: str, limit: int) -> List[Dict[str, Any]]:
    raw_lookup = ""

    if table_exists(db, "kismet_raw_devices"):
        raw_lookup = """
            COALESCE(
                (
                    SELECT NULLIF(
                        BTRIM(
                            raw.device_json
                            ->> 'kismet.device.base.manuf'
                        ),
                        ''
                    )
                    FROM kismet_raw_devices AS raw
                    WHERE wifi.import_batch_id IS NOT NULL
                      AND raw.import_batch_id = wifi.import_batch_id
                      AND raw.devmac IS NOT NULL
                      AND LOWER(raw.devmac) = LOWER(wifi.bssid)
                    ORDER BY raw.id DESC
                    LIMIT 1
                ),
                wifi.manufacturer
            )
        """
    else:
        raw_lookup = "wifi.manufacturer"

    rows = db.execute(
        text(
            f"""
            SELECT
                wifi.id,
                wifi.bssid AS mac_address,
                wifi.manufacturer AS current_manufacturer,
                {raw_lookup} AS preferred_manufacturer
            FROM {table_name} AS wifi
            WHERE wifi.bssid IS NOT NULL
              AND (
                    wifi.manufacturer IS NULL
                    OR BTRIM(wifi.manufacturer) = ''
                    OR LOWER(BTRIM(wifi.manufacturer)) IN (
                        'unknown',
                        'unknown vendor',
                        'unknown manufacturer',
                        'private/randomized mac',
                        '(unknown)'
                    )
              )
            ORDER BY wifi.id ASC
            LIMIT :limit
            """
        ),
        {"limit": limit},
    ).mappings().all()

    return [dict(row) for row in rows]


def fetch_client_rows(db, limit: int) -> List[Dict[str, Any]]:
    raw_lookup = ""

    if table_exists(db, "kismet_raw_devices"):
        raw_lookup = """
            COALESCE(
                (
                    SELECT NULLIF(
                        BTRIM(
                            raw.device_json
                            ->> 'kismet.device.base.manuf'
                        ),
                        ''
                    )
                    FROM kismet_raw_devices AS raw
                    WHERE client.import_batch_id IS NOT NULL
                      AND raw.import_batch_id = client.import_batch_id
                      AND raw.devmac IS NOT NULL
                      AND LOWER(raw.devmac) = LOWER(client.client_mac)
                    ORDER BY raw.id DESC
                    LIMIT 1
                ),
                client.client_vendor
            )
        """
    else:
        raw_lookup = "client.client_vendor"

    rows = db.execute(
        text(
            f"""
            SELECT
                client.id,
                client.client_mac AS mac_address,
                client.client_vendor AS current_manufacturer,
                {raw_lookup} AS preferred_manufacturer
            FROM client_observations AS client
            WHERE client.client_mac IS NOT NULL
              AND (
                    client.client_vendor IS NULL
                    OR BTRIM(client.client_vendor) = ''
                    OR LOWER(BTRIM(client.client_vendor)) IN (
                        'unknown',
                        'unknown vendor',
                        'unknown manufacturer',
                        'private/randomized mac',
                        '(unknown)'
                    )
              )
            ORDER BY client.id ASC
            LIMIT :limit
            """
        ),
        {"limit": limit},
    ).mappings().all()

    return [dict(row) for row in rows]


def resolve_rows(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    resolved_rows = []

    for row in rows:
        manufacturer = resolve_manufacturer(
            row["mac_address"],
            row.get("preferred_manufacturer"),
        )

        resolved_rows.append(
            {
                **row,
                "resolved_manufacturer": manufacturer,
            }
        )

    return resolved_rows


def update_wifi_rows(db, table_name: str, rows: Iterable[Dict[str, Any]]) -> int:
    updated = 0

    for row in rows:
        manufacturer = row["resolved_manufacturer"]

        if clean_manufacturer(row.get("current_manufacturer")) == manufacturer:
            continue

        db.execute(
            text(
                f"""
                UPDATE {table_name}
                SET manufacturer = :manufacturer
                WHERE id = :record_id
                """
            ),
            {
                "manufacturer": manufacturer,
                "record_id": row["id"],
            },
        )
        updated += 1

    return updated


def update_client_rows(db, rows: Iterable[Dict[str, Any]]) -> int:
    updated = 0

    for row in rows:
        manufacturer = row["resolved_manufacturer"]

        if clean_manufacturer(row.get("current_manufacturer")) == manufacturer:
            continue

        db.execute(
            text(
                """
                UPDATE client_observations
                SET client_vendor = :manufacturer
                WHERE id = :record_id
                """
            ),
            {
                "manufacturer": manufacturer,
                "record_id": row["id"],
            },
        )
        updated += 1

    return updated


def summarize(rows: Iterable[Dict[str, Any]]) -> Dict[str, int]:
    summary = {
        "resolved": 0,
        "possible_randomized": 0,
        "randomized_unknown": 0,
        "unknown": 0,
    }

    for row in rows:
        manufacturer = row["resolved_manufacturer"]

        if manufacturer == UNKNOWN_MANUFACTURER:
            summary["unknown"] += 1
        elif manufacturer == UNKNOWN_RANDOMIZED_MANUFACTURER:
            summary["randomized_unknown"] += 1
        elif manufacturer.endswith(POSSIBLE_RANDOMIZED_SUFFIX):
            summary["possible_randomized"] += 1
        else:
            summary["resolved"] += 1

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill Wi-Fi and client MAC manufacturers.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit changes. Without this flag the script performs a dry run.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50000,
        help="Maximum rows read from each table.",
    )
    args = parser.parse_args()

    limit = max(1, min(args.limit, 500000))
    db = SessionLocal()

    try:
        total_candidates = 0
        total_updates = 0

        for table_name in WIFI_TABLES:
            if not table_exists(db, table_name):
                continue

            rows = resolve_rows(fetch_wifi_rows(db, table_name, limit))
            total_candidates += len(rows)
            table_summary = summarize(rows)

            if args.apply:
                total_updates += update_wifi_rows(db, table_name, rows)

            print(
                f"{table_name}: candidates={len(rows)}, "
                f"resolved={table_summary['resolved']}, "
                f"possible/randomized={table_summary['possible_randomized']}, "
                f"randomized/unknown={table_summary['randomized_unknown']}, "
                f"unknown={table_summary['unknown']}"
            )

        if table_exists(db, "client_observations"):
            client_rows = resolve_rows(fetch_client_rows(db, limit))
            total_candidates += len(client_rows)
            client_summary = summarize(client_rows)

            if args.apply:
                total_updates += update_client_rows(db, client_rows)

            print(
                "client_observations: "
                f"candidates={len(client_rows)}, "
                f"resolved={client_summary['resolved']}, "
                f"possible/randomized={client_summary['possible_randomized']}, "
                f"randomized/unknown={client_summary['randomized_unknown']}, "
                f"unknown={client_summary['unknown']}"
            )

        if args.apply:
            db.commit()
            print(f"Backfill committed. Updated rows: {total_updates}")
        else:
            db.rollback()
            print(
                "Dry run complete. "
                f"Candidates checked: {total_candidates}. "
                "Run again with --apply to save changes."
            )

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
