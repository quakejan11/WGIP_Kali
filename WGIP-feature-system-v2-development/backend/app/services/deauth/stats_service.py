# app/services/deauth/stats_service.py
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict

from app.models.deauth_device import DeauthDevice
from app.models.deauth_log import DeauthLog
from app.models.deauth_queue import DeauthQueue
from app.services.deauth.base import DeauthBaseService


class DeauthStatsService(DeauthBaseService):
    def __init__(self, db: Session):
        super().__init__(db)
    
    def get_stats(self) -> Dict:
        """Get deauth statistics."""
        total_devices = self.db.query(DeauthDevice).count()
        
        status_counts = self.db.query(
            DeauthDevice.status,
            func.count(DeauthDevice.id).label('count')
        ).group_by(DeauthDevice.status).all()
        
        total_logs = self.db.query(DeauthLog).count()
        successful_logs = self.db.query(DeauthLog).filter(
            DeauthLog.success == True
        ).count()
        
        queue_pending = self.db.query(DeauthQueue).filter(
            DeauthQueue.status == "pending"
        ).count()
        
        return {
            "total_devices": total_devices,
            "status_counts": {s.status: s.count for s in status_counts},
            "total_attempts": total_logs,
            "successful_deauths": successful_logs,
            "success_rate": (successful_logs / total_logs * 100) if total_logs > 0 else 0,
            "queue_pending": queue_pending
        }
    
    def get_logs(self, limit: int = 100, offset: int = 0) -> List[DeauthLog]:
        """Get deauth logs."""
        return self.db.query(DeauthLog).order_by(
            DeauthLog.executed_at.desc()
        ).offset(offset).limit(limit).all()