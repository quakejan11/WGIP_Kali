from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import subprocess
import sys
import os
from pathlib import Path
import json
from datetime import datetime
from typing import Optional
import glob

# Add the backend directory to the path so we can import app modules
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.pcap_monitor import pcap_monitor

router = APIRouter(prefix="/api/kismet", tags=["kismet"])

# ✅ FIX: Use the same path as interfaces.py
SELECTED_INTERFACE_FILE = Path(__file__).parent.parent.parent / "selected_interface.txt"

def run_command(command):
    """Run a shell command and return the output."""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except Exception as e:
        return "", str(e), 1

def is_kismet_running():
    """Check if Kismet is currently running."""
    # Method 1: pgrep
    stdout, stderr, rc = run_command("pgrep kismet")
    if rc == 0 and stdout != "":
        return True
    
    # Method 2: ps aux as fallback
    stdout, stderr, rc = run_command("ps aux | grep kismet | grep -v grep | grep -v python | grep -v uvicorn")
    if rc == 0 and stdout.strip() != "":
        return True
    
    return False

def get_kismet_pid():
    """Get the PID of the Kismet process."""
    stdout, stderr, rc = run_command("pgrep kismet")
    if rc == 0 and stdout != "":
        return stdout.split('\n')[0]
    
    # Fallback: get from ps aux
    stdout, stderr, rc = run_command("ps aux | grep kismet | grep -v grep | grep -v python | grep -v uvicorn | awk '{print $2}'")
    if rc == 0 and stdout.strip() != "":
        return stdout.split('\n')[0]
    
    return None

def get_selected_interface():
    """Get the selected interface from the file."""
    if SELECTED_INTERFACE_FILE.exists():
        with open(SELECTED_INTERFACE_FILE, "r") as f:
            return f.read().strip()
    return None

def invalidate_live_cache():
    """Invalidate the live endpoint cache"""
    try:
        from app.api.live import cached_networks, cache_time
        cached_networks = []
        cache_time = None
        print("🔄 Live cache invalidated")
    except Exception as e:
        print(f"⚠️ Could not invalidate cache: {e}")

def reset_websocket_flag():
    """Reset the WebSocket stop flag"""
    try:
        from app.api.live import reset_websocket_flag as reset_flag
        reset_flag()
        print("🔄 WebSocket flag reset")
    except Exception as e:
        print(f"⚠️ Could not reset WebSocket flag: {e}")

