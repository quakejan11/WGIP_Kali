from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.db.database import Base


class BssidAlert(Base):
    __tablename__ = "bssid_alert"

    id = Column(Integer, primary_key=True, index=True)

    bssid = Column(String, nullable=False, index=True)
    alert_type = Column(String, nullable=False, index=True)

    message = Column(Text, nullable=False)

    previous_area = Column(String, nullable=True)
    current_area = Column(String, nullable=True)

    import_batch_id = Column(Integer, ForeignKey("import_batch.id"), nullable=True)
    observation_id = Column(Integer, ForeignKey("observation.id"), nullable=True)

    is_read = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())