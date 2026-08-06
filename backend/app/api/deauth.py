# app/api/deauth.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List

from app.db.session import get_db
from app.services.deauth_service import DeauthService
from app.schemas.deauth import (
    DeauthRequest, 
    BulkDeauthRequest, 
    QueueDeauthRequest,
    FlagDeviceRequest, 
    UpdateStatusRequest,
    DeauthStatus
)

router = APIRouter(prefix="/api/deauth", tags=["deauth"])


# ============ Device Management ============

@router.post("/flag")
async def flag_device(
    request: FlagDeviceRequest,
    db: Session = Depends(get_db)
):
    """Flag a device for deauthentication."""
    service = DeauthService(db)
    result = service.flag_device(
        client_mac=request.client_mac,
        reason=request.reason,
        operator=request.operator or "System"
    )
    return result


@router.get("/devices")
async def get_devices(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get all deauth devices."""
    service = DeauthService(db)
    devices = service.get_flagged_devices(
        status=status,
        search=search,
        limit=limit,
        offset=offset
    )
    return {
        "total": len(devices),
        "devices": devices
    }


@router.put("/device/{client_mac}/status")
async def update_device_status(
    client_mac: str,
    request: UpdateStatusRequest,
    db: Session = Depends(get_db)
):
    """Update device status."""
    service = DeauthService(db)
    result = service.update_device_status(
        client_mac=client_mac,
        status=request.status,
        notes=request.notes
    )
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error"))
    return result


# ============ Deauth Execution ============

@router.post("/execute")
async def execute_deauth(
    request: DeauthRequest,
    db: Session = Depends(get_db)
):
    """Execute deauth on a device (real-time)."""
    service = DeauthService(db)
    result = service.execute_deauth(
        client_mac=request.client_mac,
        reason=request.reason,
        operator=request.operator or "System",
        count=request.count
    )
    return result


@router.post("/bulk-execute")
async def bulk_execute_deauth(
    request: BulkDeauthRequest,
    db: Session = Depends(get_db)
):
    """Execute deauth on multiple devices."""
    service = DeauthService(db)
    results = []
    for client_mac in request.client_macs:
        result = service.execute_deauth(
            client_mac=client_mac,
            reason=request.reason,
            operator=request.operator or "System",
            count=request.count
        )
        results.append(result)
    
    return {
        "total": len(results),
        "successful": sum(1 for r in results if r.get("success", False)),
        "failed": sum(1 for r in results if not r.get("success", False)),
        "results": results
    }


# ============ Queue Management ============

@router.post("/queue")
async def queue_deauth(
    request: QueueDeauthRequest,
    db: Session = Depends(get_db)
):
    """Queue a deauth request for async processing."""
    service = DeauthService(db)
    result = service.queue_deauth(
        client_mac=request.client_mac,
        reason=request.reason,
        operator=request.operator or "System",
        priority=request.priority
    )
    return result


@router.post("/queue/process")
async def process_queue(
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Process pending queue entries."""
    service = DeauthService(db)
    return service.process_queue(limit=limit)


# ============ Statistics and Logs ============

@router.get("/stats")
async def get_stats(
    db: Session = Depends(get_db)
):
    """Get deauth statistics."""
    service = DeauthService(db)
    return service.get_stats()


@router.get("/logs")
async def get_logs(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get deauth logs."""
    service = DeauthService(db)
    logs = service.get_logs(limit=limit, offset=offset)
    return {
        "total": len(logs),
        "logs": logs
    }


# ============ Interface Status ============

@router.get("/interface/status")
async def get_interface_status():
    """Check if the wireless interface is ready for deauth."""
    import subprocess
    try:
        result = subprocess.run(
            ["aireplay-ng", "--test", "wlan0mon"],
            capture_output=True,
            text=True,
            timeout=10
        )
        return {
            "interface": "wlan0mon",
            "ready": "Injection is working!" in result.stdout,
            "details": result.stdout[:500]
        }
    except Exception as e:
        return {
            "interface": "wlan0mon",
            "ready": False,
            "error": str(e)
        }

# ============ AP Management (NEW) ============

@router.get("/aps")
async def get_aps(
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get list of unique APs from Observations."""
    from app.services.deauth.ap_service import DeauthAPService
    service = DeauthAPService(db)
    return service.get_aps(search=search, limit=limit, offset=offset)


@router.get("/aps/{bssid}/clients")
async def get_ap_clients(
    bssid: str,
    db: Session = Depends(get_db)
):
    """Get all clients connected to a specific AP."""
    from app.services.deauth.ap_service import DeauthAPService
    service = DeauthAPService(db)
    return service.get_ap_clients(bssid)


@router.post("/aps/{bssid}/deauth")
async def deauth_ap(
    bssid: str,
    request: DeauthRequest,
    db: Session = Depends(get_db)
):
    """Deauth all clients connected to an AP."""
    from app.services.deauth.ap_service import DeauthAPService
    service = DeauthAPService(db)
    result = service.deauth_ap_clients(
        bssid=bssid,
        reason=request.reason,
        operator=request.operator or "System",
        count=request.count
    )
    return result