@router.post("/start")
def start_kismet(background_tasks: BackgroundTasks):
    """
    Start Kismet on selected interface with REST API enabled.
    Uses the exact command: sudo kismet -c {interface} --no-daemonize --httpd-rest-api=true --httpd-port=2501 --httpd-allow-cors=true
    """
    print("=" * 60)
    print("🚀 START KISMET CALLED")
    print("=" * 60)
    
    interface = get_selected_interface()
    print(f"📡 Interface: {interface}")
    
    if not interface:
        raise HTTPException(status_code=400, detail="No interface selected. Please select an interface first.")
    
    # Reset WebSocket flag
    reset_websocket_flag()
    
    # Check if Kismet is already running
    if is_kismet_running():
        print("⚠️ Kismet already running, stopping it first...")
        subprocess.run("sudo pkill -9 kismet", shell=True)
        import time
        time.sleep(2)
    
    # Invalidate cache
    invalidate_live_cache()
    
    # ✅ Use the exact command you want
    cmd = f"sudo kismet -c {interface} --no-daemonize --httpd-rest-api=true --httpd-port=2501 --httpd-allow-cors=true"
    print(f"🔍 Command: {cmd}")
    
    try:
        # Start Kismet process
        process = subprocess.Popen(
            cmd.split(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL
        )
        
        import time
        time.sleep(5)
        
        # Check if process is still running
        if process.poll() is None:
            print(f"✅ Kismet started with PID: {process.pid}")
            
            # Check if the .kismet file is being created/updated
            kismet_files = glob.glob(os.path.expanduser("~/Kismet-*.kismet"))
            print(f"📁 .kismet files found: {len(kismet_files)}")
            if kismet_files:
                latest = max(kismet_files, key=os.path.getmtime)
                print(f"📁 Latest file: {latest}")
                print(f"📁 File size: {os.path.getsize(latest)} bytes")
                print(f"📁 Modified: {datetime.fromtimestamp(os.path.getmtime(latest))}")
            else:
                print("❌ No .kismet files found!")
                sudo_files = glob.glob("/root/Kismet-*.kismet")
                if sudo_files:
                    print(f"📁 Found files in /root/: {sudo_files}")
            
            background_tasks.add_task(pcap_monitor.start_monitoring)
            return {
                "success": True,
                "message": f"Kismet started on interface {interface}",
                "interface": interface,
                "pid": process.pid
            }
        else:
            stdout, stderr = process.communicate()
            print(f"❌ Kismet failed to start: {stderr.decode()}")
            raise HTTPException(status_code=500, detail=f"Failed to start Kismet: {stderr.decode()}")
            
    except FileNotFoundError:
        print("❌ Kismet not installed")
        return {
            "success": True,
            "message": f"Kismet would start on interface {interface} (simulated - Kismet not installed)",
            "interface": interface,
            "simulated": True
        }
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error starting Kismet: {str(e)}")

@router.post("/stop")
def stop_kismet():
    """Stop Kismet - Multiple methods to ensure it stops"""
    print("=" * 60)
    print("⏹️ STOP KISMET CALLED")
    print("=" * 60)
    
    # 1. Stop WebSocket connections FIRST
    try:
        from app.api.live import stop_websocket_connections
        stop_websocket_connections()
        print("✅ WebSocket stop flag set")
    except Exception as e:
        print(f"⚠️ Error stopping WebSocket: {e}")
    
    # 2. Stop PCAP monitoring
    try:
        pcap_monitor.stop_monitoring()
        print("✅ PCAP Monitor stopped")
    except Exception as e:
        print(f"⚠️ Error stopping PCAP monitor: {e}")
    
    # 3. Invalidate cache
    invalidate_live_cache()
    print("✅ Live cache invalidated")
    
    # 4. Check if Kismet is running
    if not is_kismet_running():
        print("ℹ️ Kismet is not running")
        return {"message": "Kismet is not running", "status": "stopped"}
    
    import time
    
    # 5. Kill Kismet process
    print("🔍 Attempting to stop Kismet...")
    commands = [
        "sudo pkill -9 kismet",
        "sudo killall -9 kismet",
        "sudo pkill -9 kismet_cap_linux_wifi"
    ]
    
    for cmd in commands:
        print(f"🔍 Running: {cmd}")
        run_command(cmd)
        time.sleep(1)
        if not is_kismet_running():
            print("✅ Kismet stopped")
            # Reset WebSocket flag for next start
            reset_websocket_flag()
            return {"message": "Kismet stopped successfully", "status": "stopped"}
    
    # If all methods fail
    print("❌ Failed to stop Kismet")
    raise HTTPException(status_code=500, detail="Failed to stop Kismet")

@router.get("/status")
def get_kismet_status():
    """Check Kismet status"""
    interface = get_selected_interface()
    
    if is_kismet_running():
        pid = get_kismet_pid()
        return {
            "running": True,
            "pid": pid,
            "message": f"Kismet is running (PID: {pid})",
            "interface": interface
        }
    else:
        return {
            "running": False,
            "pid": None,
            "message": "Kismet is not running",
            "interface": interface
        }

@router.get("/status/detailed")
def get_kismet_status_detailed():
    """Get detailed Kismet status including PCAP health"""
    kismet_running = is_kismet_running()
    pcap_healthy = pcap_monitor.pcap_healthy
    fallback_active = pcap_monitor.fallback_active
    interface = get_selected_interface()
    
    return {
        "kismet_running": kismet_running,
        "pcap_healthy": pcap_healthy,
        "fallback_active": fallback_active,
        "interface": interface,
        "message": f"Kismet: {'Running' if kismet_running else 'Stopped'}, PCAP: {'Healthy' if pcap_healthy else 'Unhealthy'}, Mode: {'Fallback' if fallback_active else 'Live'}"
    }

@router.get("/debug/files")
def debug_files():
    """Debug endpoint to check Kismet files"""
    result = {
        "home_files": glob.glob(os.path.expanduser("~/Kismet-*.kismet")),
        "root_files": glob.glob("/root/Kismet-*.kismet"),
        "selected_interface": get_selected_interface(),
        "kismet_running": is_kismet_running(),
        "kismet_pid": get_kismet_pid()
    }
    
    # Get file details
    for location in ["home_files", "root_files"]:
        if result[location]:
            files = []
            for f in result[location]:
                files.append({
                    "path": f,
                    "size": os.path.getsize(f),
                    "modified": datetime.fromtimestamp(os.path.getmtime(f)).isoformat()
                })
            result[location + "_details"] = files
    
    return result