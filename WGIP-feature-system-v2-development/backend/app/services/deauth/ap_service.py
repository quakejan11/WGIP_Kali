# app/services/deauth/ap_service.py
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict
import logging

from app.models.observation import Observation
from app.services.deauth.base import DeauthBaseService
from app.services.deauth.execution_service import DeauthExecutionService

logger = logging.getLogger(__name__)

class DeauthAPService(DeauthBaseService):
    def __init__(self, db: Session):
        super().__init__(db)
        self.execution_service = DeauthExecutionService(db)
    
    def get_aps(
        self,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Dict:
        """Get unique APs from Observations."""
        try:
            # Query unique BSSIDs (APs) from observations
            query = self.db.query(
                Observation.bssid,
                Observation.ssid,
                Observation.channel,
                Observation.manufacturer,
                func.max(Observation.timestamp).label('last_seen'),
                func.count(Observation.id).label('total_observations')
            ).filter(
                Observation.bssid.isnot(None),
                Observation.bssid != ''
            ).group_by(
                Observation.bssid,
                Observation.ssid,
                Observation.channel,
                Observation.manufacturer
            )
            
            if search:
                search_pattern = f"%{search}%"
                query = query.filter(
                    (Observation.ssid.ilike(search_pattern)) |
                    (Observation.bssid.ilike(search_pattern)) |
                    (Observation.manufacturer.ilike(search_pattern))
                )
            
            total = query.count()
            aps = query.order_by(Observation.ssid.asc()).offset(offset).limit(limit).all()
            
            results = []
            for ap in aps:
                # Count unique client devices connected to this AP
                # Using bssid as the client identifier since we don't have client_mac
                client_count = self.db.query(
                    Observation.bssid
                ).filter(
                    Observation.bssid == ap.bssid
                ).distinct().count()
                
                results.append({
                    "bssid": ap.bssid,
                    "ssid": ap.ssid or "Unknown",
                    "channel": ap.channel,
                    "manufacturer": ap.manufacturer,
                    "last_seen": ap.last_seen,
                    "client_count": client_count,
                    "total_observations": ap.total_observations
                })
            
            return {
                "total": total,
                "aps": results
            }
        except Exception as e:
            logger.error(f"Error in get_aps: {e}")
            return {
                "total": 0,
                "aps": []
            }
    
    def get_ap_clients(self, bssid: str) -> List[Dict]:
        """Get all clients connected to a specific AP."""
        try:
            # Since we don't have client_mac, we'll return the AP itself
            clients = self.db.query(
                Observation.bssid,
                func.max(Observation.timestamp).label('last_seen'),
                func.count(Observation.id).label('observations')
            ).filter(
                Observation.bssid == bssid
            ).group_by(
                Observation.bssid
            ).all()
            
            return [
                {
                    "client_mac": c.bssid,
                    "last_seen": c.last_seen,
                    "observations": c.observations
                }
                for c in clients
            ]
        except Exception as e:
            logger.error(f"Error in get_ap_clients: {e}")
            return []
    
    def deauth_ap_clients(
        self,
        bssid: str,
        reason: str,
        operator: str,
        count: int = 5
    ) -> Dict:
        """Deauth all clients connected to an AP."""
        clients = self.get_ap_clients(bssid)
        
        if not clients:
            return {
                "success": False,
                "error": "No clients found for this AP",
                "bssid": bssid
            }
        
        results = []
        successful = 0
        
        for client in clients:
            client_mac = client["client_mac"]
            result = self.execution_service.execute_deauth(
                client_mac=client_mac,
                reason=f"{reason} (AP: {bssid})",
                operator=operator,
                count=count
            )
            results.append(result)
            if result.get("success", False):
                successful += 1
        
        return {
            "success": successful > 0,
            "bssid": bssid,
            "total_clients": len(clients),
            "successful_deauths": successful,
            "failed_deauths": len(clients) - successful,
            "results": results
        }