from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.models.live_event import LiveEvent
from app.schemas.live import LiveEventCreate, LiveEventResponse, LiveStatsResponse, LiveEventsResponse
from app.utils.kismet_connector import KismetConnector
import json
from datetime import datetime, timedelta
import subprocess
import os
import glob
import sqlite3
import time
import requests
from requests.auth import HTTPBasicAuth

router = APIRouter(prefix="/api/live", tags=["live"])

# Initialize Kismet connector
kismet_connector = KismetConnector()

# Kismet REST API config
KISMET_USER = "wardriving"
KISMET_PASS = "kali"
KISMET_BASE = "http://localhost:2501"

# Cache for data
cached_networks = []
cache_time = None

# GPS cache (Kismet updates ~1Hz; no need to hammer the endpoint)
cached_gps = None
gps_cache_time = None
GPS_CACHE_SECONDS = 1.0

# Stop flag (kept for API compatibility with kismet.py)
STOP_WEBSOCKET = False


def decode_bytes(value):
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode('utf-8', errors='ignore')
    return str(value)


def count_clients(dev: dict) -> int:
    """
    Count clients associated with an AP from Kismet's device record.

    Modern Kismet exposes:
      - dot11.device.num_associated_clients  → int, pre-computed count
      - dot11.device.associated_client_map   → dict, {mac: {...}}

    Older/alternate builds exposed client maps nested under
    dot11.device.advertised_ssid_map[*].dot11.advertised_ssid.client_map
    (note: no underscore between 'advertised' and 'ssid' in the inner keys).
    Fall through to those older shapes for compatibility.
    """
    try:
        dot11 = dev.get("dot11.device")
        if not isinstance(dot11, dict):
            return 0

        # Preferred: pre-computed integer
        n = dot11.get("dot11.device.num_associated_clients")
        if isinstance(n, int) and n >= 0:
            return n

        # Fallback: count the associated_client_map
        acm = dot11.get("dot11.device.associated_client_map")
        if isinstance(acm, dict):
            return len(acm)
        if isinstance(acm, list):
            return len(acm)

        # Legacy fallback: advertised_ssid_map[*].dot11.advertisedssid.client_map
        ssid_map = dot11.get("dot11.device.advertised_ssid_map")
        if not ssid_map:
            return 0

        entries = ssid_map.values() if isinstance(ssid_map, dict) else ssid_map

        total = 0
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            # Try both spellings, plus the map directly on the entry
            for key in (
                "dot11.advertisedssid.client_map",
                "dot11.advertised_ssid.client_map",
                "dot11.advertisedssid.associated_client_map",
                "dot11.advertised_ssid.associated_client_map",
            ):
                cm = entry.get(key)
                if isinstance(cm, dict):
                    total += len(cm)
                    break
                if isinstance(cm, list):
                    total += len(cm)
                    break

        return total
    except Exception as e:
        print(f"⚠️ count_clients failed: {e}")
        return 0


def extract_device_info(device_json):
    """
    Parse a Kismet device JSON blob.
    Returns (name, vendor, channel, encryption, signal, clients).
    """
    try:
        if isinstance(device_json, str):
            data = json.loads(device_json)
        elif isinstance(device_json, bytes):
            data = json.loads(device_json.decode('utf-8', errors='ignore'))
        else:
            return None, None, 1, 'Unknown', -60, 0

        name = data.get('kismet.device.base.name', '')
        if not name:
            name = data.get('kismet.device.base.commonname', '')
        if not name:
            name = data.get('kismet.device.base.macaddr', '')

        vendor = data.get('kismet.device.base.manuf', '')
        channel = data.get('kismet.device.base.channel', 1)
        if isinstance(channel, str):
            try:
                channel = int(channel)
            except Exception:
                channel = 1

        encryption = data.get('kismet.device.base.crypt', 'Unknown')
        if encryption:
            encryption = encryption.strip()

        signal = data.get('kismet.device.base.signal', {})
        if isinstance(signal, dict):
            signal = signal.get('kismet.common.signal.last_signal', -60)

        clients = count_clients(data)

        return name, vendor, channel, encryption, signal, clients
    except Exception:
        return None, None, 1, 'Unknown', -60, 0


def stop_websocket_connections():
    global STOP_WEBSOCKET
    STOP_WEBSOCKET = True
    print("⏹️ Stop flag set")


def reset_websocket_flag():
    global STOP_WEBSOCKET
    STOP_WEBSOCKET = False
    print("🔄 Stop flag reset")


