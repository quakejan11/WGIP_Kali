from fastapi import APIRouter, HTTPException, BackgroundTasks
import subprocess
import sys
import os
from pathlib import Path
import json
from datetime import datetime

# Add the backend directory to the path so we can import app modules
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.pcap_monitor import pcap_monitor

router = APIRouter(prefix="/api/kismet", tags=["kismet"])

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
        # Return the first PID if multiple
        return stdout.split('\n')[0]
    return None

@router.post("/start")
def start_kismet(background_tasks: BackgroundTasks):
    """Start Kismet on selected interface"""
    # Get selected interface from file
    selected_interface_file = backend_dir / "selected_interface.txt"
    if not selected_interface_file.exists():
        raise HTTPException(status_code=400, detail="No interface selected. Please select an interface first.")
    
    with open(selected_interface_file, "r") as f:
        interface = f.read().strip()
    
    if not interface:
        raise HTTPException(status_code=400, detail="No interface selected.")
    
    # Check if Kismet is already running
    if is_kismet_running():
        # If already running, stop it first
        subprocess.run("pkill kismet", shell=True)
        # Wait a moment
        import time
        time.sleep(2)
    
    # Start Kismet in background
    cmd = f"kismet -c {interface} --no-daemonize"
    
    try:
        # Start Kismet process
        process = subprocess.Popen(
            cmd.split(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Wait a moment to see if it starts successfully
        import time
        time.sleep(3)
        
        # Check if process is still running
        if process.poll() is None:
            # Start PCAP monitoring in background
            background_tasks.add_task(pcap_monitor.start_monitoring)
            return {
                "message": f"Kismet started on interface {interface}",
                "interface": interface,
                "pid": process.pid
            }
        else:
            stdout, stderr = process.communicate()
            raise HTTPException(status_code=500, detail=f"Failed to start Kismet: {stderr.decode()}")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error starting Kismet: {str(e)}")

@router.post("/stop")
def stop_kismet():
    """Stop Kismet"""
    # Stop PCAP monitoring
    pcap_monitor.stop_monitoring()
    
    # Stop Kismet process
    if is_kismet_running():
        stdout, stderr, rc = run_command("pkill kismet")
        if rc == 0:
            # Wait a moment to ensure it stops
            import time
            time.sleep(2)
            if not is_kismet_running():
                return {"message": "Kismet stopped successfully"}
            else:
                # Force kill if still running
                run_command("pkill -9 kismet")
                time.sleep(1)
                if not is_kismet_running():
                    return {"message": "Kismet stopped successfully (force killed)"}
                else:
                    raise HTTPException(status_code=500, detail="Failed to stop Kismet")
        else:
            raise HTTPException(status_code=500, detail="Failed to stop Kismet")
    else:
        return {"message": "Kismet is not running"}

@router.get("/status")
def get_kismet_status():
    """Check Kismet status"""
    if is_kismet_running():
        pid = get_kismet_pid()
        return {
            "running": True,
            "pid": pid,
            "message": f"Kismet is running (PID: {pid})"
        }
    else:
        return {
            "running": False,
            "pid": None,
            "message": "Kismet is not running"
        }

# PCAP status endpoint would be better served by the pcap_monitor directly
# But let's add a simple endpoint for now
@router.get("/status/detailed")
def get_kismet_status_detailed():
    """Get detailed Kismet status including PCAP health"""
    kismet_running = is_kismet_running()
    pcap_healthy = pcap_monitor.pcap_healthy
    fallback_active = pcap_monitor.fallback_active
    
    return {
        "kismet_running": kismet_running,
        "pcap_healthy": pcap_healthy,
        "fallback_active": fallback_active,
        "message": f"Kismet: {'Running' if kismet_running else 'Stopped'}, PCAP: {'Healthy' if pcap_healthy else 'Unhealthy'}, Mode: {'Fallback' if fallback_active else 'Live'}"
    }