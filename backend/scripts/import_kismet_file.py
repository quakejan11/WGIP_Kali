import argparse
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib import request, error


BACKEND_ROOT = Path(__file__).resolve().parents[1]

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.utils.mac_manufacturer import resolve_manufacturer


# ------------------------------------------------------------
# Basic API helper
# ------------------------------------------------------------
# Ito yung helper para mag-send ng POST request sa FastAPI backend.
# Standard library lang gamit nito para hindi na kailangan mag-install ng requests.
def api_post(api_base_url: str, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{api_base_url.rstrip('/')}/{endpoint.lstrip('/')}"

    body = json.dumps(payload).encode("utf-8")

    req = request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=20) as response:
            response_body = response.read().decode("utf-8")

            if not response_body:
                return {}

            return json.loads(response_body)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"API error {exc.code} on {endpoint}: {detail}") from exc


# ------------------------------------------------------------
# Safe helpers
# ------------------------------------------------------------
# Nililinis nito yung empty values para hindi magpadala ng blank fields sa backend.
def clean_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = {}

    for key, value in payload.items():
        if value is None:
            continue

        if value == "":
            continue

        cleaned[key] = value

    return cleaned


# Converts Unix timestamp from Kismet into ISO datetime string.
def timestamp_to_iso(value: Any) -> Optional[str]:
    if value in (None, "", 0):
        return None

    try:
        return datetime.fromtimestamp(int(value)).isoformat()
    except Exception:
        return None


# Converts value to integer safely.
def to_int(value: Any) -> Optional[int]:
    if value in (None, ""):
        return None

    try:
        return int(float(value))
    except Exception:
        return None


# Converts value to float safely.
def to_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None

    try:
        return float(value)
    except Exception:
        return None


# Checks if Kismet coordinate is usable.
# Usually kapag walang GPS, Kismet records 0.0 / 0.0.
def valid_coordinate(lat: Any, lon: Any) -> bool:
    lat_value = to_float(lat)
    lon_value = to_float(lon)

    if lat_value is None or lon_value is None:
        return False

    if lat_value == 0 and lon_value == 0:
        return False

    return True


# Picks coordinate from Kismet row.
# Kapag walang GPS sa file, gagamit tayo ng manual lat/lon from command.
def pick_coordinates(
    row: sqlite3.Row,
    manual_lat: Optional[float],
    manual_lon: Optional[float],
) -> Tuple[Optional[float], Optional[float]]:
    avg_lat = row["avg_lat"] if "avg_lat" in row.keys() else None
    avg_lon = row["avg_lon"] if "avg_lon" in row.keys() else None

    if valid_coordinate(avg_lat, avg_lon):
        return to_float(avg_lat), to_float(avg_lon)

    return manual_lat, manual_lon


# Parses Kismet JSON blob from devices.device column.
def parse_device_json(row: sqlite3.Row) -> Dict[str, Any]:
    blob = row["device"]

    if not blob:
        return {}

    if isinstance(blob, bytes):
        text = blob.decode("utf-8", errors="ignore")
    else:
        text = str(blob)

    try:
        return json.loads(text)
    except Exception:
        return {}


# ------------------------------------------------------------
# Kismet field extraction
# ------------------------------------------------------------
# Kinukuha nito yung SSID from Kismet AP JSON.
def get_ap_ssid(device_json: Dict[str, Any], fallback: str = "") -> str:
    dot11 = device_json.get("dot11.device", {})

    last_beacon = dot11.get("dot11.device.last_beaconed_ssid_record", {})
    ssid = last_beacon.get("dot11.advertisedssid.ssid")

    if ssid:
        return ssid

    ssid_map = dot11.get("dot11.device.advertised_ssid_map", [])

    if isinstance(ssid_map, list) and ssid_map:
        ssid = ssid_map[0].get("dot11.advertisedssid.ssid")

        if ssid:
            return ssid

    base_name = device_json.get("kismet.device.base.name")
    common_name = device_json.get("kismet.device.base.commonname")

    return base_name or common_name or fallback or "Hidden/Unknown"


