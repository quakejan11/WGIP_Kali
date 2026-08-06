from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.observation import Observation
from app.schemas.observation import ObservationCreate, ObservationResponse
from app.services.geocoder import reverse_geocode
from app.utils.mac_manufacturer import resolve_manufacturer


router = APIRouter(
    prefix="/observations",
    tags=["Observations"]
)


@router.post("/", response_model=ObservationResponse)
def create_observation(
    observation: ObservationCreate,
    db: Session = Depends(get_db)
):
    location_info = reverse_geocode(
        observation.latitude,
        observation.longitude
    )

    db_observation = Observation(
        survey_id=observation.survey_id,
        bssid=observation.bssid,
        ssid=observation.ssid,
        manufacturer=resolve_manufacturer(
            observation.bssid,
            observation.manufacturer,
        ),
        rssi=observation.rssi,
        channel=observation.channel,
        latitude=observation.latitude,
        longitude=observation.longitude,
        city=location_info.get("city"),
        province=location_info.get("province"),
        country=location_info.get("country"),
        area_label=location_info.get("area_label"),
        encryption=observation.encryption,
    )

    db.add(db_observation)
    db.commit()
    db.refresh(db_observation)

    return db_observation


@router.get("/", response_model=list[ObservationResponse])
def get_observations(db: Session = Depends(get_db)):
    return (
        db.query(Observation)
        .order_by(Observation.id.desc())
        .all()
    )
