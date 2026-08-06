from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SurveyBase(BaseModel):
    survey_name: Optional[str] = None
    operator: Optional[str] = None

    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

    notes: Optional[str] = None

    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # Backward compatibility for old frontend payload
    description: Optional[str] = None


class SurveyCreate(SurveyBase):
    pass


class SurveyUpdate(SurveyBase):
    pass


class SurveyOut(BaseModel):
    id: int
    survey_name: Optional[str] = None
    operator: Optional[str] = None

    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

    notes: Optional[str] = None

    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    class Config:
        from_attributes = True