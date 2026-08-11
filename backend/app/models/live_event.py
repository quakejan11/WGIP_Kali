from sqlalchemy import Column, DateTime, Integer, String, Text, func, Index
from app.db.base_class import Base

class LiveEvent(Base):
    __tablename__ = "live_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=True)  # bssid, client, packet, alert, etc.
    timestamp = Column(DateTime(timezone=True), nullable=True, index=True)
    data = Column(Text, nullable=True)  # JSON string
    bssid = Column(String(17), nullable=True, index=True)  # MAC address format
    channel = Column(Integer, nullable=True)
    signal = Column(Integer, nullable=True)  # Signal strength in dBm
    essid = Column(String, nullable=True)  # Network name
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)  # created_at + 24 hours

# Indexes
Index('bssid_idx', LiveEvent.bssid)
Index('created_at_idx', LiveEvent.created_at)