def is_kismet_running():
    """Check Kismet by hitting its REST API (accurate)."""
    try:
        r = requests.get(
            f"{KISMET_BASE}/system/status.json",
            auth=HTTPBasicAuth(KISMET_USER, KISMET_PASS),
            timeout=2,
        )
        return r.status_code == 200
    except requests.exceptions.RequestException:
        return False


# ---------------- GPS ----------------

def get_gps_location(force: bool = False) -> Optional[dict]:
    """
    Fetch the current best GPS location from Kismet.

    Kismet returns geopoint as [longitude, latitude]; we normalize to
    lat/lon keys for the API and frontend. Cached for GPS_CACHE_SECONDS.
    Returns None if Kismet is unreachable or there's no usable fix.
    """
    global cached_gps, gps_cache_time

    now = datetime.now()
    if (
        not force
        and cached_gps is not None
        and gps_cache_time is not None
        and (now - gps_cache_time).total_seconds() < GPS_CACHE_SECONDS
    ):
        return cached_gps

    try:
        r = requests.get(
            f"{KISMET_BASE}/gps/location.json",
            auth=HTTPBasicAuth(KISMET_USER, KISMET_PASS),
            timeout=2,
        )
        r.raise_for_status()
        data = r.json()
    except requests.exceptions.RequestException as e:
        print(f"❌ Kismet GPS error: {e}")
        cached_gps = None
        gps_cache_time = now
        return None
    except ValueError as e:
        print(f"❌ Kismet GPS JSON error: {e}")
        cached_gps = None
        gps_cache_time = now
        return None

    geopoint = data.get("kismet.common.location.geopoint")
    fix = data.get("kismet.common.location.fix", 0)

    # fix: 0 = no GPS, 1 = no fix, 2 = 2D, 3 = 3D
    if not geopoint or len(geopoint) != 2 or fix in (0, 1):
        cached_gps = None
        gps_cache_time = now
        return None

    lon, lat = geopoint  # Kismet returns [lon, lat]

    result = {
        "lat": lat,
        "lon": lon,
        "alt": data.get("kismet.common.location.alt"),
        "speed": data.get("kismet.common.location.speed"),
        "heading": data.get("kismet.common.location.heading"),
        "fix": fix,
        "time": data.get("kismet.common.location.time_sec"),
        "gps_uuid": data.get("kismet.common.location.gps_uuid"),
        "updated_at": now.isoformat(),
    }

    cached_gps = result
    gps_cache_time = now
    return result


# ---------------- Networks ----------------

def get_networks_from_kismet_rest():
    """Fetch Wi-Fi APs from Kismet REST API."""
    global STOP_WEBSOCKET
    if STOP_WEBSOCKET:
        print("⏹️ Fetch stopped by user")
        return []

    try:
        r = requests.get(
            f"{KISMET_BASE}/devices/views/phydot11_accesspoints/devices.json",
            auth=HTTPBasicAuth(KISMET_USER, KISMET_PASS),
            timeout=5,
        )
        r.raise_for_status()
        devices = r.json()
    except requests.exceptions.RequestException as e:
        print(f"❌ Kismet REST error: {e}")
        return []

    if not isinstance(devices, list):
        print(f"⚠️ Unexpected REST response type: {type(devices)}")
        return []

    if not devices:
        print("ℹ️ REST returned 0 APs (Kismet may still be warming up)")
        return []

    # Grab current GPS once for this batch
    gps = get_gps_location()

    events = []
    for dev in devices:
        bssid = dev.get("kismet.device.base.macaddr", "")
        if not bssid or bssid == "00:00:00:00:00:00":
            continue

        sig_field = dev.get("kismet.device.base.signal", {})
        if isinstance(sig_field, dict):
            signal = sig_field.get("kismet.common.signal.last_signal", -60)
        else:
            signal = -60

        last_time = dev.get("kismet.device.base.last_time", time.time())
        try:
            last_seen_dt = datetime.fromtimestamp(last_time) if last_time else datetime.now()
        except Exception:
            last_seen_dt = datetime.now()

        event = {
            "bssid": bssid,
            "essid": dev.get("kismet.device.base.name") or "Hidden Network",
            "channel": dev.get("kismet.device.base.channel", 1),
            "signal": signal,
            "security": dev.get("kismet.device.base.crypt", "Unknown"),
            "clients": count_clients(dev),
            "vendor": dev.get("kismet.device.base.manuf", ""),
            "last_seen": last_seen_dt.strftime("%H:%M:%S"),
            "timestamp": last_seen_dt,
            # GPS snapshot attached to each event
            "lat": gps["lat"] if gps else None,
            "lon": gps["lon"] if gps else None,
            "alt": gps["alt"] if gps else None,
            "gps_fix": gps["fix"] if gps else None,
        }
        events.append(event)

    return events


