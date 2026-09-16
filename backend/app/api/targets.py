# app/api/targets.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import os
import shutil
from pathlib import Path

from app.db.database import get_db
from app.models.target import Target
from app.schemas.target import TargetCreate, TargetUpdate, TargetResponse
from app.services.capture_service import capture_service

router = APIRouter(prefix="/api/targets", tags=["targets"])

HANDSHAKES_DIR = Path(__file__).parent.parent.parent / "captures" / "handshakes"
HANDSHAKES_DIR.mkdir(parents=True, exist_ok=True)


def _try_finalize_handshake(target: Target, db: Session) -> bool:
    """Check if a handshake was captured → update DB + copy .cap."""
    if target.handshake != "capturing":
        return False

    try:
        # ⬇️ Pass capture_log so it works after restart
        if not capture_service.check_handshake(target.bssid, target.capture_log):
            return False

        print(f"🎉 Handshake detected for {target.bssid}!")

        if target.capture_file and os.path.exists(target.capture_file):
            try:
                src = Path(target.capture_file)
                safe_bssid = target.bssid.replace(":", "-")
                safe_ssid = (target.ssid or "unknown").replace(" ", "_").replace("/", "_")
                dst = HANDSHAKES_DIR / f"{safe_bssid}_{safe_ssid}_{src.stem}.cap"
                shutil.copy2(src, dst)
                print(f"📁 Handshake saved: {dst}")
            except Exception as e:
                print(f"⚠️ Could not copy handshake file: {e}")

        target.handshake = "captured"
        target.capture_stopped_at = datetime.utcnow()
        db.commit()
        db.refresh(target)
        return True

    except Exception as e:
        print(f"⚠️ Error finalizing handshake for {target.bssid}: {e}")
        return False


@router.post("", response_model=TargetResponse, status_code=status.HTTP_201_CREATED)
def create_or_update_target(payload: TargetCreate, db: Session = Depends(get_db)):
    existing = db.query(Target).filter(Target.bssid == payload.bssid).first()

    if existing:
        existing.ssid = payload.ssid
        existing.channel = payload.channel
        existing.signal = payload.signal
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing

    new_target = Target(
        bssid=payload.bssid,
        ssid=payload.ssid,
        channel=payload.channel,
        signal=payload.signal,
        handshake=payload.handshake or "pending",
        status=payload.status or "pending",
    )
    db.add(new_target)
    db.commit()
    db.refresh(new_target)
    return new_target


@router.get("", response_model=List[TargetResponse])
def list_targets(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    targets = (
        db.query(Target)
        .order_by(Target.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    updated_count = 0
    for target in targets:
        if _try_finalize_handshake(target, db):
            updated_count += 1

    if updated_count > 0:
        print(f"✅ Auto-finalized {updated_count} handshake(s)")

    return targets


@router.get("/{target_id}", response_model=TargetResponse)
def get_target(target_id: int, db: Session = Depends(get_db)):
    target = db.query(Target).filter(Target.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    _try_finalize_handshake(target, db)
    return target


@router.patch("/{target_id}", response_model=TargetResponse)
def update_target(
    target_id: int,
    payload: TargetUpdate,
    db: Session = Depends(get_db)
):
    target = db.query(Target).filter(Target.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(target, key, value)

    target.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(target)
    return target


@router.delete("/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_target(target_id: int, db: Session = Depends(get_db)):
    target = db.query(Target).filter(Target.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    db.delete(target)
    db.commit()
    return None


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_all_targets(db: Session = Depends(get_db)):
    db.query(Target).delete()
    db.commit()
    return None