from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

try:
    from app.db.session import get_db
except ImportError:
    from app.db.database import get_db

from app.services.kismet_import_service import save_upload_to_temp
from app.services.kismet_csv_import_service import import_kismet_devices_csv


router = APIRouter(prefix="/kismet-csv-imports", tags=["Kismet CSV Imports"])


@router.post("/upload")
def upload_kismet_devices_csv(
    file: UploadFile = File(...),
    survey_id: Optional[int] = Form(default=None),
    manual_area_label: Optional[str] = Form(default=None),
    manual_latitude: Optional[float] = Form(default=None),
    manual_longitude: Optional[float] = Form(default=None),
    db: Session = Depends(get_db),
):
    original_filename = file.filename or "uploaded_devices.csv"
    suffix = Path(original_filename).suffix.lower()

    if suffix != ".csv":
        raise HTTPException(
            status_code=400,
            detail="Only .csv files are supported by this endpoint.",
        )

    temp_path = None

    try:
        temp_path = save_upload_to_temp(file)

        result = import_kismet_devices_csv(
            db,
            uploaded_file_path=temp_path,
            original_filename=original_filename,
            survey_id=survey_id,
            manual_area_label=manual_area_label,
            manual_latitude=manual_latitude,
            manual_longitude=manual_longitude,
        )

        return result

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Kismet devices CSV import failed: {exc}",
        ) from exc

    finally:
        if temp_path:
            try:
                temp_dir = temp_path.parent
                temp_path.unlink(missing_ok=True)
                temp_dir.rmdir()
            except Exception:
                pass