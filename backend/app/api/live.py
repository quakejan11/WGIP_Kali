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
import websocket
import threading

router = APIRouter(prefix="/api/live", tags=["live"])

# Initialize Kismet connector
kismet_connector = KismetConnector()

# Cache for data
cached_networks = []
cache_time = None
ws_connected = False
ws_data = []

# WebSocket stop flag
STOP_WEBSOCKET = False

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
            return None, None, 1, 'Unknown', -60
        
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
            except:
                channel = 1
        
        encryption = data.get('kismet.device.base.crypt', 'Unknown')
        if encryption and encryption != '':
            encryption = encryption.replace(' ', ' ').strip()
        
        signal = data.get('kismet.device.base.signal', {})
        if isinstance(signal, dict):
            signal = signal.get('kismet.common.signal.last_signal', -60)
        
        return name, vendor, channel, encryption, signal
    except:
        return None, None, 1, 'Unknown', -60

def stop_websocket_connections():
    """Stop all WebSocket connections"""
    global STOP_WEBSOCKET
    STOP_WEBSOCKET = True
    print("⏹️ WebSocket stop flag set")

def reset_websocket_flag():
    """Reset the WebSocket stop flag"""
    global STOP_WEBSOCKET
    STOP_WEBSOCKET = False
    print("🔄 WebSocket stop flag reset")

def get_networks_from_websocket():
    """Fetch networks via Kismet WebSocket API"""
    global STOP_WEBSOCKET
    
    # Check if we should stop
    if STOP_WEBSOCKET:
        print("⏹️ WebSocket connection stopped by user")
        return []
    
    try:
        import websocket
        import json
        
        # Use the correct credentials from auth file
        username = "enigma"
        password = "011101"
        
        ws_url = f"ws://localhost:2501/eventbus/events.ws?user={username}&password={password}"
        print(f"🔍 Connecting to WebSocket with username: {username}")
        
        ws = websocket.create_connection(ws_url, timeout=5)
        print("✅ Connected to WebSocket")
        
        # Send GET_DEVICES command
        msg = {
            "cmd": "GET_DEVICES",
            "fields": [
                "kismet.device.base.name",
                "kismet.device.base.macaddr",
                "kismet.device.base.signal/kismet.device.base.signal_dbm",
                "kismet.device.base.channel",
                "kismet.device.base.encryption",
                "kismet.device.base.vendor",
                "kismet.device.base.type"
            ]
        }
        
        ws.send(json.dumps(msg))
        print("📤 Sent GET_DEVICES request")
        
        ws.settimeout(5)
        response = ws.recv()
        ws.close()
        
        if response:
            print("📥 Received response")
            data = json.loads(response)
            events = []
            
            if isinstance(data, list):
                for device in data:
                    device_type = device.get('kismet.device.base.type', '')
                    if device_type == 'Wi-Fi AP' or device_type == 'ap':
                        bssid = device.get('kismet.device.base.macaddr', '')
                        if not bssid or bssid == '00:00:00:00:00:00':
                            continue
                        
                        signal_data = device.get('kismet.device.base.signal', {})
                        if isinstance(signal_data, dict):
                            signal = signal_data.get('kismet.common.signal.last_signal', -60)
                        else:
                            signal = -60
                        
                        events.append({
                            "bssid": bssid,
                            "essid": device.get('kismet.device.base.name', 'Unknown'),
                            "channel": device.get('kismet.device.base.channel', 1),
                            "signal": signal,
                            "security": device.get('kismet.device.base.encryption', 'Unknown'),
                            "clients": 0,
                            "vendor": device.get('kismet.device.base.vendor', ''),
                            "last_seen": datetime.now().strftime("%H:%M:%S"),
                            "timestamp": datetime.now()
                        })
            
            return events
    except websocket.WebSocketConnectionClosedException:
        print("❌ WebSocket connection closed")
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
    
    return []

def get_kismet_networks():
    """Fetch networks from Kismet via WebSocket or .kismet file"""
    global cached_networks, cache_time, STOP_WEBSOCKET
    
    print("🔍 Fetching networks from Kismet...")
    
    # Check if WebSocket is stopped
    if STOP_WEBSOCKET:
        print("⏹️ WebSocket is stopped, returning empty")
        return []
    
    # Check cache
    if cache_time and cached_networks:
        age = (datetime.now() - cache_time).total_seconds()
        if age < 2:
            print(f"ℹ️ Using cached data ({len(cached_networks)} networks, {age:.1f}s old)")
            return cached_networks
    
    # Check if Kismet is running
    if not is_kismet_running():
        print("❌ Kismet is not running")
        return []
    
    # Try WebSocket first
    events = get_networks_from_websocket()
    if events:
        print(f"✅ Found {len(events)} networks from WebSocket")
        cached_networks = events
        cache_time = datetime.now()
        return events
    
    # Fallback to .kismet file
    events = get_networks_from_file()
    if events:
        print(f"✅ Found {len(events)} networks from .kismet file")
        cached_networks = events
        cache_time = datetime.now()
        return events
    
    print("ℹ️ No networks found")
    return []

def get_networks_from_file():
    """Read networks from .kismet file"""
    kismet_files = glob.glob(os.path.expanduser("~/Kismet-*.kismet"))
    if not kismet_files:
        print("❌ No .kismet files found")
        return []
    
    latest = max(kismet_files, key=os.path.getmtime)
    print(f"📁 Reading from: {latest}")
    
    try:
        conn = sqlite3.connect(latest)
        cursor = conn.cursor()
        
        # Check if devices table exists
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
        
        events = []
        for row in rows:
            devmac = decode_bytes(row[0])
            if not devmac or devmac == "00:00:00:00:00:00":
                continue
            
            device_json = row[1] if row[1] is not None else "{}"
            signal = row[2] if row[2] is not None else -60
            last_time_val = row[3] if row[3] is not None else time.time()
            
            name, vendor, channel, encryption, json_signal = extract_device_info(device_json)
            
            if json_signal and json_signal != -60:
                signal = json_signal
            
            try:
                if isinstance(last_time_val, (int, float)):
                    last_seen_dt = datetime.fromtimestamp(last_time_val)
                else:
                    last_seen_dt = datetime.now()
            except:
                last_seen_dt = datetime.now()
            
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
        
        return events
    except Exception as e:
        print(f"❌ Error reading .kismet file: {e}")
        return []

def is_kismet_running():
    """Check if Kismet is running"""
    try:
        result = subprocess.run(["pgrep", "kismet"], capture_output=True, text=True)
        return result.returncode == 0 and result.stdout.strip() != ""
    except:
        return False

def invalidate_cache():
    """Invalidate the cache"""
    global cached_networks, cache_time
    cached_networks = []
    cache_time = None
    print("🔄 Cache invalidated")

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
    invalidate_cache()
    return {"message": "All Temp DB data cleared"}

@router.post("/clear-old")
def clear_old_data(hours: int = 24, db: Session = Depends(get_db)):
    """Delete data older than X hours"""
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)
    deleted_count = db.query(LiveEvent).filter(LiveEvent.created_at < cutoff_time).delete()
    db.commit()
    invalidate_cache()
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