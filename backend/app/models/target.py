# app/models/target.py
from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.db.database import Base


class Target(Base):
    __tablename__ = "targets"

    id = Column(Integer, primary_key=True, index=True)
    bssid = Column(String, unique=True, nullable=False, index=True)
    ssid = Column(String, nullable=True)
    channel = Column(Integer, nullable=False)
    signal = Column(Integer, nullable=True)
    handshake = Column(String, default="pending")   # pending / capturing / captured / failed
    status = Column(String, default="pending")      # pending / success / failed

    # ⬇️ NEW: Capture tracking
    capture_file = Column(String, nullable=True)           # path to .cap file
    capture_log = Column(String, nullable=True)            # path to .log file
    capture_pid = Column(Integer, nullable=True)           # airodump-ng PID
    deauth_pid = Column(Integer, nullable=True)            # aireplay-ng PID
    capture_started_at = Column(DateTime, nullable=True)
    capture_stopped_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Target bssid={self.bssid} ssid={self.ssid} handshake={self.handshake}>"