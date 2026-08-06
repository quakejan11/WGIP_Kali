# app/models/deauth_queue.py
from sqlalchemy import Column, Integer, String, Text, DateTime, func, Index
from app.db.base_class import Base


class DeauthQueue(Base):
    """Queue for async deauth processing"""
    __tablename__ = "deauth_queue"

    id = Column(Integer, primary_key=True, index=True)
    
    # Reference
    deauth_device_id = Column(Integer, index=True)
    client_mac = Column(String(32), index=True)
    
    # Deauth details
    reason = Column(Text, nullable=False)
    operator = Column(String(100), nullable=True)
    priority = Column(String(20), default="medium")  # high, medium, low
    
    # Status
    status = Column(String(20), default="pending", index=True)
    # pending, processing, completed, failed
    
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    
    # Indexes
    __table_args__ = (
        Index('ix_deauth_queue_status_priority', 'status', 'priority'),
        Index('ix_deauth_queue_client_mac', 'client_mac'),
    )