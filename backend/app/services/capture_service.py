# app/services/capture_service.py
import subprocess
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any


BACKEND_DIR = Path(__file__).parent.parent.parent
CAPTURES_DIR = BACKEND_DIR / "captures"
RAW_DIR = CAPTURES_DIR / "raw"
LOGS_DIR = CAPTURES_DIR / "logs"
HANDSHAKES_DIR = CAPTURES_DIR / "handshakes"

for d in [CAPTURES_DIR, RAW_DIR, LOGS_DIR, HANDSHAKES_DIR]:
    d.mkdir(parents=True, exist_ok=True)


class CaptureService:
    def __init__(self):
        self.active_captures: Dict[str, Dict[str, Any]] = {}
        self._handshake_cache: Dict[str, tuple] = {}
        self._cache_ttl = 10

    def start_capture(
        self,
        bssid: str,
        channel: int,
        interface: str = "wlan2mon",
    ) -> Dict[str, Any]:
        if bssid in self.active_captures:
            print(f"⚠️ Capture already running for {bssid}")
            return self.active_captures[bssid]

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_bssid = bssid.replace(":", "-")

        cap_base = RAW_DIR / f"{safe_bssid}_{timestamp}"
        log_file = LOGS_DIR / f"{safe_bssid}_{timestamp}.log"

        # ⬇️ Skip iw set channel — airodump-ng --channel handles it
        print(f"ℹ️ airodump-ng will set channel {channel} via --channel flag")

        cmd = [
            "sudo", "airodump-ng",
            "--bssid", bssid,
            "--channel", str(channel),
            "--write", str(cap_base),
            "--output-format", "cap",
            interface,
        ]

        print(f"🚀 Starting capture: {' '.join(cmd)}")

        log_handle = open(log_file, "w")
        process = subprocess.Popen(
            cmd,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
        )

        capture_info = {
            "bssid": bssid,
            "channel": channel,
            "interface": interface,
            "process": process,
            "pid": process.pid,
            "cap_file": f"{cap_base}.cap",
            "log_file": str(log_file),
            "started_at": time.time(),
            "log_handle": log_handle,
        }

        self.active_captures[bssid] = capture_info
        self._handshake_cache.pop(bssid, None)
        print(f"✅ Capture started for {bssid} (PID: {process.pid})")
        return capture_info

    def check_handshake(self, bssid: str, log_file: Optional[str] = None) -> bool:
        now = time.time()
        cached = self._handshake_cache.get(bssid)
        if cached:
            result, ts = cached
            if now - ts < self._cache_ttl:
                return result
            if result is True:
                return True

        result = False
        if log_file and os.path.exists(log_file):
            result = self._check_log_file(log_file)
        elif bssid in self.active_captures:
            mem_log = self.active_captures[bssid].get("log_file")
            if mem_log and os.path.exists(mem_log):
                result = self._check_log_file(mem_log)

        self._handshake_cache[bssid] = (result, now)
        return result

    def _check_log_file(self, log_file: str) -> bool:
        try:
            with open(log_file, "rb") as f:
                f.seek(0, 2)
                size = f.tell()
                f.seek(max(0, size - 8192))
                tail = f.read().decode("utf-8", errors="ignore")
                if "WPA handshake:" in tail:
                    return True
        except Exception as e:
            print(f"⚠️ Error reading log {log_file}: {e}")
        return False

    def stop_capture(self, bssid: str) -> bool:
        info = self.active_captures.pop(bssid, None)
        if not info:
            return False

        process = info.get("process")
        log_handle = info.get("log_handle")

        try:
            if process and process.poll() is None:
                process.terminate()
                time.sleep(1)
                if process.poll() is None:
                    process.kill()

            if log_handle:
                log_handle.close()

            self._handshake_cache.pop(bssid, None)
            print(f"✅ Capture stopped for {bssid}")
            return True
        except Exception as e:
            print(f"❌ Error stopping capture: {e}")
            return False

    def get_status(self, bssid: str) -> Optional[Dict[str, Any]]:
        if bssid not in self.active_captures:
            return None

        info = self.active_captures[bssid]
        process = info.get("process")
        running = False
        if process:
            process.poll()
            running = process.returncode is None

        elapsed = time.time() - info.get("started_at", time.time())

        return {
            "bssid": bssid,
            "running": running,
            "pid": info.get("pid"),
            "cap_file": info.get("cap_file"),
            "log_file": info.get("log_file"),
            "elapsed_seconds": round(elapsed, 1),
            "handshake_detected": self.check_handshake(bssid),
        }

    def stop_all(self):
        bssids = list(self.active_captures.keys())
        for bssid in bssids:
            self.stop_capture(bssid)


capture_service = CaptureService()