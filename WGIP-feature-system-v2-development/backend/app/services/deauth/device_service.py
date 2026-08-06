# app/services/deauth/device_service.py
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional, Dict

from app.models.deauth_device import DeauthDevice
from app.models.device_profile import DeviceProfile
from app.services.deauth.base import DeauthBaseService


class DeauthDeviceService(DeauthBaseService):
    def __init__(self, db: Session):
        super().__init__(db)
    
    def get_or_create_deauth_device(self, client_mac: str) -> DeauthDevice:
        """Get existing deauth device or create new one."""
        device = self.db.query(DeauthDevice).filter(
            DeauthDevice.client_mac == client_mac
        ).first()
        
        if not device:
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