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
    capture_file: Optional[str] = None
    capture_log: Optional[str] = None
    capture_pid: Optional[int] = None
    deauth_pid: Optional[int] = None
    capture_started_at: Optional[datetime] = None
    capture_stopped_at: Optional[datetime] = None


class TargetResponse(TargetBase):
    id: int
    capture_file: Optional[str] = None
    capture_log: Optional[str] = None
    capture_pid: Optional[int] = None
    deauth_pid: Optional[int] = None
    capture_started_at: Optional[datetime] = None
    capture_stopped_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    # ⬇️ NEW: filesystem truth — is there a downloadable .cap for this target?
    # Computed in the API layer (see _to_response in app/api/targets.py).
    # Kept on the response model so FastAPI doesn't strip it during serialization.
    has_capture: bool = False

    class Config:
        from_attributes = True