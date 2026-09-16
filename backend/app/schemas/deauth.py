# app/schemas/deauth.py
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


class DeauthPriority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DeauthStatus(str, Enum):
    ACTIVE = "active"
    FLAGGED = "flagged"
    PENDING = "pending"
    DEAUTHENTICATED = "deauthenticated"
    BLOCKED = "blocked"


# ============ Request Schemas ============

class DeauthRequest(BaseModel):
    client_mac: Optional[str] = None
    bssid: Optional[str] = None
    channel: Optional[int] = None
    interface: Optional[str] = "wlan1"
    reason: Optional[str] = "Manual deauth"
    operator: Optional[str] = "System"
    count: int = 0                    # ⬅️ CHANGED from 5 → 0 (continuous by default)
    capture_handshake: bool = False


class BulkDeauthRequest(BaseModel):
    client_macs: List[str]
    bssid: Optional[str] = None
    channel: Optional[int] = None
    interface: Optional[str] = "wlan1"
    reason: str
    operator: Optional[str] = "System"
    count: int = 0                    # ⬅️ CHANGED from 5 → 0 (continuous by default)


class QueueDeauthRequest(BaseModel):
    client_mac: str
    reason: str
    operator: Optional[str] = "System"
    priority: DeauthPriority = DeauthPriority.MEDIUM


class FlagDeviceRequest(BaseModel):
    client_mac: str
    reason: str
    operator: Optional[str] = "System"


class UpdateStatusRequest(BaseModel):
    status: DeauthStatus
    notes: Optional[str] = None


# ============ Response Schemas ============

class DeauthDeviceResponse(BaseModel):
    id: int
    client_mac: str
    status: str
    display_name: Optional[str]
    notes: Optional[str]
    deauth_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DeauthLogResponse(BaseModel):
    id: int
    client_mac: str
    reason: str
    operator: Optional[str]
    success: bool
    packets_sent: int
    error_message: Optional[str]
    requested_at: datetime
    executed_at: Optional[datetime]

    class Config:
        from_attributes = True


class DeauthStatsResponse(BaseModel):
    total_devices: int
    status_counts: dict
    total_attempts: int
    successful_deauths: int
    success_rate: float
    queue_pending: int