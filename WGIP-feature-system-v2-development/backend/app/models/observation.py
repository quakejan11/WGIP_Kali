from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, func

from app.db.base_class import Base


class Observation(Base):
    __tablename__ = "observation"

    id = Column(Integer, primary_key=True, index=True)

    survey_id = Column(Integer, ForeignKey("survey.id"), nullable=True, index=True)
    import_batch_id = Column(Integer, ForeignKey("import_batch.id"), nullable=True, index=True)

    bssid = Column(String, nullable=True, index=True)
    ssid = Column(String, nullable=True)
    manufacturer = Column(
        String(255),
        nullable=False,
        default="Unknown Manufacturer",
        server_default="Unknown Manufacturer",
    )

    channel = Column(Integer, nullable=True)

    rssi = Column(Integer, nullable=True)
    signal_dbm = Column(Integer, nullable=True)

    encryption = Column(String, nullable=True)

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    timestamp = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)

    notes = Column(Text, nullable=True)
