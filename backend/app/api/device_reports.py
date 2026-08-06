from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

try:
    from app.db.session import get_db
except ImportError:
    from app.db.database import get_db

from app.services.device_timeline_pdf_service import build_device_timeline_pdf


router = APIRouter(prefix="/device-reports", tags=["Device Reports"])


def make_safe_filename(value: str) -> str:
    return (
        value.replace(":", "-")
        .replace("/", "-")
        .replace("\\", "-")
        .replace(" ", "_")
    )


@router.get("/{client_mac}/pdf")
def download_device_timeline_pdf(
    client_mac: str,
    db: Session = Depends(get_db),
):
    try:
        pdf_buffer = build_device_timeline_pdf(db, client_mac)

        safe_mac = make_safe_filename(client_mac)
        filename = f"wgip_device_timeline_{safe_mac}.pdf"

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
            detail=f"Failed to generate device timeline PDF: {exc}",
        ) from exc