from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

try:
    from app.db.session import get_db
except ImportError:
    from app.db.database import get_db

from app.services.scan_result_pdf_service import build_scan_result_pdf


router = APIRouter(prefix="/scan-reports", tags=["Scan Reports"])


@router.get("/{import_batch_id}/pdf")
def download_scan_result_pdf(
    import_batch_id: int,
    db: Session = Depends(get_db),
):
    try:
        pdf_buffer = build_scan_result_pdf(db, import_batch_id)

        filename = f"wgip_scan_result_{import_batch_id}.pdf"

        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            },
        )

    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate scan result PDF: {exc}",
        ) from exc