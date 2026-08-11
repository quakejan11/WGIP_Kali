from pydantic import BaseModel
from typing import Optional, Any, List
from datetime import datetime

class LiveEventBase(BaseModel):
    event_type: Optional[str] = None
    timestamp: Optional[datetime] = None
    data: Optional[Any] = None
    bssid: Optional[str] = None
    channel: Optional[int] = None
    signal: Optional[int] = None
    essid: Optional[str] = None

class LiveEventCreate(LiveEventBase):
    pass

class LiveEventResponse(LiveEventBase):
    id: int
    created_at: datetime
    
    class Config:
        orm_mode = True

class LiveEventsResponse(BaseModel):
    events: List[LiveEventResponse]
    total: int
    limit: int
    offset: int

class LiveStatsResponse(BaseModel):
    total_count: int
    oldest_record: Optional[datetime] = None
    newest_record: Optional[datetime] = None
    expires_in_hours: int = 24