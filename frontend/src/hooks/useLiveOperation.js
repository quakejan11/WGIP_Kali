    // src/hooks/useLiveOperation.js
import { useState, useEffect, useRef, useCallback } from "react";
import targetService from "../services/targetService";

// ─── Cache keys + TTL ───
export const CACHE_KEYS = {
  DEVICES: "live_operation_devices",
  PAGE: "live_operation_page",
  SEARCH: "live_operation_search",
  SORT: "live_operation_sort",
  BAND: "live_operation_band",
  KISMET_STATUS: "live_operation_kismet_status",
  LAST_FETCH: "live_operation_last_fetch",
  GPS: "live_operation_gps",
  INTERFACE: "live_operation_interface",
};
const CACHE_TTL = 30000;
const HISTORY_WINDOW_MS = 10000; // 10s sparkline window
const POLL_DEVICES_MS = 3000;
const POLL_STATUS_MS = 5000;

// ─── Helper: band from channel (FIXED) ───
export const getBand = (channel) => {
  const ch = Number(channel);
  if (!ch || Number.isNaN(ch)) return "Unknown";
  if (ch >= 1 && ch <= 14) return "2.4 GHz";
  if (ch >= 32 && ch <= 177) return "5 GHz";
  if (ch >= 178 && ch <= 233) return "6 GHz";
  return "Unknown";
};

// ─── Helper: deauth eligibility (2.4 GHz only) ───
export const isDeauthEligible = (channel) =>
  getBand(channel) === "2.4 GHz";