def get_networks_from_file():
    """Read networks from .kismet file (fallback)."""
    kismet_files = glob.glob(os.path.expanduser("~/Kismet-*.kismet"))
    if not kismet_files:
        kismet_files = glob.glob("/root/Kismet-*.kismet")
    if not kismet_files:
        print("❌ No .kismet files found")
        return []

    latest = max(kismet_files, key=os.path.getmtime)
    print(f"📁 Reading from: {latest}")

    try:
        conn = sqlite3.connect(latest)
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='devices'")
        if not cursor.fetchone():
            print("❌ Devices table does not exist")
            conn.close()
            return []

        cursor.execute("SELECT COUNT(*) FROM devices")
        total_count = cursor.fetchone()[0]
        print(f"📊 Total devices: {total_count}")
        if total_count == 0:
            print("⏳ No devices yet")
            conn.close()
            return []

        cursor.execute("""
            SELECT devmac, device, strongest_signal, last_time
            FROM devices
            WHERE type = 'Wi-Fi AP' OR type = 'Wi-Fi Bridged'
            ORDER BY strongest_signal DESC
            LIMIT 100
        """)
        rows = cursor.fetchall()
        conn.close()

        gps = get_gps_location()  # snapshot current GPS too

        events = []
        for row in rows:
            devmac = decode_bytes(row[0])
            if not devmac or devmac == "00:00:00:00:00:00":
                continue

            device_json = row[1] if row[1] is not None else "{}"
            signal = row[2] if row[2] is not None else -60
            last_time_val = row[3] if row[3] is not None else time.time()

            name, vendor, channel, encryption, json_signal, clients = extract_device_info(device_json)
            if json_signal and json_signal != -60:
                signal = json_signal

            try:
                last_seen_dt = (
                    datetime.fromtimestamp(last_time_val)
                    if isinstance(last_time_val, (int, float))
                    else datetime.now()
                )
            except Exception:
                last_seen_dt = datetime.now()

            if not name:
                name = "Hidden Network"

            events.append({
                "bssid": devmac,
                "essid": name,
                "channel": channel if channel else 1,
                "signal": signal,
                "security": encryption if encryption else "Unknown",
                "clients": clients,
                "vendor": vendor if vendor else "",
                "last_seen": last_seen_dt.strftime("%H:%M:%S"),
                "timestamp": last_seen_dt,
                "lat": gps["lat"] if gps else None,
                "lon": gps["lon"] if gps else None,
                "alt": gps["alt"] if gps else None,
                "gps_fix": gps["fix"] if gps else None,
            })
        return events
    except Exception as e:
        print(f"❌ Error reading .kismet file: {e}")
        return []


def get_kismet_networks():
    """Fetch networks from Kismet REST API, fallback to .kismet file."""
    global cached_networks, cache_time, STOP_WEBSOCKET

    print("🔍 Fetching networks from Kismet...")

    if STOP_WEBSOCKET:
        print("⏹️ Fetch stopped, returning empty")
        return []

    if cache_time and cached_networks:
        age = (datetime.now() - cache_time).total_seconds()
        if age < 2:
            print(f"ℹ️ Using cached data ({len(cached_networks)} networks, {age:.1f}s old)")
            return cached_networks

    if not is_kismet_running():
        print("❌ Kismet is not running")
        return []

    events = get_networks_from_kismet_rest()
    if events:
        print(f"✅ Found {len(events)} networks from REST")
        cached_networks = events
        cache_time = datetime.now()
        return events

    events = get_networks_from_file()
    if events:
        print(f"✅ Found {len(events)} networks from .kismet file")
        cached_networks = events
        cache_time = datetime.now()
        return events

    print("ℹ️ No networks found")
    return []


def invalidate_cache():
    global cached_networks, cache_time, cached_gps, gps_cache_time
    cached_networks = []
    cache_time = None
    cached_gps = None
    gps_cache_time = None
    print("🔄 Cache invalidated")


# ---------------- Routes ----------------

