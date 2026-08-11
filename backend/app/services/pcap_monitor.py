import time
import threading
from datetime import datetime, timedelta
from app.utils.kismet_connector import KismetConnector
from app.db.database import SessionLocal
from app.models.live_event import LiveEvent
import json

class PCAPMonitor:
    def __init__(self):
        self.kismet_connector = KismetConnector()
        self.last_packet_time = None
        self.is_monitoring = False
        self.monitor_thread = None
        self.pcap_healthy = True
        self.fallback_active = False
        
    def start_monitoring(self):
        """Start the PCAP health monitoring in a background thread"""
        if self.is_monitoring:
            return
            
        self.is_monitoring = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        print("PCAP Monitor started")
        
    def stop_monitoring(self):
        """Stop the PCAP health monitoring"""
        self.is_monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5)
        print("PCAP Monitor stopped")
        
    def _monitor_loop(self):
        """Main monitoring loop - runs in background thread"""
        while self.is_monitoring:
            try:
                self._check_pcap_health()
                time.sleep(5)  # Check every 5 seconds
            except Exception as e:
                print(f"Error in PCAP monitor loop: {e}")
                time.sleep(5)
                
    def _check_pcap_health(self):
        """Check if PCAP is healthy (receiving packets)"""
        try:
            last_packet_time = self.kismet_connector.get_last_packet_time()
            current_time = int(datetime.utcnow().timestamp() * 1000000)  # Microseconds
            
            if last_packet_time is None:
                # No data from Kismet
                if self.pcap_healthy:
                    print("PCAP unhealthy: No data from Kismet")
                    self.pcap_healthy = False
                    self._trigger_fallback()
            else:
                # We have data, check if it's recent (within 30 seconds)
                time_diff = (current_time - last_packet_time) / 1000000  # Convert to seconds
                
                if time_diff > 30:
                    # No packet for 30+ seconds
                    if self.pcap_healthy:
                        print(f"PCAP unhealthy: No packet for {time_diff:.1f} seconds")
                        self.pcap_healthy = False
                        self._trigger_fallback()
                else:
                    # PCAP is healthy
                    if not self.pcap_healthy:
                        print(f"PCAP healthy again: Last packet {time_diff:.1f} seconds ago")
                        self.pcap_healthy = True
                        self._trigger_live()
                        
        except Exception as e:
            print(f"Error checking PCAP health: {e}")
            
    def _trigger_fallback(self):
        """Switch to fallback mode (Temp DB)"""
        if not self.fallback_active:
            self.fallback_active = True
            print("SWITCHING TO FALLBACK MODE - Using Temp DB")
            # In a real implementation, this would signal the frontend/WebSocket to switch
            
    def _trigger_live(self):
        """Switch back to live mode (PCAP)"""
        if self.fallback_active:
            self.fallback_active = False
            print("SWITCHING BACK TO LIVE MODE - Using PCAP")
            # In a real implementation, this would signal the frontend/WebSocket to switch
            
    def save_pcap_data_to_temp_db(self):
        """Save current PCAP data to Temp DB (called periodically or on packet receipt)"""
        try:
            # Get live data from Kismet
            raw_data = self.kismet_connector.get_live_data()
            if not raw_data:
                return
                
            normalized_data = self.kismet_connector.normalize_kismet_data(raw_data)
            
            # Save to database
            db = SessionLocal()
            try:
                for item in normalized_data:
                    # Create LiveEvent record
                    live_event = LiveEvent(
                        event_type="bssid",  # or "packet" depending on data type
                        timestamp=datetime.fromtimestamp(item.get("timestamp", 0)/1000000) if item.get("timestamp") else None,
                        data=json.dumps(item),
                        bssid=item.get("bssid"),
                        channel=item.get("channel"),
                        signal=item.get("rssi"),  # Kismet uses rssi field
                        essid=item.get("ssid")
                    )
                    db.add(live_event)
                db.commit()
                print(f"Saved {len(normalized_data)} PCAP records to Temp DB")
            finally:
                db.close()
                
        except Exception as e:
            print(f"Error saving PCAP data to Temp DB: {e}")

# Global instance
pcap_monitor = PCAPMonitor()