// ─── Helper: GPS formatting ───
export const formatGps = (gps) => {
  if (!gps || gps.lat == null || gps.lon == null) return "N/A";
  return `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
};

export const gpsFixLabel = (fix) => {
  switch (fix) {
    case 3: return "3D";
    case 2: return "2D";
    case 1: return "No fix";
    case 0: return "No GPS";
    default: return "—";
  }
};

// ─── The hook ───
const useLiveOperation = () => {
  const [interfaces, setInterfaces] = useState([]);
  const [interfacesLoading, setInterfacesLoading] = useState(true);
  const [selectedInterface, setSelectedInterface] = useState(
    () => localStorage.getItem(CACHE_KEYS.INTERFACE) || ""
  );

  const [kismetStatus, setKismetStatus] = useState(
    () => localStorage.getItem(CACHE_KEYS.KISMET_STATUS) || "stopped"
  );
  const [tempDbStatus, setTempDbStatus] = useState("inactive");
  const [packetCount, setPacketCount] = useState(0);
  const [recordsCount, setRecordsCount] = useState(0);
  const [oldestRecord, setOldestRecord] = useState("");
  const [newestRecord, setNewestRecord] = useState("");

  const [gps, setGps] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEYS.GPS);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [devices, setDevices] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEYS.DEVICES);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [loadingDevices, setLoadingDevices] = useState(false);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  // Rolling signal history: bssid -> [{ t, signal }]
  const historyRef = useRef({});

  // ─── Persist caches ───
  useEffect(() => {
    try {
      localStorage.setItem(CACHE_KEYS.DEVICES, JSON.stringify(devices));
    } catch (e) {
      console.warn("Failed to cache devices:", e);
    }
  }, [devices]);

  useEffect(() => {
    if (gps) {
      try {
        localStorage.setItem(CACHE_KEYS.GPS, JSON.stringify(gps));
      } catch (e) {
        console.warn("Failed to cache GPS:", e);
      }
    }
  }, [gps]);

  useEffect(() => {
    localStorage.setItem(CACHE_KEYS.KISMET_STATUS, kismetStatus);
  }, [kismetStatus]);

  useEffect(() => {
    if (selectedInterface) {
      localStorage.setItem(CACHE_KEYS.INTERFACE, selectedInterface);
    }
  }, [selectedInterface]);

  // ─── Fetchers ───
  const fetchInterfaces = useCallback(async () => {
    setInterfacesLoading(true);
    try {
      const response = await fetch("/api/interfaces");
      if (!response.ok) throw new Error("Failed to fetch interfaces");
      const data = await response.json();
      const interfaceList = data.interfaces || [];
      setInterfaces(interfaceList);
      setSelectedInterface((prev) => prev || interfaceList[0] || "");
    } catch (err) {
      console.error("Failed to fetch interfaces", err);
    } finally {
      setInterfacesLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const [kismetRes, tempDbRes] = await Promise.all([
        fetch("/api/kismet/status"),
        fetch("/api/live/status"),
      ]);
      const kismetData = await kismetRes.json();
      const tempDbData = await tempDbRes.json();
      const isKismetRunning = kismetData.running || false;

      setKismetStatus(isKismetRunning ? "running" : "stopped");
      setTempDbStatus((tempDbData.total_count || 0) > 0 ? "active" : "inactive");
      setPacketCount(kismetData.packet_count || 0);
      setRecordsCount(tempDbData.total_count || 0);
      setOldestRecord(tempDbData.oldest_record || "");
      setNewestRecord(tempDbData.newest_record || "");
    } catch (err) {
      console.error("Failed to fetch status", err);
    }
  }, []);

  const fetchGps = useCallback(async () => {
    try {
      const res = await fetch("/api/live/gps");
      if (!res.ok) {
        setGps(null);
        return;
      }
      const data = await res.json();
      setGps(data);
    } catch {
      setGps(null);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const response = await fetch("/api/live/events/recent?limit=1000");
      if (!response.ok) throw new Error("Failed to fetch devices");
      const data = await response.json();

      let devicesData = [];
      if (Array.isArray(data)) devicesData = data;
      else if (data.events) devicesData = data.events;
      else if (data.data) devicesData = data.data;

      const transformedDevices = devicesData.map((device) => ({
        bssid: device.bssid || "00:00:00:00:00:00",
        ssid: device.essid || device.ssid || "Unknown",
        manufacturer: device.vendor || device.data?.vendor || "",
        encryption: device.security || device.data?.security || "Unknown",
        channel: device.channel || 1,
        clients: device.clients || device.data?.clients || 0,
        lastSeen: device.last_seen || new Date().toLocaleTimeString(),
        signal: device.signal || -60,
        lat: device.data?.lat ?? device.lat ?? gps?.lat ?? null,
        lon: device.data?.lon ?? device.lon ?? gps?.lon ?? null,
        alt: device.data?.alt ?? device.alt ?? gps?.alt ?? null,
        gpsFix: device.data?.gps_fix ?? device.gps_fix ?? gps?.fix ?? null,
      }));

      // Dedupe by BSSID, keep strongest signal
      const uniqueDevices = {};
      transformedDevices.forEach((device) => {
        const prev = uniqueDevices[device.bssid];
        if (!prev || device.signal > prev.signal) {
          uniqueDevices[device.bssid] = device;
        }
      });

      const finalDevices = Object.values(uniqueDevices);
      finalDevices.sort((a, b) => b.signal - a.signal);

      // ─── Update rolling signal history ───
      const now = Date.now();
      finalDevices.forEach((d) => {
        const arr = historyRef.current[d.bssid] || [];
        arr.push({ t: now, signal: d.signal });
        historyRef.current[d.bssid] = arr.filter(
          (p) => now - p.t <= HISTORY_WINDOW_MS
        );
      });

      // Attach history as plain array of numbers for the sparkline
      finalDevices.forEach((d) => {
        d.signalHistory = (historyRef.current[d.bssid] || []).map((p) => p.signal);
      });

      setDevices(finalDevices);
      localStorage.setItem(CACHE_KEYS.LAST_FETCH, String(Date.now()));
    } catch (err) {
      console.error("Failed to fetch devices:", err);
    } finally {
      setLoadingDevices(false);
    }
  }, [gps]);

  // ─── Initial load + status poll ───
  useEffect(() => {
    fetchInterfaces();
    fetchStatus();
    fetchGps();

    const lastFetch = parseInt(
      localStorage.getItem(CACHE_KEYS.LAST_FETCH) || "0",
      10
    );
    const age = Date.now() - lastFetch;
    const cachedStatus = localStorage.getItem(CACHE_KEYS.KISMET_STATUS);

    if (cachedStatus === "running" && age > CACHE_TTL) {
      fetchDevices();
    }

    const statusInterval = setInterval(fetchStatus, POLL_STATUS_MS);
    return () => clearInterval(statusInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Device + GPS poll when running ───
  useEffect(() => {
    if (kismetStatus !== "running") return;
    const deviceInterval = setInterval(fetchDevices, POLL_DEVICES_MS);
    const gpsInterval = setInterval(fetchGps, POLL_DEVICES_MS);
    return () => {
      clearInterval(deviceInterval);
      clearInterval(gpsInterval);
    };
  }, [kismetStatus, fetchDevices, fetchGps]);

  // ─── Actions ───
  const handleStartKismet = async () => {
    if (!selectedInterface) return;
    try {
      await fetch("/api/interfaces/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interface: selectedInterface }),
      });
      await fetch("/api/kismet/start", { method: "POST" });
      setTimeout(fetchStatus, 1000);
      setTimeout(fetchGps, 1500);
    } catch (err) {
      console.error("Failed to start Kismet", err);
    }
  };

  const handleStopKismet = async () => {
    try {
      await fetch("/api/kismet/stop", { method: "POST" });
      setTimeout(fetchStatus, 1000);
    } catch (err) {
      console.error("Failed to stop Kismet", err);
    }
  };

  const handleRefresh = () => {
    fetchStatus();
    fetchGps();
    if (kismetStatus === "running") fetchDevices();
  };

  const handleSelectTarget = async (device) => {
    if (!isDeauthEligible(device.channel)) {
      setSnackbar({
        open: true,
        message: `Cannot select 5 GHz target — only 2.4 GHz supported`,
        severity: "error",
      });
      return;
    }
    try {
      await targetService.saveTarget({
        bssid: device.bssid,
        ssid: device.ssid,
        channel: device.channel,
        signal: device.signal,
        handshake: "pending",
        status: "pending",
        lat: device.lat,
        lon: device.lon,
      });
      setSnackbar({
        open: true,
        message: `Target saved: ${device.ssid} (${device.bssid})`,
        severity: "success",
      });
    } catch (error) {
      console.error("Failed to save target:", error);
      setSnackbar({
        open: true,
        message: `Failed to save target: ${
          error.response?.data?.detail || error.message
        }`,
        severity: "error",
      });
    }
  };

  return {
    // state
    interfaces,
    interfacesLoading,
    selectedInterface,
    setSelectedInterface,
    kismetStatus,
    tempDbStatus,
    packetCount,
    recordsCount,
    oldestRecord,
    newestRecord,
    gps,
    devices,
    loadingDevices,
    snackbar,
    setSnackbar,

    // actions
    handleStartKismet,
    handleStopKismet,
    handleRefresh,
    handleSelectTarget,
    fetchDevices,
  };
};

export default useLiveOperation;