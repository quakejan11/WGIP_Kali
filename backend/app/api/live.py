from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.models.live_event import LiveEvent
from app.schemas.live import LiveEventCreate, LiveEventResponse, LiveStatsResponse, LiveEventsResponse
from app.utils.kismet_connector import KismetConnector
import json
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/live", tags=["live"])

# Initialize Kismet connector
kismet_connector = KismetConnector()

@router.get("/events", response_model=LiveEventsResponse)
def get_live_events(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get events from Temp DB (fallback)"""
    events = db.query(LiveEvent).order_by(LiveEvent.created_at.desc()).offset(offset).limit(limit).all()
    total = db.query(LiveEvent).count()
    return LiveEventsResponse(
        events=[LiveEventResponse.from_orm(event) for event in events],
        total=total,
        limit=limit,
        offset=offset
    )

@router.get("/events/recent", response_model=List[LiveEventResponse])
def get_recent_events(
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Get last N events"""
    events = db.query(LiveEvent).order_by(LiveEvent.created_at.desc()).limit(limit).all()
    return [LiveEventResponse.from_orm(event) for event in events]

@router.post("/clear")
def clear_all_data(db: Session = Depends(get_db)):
    """Clear all Temp DB data"""
    db.query(LiveEvent).delete()
    db.commit()
    return {"message": "All Temp DB data cleared"}

@router.post("/clear-old")
def clear_old_data(hours: int = 24, db: Session = Depends(get_db)):
    """Delete data older than X hours"""
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)
    deleted_count = db.query(LiveEvent).filter(LiveEvent.created_at < cutoff_time).delete()
    db.commit()
    return {"message": f"Deleted {deleted_count} records older than {hours} hours"}

@router.get("/export")
def export_to_kismet(db: Session = Depends(get_db)):
    """Export Temp DB data to .kismet"""
    events = db.query(LiveEvent).all()
    # Convert to Kismet format - simplified for now
    kismet_data = []
    for event in events:
        kismet_data.append({
            "bssid": event.bssid,
            "ssid": event.essid,
            "signal": event.signal,
            "channel": event.channel,
            "encryption": event.data.get("encryption", "Unknown") if event.data else "Unknown",
            "timestamp": event.timestamp.isoformat() if event.timestamp else None
        })
    
    return {
        "format": "kismet",
        "data": kismet_data,
        "count": len(kismet_data)
    }

@router.get("/status", response_model=LiveStatsResponse)
def get_live_status(db: Session = Depends(get_db)):
    """Get Temp DB stats (count, oldest, newest)"""
    total_count = db.query(LiveEvent).count()
    oldest_event = db.query(LiveEvent).order_by(LiveEvent.created_at.ascii()).first()
    newest_event = db.query(LiveEvent).order_by(LiveEvent.created_at.desc()).first()
    
    return LiveStatsResponse(
        total_count=total_count,
        oldest_record=oldest_event.created_at if oldest_event else None,
        newest_record=newest_event.created_at if newest_event else None,
        expires_in_hours=24  # TTL is 24 hours
    )

# Background task to save PCAP data to Temp DB
def save_pcap_to_temp_db():
    """Background function to save PCAP data to Temp DB"""
    # This would be called periodically or triggered by PCAP stream
    pass

# PCAP Health Check endpoints would go in a separate file per spec