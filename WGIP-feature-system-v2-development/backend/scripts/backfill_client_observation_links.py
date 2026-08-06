import argparse
from collections import defaultdict
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Tuple

try:
    from app.db.session import SessionLocal
except ImportError:
    from app.db.database import SessionLocal

from app.models.client_observation import ClientObservation
from app.models.import_batch import ImportBatch
from app.models.observation import Observation


MAX_TIME_DIFFERENCE_SECONDS = 5
MAX_COORDINATE_DIFFERENCE = 0.00001


def normalize_mac(value: Optional[str]) -> str:
    return str(value or "").strip().upper()


def datetime_seconds(value: Optional[datetime]) -> Optional[float]:
    if value is None:
        return None

    try:
        return value.timestamp()
    except (AttributeError, OSError, OverflowError, ValueError):
        return None


def valid_coordinate(latitude, longitude) -> bool:
    try:
        latitude_value = float(latitude)
        longitude_value = float(longitude)
    except (TypeError, ValueError):
        return False

    return (
        -90 <= latitude_value <= 90
        and -180 <= longitude_value <= 180
        and not (latitude_value == 0 and longitude_value == 0)
    )


def coordinate_difference(client: ClientObservation, wifi: Observation) -> float:
    if not valid_coordinate(client.latitude, client.longitude):
        return float("inf")

    if not valid_coordinate(wifi.latitude, wifi.longitude):
        return float("inf")

    return abs(float(client.latitude) - float(wifi.latitude)) + abs(
        float(client.longitude) - float(wifi.longitude)
    )


def time_difference_seconds(
    client: ClientObservation,
    wifi: Observation,
) -> float:
    client_seconds = datetime_seconds(client.timestamp)
    wifi_seconds = datetime_seconds(wifi.timestamp)

    if client_seconds is None or wifi_seconds is None:
        return float("inf")

    return abs(client_seconds - wifi_seconds)


def build_wifi_lookup(
    rows: Iterable[Observation],
) -> Dict[str, List[Observation]]:
    lookup: Dict[str, List[Observation]] = defaultdict(list)

    for row in rows:
        bssid = normalize_mac(row.bssid)

        if bssid and row.survey_id is not None:
            lookup[bssid].append(row)

    return lookup


def find_match(
    client: ClientObservation,
    candidates: Iterable[Observation],
) -> Tuple[Optional[Observation], str]:
    scored = []

    for wifi in candidates:
        time_difference = time_difference_seconds(client, wifi)
        coordinate_delta = coordinate_difference(client, wifi)

        time_matches = time_difference <= MAX_TIME_DIFFERENCE_SECONDS
        coordinate_matches = coordinate_delta <= MAX_COORDINATE_DIFFERENCE

        if not time_matches:
            continue

        scored.append(
            (
                time_difference,
                coordinate_delta,
                0 if coordinate_matches else 1,
                wifi,
            )
        )

    if not scored:
        return None, "no timestamp match"

    scored.sort(key=lambda item: (item[0], item[2], item[1], item[3].id))
    best = scored[0]
    best_wifi = best[3]

    equally_good = [
        item
        for item in scored
        if item[0] == best[0]
        and item[2] == best[2]
        and item[1] == best[1]
    ]

    distinct_survey_ids = {
        item[3].survey_id
        for item in equally_good
        if item[3].survey_id is not None
    }

    if len(distinct_survey_ids) > 1:
        return None, "ambiguous scan match"

    if best[2] == 0:
        return best_wifi, "BSSID + timestamp + coordinates"

    return best_wifi, "BSSID + timestamp"


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill scan/import links for legacy WGIP client observations. "
            "Dry-run is the default; pass --apply to commit changes."
        )
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit matched links. Without this flag, no changes are saved.",
    )
    args = parser.parse_args()

    db = SessionLocal()

    try:
        wifi_rows = (
            db.query(Observation)
            .filter(
                Observation.bssid.isnot(None),
                Observation.survey_id.isnot(None),
            )
            .all()
        )

        client_rows = (
            db.query(ClientObservation)
            .filter(
                ClientObservation.bssid.isnot(None),
                ClientObservation.client_mac.isnot(None),
            )
            .order_by(ClientObservation.id.asc())
            .all()
        )

        valid_import_batch_ids = {
            row_id
            for (row_id,) in db.query(ImportBatch.id).all()
        }

        wifi_lookup = build_wifi_lookup(wifi_rows)

        matched = 0
        changed = 0
        unmatched = 0
        already_linked = 0

        print("WGIP Client Observation Link Backfill")
        print("=" * 46)
        print(f"Mode: {'APPLY' if args.apply else 'DRY RUN'}")
        print(f"Wi-Fi observations available: {len(wifi_rows)}")
        print(f"Client observations checked: {len(client_rows)}")
        print("")

        for client in client_rows:
            candidates = wifi_lookup.get(normalize_mac(client.bssid), [])
            wifi, reason = find_match(client, candidates)

            if wifi is None:
                unmatched += 1
                print(
                    f"UNMATCHED client row #{client.id}: "
                    f"{client.client_mac} -> {client.bssid} ({reason})"
                )
                continue

            matched += 1
            row_changed = False

            old_survey_id = client.survey_id
            old_import_batch_id = client.import_batch_id
            old_coordinate_source = client.coordinate_source

            if client.survey_id is None and wifi.survey_id is not None:
                client.survey_id = wifi.survey_id
                row_changed = True

            if (
                client.import_batch_id is None
                and wifi.import_batch_id is not None
                and wifi.import_batch_id in valid_import_batch_ids
            ):
                client.import_batch_id = wifi.import_batch_id
                row_changed = True

            if (
                not client.coordinate_source
                and valid_coordinate(client.latitude, client.longitude)
            ):
                client.coordinate_source = "scan_gps"
                row_changed = True

            if row_changed:
                changed += 1

                print(
                    f"MATCH client row #{client.id}: "
                    f"survey {old_survey_id!r} -> {client.survey_id!r}, "
                    f"batch {old_import_batch_id!r} -> "
                    f"{client.import_batch_id!r}, "
                    f"source {old_coordinate_source!r} -> "
                    f"{client.coordinate_source!r} "
                    f"[{reason}; Wi-Fi row #{wifi.id}]"
                )
            else:
                already_linked += 1

        print("")
        print("Summary")
        print("-" * 46)
        print(f"Matched: {matched}")
        print(f"Rows needing changes: {changed}")
        print(f"Already complete: {already_linked}")
        print(f"Unmatched: {unmatched}")

        if args.apply:
            db.commit()
            print("")
            print("Changes committed successfully.")
        else:
            db.rollback()
            print("")
            print("Dry run only. No database changes were saved.")
            print("Run again with --apply after reviewing the matches.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
