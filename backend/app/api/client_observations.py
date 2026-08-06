from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

try:
    from app.db.session import get_db
except ImportError:
    from app.db.database import get_db

from app.models.client_observation import ClientObservation
from app.utils.mac_manufacturer import resolve_manufacturer

router = APIRouter()


def parse_datetime(value: Any) -> Any:
    if not value:
        return value

    if isinstance(value, datetime):
        return value

    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value

    return value


def model_to_dict(row: ClientObservation) -> Dict[str, Any]:
    manufacturer = resolve_manufacturer(
        getattr(row, "client_mac", None),
        getattr(row, "client_vendor", None),
    )

    return {
        "id": getattr(row, "id", None),
        "survey_id": getattr(row, "survey_id", None),
        "import_batch_id": getattr(row, "import_batch_id", None),
        "bssid": getattr(row, "bssid", None),
        "ssid": getattr(row, "ssid", None),
        "channel": getattr(row, "channel", None),
        "client_mac": getattr(row, "client_mac", None),
        "client_vendor": manufacturer,
        "manufacturer": manufacturer,
        "timestamp": getattr(row, "timestamp", None),
        "latitude": getattr(row, "latitude", None),
        "longitude": getattr(row, "longitude", None),
        "signal_dbm": getattr(row, "signal_dbm", None),
        "relationship_type": getattr(row, "relationship_type", None),
        "coordinate_source": getattr(row, "coordinate_source", None),
        "created_at": getattr(row, "created_at", None),
    }


def apply_filters(
    query,
    survey_id: Optional[int] = None,
    import_batch_id: Optional[int] = None,
    client_mac: Optional[str] = None,
    bssid: Optional[str] = None,
):
    if survey_id is not None:
        query = query.filter(ClientObservation.survey_id == survey_id)

    if import_batch_id is not None:
        query = query.filter(ClientObservation.import_batch_id == import_batch_id)

    if client_mac:
        query = query.filter(
            func.lower(ClientObservation.client_mac) == client_mac.lower()
        )

    if bssid:
        query = query.filter(
            ClientObservation.bssid.isnot(None),
            func.lower(ClientObservation.bssid) == bssid.lower(),
        )

    return query


@router.post("/client-observations")
@router.post("/client-observations/")
def create_client_observation(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
):
    allowed_fields = {
        "survey_id",
        "import_batch_id",
        "bssid",
        "ssid",
        "channel",
        "client_mac",
        "client_vendor",
        "timestamp",
        "latitude",
        "longitude",
        "signal_dbm",
        "relationship_type",
        "coordinate_source",
    }

    data = {key: value for key, value in payload.items() if key in allowed_fields}

    if not data.get("client_mac"):
        raise HTTPException(status_code=400, detail="client_mac is required")

    if data.get("timestamp"):
        data["timestamp"] = parse_datetime(data["timestamp"])

    if data.get("relationship_type") is None:
        data["relationship_type"] = "observed"

    data["client_vendor"] = resolve_manufacturer(
        data["client_mac"],
        data.get("client_vendor"),
    )

    row = ClientObservation(**data)

    db.add(row)
    db.commit()
    db.refresh(row)

    return model_to_dict(row)


@router.get("/client-observations")
@router.get("/client-observations/")
def list_client_observations(
    survey_id: Optional[int] = Query(default=None),
    import_batch_id: Optional[int] = Query(default=None),
    client_mac: Optional[str] = Query(default=None),
    bssid: Optional[str] = Query(default=None),
    limit: int = Query(default=5000, ge=1, le=20000),
    db: Session = Depends(get_db),
):
    query = db.query(ClientObservation)

    query = apply_filters(
        query=query,
        survey_id=survey_id,
        import_batch_id=import_batch_id,
        client_mac=client_mac,
        bssid=bssid,
    )

    rows = (
        query.order_by(ClientObservation.timestamp.desc().nullslast())
        .limit(limit)
        .all()
    )

    return [model_to_dict(row) for row in rows]


@router.get("/client-observations/by-client/{client_mac}")
def get_by_client(
    client_mac: str,
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ClientObservation)
        .filter(func.lower(ClientObservation.client_mac) == client_mac.lower())
        .order_by(ClientObservation.timestamp.asc().nullslast())
        .all()
    )

    return [model_to_dict(row) for row in rows]


@router.get("/client-observations/client/{client_mac}")
def get_client(
    client_mac: str,
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ClientObservation)
        .filter(func.lower(ClientObservation.client_mac) == client_mac.lower())
        .order_by(ClientObservation.timestamp.asc().nullslast())
        .all()
    )

    return [model_to_dict(row) for row in rows]


@router.get("/client-observations/timeline/{client_mac}")
def get_client_timeline(
    client_mac: str,
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ClientObservation)
        .filter(func.lower(ClientObservation.client_mac) == client_mac.lower())
        .order_by(ClientObservation.timestamp.asc().nullslast())
        .all()
    )

    records = [model_to_dict(row) for row in rows]

    return {
        "client_mac": client_mac,
        "records": records,
        "timeline": records,
    }


@router.get("/client-observations/by-bssid/{bssid}")
def get_by_bssid(
    bssid: str,
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ClientObservation)
        .filter(
            ClientObservation.bssid.isnot(None),
            func.lower(ClientObservation.bssid) == bssid.lower(),
        )
        .order_by(ClientObservation.timestamp.asc().nullslast())
        .all()
    )

    return [model_to_dict(row) for row in rows]


@router.get("/client-observations/bssid/{bssid}")
def get_bssid(
    bssid: str,
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ClientObservation)
        .filter(
            ClientObservation.bssid.isnot(None),
            func.lower(ClientObservation.bssid) == bssid.lower(),
        )
        .order_by(ClientObservation.timestamp.asc().nullslast())
        .all()
    )

    return [model_to_dict(row) for row in rows]


@router.delete("/client-observations/{record_id}")
def delete_client_observation(
    record_id: int,
    db: Session = Depends(get_db),
):
    row = (
        db.query(ClientObservation)
        .filter(ClientObservation.id == record_id)
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Client observation not found")

    db.delete(row)
    db.commit()

    return {"status": "deleted", "id": record_id}
