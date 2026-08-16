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

router = APIRouter(prefix="/api/live", tags=["live"])

# Initialize Kismet connector
kismet_connector = KismetConnector()

# Cache for data
cached_networks = []
cache_time = None

def decode_bytes(value):
    """Safely decode bytes to string"""
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode('utf-8', errors='ignore')
    return str(value)

def extract_device_info(device_json):
    """Extract device information from the JSON stored in the device column"""
    try:
        if isinstance(device_json, str):
            data = json.loads(device_json)
        elif isinstance(device_json, bytes):
            data = json.loads(device_json.decode('utf-8', errors='ignore'))
        else:
            return None, None
        
        # Extract name
        name = data.get('kismet.device.base.name', '')
        if not name:
            name = data.get('kismet.device.base.commonname', '')
        if not name:
            name = data.get('kismet.device.base.macaddr', '')
        
        # Extract vendor/manufacturer
        vendor = data.get('kismet.device.base.manuf', '')
        
        # Extract channel
        channel = data.get('kismet.device.base.channel', 1)
        if isinstance(channel, str):
            try:
                channel = int(channel)
            except:
                channel = 1
        
        # Extract encryption
        encryption = data.get('kismet.device.base.crypt', 'Unknown')
        if encryption and encryption != '':
            # Clean up the encryption string
            encryption = encryption.replace(' ', ' ').strip()
        
        # Extract signal
        signal = data.get('kismet.device.base.signal', {})
        if isinstance(signal, dict):
            signal = signal.get('kismet.common.signal.last_signal', -60)
        
        return name, vendor, channel, encryption, signal
    except:
        return None, None, 1, 'Unknown', -60

def get_kismet_networks():
    """Fetch networks from Kismet .kismet file (SQLite)"""
    global cached_networks, cache_time
    
    print("🔍 Fetching networks from Kismet...")
    
    # Check cache (refresh every 2 seconds)
    if cache_time and cached_networks:
        age = (datetime.now() - cache_time).total_seconds()
        if age < 2:
            print(f"ℹ️ Using cached data ({len(cached_networks)} networks, {age:.1f}s old)")
            return cached_networks
    
    # Find the latest .kismet file
    kismet_files = glob.glob(os.path.expanduser("~/Kismet-*.kismet"))
    if not kismet_files:
        print("❌ No .kismet files found")
        return get_mock_networks()
    
    # Get the most recent file
    latest = max(kismet_files, key=os.path.getmtime)
    print(f"📁 Reading from: {latest}")
    
    events = []
    
    try:
        conn = sqlite3.connect(latest)
        cursor = conn.cursor()
        
        # Query for access points - get the JSON data from device column
        cursor.execute("""
            SELECT 
                devmac, 
                device, 
                strongest_signal, 
                type, 
                last_time
            FROM devices 
            WHERE type = 'Wi-Fi AP' OR type = 'Wi-Fi Bridged'
            ORDER BY strongest_signal DESC 
            LIMIT 100
        """)
        
        rows = cursor.fetchall()
        conn.close()
        
        print(f"📊 Found {len(rows)} access points")
        
        for row in rows:
            # Decode MAC address
            devmac = decode_bytes(row[0])
            
            # Skip invalid MACs
            if not devmac or devmac == "" or devmac == "00:00:00:00:00:00":
                continue
            
            # Extract device info from the JSON in the device column
            device_json = row[1] if row[1] is not None else "{}"
            signal = row[2] if row[2] is not None else -60
            device_type = decode_bytes(row[3])
            last_time_val = row[4] if row[4] is not None else time.time()
            
            # Parse the JSON data
            name, vendor, channel, encryption, json_signal = extract_device_info(device_json)
            
            # Use signal from JSON if available, otherwise use the column value
            if json_signal and json_signal != -60:
                signal = json_signal
            
            # Parse last_time
            try:
                if isinstance(last_time_val, (int, float)):
                    last_seen_dt = datetime.fromtimestamp(last_time_val)
                else:
                    last_seen_dt = datetime.now()
            except:
                last_seen_dt = datetime.now()
            
            # Clean up the name
            if not name or name == "":
                name = "Hidden Network"
            
            events.append({
                "bssid": devmac,
                "essid": name,
                "channel": channel if channel else 1,
                "signal": signal,
                "security": encryption if encryption else "Unknown",
                "clients": 0,
                "vendor": vendor if vendor else "",
                "last_seen": last_seen_dt.strftime("%H:%M:%S"),
                "timestamp": last_seen_dt
            })
        
    except Exception as e:
        print(f"❌ Error reading .kismet file: {e}")
        import traceback
        traceback.print_exc()
        return get_mock_networks()
    
    if events:
        print(f"✅ Found {len(events)} networks from .kismet file")
        cached_networks = events
        cache_time = datetime.now()
        return events
    
    print("⚠️ No networks found, using mock data")
    return get_mock_networks()