# Kinukuha nito yung encryption/security string from Kismet AP JSON.
def get_ap_encryption(device_json: Dict[str, Any]) -> str:
    dot11 = device_json.get("dot11.device", {})

    last_beacon = dot11.get("dot11.device.last_beaconed_ssid_record", {})
    crypt = last_beacon.get("dot11.advertisedssid.crypt_string")

    if crypt:
        return crypt

    return device_json.get("kismet.device.base.crypt", "") or ""


# Kinukuha nito yung channel from Kismet JSON.
def get_channel(device_json: Dict[str, Any]) -> Optional[int]:
    channel = device_json.get("kismet.device.base.channel")

    return to_int(channel)


# Kinukuha nito yung manufacturer/vendor from Kismet, then API fallback.
def get_vendor(
    device_json: Dict[str, Any],
    mac_address: Any = None,
) -> str:
    return resolve_manufacturer(
        mac_address
        or device_json.get("kismet.device.base.macaddr"),
        device_json.get("kismet.device.base.manuf"),
    )


# Kinukuha nito yung last BSSID na related sa client/device.
def get_last_bssid(device_json: Dict[str, Any]) -> str:
    dot11 = device_json.get("dot11.device", {})

    return dot11.get("dot11.device.last_bssid") or ""


# Gets client map from Kismet.
# Usually ito yung mapping ng observed client/device to possible BSSID.
def get_client_map(device_json: Dict[str, Any]) -> Dict[str, Any]:
    dot11 = device_json.get("dot11.device", {})

    client_map = dot11.get("dot11.device.client_map", {})

    if isinstance(client_map, dict):
        return client_map

    return {}


# Gets associated client map from AP records.
# Usually AP -> associated clients.
def get_associated_client_map(device_json: Dict[str, Any]) -> Dict[str, Any]:
    dot11 = device_json.get("dot11.device", {})

    associated_map = dot11.get("dot11.device.associated_client_map", {})

    if isinstance(associated_map, dict):
        return associated_map

    return {}


# ------------------------------------------------------------
# Database readers
# ------------------------------------------------------------
# Reads all IEEE802.11 devices from the Kismet SQLite file.
def read_kismet_devices(kismet_file: Path) -> List[sqlite3.Row]:
    conn = sqlite3.connect(kismet_file)
    conn.row_factory = sqlite3.Row

    try:
        rows = conn.execute(
            """
            SELECT
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
                type,
                device
            FROM devices
            WHERE phyname = 'IEEE802.11'
            ORDER BY first_time ASC
            """
        ).fetchall()

        return rows
    finally:
        conn.close()


# ------------------------------------------------------------
# Import builders
# ------------------------------------------------------------
# Gumagawa ng AP lookup para makuha SSID/encryption per BSSID.
def build_ap_lookup(device_rows: List[sqlite3.Row]) -> Dict[str, Dict[str, Any]]:
    lookup = {}

    for row in device_rows:
        if row["type"] != "Wi-Fi AP":
            continue

        device_json = parse_device_json(row)
        bssid = row["devmac"]

        lookup[bssid] = {
            "bssid": bssid,
            "ssid": get_ap_ssid(device_json, fallback=bssid),
            "encryption": get_ap_encryption(device_json),
            "channel": get_channel(device_json),
            "vendor": get_vendor(device_json, bssid),
        }

    return lookup


# Builds Wi-Fi observation payloads from Kismet AP rows.
def build_wifi_observations(
    device_rows: List[sqlite3.Row],
    survey_id: int,
    manual_lat: Optional[float],
    manual_lon: Optional[float],
    area_label: str,
) -> List[Dict[str, Any]]:
    observations = []

    for row in device_rows:
        if row["type"] != "Wi-Fi AP":
            continue

        device_json = parse_device_json(row)
        latitude, longitude = pick_coordinates(row, manual_lat, manual_lon)

        payload = clean_payload(
            {
                "survey_id": survey_id,
                "bssid": row["devmac"],
                "ssid": get_ap_ssid(device_json, fallback=row["devmac"]),
                "manufacturer": get_vendor(device_json, row["devmac"]),
                "channel": get_channel(device_json),
                "rssi": to_int(row["strongest_signal"]),
                "signal_dbm": to_int(row["strongest_signal"]),
                "encryption": get_ap_encryption(device_json),
                "latitude": latitude,
                "longitude": longitude,
                "timestamp": timestamp_to_iso(row["last_time"]),
                "area_label": area_label,
                "country": "Philippines",
                "notes": f"Imported from Kismet file. Kismet type: {row['type']}",
            }
        )

        observations.append(payload)

    return observations


