from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, func

from app.db.base_class import Base


class ClientObservation(Base):
    __tablename__ = "client_observations"

    id = Column(Integer, primary_key=True, index=True)

    survey_id = Column(
        Integer,
        ForeignKey("survey.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    import_batch_id = Column(
        Integer,
        nullable=True,
        index=True,
    )

    bssid = Column(String(32), nullable=True, index=True)
    ssid = Column(String(255), nullable=True)
    channel = Column(Integer, nullable=True)

    client_mac = Column(String(32), nullable=False, index=True)
    client_vendor = Column(
        String(255),
        nullable=False,
        default="Unknown Manufacturer",
        server_default="Unknown Manufacturer",
    )

    timestamp = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    signal_dbm = Column(Integer, nullable=True)

    relationship_type = Column(
        String(100),
        nullable=False,
        default="observed",
    )

    coordinate_source = Column(
        String(100),
        nullable=True,
    )

    source = Column(
        String(100),
        nullable=False,
        default="api",
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
