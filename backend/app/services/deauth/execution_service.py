# app/services/deauth/execution_service.py
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Dict
import logging
import subprocess

from app.models.deauth_log import DeauthLog
from app.models.observation import Observation
from app.services.deauth.base import DeauthBaseService
from app.services.deauth.device_service import DeauthDeviceService

logger = logging.getLogger(__name__)

class DeauthExecutionService(DeauthBaseService):
    def __init__(self, db: Session):
        super().__init__(db)
        self.device_service = DeauthDeviceService(db)
    
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
        deauth_device = self.device_service.get_or_create_deauth_device(client_mac)
        
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
        # REAL CODE FOR KALI LINUX - Uncomment when deploying to Kali
        # ============================================================
        # try:
        #     interface = "wlan0mon"
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