# Builds client observation payloads from Kismet client/device rows.
def build_client_observations_from_clients(
    device_rows: List[sqlite3.Row],
    ap_lookup: Dict[str, Dict[str, Any]],
    survey_id: int,
    manual_lat: Optional[float],
    manual_lon: Optional[float],
    area_label: str,
) -> List[Dict[str, Any]]:
    client_observations = []
    seen = set()

    for row in device_rows:
        if row["type"] == "Wi-Fi AP":
            continue

        device_json = parse_device_json(row)
        client_mac = row["devmac"]
        client_vendor = get_vendor(device_json, client_mac)
        latitude, longitude = pick_coordinates(row, manual_lat, manual_lon)

        possible_bssids = []

        last_bssid = get_last_bssid(device_json)

        if last_bssid and last_bssid != "00:00:00:00:00:00":
            possible_bssids.append(last_bssid)

        client_map = get_client_map(device_json)

        for bssid in client_map.keys():
            if bssid and bssid != "00:00:00:00:00:00":
                possible_bssids.append(bssid)

        # Remove duplicates while preserving order.
        unique_bssids = []
        for bssid in possible_bssids:
            if bssid not in unique_bssids:
                unique_bssids.append(bssid)

        for bssid in unique_bssids:
            ap_info = ap_lookup.get(bssid, {})

            dedupe_key = (
                client_mac,
                bssid,
                timestamp_to_iso(row["last_time"]),
                "client-row",
            )

            if dedupe_key in seen:
                continue

            seen.add(dedupe_key)

            payload = clean_payload(
                {
                    "survey_id": survey_id,
                    "bssid": bssid,
                    "ssid": ap_info.get("ssid", ""),
                    "channel": ap_info.get("channel") or get_channel(device_json),
                    "client_mac": client_mac,
                    "client_vendor": client_vendor,
                    "timestamp": timestamp_to_iso(row["last_time"]),
                    "latitude": latitude,
                    "longitude": longitude,
                    "signal_dbm": to_int(row["strongest_signal"]),
                    "relationship_type": row["type"],
                }
            )

            client_observations.append(payload)

    return client_observations


# Builds client observations from AP associated_client_map.
def build_client_observations_from_aps(
    device_rows: List[sqlite3.Row],
    ap_lookup: Dict[str, Dict[str, Any]],
    survey_id: int,
    manual_lat: Optional[float],
    manual_lon: Optional[float],
) -> List[Dict[str, Any]]:
    client_observations = []
    seen = set()

    for row in device_rows:
        if row["type"] != "Wi-Fi AP":
            continue

        device_json = parse_device_json(row)
        associated_clients = get_associated_client_map(device_json)

        if not associated_clients:
            continue

        bssid = row["devmac"]
        ap_info = ap_lookup.get(bssid, {})
        latitude, longitude = pick_coordinates(row, manual_lat, manual_lon)

        for client_mac in associated_clients.keys():
            dedupe_key = (
                client_mac,
                bssid,
                timestamp_to_iso(row["last_time"]),
                "associated-map",
            )

            if dedupe_key in seen:
                continue

            seen.add(dedupe_key)

            payload = clean_payload(
                {
                    "survey_id": survey_id,
                    "bssid": bssid,
                    "ssid": ap_info.get("ssid", ""),
                    "channel": ap_info.get("channel"),
                    "client_mac": client_mac,
                    "client_vendor": resolve_manufacturer(client_mac),
                    "timestamp": timestamp_to_iso(row["last_time"]),
                    "latitude": latitude,
                    "longitude": longitude,
                    "signal_dbm": to_int(row["strongest_signal"]),
                    "relationship_type": "associated",
                }
            )

            client_observations.append(payload)

    return client_observations


