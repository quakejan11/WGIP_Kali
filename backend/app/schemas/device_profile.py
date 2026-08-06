from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DeviceProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    notes: Optional[str] = None


class DeviceProfileOut(BaseModel):
    client_mac: str
    display_name: str
    notes: Optional[str] = None
    is_custom_name: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True