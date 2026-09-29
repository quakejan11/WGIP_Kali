# app/api/targets.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
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

# Old backend roots that may appear in stale DB rows from earlier installs.
# When resolving a capture path, if the recorded path doesn't exist, we
# rewrite these prefixes to the current captures dir.
STALE_PATH_PREFIXES = [
    "/home/wardriving/Desktop/WGIP_Kali/backend/captures",
    "/home/enigma/Desktop/Integrated/backend/captures",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_capture_path(recorded: str | None) -> str | None:
    """
    Return a path that actually exists on disk, or None.

    Handles three cases:
      1. The recorded path exists exactly as stored.
      2. airodump-ng appended a -NN suffix (e.g. foo.cap → foo-01.cap).
         This is the common case for anything written by airodump-ng.
      3. The recorded path has a stale prefix; rewrite it against the current
         captures dir and retry cases 1 and 2.
    """
    if not recorded:
        return None

    def _try(path: str) -> str | None:
        """
        Return `path` if it exists, or the newest '<stem>-NN<suffix>' sibling.
        Example: 'foo.cap' → 'foo-01.cap' when that's what's on disk.
        """
        if os.path.exists(path):
            return path

        p = Path(path)
        if not p.suffix:
            return None

        parent = p.parent
        if not parent.exists():
            return None

        # Match foo-01.cap, foo-02.cap, ... — pick the newest by mtime
        matches = list(parent.glob(f"{p.stem}-*{p.suffix}"))
        if not matches:
            return None

        newest = max(matches, key=lambda f: f.stat().st_mtime)
        return str(newest)

    # Case 1: as recorded (+ -NN fallback)
    hit = _try(recorded)
    if hit:
        if hit != recorded:
            print(f"🎯 Matched airodump variant: {recorded} → {hit}")
        return hit

    # Case 3: rewrite known stale prefixes, then retry cases 1 and 2
    current_captures = str(HANDSHAKES_DIR.parent)  # .../captures
    for old_prefix in STALE_PATH_PREFIXES:
        if recorded.startswith(old_prefix):
            tail = recorded[len(old_prefix):].lstrip("/")
            candidate = os.path.join(current_captures, tail)
            hit = _try(candidate)
            if hit:
                print(f"🔄 Rewrote stale path: {recorded} → {hit}")
                return hit

    # Case 3b: generic rewrite — any '…/backend/captures/…' suffix
    # reattached to the current captures root. Catches old installs we
    # haven't listed in STALE_PATH_PREFIXES.
    marker = "/backend/captures/"
    idx = recorded.find(marker)
    if idx != -1:
        tail = recorded[idx + len(marker):]
        candidate = os.path.join(current_captures, tail)
        hit = _try(candidate)
        if hit:
            print(f"🔄 Generic rewrite: {recorded} → {hit}")
            return hit

    return None


def _to_response(target: Target) -> TargetResponse:
    """
    Convert ORM target → response, computing has_capture from the filesystem.

    We do this here rather than in the ORM so the truth always reflects what's
    actually on disk. If the DB has a stale capture_file path, has_capture
    will be False and the frontend will disable the download button.
    """
    data = TargetResponse.model_validate(target, from_attributes=True)
    data.has_capture = bool(_resolve_capture_path(target.capture_file))
    return data


def _mark_capture_failed(target: Target, db: Session) -> None:
    """Clean up a target whose capture ended without a handshake."""
    target.handshake = "failed"
    # Don't wipe the file path if the .cap actually still exists —
    # the user might still want to download it for analysis.
    if target.capture_file and not _resolve_capture_path(target.capture_file):
        target.capture_file = None
    if target.capture_log and not os.path.exists(target.capture_log):
        target.capture_log = None
    target.capture_stopped_at = target.capture_stopped_at or datetime.utcnow()
    db.commit()
    db.refresh(target)


def _try_finalize_handshake(target: Target, db: Session) -> bool:
    """Check if a handshake was captured → update DB + copy .cap."""
    if target.handshake != "capturing":
        return False

    try:
        if not capture_service.check_handshake(target.bssid, target.capture_log):
            return False

        print(f"🎉 Handshake detected for {target.bssid}!")

        # Resolve the raw .cap, including airodump's -NN suffix
        resolved = _resolve_capture_path(target.capture_file)
        if resolved:
            try:
                src = Path(resolved)
                safe_bssid = target.bssid.replace(":", "-")
                safe_ssid = (target.ssid or "unknown").replace(" ", "_").replace("/", "_")
                # Use the resolved stem so we keep the "-01" if that's what exists
                dst = HANDSHAKES_DIR / f"{safe_bssid}_{safe_ssid}_{src.stem}{src.suffix}"
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

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
        return _to_response(existing)

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
    return _to_response(new_target)


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

    return [_to_response(t) for t in targets]


# NOTE: this must be declared BEFORE the generic "/{target_id}" route in
# FastAPI, otherwise "cleanup-stale-paths" would be parsed as a target_id.
@router.post("/cleanup-stale-paths")
def cleanup_stale_paths(db: Session = Depends(get_db)):
    """
    One-shot cleanup: null out capture_file / capture_log on any target whose
    recorded path doesn't resolve to a real file (including -NN variants).
    """
    targets = db.query(Target).all()
    cleaned = 0
    details = []
    for t in targets:
        cf = t.capture_file
        cl = t.capture_log
        cf_missing = cf and not _resolve_capture_path(cf)
        cl_missing = cl and not os.path.exists(cl)
        if cf_missing or cl_missing:
            details.append({
                "id": t.id,
                "ssid": t.ssid,
                "capture_file": cf,
                "capture_log": cl,
            })
            if cf_missing:
                t.capture_file = None
            if cl_missing:
                t.capture_log = None
            cleaned += 1

    if cleaned:
        db.commit()
        print(f"🧹 Cleaned {cleaned} stale path(s)")

    return {"cleaned": cleaned, "targets": details}


@router.get("/{target_id}/capture")
def download_capture(target_id: int, db: Session = Depends(get_db)):
    """
    Stream the target's .cap capture file to the browser as a download.
    Prefers the finalized handshake copy in HANDSHAKES_DIR; falls back to
    the raw capture_file path recorded on the target row (resolving -NN).
    """
    target = db.query(Target).filter(Target.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    # Try to promote to finalized handshake first
    _try_finalize_handshake(target, db)

    # Candidate 1: finalized handshake copy in HANDSHAKES_DIR.
    # Check both the exact-stem and any -NN variant we may have saved.
    finalized_path = None
    if target.capture_file:
        src_stem = Path(target.capture_file).stem
        safe_bssid = target.bssid.replace(":", "-")
        safe_ssid = (target.ssid or "unknown").replace(" ", "_").replace("/", "_")
        base_name = f"{safe_bssid}_{safe_ssid}_{src_stem}"
        # Try exact first, then any -NN sibling
        for candidate in [
            HANDSHAKES_DIR / f"{base_name}.cap",
            *sorted(HANDSHAKES_DIR.glob(f"{base_name}-*.cap")),
        ]:
            if candidate.exists():
                finalized_path = candidate
                break

    # Candidate 2: raw capture path — resolve stale prefixes and -NN suffix
    raw_path = None
    resolved = _resolve_capture_path(target.capture_file)
    if resolved:
        raw_path = Path(resolved)

    chosen = finalized_path or raw_path

    if not chosen:
        raise HTTPException(
            status_code=404,
            detail="No capture file available for this target yet",
        )

    if not chosen.is_file():
        raise HTTPException(status_code=404, detail="Capture path is not a file")

    return FileResponse(
        path=str(chosen),
        media_type="application/vnd.tcpdump.pcap",
        filename=chosen.name,
    )


@router.get("/{target_id}", response_model=TargetResponse)
def get_target(target_id: int, db: Session = Depends(get_db)):
    target = db.query(Target).filter(Target.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    _try_finalize_handshake(target, db)
    return _to_response(target)


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
    return _to_response(target)


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