from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ClientObservationCreate(BaseModel):
    survey_id: Optional[int] = None

    bssid: str
    ssid: Optional[str] = None
    channel: Optional[int] = None

    client_mac: str
    client_vendor: str = "Unknown Manufacturer"

    timestamp: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    signal_dbm: Optional[int] = None

    relationship_type: str = "observed_association"
    source: str = "mock_kismet"


class ClientObservationOut(ClientObservationCreate):
    id: int

    class Config:
        from_attributes = True


class BSSIDClientSummary(BaseModel):
    bssid: str
    ssid: Optional[str] = None

    client_mac: str
    client_vendor: str = "Unknown Manufacturer"

    first_seen: datetime
    last_seen: datetime
    seen_count: int

    last_latitude: Optional[float] = None
    last_longitude: Optional[float] = None
    last_signal_dbm: Optional[int] = None
    last_channel: Optional[int] = None


class ClientTimelineItem(BaseModel):
    id: int

    timestamp: datetime

    bssid: str
    ssid: Optional[str] = None
    channel: Optional[int] = None

    client_mac: str
    client_vendor: str = "Unknown Manufacturer"

    latitude: Optional[float] = None
    longitude: Optional[float] = None
    signal_dbm: Optional[int] = None

    relationship_type: str
    source: str

    class Config:
        from_attributes = True
