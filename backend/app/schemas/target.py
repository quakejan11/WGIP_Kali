# app/schemas/target.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class TargetBase(BaseModel):
    bssid: str
    ssid: Optional[str] = None
    channel: int
    signal: Optional[int] = None
    handshake: Optional[str] = "pending"
    status: Optional[str] = "pending"


class TargetCreate(TargetBase):
    pass


class TargetUpdate(BaseModel):
    ssid: Optional[str] = None
    channel: Optional[int] = None
    signal: Optional[int] = None
    handshake: Optional[str] = None
    status: Optional[str] = None
    # ⬇️ NEW
    capture_file: Optional[str] = None
    capture_log: Optional[str] = None
    capture_pid: Optional[int] = None
    deauth_pid: Optional[int] = None
    capture_started_at: Optional[datetime] = None
    capture_stopped_at: Optional[datetime] = None


class TargetResponse(TargetBase):
    id: int
    # ⬇️ NEW
    capture_file: Optional[str] = None
    capture_log: Optional[str] = None
    capture_pid: Optional[int] = None
    deauth_pid: Optional[int] = None
    capture_started_at: Optional[datetime] = None
    capture_stopped_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True