# app/services/deauth_service.py
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import List, Optional, Dict
import logging
import subprocess

from app.models.deauth_device import DeauthDevice
from app.models.deauth_log import DeauthLog
from app.models.deauth_queue import DeauthQueue
from app.models.device_profile import DeviceProfile
from app.models.observation import Observation

logger = logging.getLogger(__name__)

class DeauthService:
    def __init__(self, db: Session):
        self.db = db
    
    # ============ Device Management ============
    
    def get_or_create_deauth_device(self, client_mac: str) -> DeauthDevice:
        """Get existing deauth device or create new one."""
        device = self.db.query(DeauthDevice).filter(
            DeauthDevice.client_mac == client_mac
        ).first()
        
        if not device:
            # Try to find device_profile_id
            device_profile = self.db.query(DeviceProfile).filter(
                DeviceProfile.client_mac == client_mac
            ).first()
            
            device = DeauthDevice(
                client_mac=client_mac,
                device_profile_id=device_profile.id if device_profile else None,
                status="active"
            )
            self.db.add(device)
            self.db.commit()
            self.db.refresh(device)
        
        return device
    
    def flag_device(self, client_mac: str, reason: str, operator: str) -> Dict:
        """Flag a device for deauthentication."""
        device = self.get_or_create_deauth_device(client_mac)
        device.status = "flagged"
        device.notes = reason
        device.updated_at = datetime.utcnow()
        
        # Also update DeviceProfile notes if available
        device_profile = self.db.query(DeviceProfile).filter(
            DeviceProfile.client_mac == client_mac
        ).first()
        if device_profile:
            if device_profile.notes:
                device_profile.notes += f"\n[DEAUTH FLAG] {reason} (by {operator})"
            else:
                device_profile.notes = f"[DEAUTH FLAG] {reason} (by {operator})"
        
        self.db.commit()
        
        return {
            "success": True,
            "device_id": device.id,
            "client_mac": device.client_mac,
            "status": device.status
        }
    
    def get_flagged_devices(
        self,
        status: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[DeauthDevice]:
        """Get flagged devices with filters."""
        query = self.db.query(DeauthDevice)
        
        if status:
            query = query.filter(DeauthDevice.status == status)
        
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                (DeauthDevice.client_mac.ilike(search_pattern)) |
                (DeauthDevice.display_name.ilike(search_pattern)) |
                (DeauthDevice.notes.ilike(search_pattern))
            )
        
        return query.order_by(DeauthDevice.updated_at.desc()).offset(offset).limit(limit).all()
    
    def update_device_status(
        self,
        client_mac: str,
        status: str,
        notes: Optional[str] = None
    ) -> Dict:
        """Update device status."""
        device = self.db.query(DeauthDevice).filter(
            DeauthDevice.client_mac == client_mac
        ).first()
        
        if not device:
            return {"success": False, "error": "Device not found"}
        
        device.status = status
        if notes:
            device.notes = notes
        device.updated_at = datetime.utcnow()
        
        self.db.commit()
        
        return {
            "success": True,
            "client_mac": device.client_mac,
            "status": device.status
        }
    
    # ============ Deauth Execution ============
    
    def execute_deauth(
        self,
        client_mac: str,
        reason: str,
        operator: str,
        count: int = 5
    ) -> Dict:
        """
        Execute deauth using external tool (aireplay-ng).
        MOCK mode for Windows testing - always returns success.
        """
        # Get deauth device
        deauth_device = self.db.query(DeauthDevice).filter(
            DeauthDevice.client_mac == client_mac
        ).first()
        
        if not deauth_device:
            deauth_device = self.get_or_create_deauth_device(client_mac)
        
        # Get latest location from observations
        latest_obs = self.db.query(Observation).filter(
            Observation.bssid == client_mac
        ).order_by(Observation.timestamp.desc()).first()
        
        # ============================================================
        # MOCK MODE: For Windows testing (always returns success)
        # ============================================================
        logger.info(f"MOCK: Deauth executed for {client_mac} (Windows testing)")
        success = True
        error_message = None
        
        # ============================================================
        # REAL CODE FOR KALI LINUX - Comment this block when on Windows
        # Uncomment when deploying to Kali
        # ============================================================
        # try:
        #     interface = "wlan0mon"  # Change to your interface
        #     cmd = [
        #         "sudo", "aireplay-ng",
        #         "-0", str(count),
        #         "-a", client_mac,
        #         interface
        #     ]
        #     logger.info(f"Executing: {' '.join(cmd)}")
        #     result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        #     success = result.returncode == 0
        #     error_message = result.stderr if not success else None
        # except subprocess.TimeoutExpired:
        #     success = False
        #     error_message = "Deauth command timed out"
        # except Exception as e:
        #     logger.error(f"Deauth execution failed: {e}")
        #     success = False
        #     error_message = str(e)
        
        # Create log entry
        deauth_log = DeauthLog(
            deauth_device_id=deauth_device.id,
            client_mac=client_mac,
            device_profile_id=deauth_device.device_profile_id,
            reason=reason,
            operator=operator,
            packets_sent=count,
            success=success,
            error_message=error_message,
            latitude=latest_obs.latitude if latest_obs else None,
            longitude=latest_obs.longitude if latest_obs else None,
            executed_at=datetime.utcnow()
        )
        self.db.add(deauth_log)
        
        # Update device
        if success:
            deauth_device.status = "deauthenticated"
            deauth_device.deauth_count += 1
            deauth_device.last_deauth_attempt = datetime.utcnow()
        else:
            deauth_device.status = "pending"
            deauth_device.last_deauth_attempt = datetime.utcnow()
        
        self.db.commit()
        
        return {
            "success": success,
            "client_mac": client_mac,
            "packets_sent": count,
            "log_id": deauth_log.id,
            "error": error_message
        }
    
    # ============ Queue Management ============
    
    def queue_deauth(
        self,
        client_mac: str,
        reason: str,
        operator: str,
        priority: str = "medium"
    ) -> Dict:
        """Queue a deauth request for async processing."""
        
        deauth_device = self.get_or_create_deauth_device(client_mac)
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
            
            # Execute deauth
            result = self.execute_deauth(
                client_mac=entry.client_mac,
                reason=entry.reason,
                operator=entry.operator or "System",
                count=3
            )
            
            # Update queue entry
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
    
    # ============ Statistics and Logs ============
    
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