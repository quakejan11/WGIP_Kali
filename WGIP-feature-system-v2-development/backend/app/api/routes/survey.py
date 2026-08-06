from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.survey import Survey
from app.schemas.survey import SurveyCreate, SurveyOut, SurveyUpdate


router = APIRouter(
    prefix="/surveys",
    tags=["Surveys"],
)


def clean_text(value):
    if value is None:
        return None

    value = str(value).strip()

    if not value:
        return None

    return value


def get_location_from_payload(payload: SurveyCreate):
    return (
        clean_text(payload.location_name)
        or clean_text(payload.description)
        or clean_text(payload.notes)
    )


@router.get("", response_model=List[SurveyOut])
def list_surveys(db: Session = Depends(get_db)):
    return db.query(Survey).order_by(Survey.id.desc()).all()


@router.get("/{survey_id}", response_model=SurveyOut)
def get_survey(survey_id: int, db: Session = Depends(get_db)):
    survey = db.query(Survey).filter(Survey.id == survey_id).first()

    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found.")

    return survey


@router.post("", response_model=SurveyOut)
def create_survey(payload: SurveyCreate, db: Session = Depends(get_db)):
    location_name = get_location_from_payload(payload)

    survey = Survey(
        survey_name=clean_text(payload.survey_name) or "Untitled Scan",
        operator=clean_text(payload.operator),
        start_time=payload.start_time or datetime.now(timezone.utc),
        end_time=payload.end_time,
        notes=clean_text(payload.notes),
        location_name=location_name,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )

    db.add(survey)
    db.commit()
    db.refresh(survey)

    return survey


@router.put("/{survey_id}", response_model=SurveyOut)
def update_survey(
    survey_id: int,
    payload: SurveyUpdate,
    db: Session = Depends(get_db),
):
    survey = db.query(Survey).filter(Survey.id == survey_id).first()

    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found.")

    if payload.survey_name is not None:
        survey.survey_name = clean_text(payload.survey_name)

    if payload.operator is not None:
        survey.operator = clean_text(payload.operator)

    if payload.start_time is not None:
        survey.start_time = payload.start_time

    if payload.end_time is not None:
        survey.end_time = payload.end_time

    if payload.notes is not None:
        survey.notes = clean_text(payload.notes)

    if payload.location_name is not None:
        survey.location_name = clean_text(payload.location_name)

    if payload.description is not None and not survey.location_name:
        survey.location_name = clean_text(payload.description)

    if payload.latitude is not None:
        survey.latitude = payload.latitude

    if payload.longitude is not None:
        survey.longitude = payload.longitude

    db.commit()
    db.refresh(survey)

    return survey


@router.delete("/{survey_id}")
def delete_survey(survey_id: int, db: Session = Depends(get_db)):
    survey = db.query(Survey).filter(Survey.id == survey_id).first()

    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found.")

    db.delete(survey)
    db.commit()

    return {
        "message": "Survey deleted successfully.",
        "survey_id": survey_id,
    }