@router.get("/events", response_model=LiveEventsResponse)
def get_live_events(limit: int = 100, offset: int = 0, db: Session = Depends(get_db)):
    kismet_events = get_kismet_networks()
    if kismet_events:
        events = []
        for event in kismet_events[offset:offset + limit]:
            events.append(LiveEventResponse(
                bssid=event['bssid'],
                essid=event['essid'],
                channel=event['channel'],
                signal=event['signal'],
                event_type='kismet_network',
                timestamp=event.get('timestamp'),
                data={
                    'security': event['security'],
                    'clients': event['clients'],
                    'vendor': event.get('vendor', ''),
                    'last_seen': event['last_seen'],
                    'lat': event.get('lat'),
                    'lon': event.get('lon'),
                    'alt': event.get('alt'),
                    'gps_fix': event.get('gps_fix'),
                },
                id=None,
                created_at=event.get('timestamp'),
            ))
        return LiveEventsResponse(
            events=events,
            total=len(kismet_events),
            limit=limit,
            offset=offset,
        )

    events = db.query(LiveEvent).order_by(LiveEvent.created_at.desc()).offset(offset).limit(limit).all()
    total = db.query(LiveEvent).count()
    return LiveEventsResponse(
        events=[LiveEventResponse.from_orm(e) for e in events],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/events/recent", response_model=List[LiveEventResponse])
def get_recent_events(limit: int = 10, db: Session = Depends(get_db)):
    kismet_events = get_kismet_networks()
    if kismet_events:
        events = []
        for event in kismet_events[:limit]:
            events.append(LiveEventResponse(
                bssid=event['bssid'],
                essid=event['essid'],
                channel=event['channel'],
                signal=event['signal'],
                event_type='kismet_network',
                timestamp=event.get('timestamp'),
                data={
                    'security': event['security'],
                    'clients': event['clients'],
                    'vendor': event.get('vendor', ''),
                    'last_seen': event['last_seen'],
                    'lat': event.get('lat'),
                    'lon': event.get('lon'),
                    'alt': event.get('alt'),
                    'gps_fix': event.get('gps_fix'),
                },
                id=None,
                created_at=event.get('timestamp'),
            ))
        return events

    events = db.query(LiveEvent).order_by(LiveEvent.created_at.desc()).limit(limit).all()
    return [LiveEventResponse.from_orm(e) for e in events]


@router.get("/gps")
def get_live_gps():
    """
    Current best GPS fix from Kismet.
    Returns 503 if Kismet is unreachable or has no usable fix.
    """
    if not is_kismet_running():
        raise HTTPException(status_code=503, detail="Kismet is not running")

    gps = get_gps_location()
    if not gps:
        raise HTTPException(status_code=503, detail="No GPS fix available")

    return gps


@router.get("/gps/all")
def get_all_gps():
    """List every GPS device Kismet knows about (driver, name, UUID)."""
    try:
        r = requests.get(
            f"{KISMET_BASE}/gps/all_gps.json",
            auth=HTTPBasicAuth(KISMET_USER, KISMET_PASS),
            timeout=3,
        )
        r.raise_for_status()
        return r.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Kismet GPS list error: {e}")


@router.post("/clear")
def clear_all_data(db: Session = Depends(get_db)):
    db.query(LiveEvent).delete()
    db.commit()
    invalidate_cache()
    return {"message": "All Temp DB data cleared"}


@router.post("/clear-old")
def clear_old_data(hours: int = 24, db: Session = Depends(get_db)):
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)
    deleted_count = db.query(LiveEvent).filter(LiveEvent.created_at < cutoff_time).delete()
    db.commit()
    invalidate_cache()
    return {"message": f"Deleted {deleted_count} records older than {hours} hours"}


@router.get("/export")
def export_to_kismet(db: Session = Depends(get_db)):
    events = db.query(LiveEvent).all()
    kismet_data = []
    for event in events:
        kismet_data.append({
            "bssid": event.bssid,
            "ssid": event.essid,
            "signal": event.signal,
            "channel": event.channel,
            "encryption": event.data.get("encryption", "Unknown") if event.data else "Unknown",
            "timestamp": event.timestamp.isoformat() if event.timestamp else None,
        })
    return {"format": "kismet", "data": kismet_data, "count": len(kismet_data)}


@router.get("/status", response_model=LiveStatsResponse)
def get_live_status(db: Session = Depends(get_db)):
    kismet_events = get_kismet_networks()
    if kismet_events:
        return LiveStatsResponse(
            total_count=len(kismet_events),
            oldest_record=datetime.now() - timedelta(minutes=2),
            newest_record=datetime.now(),
            expires_in_hours=24,
        )

    total_count = db.query(LiveEvent).count()
    oldest_event = db.query(LiveEvent).order_by(LiveEvent.created_at.asc()).first()
    newest_event = db.query(LiveEvent).order_by(LiveEvent.created_at.desc()).first()

    return LiveStatsResponse(
        total_count=total_count,
        oldest_record=oldest_event.created_at if oldest_event else None,
        newest_record=newest_event.created_at if newest_event else None,
        expires_in_hours=24,
    )


def save_pcap_to_temp_db():
    """Placeholder."""
    pass