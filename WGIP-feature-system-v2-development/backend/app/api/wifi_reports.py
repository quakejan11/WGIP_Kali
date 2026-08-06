from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

try:
    from app.db.session import get_db
except ImportError:
    from app.db.database import get_db

from app.services.wifi_profile_pdf_service import build_wifi_profile_pdf


router = APIRouter(prefix="/wifi-reports", tags=["Wi-Fi Reports"])


def make_safe_filename(value: str) -> str:
    return (
        value.replace(":", "-")
        .replace("/", "-")
        .replace("\\", "-")
        .replace(" ", "_")
    )


@router.get("/{bssid}/pdf")
def download_wifi_profile_pdf(
    bssid: str,
    db: Session = Depends(get_db),
):
    try:
        pdf_buffer = build_wifi_profile_pdf(db, bssid)

        safe_bssid = make_safe_filename(bssid)
        filename = f"wgip_wifi_profile_{safe_bssid}.pdf"

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
            detail=f"Failed to generate Wi-Fi profile PDF: {exc}",
        ) from exc