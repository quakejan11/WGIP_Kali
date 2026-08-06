from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from app.db.base_class import Base


class ImportBatch(Base):
    __tablename__ = "import_batch"

    id = Column(Integer, primary_key=True, index=True)

    survey_id = Column(Integer, ForeignKey("survey.id"), nullable=False, index=True)

    filename = Column(String, nullable=True)
    file_type = Column(String, nullable=True)

    total_records = Column(Integer, nullable=True)
    inserted_records = Column(Integer, nullable=True)

    status = Column(String, nullable=True)
    source = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)