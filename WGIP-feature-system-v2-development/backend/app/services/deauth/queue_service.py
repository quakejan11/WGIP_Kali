# app/services/deauth/queue_service.py
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Dict

from app.models.deauth_queue import DeauthQueue
from app.services.deauth.base import DeauthBaseService
from app.services.deauth.device_service import DeauthDeviceService
from app.services.deauth.execution_service import DeauthExecutionService


class DeauthQueueService(DeauthBaseService):
    def __init__(self, db: Session):
        super().__init__(db)
        self.device_service = DeauthDeviceService(db)
        self.execution_service = DeauthExecutionService(db)
    
    def queue_deauth(
        self,
        client_mac: str,
        reason: str,
        operator: str,
        priority: str = "medium"
    ) -> Dict:
        """Queue a deauth request for async processing."""
        
        deauth_device = self.device_service.get_or_create_deauth_device(client_mac)
        deauth_device.status = "pending"
        deauth_device.updated_at = datetime.utcnow()
        
        queue_entry = DeauthQueue(
            deauth_device_id=deauth_device.id,
            client_mac=client_mac,
            reason=reason,
            operator=operator,
            priority=priority,
            status="pending",
            scheduled_at=datetime.utcnow()
        )
        self.db.add(queue_entry)
        self.db.commit()
        
        return {
            "success": True,
            "queue_id": queue_entry.id,
            "client_mac": client_mac,
            "status": "queued"
        }
    
    def process_queue(self, limit: int = 10) -> Dict:
        """Process pending queue entries."""
        pending = self.db.query(DeauthQueue).filter(
            DeauthQueue.status == "pending"
        ).order_by(
            DeauthQueue.priority.desc(),
            DeauthQueue.created_at.asc()
        ).limit(limit).all()
        
        results = []
        for entry in pending:
            entry.status = "processing"
            self.db.commit()
            
            result = self.execution_service.execute_deauth(
                client_mac=entry.client_mac,
                reason=entry.reason,
                operator=entry.operator or "System",
                count=3
            )
            
            entry.retry_count += 1
            if result.get("success", False):
                entry.status = "completed"
                entry.processed_at = datetime.utcnow()
            else:
                if entry.retry_count >= entry.max_retries:
                    entry.status = "failed"
                    entry.error_message = result.get("error", "Max retries exceeded")
                else:
                    entry.status = "pending"
            
            self.db.commit()
            results.append({
                "queue_id": entry.id,
                "client_mac": entry.client_mac,
                "status": entry.status,
                "success": result.get("success", False)
            })
        
        return {
            "processed": len(results),
            "results": results
        }