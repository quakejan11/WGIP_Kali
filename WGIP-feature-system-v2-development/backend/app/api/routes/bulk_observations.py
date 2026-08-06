from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.models.observation import Observation
from app.schemas.observation import ObservationCreate
from app.utils.mac_manufacturer import resolve_manufacturer

router = APIRouter()

@router.post("/bulk-observations")
def bulk_create_observations(
    observations: List[ObservationCreate],
    db: Session = Depends(get_db)
):
    try:
        db_observations = []
        for obs_data in observations:
            values = obs_data.model_dump()
            values["manufacturer"] = resolve_manufacturer(
                values.get("bssid"),
                values.get("manufacturer"),
            )
            db_obs = Observation(**values)
            db_observations.append(db_obs)
        
        db.add_all(db_observations)
        db.commit()
        
        return {
            "status": "success",
            "inserted": len(db_observations),
            "message": f"Successfully inserted {len(db_observations)} observations"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
