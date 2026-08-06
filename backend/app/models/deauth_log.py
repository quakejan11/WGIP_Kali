# app/models/deauth_log.py
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Boolean, func, Index
from app.db.base_class import Base


class DeauthLog(Base):
    """Audit log for deauth events"""
    __tablename__ = "deauth_logs"

    id = Column(Integer, primary_key=True, index=True)
    
    # Reference
    deauth_device_id = Column(Integer, index=True)
    client_mac = Column(String(32), index=True)
    device_profile_id = Column(Integer, index=True, nullable=True)
    
    # Deauth details
    reason = Column(Text, nullable=False)
    operator = Column(String(100), nullable=True)
    
    # Execution details
    packets_sent = Column(Integer, default=0)
    success = Column(Boolean, default=False)
    error_message = Column(Text, nullable=True)
    
    # Location context
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    # Timestamps
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    executed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Indexes
    __table_args__ = (
        Index('ix_deauth_logs_client_mac', 'client_mac'),
        Index('ix_deauth_logs_success', 'success'),
        Index('ix_deauth_logs_requested_at', 'requested_at'),
    )