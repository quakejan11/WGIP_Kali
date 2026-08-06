from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.bssid_alert import BssidAlert

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("/")
def get_alerts(
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(BssidAlert)

    if unread_only:
        query = query.filter(BssidAlert.is_read.is_(False))

    alerts = (
        query
        .order_by(BssidAlert.created_at.desc(), BssidAlert.id.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": alert.id,
            "bssid": alert.bssid,
            "alert_type": alert.alert_type,
            "message": alert.message,
            "previous_area": alert.previous_area,
            "current_area": alert.current_area,
            "import_batch_id": alert.import_batch_id,
            "observation_id": alert.observation_id,
            "is_read": alert.is_read,
            "created_at": alert.created_at,
        }
        for alert in alerts
    ]


@router.get("/unread-count")
def get_unread_alert_count(db: Session = Depends(get_db)):
    count = (
        db.query(BssidAlert)
        .filter(BssidAlert.is_read.is_(False))
        .count()
    )

    return {"unread_count": count}


@router.patch("/read-all")
def mark_all_alerts_as_read(db: Session = Depends(get_db)):
    alerts = (
        db.query(BssidAlert)
        .filter(BssidAlert.is_read.is_(False))
        .all()
    )

    for alert in alerts:
        alert.is_read = True

    db.commit()

    return {
        "message": "All alerts marked as read.",
        "updated": len(alerts),
    }


@router.patch("/{alert_id}/read")
def mark_alert_as_read(alert_id: int, db: Session = Depends(get_db)):
    alert = (
        db.query(BssidAlert)
        .filter(BssidAlert.id == alert_id)
        .first()
    )

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")

    alert.is_read = True
    db.commit()
    db.refresh(alert)

    return {
        "message": "Alert marked as read.",
        "id": alert.id,
        "is_read": alert.is_read,
    }