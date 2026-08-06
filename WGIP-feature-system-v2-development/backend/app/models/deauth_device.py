# app/models/deauth_device.py
from sqlalchemy import Column, Integer, String, DateTime, Text, func, Index
from app.db.base_class import Base


class DeauthDevice(Base):
    """Extended device information for deauth - separate from DeviceProfile"""
    __tablename__ = "deauth_devices"

    id = Column(Integer, primary_key=True, index=True)
    
    # Reference to existing DeviceProfile (not foreign key to avoid constraints)
    device_profile_id = Column(Integer, index=True)
    client_mac = Column(String(32), unique=True, index=True, nullable=False)
    
    # Deauth-specific fields
    status = Column(String(20), default="active", index=True)
    # Values: active, flagged, pending, deauthenticated, blocked
    
    # Additional deauth metadata
    display_name = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    
    # Tracking
    last_deauth_attempt = Column(DateTime(timezone=True), nullable=True)
    deauth_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Indexes
    __table_args__ = (
        Index('ix_deauth_devices_status', 'status'),
        Index('ix_deauth_devices_device_profile_id', 'device_profile_id'),
    )