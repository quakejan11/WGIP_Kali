from fastapi import APIRouter, HTTPException
import subprocess
import re
import os
from pathlib import Path
from typing import Optional

router = APIRouter(prefix="/api/interfaces", tags=["interfaces"])

def run_command(command):
    """Run a shell command and return the output."""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except Exception as e:
        return "", str(e), 1

def list_interfaces():
    """List available WiFi interfaces."""
    interfaces = []
    
    # Try using 'iw dev'
    stdout, stderr, rc = run_command("iw dev")
    if rc == 0:
        # Parse output for interfaces
        for line in stdout.split('\n'):
            # Check if line contains 'Interface' (after stripping whitespace)
            if line.strip().startswith('Interface'):
                iface = line.split()[1]
                interfaces.append(iface)
    else:
        # Fallback to 'ip link'
        stdout, stderr, rc = run_command("ip link show")
        if rc == 0:
            for line in stdout.split('\n'):
                if ': ' in line and not line.startswith(' ') and 'lo' not in line:
                    # Extract interface name (e.g., "2: wlan0: <BROADCAST,MULTICAST>")
                    iface = line.split(':')[1].strip().split()[0]
                    if iface != 'lo':
                        interfaces.append(iface)
    
    return interfaces

def get_interface_details(iface):
    """Get details for a specific interface."""
    details = {}
    
    # Get MAC address
    stdout, stderr, rc = run_command(f"cat /sys/class/net/{iface}/address")
    if rc == 0:
        details['mac'] = stdout.strip()
    
    # Get mode (if available via iwconfig)
    stdout, stderr, rc = run_command(f"iwconfig {iface}")
    if rc == 0:
        for line in stdout.split('\n'):
            if 'Mode:' in line:
                mode = line.split('Mode:')[1].split()[0]
                details['mode'] = mode
            if 'Frequency:' in line:
                freq = line.split('Frequency:')[1].split()[0]
                details['frequency'] = freq
            if 'Access Point:' in line:
                ap = line.split('Access Point:')[1].split()[0]
                details['access_point'] = ap
            if 'Bit Rate:' in line:
                bitrate = line.split('Bit Rate:')[1].split()[0]
                details['bitrate'] = bitrate
            if 'Tx-Power=' in line:
                txpower = line.split('Tx-Power=')[1].split()[0]
                details['tx_power'] = txpower
    
    # Get status (up/down)
    stdout, stderr, rc = run_command(f"ip link show {iface}")
    if rc == 0:
        if 'UP' in stdout:
            details['status'] = 'up'
        else:
            details['status'] = 'down'
    
    return details

@router.get("")
def get_interfaces():
    """List available WiFi interfaces."""
    interfaces = list_interfaces()
    if not interfaces:
        raise HTTPException(status_code=404, detail="No WiFi interfaces found")
    return {"interfaces": interfaces}

@router.get("/{iface}")
def get_interface(iface: str):
    """Get details for a specific interface."""
    interfaces = list_interfaces()
    if iface not in interfaces:
        raise HTTPException(status_code=404, detail=f"Interface {iface} not found")
    details = get_interface_details(iface)
    return {"interface": iface, "details": details}

# For selecting an interface, we'll store the selection in a file
SELECTED_INTERFACE_FILE = Path(__file__).parent.parent.parent / "selected_interface.txt"

def save_selected_interface(iface: str):
    """Save the selected interface to a file."""
    with open(SELECTED_INTERFACE_FILE, "w") as f:
        f.write(iface)

def load_selected_interface() -> Optional[str]:
    """Load the selected interface from a file, or return None if not set."""
    if SELECTED_INTERFACE_FILE.exists():
        with open(SELECTED_INTERFACE_FILE, "r") as f:
            return f.read().strip()
    return None

@router.post("/select")
def select_interface(iface: str):
    """Select an active interface."""
    interfaces = list_interfaces()
    if iface not in interfaces:
        raise HTTPException(status_code=400, detail=f"Interface {iface} is not available")
    save_selected_interface(iface)
    return {"message": f"Interface {iface} selected", "selected_interface": iface}

@router.get("/selected")
def get_selected_interface():
    """Get the currently selected interface."""
    selected = load_selected_interface()
    if selected is None:
        return {"selected_interface": None, "message": "No interface selected"}
    return {"selected_interface": selected}
