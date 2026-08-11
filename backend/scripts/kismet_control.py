#!/usr/bin/env python3
"""
Script to start and stop Kismet on a selected WiFi interface for the Live Operation feature.
"""
import subprocess
import re
import sys
import os
import time
import signal
from pathlib import Path

# Global variable to track Kismet process
kismet_process = None

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

def start_kismet(interface):
    """Start Kismet on the specified interface."""
    global kismet_process
    
    # Check if Kismet is already running
    if is_kismet_running():
        print("Kismet is already running. Stopping it first...")
        stop_kismet()
        time.sleep(2)  # Give it time to stop
    
    # Start Kismet with the specified interface
    # Using the Kismet server with REST API enabled (typically on port 2501)
    cmd = f"kismet -c {interface} --no-daemonize"
    
    try:
        print(f"Starting Kismet on interface {interface}...")
        # Start Kismet in background
        kismet_process = subprocess.Popen(
            cmd.split(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Wait a moment to see if it starts successfully
        time.sleep(3)
        
        # Check if process is still running
        if kismet_process.poll() is None:
            print(f"Kismet started successfully on {interface} (PID: {kismet_process.pid})")
            return True
        else:
            stdout, stderr = kismet_process.communicate()
            print(f"Failed to start Kismet: {stderr.decode()}")
            return False
            
    except Exception as e:
        print(f"Error starting Kismet: {e}")
        return False

def stop_kismet():
    """Stop Kismet if it's running."""
    global kismet_process
    
    # First try to stop our tracked process
    if kismet_process and kismet_process.poll() is None:
        print("Stopping Kismet process...")
        kismet_process.terminate()
        try:
            kismet_process.wait(timeout=5)
            print("Kismet stopped.")
            kismet_process = None
            return True
        except subprocess.TimeoutExpired:
            print("Kismet did not stop gracefully, forcing...")
            kismet_process.kill()
            kismet_process.wait()
            kismet_process = None
            return True
    
    # Then try to stop any other Kismet processes
    if is_kismet_running():
        print("Stopping any remaining Kismet processes...")
        stdout, stderr, rc = run_command("pkill kismet")
        if rc == 0:
            time.sleep(2)
            if not is_kismet_running():
                print("Kismet stopped.")
                return True
            else:
                print("Failed to stop Kismet.")
                return False
    else:
        print("Kismet is not running.")
        return True

def get_kismet_status():
    """Get the current status of Kismet."""
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

def main():
    if len(sys.argv) < 2:
        print("Usage: kismet_control.py [start <interface>|stop|status]")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'start':
        if len(sys.argv) < 3:
            print("Usage: kismet_control.py start <interface>")
            sys.exit(1)
        interface = sys.argv[2]
        success = start_kismet(interface)
        sys.exit(0 if success else 1)
    
    elif command == 'stop':
        success = stop_kismet()
        sys.exit(0 if success else 1)
    
    elif command == 'status':
        status = get_kismet_status()
        print(f"Kismet Status: {status['message']}")
        if status['running']:
            print(f"PID: {status['pid']}")
        sys.exit(0)
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main()