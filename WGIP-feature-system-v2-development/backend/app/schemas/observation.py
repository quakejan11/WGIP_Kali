from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ObservationBase(BaseModel):
    survey_id: Optional[int] = None
    import_batch_id: Optional[int] = None

    bssid: Optional[str] = None
    ssid: Optional[str] = None
    manufacturer: str = "Unknown Manufacturer"

    channel: Optional[int] = None

    rssi: Optional[int] = None
    signal_dbm: Optional[int] = None

    encryption: Optional[str] = None

    latitude: Optional[float] = None
    longitude: Optional[float] = None

    timestamp: Optional[datetime] = None
    created_at: Optional[datetime] = None

    notes: Optional[str] = None

    city: Optional[str] = None
    province: Optional[str] = None
    country: Optional[str] = None
    area_label: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ObservationCreate(ObservationBase):
    pass


class ObservationUpdate(ObservationBase):
    pass


class ObservationOut(ObservationBase):
    id: int


class ObservationResponse(ObservationBase):
    id: int


class ObservationRead(ObservationBase):
    id: int


class ObservationSchema(ObservationBase):
    id: int