def get_mock_networks():
    """Return mock networks for testing"""
    now = datetime.now().strftime("%H:%M:%S")
    return [
        {"bssid": "06:5F:67:C3:7A:97", "essid": "master-bedroom_Guest", "channel": 6, "signal": -45, "security": "WPA2-PSK", "clients": 0, "vendor": "", "last_seen": now, "timestamp": datetime.now()},
        {"bssid": "30:16:9D:62:6A:10", "essid": "Janlinksys", "channel": 1, "signal": -58, "security": "WPA2-PSK", "clients": 0, "vendor": "Linksys", "last_seen": now, "timestamp": datetime.now()},
        {"bssid": "00:5F:67:C3:7A:97", "essid": "master-bedroom", "channel": 6, "signal": -45, "security": "WPA2-PSK", "clients": 0, "vendor": "", "last_seen": now, "timestamp": datetime.now()},
        {"bssid": "0E:84:08:40:1C:18", "essid": "Converge_5GHz_U6fu", "channel": 36, "signal": -62, "security": "WPA2-PSK", "clients": 0, "vendor": "Converge", "last_seen": now, "timestamp": datetime.now()},
    ]

def is_kismet_running():
    """Check if Kismet is running"""
    try:
        result = subprocess.run(["pgrep", "kismet"], capture_output=True, text=True)
        return result.returncode == 0 and result.stdout.strip() != ""
    except:
        return False

@router.get("/events", response_model=LiveEventsResponse)
def get_live_events(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get events from Kismet or Temp DB (fallback)"""
    kismet_events = get_kismet_networks()
    if kismet_events:
        events = []
        for event in kismet_events[offset:offset+limit]:
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
                    'last_seen': event['last_seen']
                },
                id=None,
                created_at=event.get('timestamp')
            ))
        return LiveEventsResponse(
            events=events,
            total=len(kismet_events),
            limit=limit,
            offset=offset
        )
    
    events = db.query(LiveEvent).order_by(LiveEvent.created_at.desc()).offset(offset).limit(limit).all()
    total = db.query(LiveEvent).count()
    return LiveEventsResponse(
        events=[LiveEventResponse.from_orm(event) for event in events],
        total=total,
        limit=limit,
        offset=offset
    )

@router.get("/events/recent", response_model=List[LiveEventResponse])
def get_recent_events(
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Get last N events from Kismet"""
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
                    'last_seen': event['last_seen']
                },
                id=None,
                created_at=event.get('timestamp')
            ))
        return events
    
    events = db.query(LiveEvent).order_by(LiveEvent.created_at.desc()).limit(limit).all()
    return [LiveEventResponse.from_orm(event) for event in events]

@router.post("/clear")
def clear_all_data(db: Session = Depends(get_db)):
    """Clear all Temp DB data"""
    db.query(LiveEvent).delete()
    db.commit()
    return {"message": "All Temp DB data cleared"}

@router.post("/clear-old")
def clear_old_data(hours: int = 24, db: Session = Depends(get_db)):
    """Delete data older than X hours"""
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)
    deleted_count = db.query(LiveEvent).filter(LiveEvent.created_at < cutoff_time).delete()
    db.commit()
    return {"message": f"Deleted {deleted_count} records older than {hours} hours"}

@router.get("/export")
def export_to_kismet(db: Session = Depends(get_db)):
    """Export Temp DB data to .kismet"""
    events = db.query(LiveEvent).all()
    kismet_data = []
    for event in events:
        kismet_data.append({
            "bssid": event.bssid,
            "ssid": event.essid,
            "signal": event.signal,
            "channel": event.channel,
            "encryption": event.data.get("encryption", "Unknown") if event.data else "Unknown",
            "timestamp": event.timestamp.isoformat() if event.timestamp else None
        })
    
    return {
        "format": "kismet",
        "data": kismet_data,
        "count": len(kismet_data)
    }

@router.get("/status", response_model=LiveStatsResponse)
def get_live_status(db: Session = Depends(get_db)):
    """Get Temp DB stats (count, oldest, newest)"""
    kismet_events = get_kismet_networks()
    if kismet_events:
        return LiveStatsResponse(
            total_count=len(kismet_events),
            oldest_record=datetime.now() - timedelta(minutes=2),
            newest_record=datetime.now(),
            expires_in_hours=24
        )
    
    total_count = db.query(LiveEvent).count()
    oldest_event = db.query(LiveEvent).order_by(LiveEvent.created_at.asc()).first()
    newest_event = db.query(LiveEvent).order_by(LiveEvent.created_at.desc()).first()
    
    return LiveStatsResponse(
        total_count=total_count,
        oldest_record=oldest_event.created_at if oldest_event else None,
        newest_record=newest_event.created_at if newest_event else None,
        expires_in_hours=24
    )

# Background task to save PCAP data to Temp DB
def save_pcap_to_temp_db():
    """Background function to save PCAP data to Temp DB"""
    pass