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

# Default channels to scan (all 2.4GHz channels)
DEFAULT_CHANNELS = "1,2,3,4,5,6,7,8,9,10,11"

# Channel presets
CHANNEL_PRESETS = {
    "2.4ghz_all": "1,2,3,4,5,6,7,8,9,10,11",
    "2.4ghz_common": "1,6,11",
    "5ghz_all": "36,40,44,48,149,153,157,161",
    "5ghz_common": "36,40,44,48",
    "all": "1,2,3,4,5,6,7,8,9,10,11,36,40,44,48,149,153,157,161"
}

class KismetStartRequest(BaseModel):
    channels: Optional[str] = None
    preset: Optional[str] = None

def run_command(command):
    """Run a shell command and return the output."""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except Exception as e:
        return "", str(e), 1

def is_kismet_running():
    """Check if Kismet is currently running."""
    stdout, stderr, rc = run_command("pgrep kismet")
    return rc == 0 and stdout != ""

def get_kismet_pid():
    """Get the PID of the Kismet process."""
    stdout, stderr, rc = run_command("pgrep kismet")
    if rc == 0 and stdout != "":
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

@router.post("/start")
def start_kismet(background_tasks: BackgroundTasks, request: Optional[KismetStartRequest] = None):
    """
    Start Kismet on selected interface with channel options.
    """
    print("=" * 60)
    print("🚀 START KISMET CALLED")
    print("=" * 60)
    
    interface = get_selected_interface()
    print(f"📡 Interface: {interface}")
    
    if not interface:
        raise HTTPException(status_code=400, detail="No interface selected. Please select an interface first.")
    
    # Determine channels to use
    channel_list = DEFAULT_CHANNELS
    
    if request:
        if request.channels:
            channel_list = request.channels
            print(f"📡 Channels from request: {channel_list}")
        elif request.preset and request.preset in CHANNEL_PRESETS:
            channel_list = CHANNEL_PRESETS[request.preset]
            print(f"📡 Preset: {request.preset} -> {channel_list}")
    
    # Check if Kismet is already running
    if is_kismet_running():
        print("⚠️ Kismet already running, stopping it first...")
        subprocess.run("pkill kismet", shell=True)
        import time
        time.sleep(2)
    
    # Invalidate cache
    invalidate_live_cache()
    
    # Build the command with channels
    cmd = f"sudo kismet -c {interface} --no-daemonize --channels={channel_list}"
    print(f"🔍 Command: {cmd}")
    
    try:
        # Start Kismet process
        process = subprocess.Popen(
            cmd.split(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        import time
        time.sleep(5)  # Wait longer for Kismet to start
        
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
                # Check if Kismet is writing to a different location
                sudo_files = glob.glob("/root/Kismet-*.kismet")
                if sudo_files:
                    print(f"📁 Found files in /root/: {sudo_files}")
            
            background_tasks.add_task(pcap_monitor.start_monitoring)
            return {
                "success": True,
                "message": f"Kismet started on interface {interface}",
                "interface": interface,
                "channels": channel_list,
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
            "message": f"Kismet would start on interface {interface} with channels {channel_list} (simulated - Kismet not installed)",
            "interface": interface,
            "channels": channel_list,
            "simulated": True
        }
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error starting Kismet: {str(e)}")

@router.post("/stop")
def stop_kismet():
    """Stop Kismet"""
    print("⏹️ STOP KISMET CALLED")
    pcap_monitor.stop_monitoring()
    invalidate_live_cache()
    
    if is_kismet_running():
        stdout, stderr, rc = run_command("pkill kismet")
        if rc == 0:
            import time
            time.sleep(2)
            if not is_kismet_running():
                print("✅ Kismet stopped successfully")
                return {"message": "Kismet stopped successfully"}
            else:
                run_command("pkill -9 kismet")
                time.sleep(1)
                if not is_kismet_running():
                    print("✅ Kismet stopped successfully (force killed)")
                    return {"message": "Kismet stopped successfully (force killed)"}
                else:
                    print("❌ Failed to stop Kismet")
                    raise HTTPException(status_code=500, detail="Failed to stop Kismet")
        else:
            print("❌ Failed to stop Kismet")
            raise HTTPException(status_code=500, detail="Failed to stop Kismet")
    else:
        print("ℹ️ Kismet is not running")
        return {"message": "Kismet is not running"}

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

@router.get("/channels")
def get_channel_presets():
    """Get available channel presets"""
    return {
        "presets": CHANNEL_PRESETS,
        "default": DEFAULT_CHANNELS
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