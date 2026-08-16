import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Typography,
  TextField,
  MenuItem,
  Stack,
  Tooltip,
  IconButton,
} from "@mui/material";
import { PlayCircleFilled, Stop, Refresh } from "@mui/icons-material";

const LiveOperationSidebar = () => {
  const [interfaces, setInterfaces] = useState([]);
  const [interfacesLoading, setInterfacesLoading] = useState(true);
  const [selectedInterface, setSelectedInterface] = useState("");
  const [kismetStatus, setKismetStatus] = useState("stopped");
  const [tempDbStatus, setTempDbStatus] = useState("inactive");
  const [packetCount, setPacketCount] = useState(0);
  const [recordsCount, setRecordsCount] = useState(0);
  const [oldestRecord, setOldestRecord] = useState("");
  const [newestRecord, setNewestRecord] = useState("");

  useEffect(() => {
    fetchInterfaces();
    const statusInterval = setInterval(fetchStatus, 5000);
    return () => clearInterval(statusInterval);
  }, []);

  const fetchInterfaces = async () => {
    setInterfacesLoading(true);
    try {
      const response = await fetch("/api/interfaces");
      if (!response.ok) throw new Error("Failed to fetch interfaces");
      const data = await response.json();
      // Fix: Backend returns {interfaces: ["wlan0"]}
      const interfaceList = data.interfaces || [];
      setInterfaces(interfaceList);
      if (interfaceList.length > 0 && !selectedInterface) {
        setSelectedInterface(interfaceList[0]);
      }
    } catch (err) {
      console.error("Failed to fetch interfaces", err);
    } finally {
      setInterfacesLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const [kismetRes, tempDbRes] = await Promise.all([
        fetch("/api/kismet/status"),
        fetch("/api/live/status"),
      ]);
      
      const kismetData = await kismetRes.json();
      const tempDbData = await tempDbRes.json();

      // Fix: Backend returns {running: true/false}
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
  };

  const handleStartKismet = async () => {
    if (!selectedInterface) return;
    try {
      await fetch(`/api/interfaces/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interface: selectedInterface }),
      });
      await fetch("/api/kismet/start", { method: "POST" });
      setTimeout(fetchStatus, 1000);
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

  const handleClearAll = async () => {
    try {
      await fetch("/api/live/clear", { method: "POST" });
      fetchStatus();
    } catch (err) {
      console.error("Failed to clear all records", err);
    }
  };

  const handleClearOld = async () => {
    try {
      await fetch("/api/live/clear-old", { method: "POST" });
      fetchStatus();
    } catch (err) {
      console.error("Failed to clear old records", err);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch("/api/live/export", { method: "POST" });
      if (response.ok) {
        console.log("Export completed successfully");
      }
    } catch (err) {
      console.error("Failed to export records", err);
    }
  };

  if (interfacesLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Loading interfaces...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Adapter Selection */}
      <Box>
        <Typography variant="h6" gutterBottom>
          WiFi Adapter
        </Typography>
        <TextField
          select
          label="Interface"
          value={selectedInterface}
          onChange={(e) => setSelectedInterface(e.target.value)}
          fullWidth
          size="small"
          slotProps={{
            select: {
              MenuProps: {
                MenuListProps: { "data-disable-rfx": true }
              }
            }
          }}
        >
          {interfaces.map((iface) => (
            <MenuItem key={iface} value={iface}>
              {iface}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {/* Status Indicators */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Status
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Tooltip title="Kismet Status">
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor:
                    kismetStatus === "running"
                      ? "#22c55e"
                      : kismetStatus === "starting"
                      ? "#f59e0b"
                      : "#ef4444",
                }}
              />
            </Tooltip>
            <Typography variant="body2">
              Kismet:{" "}
              {kismetStatus === "running"
                ? "Running"
                : kismetStatus === "starting"
                ? "Starting..."
                : "Stopped"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Tooltip title="Temp DB Status">
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: tempDbStatus === "active" ? "#22c55e" : "#ef4444",
                }}
              />
            </Tooltip>
            <Typography variant="body2">
              Temp DB: {tempDbStatus === "active" ? "Active" : "Inactive"}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Adapter Details */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Adapter Details
        </Typography>
        <Box
          sx={{
            border: "1px solid #e5e7eb",
            borderRadius: 2,
            p: 1.5,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
          }}
        >
          <Typography variant="caption" display="block">
            MAC: AA:BB:CC:DD:EE:FF
          </Typography>
          <Typography variant="caption" display="block">
            Channel: 6
          </Typography>
          <Typography variant="caption" display="block">
            Mode: Monitor
          </Typography>
          <Typography variant="caption" display="block">
            Status: {kismetStatus === "running" ? "Online" : "Offline"}
          </Typography>
        </Box>
      </Box>

      {/* Packet and Record Counts */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Statistics
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="body2">Packets: {packetCount}</Typography>
          <Typography variant="body2">Records: {recordsCount}</Typography>
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.8rem",
            color: "#6b7280",
          }}
        >
          <Typography variant="caption">Oldest: {oldestRecord || "N/A"}</Typography>
          <Typography variant="caption">Newest: {newestRecord || "N/A"}</Typography>
        </Box>
      </Box>

      {/* Controls */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Controls
        </Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Start Kismet">
            <span>
              <Button
                variant="contained"
                color="success"
                disabled={kismetStatus === "running" || !selectedInterface}
                onClick={handleStartKismet}
                startIcon={<PlayCircleFilled fontSize="inherit" />}
                size="small"
              >
                Start
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Stop Kismet">
            <span>
              <Button
                variant="contained"
                color="error"
                disabled={kismetStatus !== "running"}
                onClick={handleStopKismet}
                startIcon={<Stop fontSize="inherit" />}
                size="small"
              >
                Stop
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Refresh Status">
            <IconButton onClick={fetchStatus} size="small">
              <Refresh fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Temp DB Controls */}
        <Box sx={{ borderTop: "1px solid #e5e7eb", pt: 1.5, mt: 0.5 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Temp DB Controls
          </Typography>
          <Stack 
            direction="row" 
            spacing={1} 
            sx={{ flexWrap: "wrap", gap: 1 }}
          >
            <Button
              variant="outlined"
              color="error"
              onClick={handleClearAll}
              size="small"
            >
              Clear All
            </Button>
            <Button
              variant="outlined"
              color="warning"
              onClick={handleClearOld}
              size="small"
            >
              Clear Old
            </Button>
            <Button
              variant="outlined"
              color="primary"
              onClick={handleExport}
              size="small"
            >
              Export
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};

export default LiveOperationSidebar;