from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import subprocess
import re
import os
from pathlib import Path
from typing import Optional, List

router = APIRouter(prefix="/api/interfaces", tags=["interfaces"])

# Pydantic model for interface selection
class InterfaceSelect(BaseModel):
    interface: str  # Matches frontend's { interface: "wlan0" }

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
                parts = line.split()
                if len(parts) >= 2:
                    iface = parts[1]
                    if iface and iface not in interfaces:
                        interfaces.append(iface)
    else:
        # Fallback to 'ip link'
        stdout, stderr, rc = run_command("ip link show")
        if rc == 0:
            for line in stdout.split('\n'):
                if ': ' in line and not line.startswith(' ') and 'lo' not in line:
                    # Extract interface name (e.g., "2: wlan0: <BROADCAST,MULTICAST>")
                    parts = line.split(':')
                    if len(parts) >= 2:
                        iface = parts[1].strip().split()[0]
                        if iface and iface != 'lo' and iface not in interfaces:
                            interfaces.append(iface)
    
    # If no interfaces found, try 'iwconfig' as last resort
    if not interfaces:
        stdout, stderr, rc = run_command("iwconfig")
        if rc == 0:
            for line in stdout.split('\n'):
                if line and not line.startswith(' ') and 'no wireless extensions' not in line:
                    parts = line.split()
                    if parts:
                        iface = parts[0]
                        if iface and iface not in interfaces:
                            interfaces.append(iface)
    
    # If still no interfaces, return common ones for testing
    if not interfaces:
        interfaces = ["wlan0", "wlan1", "eth0"]
    
    return interfaces

def get_interface_details(iface):
    """Get details for a specific interface."""
    details = {
        'name': iface,
        'mac': 'N/A',
        'mode': 'N/A',
        'status': 'down',
        'frequency': 'N/A',
        'access_point': 'N/A',
        'bitrate': 'N/A',
        'tx_power': 'N/A'
    }
    
    # Get MAC address
    stdout, stderr, rc = run_command(f"cat /sys/class/net/{iface}/address 2>/dev/null")
    if rc == 0 and stdout:
        details['mac'] = stdout.strip()
    
    # Get mode and other details via iwconfig
    stdout, stderr, rc = run_command(f"iwconfig {iface} 2>/dev/null")
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
    stdout, stderr, rc = run_command(f"ip link show {iface} 2>/dev/null")
    if rc == 0:
        if 'UP' in stdout and 'LOWER_UP' in stdout:
            details['status'] = 'up'
        elif 'UP' in stdout:
            details['status'] = 'up'
        else:
            details['status'] = 'down'
    
    return details

@router.get("")
def get_interfaces():
    """List available WiFi interfaces."""
    interfaces = list_interfaces()
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
    try:
        # Ensure directory exists
        SELECTED_INTERFACE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(SELECTED_INTERFACE_FILE, "w") as f:
            f.write(iface)
        return True
    except Exception as e:
        print(f"Error saving selected interface: {e}")
        return False

def load_selected_interface() -> Optional[str]:
    """Load the selected interface from a file, or return None if not set."""
    if SELECTED_INTERFACE_FILE.exists():
        try:
            with open(SELECTED_INTERFACE_FILE, "r") as f:
                return f.read().strip()
        except Exception:
            return None
    return None

@router.post("/select")
def select_interface(data: InterfaceSelect):
    """
    Select an active interface.
    """
    iface = data.interface
    
    if not iface:
        raise HTTPException(status_code=400, detail="No interface provided")
    
    interfaces = list_interfaces()
    if iface not in interfaces:
        raise HTTPException(
            status_code=400, 
            detail=f"Interface '{iface}' is not available. Available interfaces: {', '.join(interfaces)}"
        )
    
    if not save_selected_interface(iface):
        raise HTTPException(status_code=500, detail="Failed to save interface selection")
    
    return {
        "success": True,
        "message": f"Interface '{iface}' selected successfully",
        "selected_interface": iface,
        "available_interfaces": interfaces
    }

@router.get("/selected")
def get_selected_interface():
    """Get the currently selected interface."""
    selected = load_selected_interface()
    
    # Validate that the selected interface still exists
    if selected:
        interfaces = list_interfaces()
        if selected not in interfaces:
            return {
                "selected_interface": None,
                "message": f"Previously selected interface '{selected}' is no longer available"
            }
        return {
            "selected_interface": selected,
            "message": f"Current selected interface: {selected}"
        }
    
    return {
        "selected_interface": None,
        "message": "No interface selected"
    }

@router.get("/details/all")
def get_all_interfaces_details():
    """Get details for all available interfaces."""
    interfaces = list_interfaces()
    details = []
    for iface in interfaces:
        details.append(get_interface_details(iface))
    return {"interfaces": details}

@router.post("/refresh")
def refresh_interfaces():
    """Force refresh of interface list."""
    interfaces = list_interfaces()
    return {
        "message": "Interface list refreshed",
        "interfaces": interfaces,
        "count": len(interfaces)
    }