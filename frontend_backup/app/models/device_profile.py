from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.db.base_class import Base


class DeviceProfile(Base):
    __tablename__ = "device_profiles"

    id = Column(Integer, primary_key=True, index=True)

    client_mac = Column(String(32), nullable=False, unique=True, index=True)
    display_name = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )