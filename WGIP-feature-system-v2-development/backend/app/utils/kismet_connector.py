import requests
import json
from datetime import datetime
import sys
from pathlib import Path

# Ensure app is in path if running from scripts
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

class KismetConnector:
    def __init__(self, kismet_url="http://localhost:2501"):
        self.kismet_url = kismet_url
        self.session = requests.Session()
    
    def get_live_data(self):
        """Fetch current Kismet data from DragonOS"""
        try:
            # Kismet REST API endpoint for access points
            response = self.session.get(
                f"{self.kismet_url}/devices/views/last-time",
                params={"duration": 60}  # Last 60 seconds
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Kismet API error: {response.status_code}")
                return None
        except Exception as e:
            print(f"Connection error: {e}")
            return None
    
    def normalize_kismet_data(self, raw_data):
        """Convert Kismet format to WGIP format"""
        normalized = []
        
        for device in raw_data:
            # Kismet uses different field names
            obs = {
                "bssid": device.get("kismet.device.base.macaddr"),
                "ssid": device.get("kismet.device.base.name", "Unknown"),
                "rssi": device.get("kismet.device.base.signal", -100),
                "channel": device.get("kismet.device.base.channel", 0),
                "latitude": device.get("kismet.device.base.location", {}).get("lat"),
                "longitude": device.get("kismet.device.base.location", {}).get("lon"),
                "encryption": self._detect_encryption(device)
            }
            normalized.append(obs)
        
        return normalized
    
    def _detect_encryption(self, device):
        """Detect encryption type from Kismet data"""
        crypto = device.get("kismet.device.base.crypto", "")
        if "wpa2" in crypto.lower():
            return "WPA2"
        elif "wpa" in crypto.lower():
            return "WPA"
        elif "wep" in crypto.lower():
            return "WEP"
        elif "open" in crypto.lower():
            return "Open"
        return "Unknown"