# ------------------------------------------------------------
# Main importer
# ------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import a real Kismet .kismet SQLite file into WGIP."
    )

    parser.add_argument(
        "--file",
        required=True,
        help="Path to the .kismet file.",
    )

    parser.add_argument(
        "--api",
        default="http://127.0.0.1:8000",
        help="WGIP backend API base URL.",
    )

    parser.add_argument(
        "--scan-name",
        default="Imported Kismet Scan",
        help="Scan name to save in WGIP.",
    )

    parser.add_argument(
        "--area",
        default="Imported Kismet Area",
        help="Readable area/location label.",
    )

    parser.add_argument(
        "--lat",
        type=float,
        default=None,
        help="Manual latitude fallback if Kismet file has no GPS.",
    )

    parser.add_argument(
        "--lon",
        type=float,
        default=None,
        help="Manual longitude fallback if Kismet file has no GPS.",
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview counts only. Do not send to API.",
    )

    args = parser.parse_args()

    kismet_file = Path(args.file)

    if not kismet_file.exists():
        raise FileNotFoundError(f"Kismet file not found: {kismet_file}")

    device_rows = read_kismet_devices(kismet_file)
    ap_lookup = build_ap_lookup(device_rows)

    wifi_observations_preview = [
        row for row in device_rows if row["type"] == "Wi-Fi AP"
    ]

    manual_lat = args.lat
    manual_lon = args.lon

    if manual_lat is None or manual_lon is None:
        print("NOTE: No manual --lat/--lon was provided.")
        print("If this Kismet file has no GPS, records will import but may not show on the map.")
        print("For demo map points, run with --lat and --lon.")
        print("")

    print("Kismet file:", kismet_file)
    print("Total IEEE802.11 devices:", len(device_rows))
    print("Wi-Fi AP rows:", len(wifi_observations_preview))
    print("AP lookup:", len(ap_lookup))

    if args.dry_run:
        print("")
        print("Dry run only. No records were imported.")
        return

    print("")
    print("Creating WGIP scan record...")

    survey_payload = clean_payload(
        {
            "survey_name": args.scan_name,
            "name": args.scan_name,
            "location_name": args.area,
            "location": args.area,
            "area_label": args.area,
            "latitude": manual_lat,
            "longitude": manual_lon,
        }
    )

    survey_response = api_post(args.api, "/surveys", survey_payload)
    survey_id = (
        survey_response.get("id")
        or survey_response.get("survey_id")
        or survey_response.get("scan_id")
    )

    if not survey_id:
        raise RuntimeError(f"Survey created but no ID was returned: {survey_response}")

    print(f"Created scan/survey ID: {survey_id}")

    wifi_payloads = build_wifi_observations(
        device_rows=device_rows,
        survey_id=int(survey_id),
        manual_lat=manual_lat,
        manual_lon=manual_lon,
        area_label=args.area,
    )

    client_payloads = build_client_observations_from_clients(
        device_rows=device_rows,
        ap_lookup=ap_lookup,
        survey_id=int(survey_id),
        manual_lat=manual_lat,
        manual_lon=manual_lon,
        area_label=args.area,
    )

    associated_payloads = build_client_observations_from_aps(
        device_rows=device_rows,
        ap_lookup=ap_lookup,
        survey_id=int(survey_id),
        manual_lat=manual_lat,
        manual_lon=manual_lon,
    )

    all_client_payloads = client_payloads + associated_payloads

    print(f"Wi-Fi observations to import: {len(wifi_payloads)}")
    print(f"Client observations to import: {len(all_client_payloads)}")
    print("")

    inserted_wifi = 0
    inserted_clients = 0
    failed = 0

    for payload in wifi_payloads:
        try:
            api_post(args.api, "/observations", payload)
            inserted_wifi += 1
            print(f"Inserted Wi-Fi: {payload.get('bssid')} / {payload.get('ssid')}")
        except Exception as exc:
            failed += 1
            print(f"Failed Wi-Fi: {payload.get('bssid')} -> {exc}")

    for payload in all_client_payloads:
        try:
            api_post(args.api, "/client-observations", payload)
            inserted_clients += 1
            print(
                f"Inserted Client: {payload.get('client_mac')} -> {payload.get('bssid')}"
            )
        except Exception as exc:
            failed += 1
            print(
                f"Failed Client: {payload.get('client_mac')} -> {payload.get('bssid')} -> {exc}"
            )

    print("")
    print("Import completed.")
    print(f"Scan ID: {survey_id}")
    print(f"Wi-Fi inserted: {inserted_wifi}")
    print(f"Client observations inserted: {inserted_clients}")
    print(f"Failed: {failed}")


if __name__ == "__main__":
    main()
