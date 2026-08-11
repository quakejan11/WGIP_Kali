#!/usr/bin/env python3
"""
Script to export Temp DB data to .kismet format for the Live Operation feature.
"""
import subprocess
import sys
import os
from pathlib import Path

# Add the backend directory to the path so we can import app modules
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.database import SessionLocal
from app.models.live_event import LiveEvent
import json
from datetime import datetime

def export_to_kismet():
    """Export Temp DB data to .kismet format"""
    db = SessionLocal()
    try:
        events = db.query(LiveEvent).all()
        
        # Convert to Kismet format
        kismet_data = []
        for event in events:
            # Parse the data JSON if it exists
            data_dict = {}
            if event.data:
                try:
                    data_dict = json.loads(event.data)
                except:
                    data_dict = {}
            
            kismet_data.append({
                "bssid": event.bssid or "",
                "ssid": event.essid or "",
                "signal": event.signal if event.signal is not None else 0,
                "channel": event.channel if event.channel is not None else 0,
                "encryption": data_dict.get("encryption", "Unknown"),
                "timestamp": event.timestamp.isoformat() if event.timestamp else "",
                "latitude": data_dict.get("latitude", ""),
                "longitude": data_dict.get("longitude", ""),
                "manufacturer": data_dict.get("manufacturer", "Unknown")
            })
        
        # Create output filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"live_export_{timestamp}.kismet"
        filepath = backend_dir / "db_dumps" / filename
        
        # Ensure the directory exists
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        # Write to file
        with open(filepath, 'w') as f:
            json.dump(kismet_data, f, indent=2)
        
        print(f"Exported {len(kismet_data)} records to {filepath}")
        return str(filepath)
        
    except Exception as e:
        print(f"Error exporting data: {e}")
        return None
    finally:
        db.close()

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--help":
        print("Usage: export_live_data.py [--help]")
        print("Exports Temp DB data to .kismet format")
        return
    
    filepath = export_to_kismet()
    if filepath:
        print(f"Success: Data exported to {filepath}")
        sys.exit(0)
    else:
        print("Error: Failed to export data")
        sys.exit(1)

if __name__ == "__main__":
    main()