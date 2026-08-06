import sys
import os
from pathlib import Path

# Add project root to Python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json
import requests
import time
from datetime import datetime
from app.utils.kismet_connector import KismetConnector

API_URL = "http://127.0.0.1:8000/observations"  # Remove /api/v1


def ingest_live_kismet(survey_id=1, interval=30):
    """Ingest Kismet data every X seconds"""
    connector = KismetConnector()
    
    print(f"🚀 Starting live Kismet ingestion (interval: {interval}s)")
    print(f"📡 Connecting to Kismet at localhost:2501...")
    
    while True:
        try:
            # Get raw data from Kismet
            raw_data = connector.get_live_data()
            
            if raw_data:
                # Normalize to WGIP format
                normalized = connector.normalize_kismet_data(raw_data)
                
                if normalized:
                    # Add survey_id to each observation
                    for obs in normalized:
                        obs["survey_id"] = survey_id
                    
                    # Send to WGIP bulk API
                    response = requests.post(API_URL, json=normalized)
                    
                    if response.status_code == 200:
                        result = response.json()
                        print(f"✅ [{datetime.now()}] Inserted {result['inserted']} observations")
                    else:
                        print(f"❌ API error: {response.text}")
                else:
                    print(f"⚠️ No valid data from Kismet")
            else:
                print(f"⚠️ No connection to Kismet (waiting...)")
            
            # Wait before next poll
            time.sleep(interval)
            
        except KeyboardInterrupt:
            print("\n🛑 Stopped by user")
            break
        except Exception as e:
            print(f"❌ Error: {e}")
            time.sleep(interval)


if __name__ == "__main__":
    ingest_live_kismet()