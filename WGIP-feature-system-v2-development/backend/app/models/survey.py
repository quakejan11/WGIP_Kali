from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from app.db.base_class import Base


class Survey(Base):
    __tablename__ = "survey"

    id = Column(Integer, primary_key=True, index=True)

    survey_name = Column(String, nullable=True)
    operator = Column(String, nullable=True)

    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)

    notes = Column(Text, nullable=True)

    location_name = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)