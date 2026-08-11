#!/usr/bin/env python3
"""
Script to list and manage WiFi interfaces for the Live Operation feature.
"""
import subprocess
import re
import sys
import os

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
            if line.startswith('Interface'):
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

def main():
    if len(sys.argv) < 2:
        print("Usage: wifi_interface.py [list|details <interface>]")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'list':
        interfaces = list_interfaces()
        if interfaces:
            print("Available WiFi interfaces:")
            for iface in interfaces:
                print(f"  {iface}")
        else:
            print("No WiFi interfaces found.")
    
    elif command == 'details':
        if len(sys.argv) < 3:
            print("Usage: wifi_interface.py details <interface>")
            sys.exit(1)
        iface = sys.argv[2]
        details = get_interface_details(iface)
        if details:
            print(f"Details for interface {iface}:")
            for key, value in details.items():
                print(f"  {key}: {value}")
        else:
            print(f"Could not get details for interface {iface}")
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main()