import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Button,
  Stack,
  Tooltip,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
} from "@mui/material";
import { PlayCircleFilled, Stop, Refresh, Search } from "@mui/icons-material";

const tableHeaders = [
  "BSSID",
  "SSID",
  "Manufacturer",
  "Encryption",
  "Channel",
  "Clients",
  "Last seen",
  "Signal",
  "Location",
  "Actions",
];

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
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("signal");
  const [sortDir, setSortDir] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchInterfaces();
    const statusInterval = setInterval(fetchStatus, 5000);
    return () => clearInterval(statusInterval);
  }, []);

  useEffect(() => {
    if (kismetStatus === "running") {
      fetchDevices();
      const deviceInterval = setInterval(fetchDevices, 3000);
      return () => clearInterval(deviceInterval);
    }
  }, [kismetStatus]);

  const fetchInterfaces = async () => {
    setInterfacesLoading(true);
    try {
      const response = await fetch("/api/interfaces");
      if (!response.ok) throw new Error("Failed to fetch interfaces");
      const data = await response.json();
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

  const fetchDevices = async () => {
    setLoadingDevices(true);
    try {
      const response = await fetch("/api/live/events/recent?limit=1000");
      if (!response.ok) throw new Error("Failed to fetch devices");
      const data = await response.json();

      let devicesData = [];
      if (Array.isArray(data)) {
        devicesData = data;
      } else if (data.events) {
        devicesData = data.events;
      } else if (data.data) {
        devicesData = data.data;
      }

      const transformedDevices = devicesData.map((device) => ({
        bssid: device.bssid || "00:00:00:00:00:00",
        ssid: device.essid || device.ssid || "Unknown",
        manufacturer: device.vendor || device.data?.vendor || "",
        encryption: device.security || device.data?.security || "Unknown",
        channel: device.channel || 1,
        clients: device.clients || device.data?.clients || 0,
        lastSeen: device.last_seen || new Date().toLocaleTimeString(),
        signal: device.signal || -60,
        location: "N/A",
      }));

      const uniqueDevices = {};
      transformedDevices.forEach((device) => {
        if (!uniqueDevices[device.bssid] || device.signal > uniqueDevices[device.bssid].signal) {
          uniqueDevices[device.bssid] = device;
        }
      });

      const finalDevices = Object.values(uniqueDevices);
      finalDevices.sort((a, b) => b.signal - a.signal);

      setDevices(finalDevices);
    } catch (err) {
      console.error("Failed to fetch devices:", err);
    } finally {
      setLoadingDevices(false);
    }
  };

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
    if (kismetStatus === "running") {
      fetchDevices();
    }
  };

  const handleClearAll = async () => {
    try {
      await fetch("/api/live/clear", { method: "POST" });
      setDevices([]);
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

  const handleSort = (column) => {
    const sortMap = {
      BSSID: "bssid",
      SSID: "ssid",
      Manufacturer: "manufacturer",
      Encryption: "encryption",
      Channel: "channel",
      Clients: "clients",
      "Last seen": "lastSeen",
      Signal: "signal",
    };
    const key = sortMap[column] || column.toLowerCase();
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const getSignalColor = (signal) => {
    if (signal >= -50) return "#22c55e";
    if (signal >= -60) return "#eab308";
    if (signal >= -70) return "#eab308";
    return "#ef4444";
  };

  const filteredDevices = devices.filter((device) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      device.bssid.toLowerCase().includes(searchLower) ||
      device.ssid.toLowerCase().includes(searchLower) ||
      device.manufacturer.toLowerCase().includes(searchLower)
    );
  });

  const sortedDevices = [...filteredDevices].sort((a, b) => {
    let valA = a[sortBy] || "";
    let valB = b[sortBy] || "";
    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();
    if (valA < valB) return sortDir === "asc" ? -1 : 1;
    if (valA > valB) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedDevices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedDevices = sortedDevices.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  if (interfacesLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Loading interfaces...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", height: "100%", bgcolor: "#f5f7fa", p: 2, display: "flex", flexDirection: "column" }}>
      {/* Controls Bar */}
      <Paper sx={{ p: 2, mb: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", border: "1px solid #e0e7ef", boxShadow: "none" }}>
        <TextField
          select
          size="small"
          value={selectedInterface}
          onChange={(e) => setSelectedInterface(e.target.value)}
          label="Input WiFi Adapter"
          sx={{ minWidth: 180, bgcolor: "#fff" }}
          slotProps={{ select: { MenuProps: { MenuListProps: { "data-disable-rfx": true } } } }}
        >
          {interfaces.map((iface) => (
            <MenuItem key={iface} value={iface}>
              {iface}
            </MenuItem>
          ))}
        </TextField>

        <Button
          variant="contained"
          color="success"
          onClick={handleStartKismet}
          disabled={kismetStatus === "running" || !selectedInterface}
          startIcon={<PlayCircleFilled />}
          sx={{ textTransform: "none" }}
        >
          Start
        </Button>

        <Button
          variant="contained"
          color="error"
          onClick={handleStopKismet}
          disabled={kismetStatus !== "running"}
          startIcon={<Stop />}
          sx={{ textTransform: "none" }}
        >
          Stop
        </Button>

        <Chip
          label={kismetStatus === "running" ? "🟢 Live" : "🔴 Stopped"}
          color={kismetStatus === "running" ? "success" : "error"}
          size="small"
        />
        <Chip label={`${devices.length} devices`} variant="outlined" size="small" />

        <Box sx={{ flex: 1 }} />

        <TextField
          placeholder="Search..."
          size="small"
          variant="outlined"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <Search fontSize="small" sx={{ mr: 0.5 }} />,
          }}
          sx={{ width: 180, bgcolor: "#fff" }}
        />
        <Button variant="outlined" size="small" onClick={handleRefresh}>
          Refresh
        </Button>
      </Paper>

      {/* Table - Auto height based on rows */}
      <Paper sx={{ display: "flex", flexDirection: "column", border: "1px solid #e0e7ef", boxShadow: "none", overflow: "hidden" }}>
        <TableContainer sx={{ overflow: "auto" }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "#f8fafb" }}>
                {tableHeaders.map((column) => {
                  const sortMap = {
                    BSSID: "bssid",
                    SSID: "ssid",
                    Manufacturer: "manufacturer",
                    Encryption: "encryption",
                    Channel: "channel",
                    Clients: "clients",
                    "Last seen": "lastSeen",
                    Signal: "signal",
                  };
                  const isSorted = sortBy === sortMap[column];
                  const arrow = isSorted ? (sortDir === "asc" ? "▲" : "▼") : "";
                  return (
                    <TableCell
                      key={column}
                      onClick={() => handleSort(column)}
                      sx={{
                        fontWeight: isSorted ? 700 : 600,
                        color: isSorted ? "#065f46" : "#64748b",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                        py: 1.5,
                        px: 1,
                        bgcolor: "#f8fafb",
                      }}
                    >
                      {column} {arrow}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingDevices && devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={40} />
                    <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                      Scanning for networks...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : paginatedDevices.length > 0 ? (
                paginatedDevices.map((device, index) => (
                  <TableRow key={`${device.bssid}_${index}`} hover>
                    <TableCell sx={{ fontSize: "0.75rem", fontFamily: "monospace" }}>{device.bssid}</TableCell>
                    <TableCell sx={{ fontSize: "0.75rem", fontWeight: 500 }}>{device.ssid}</TableCell>
                    <TableCell sx={{ fontSize: "0.75rem" }}>{device.manufacturer || "Unknown"}</TableCell>
                    <TableCell>
                      <Chip
                        label={device.encryption}
                        size="small"
                        color={device.encryption === "Open" ? "success" : "warning"}
                        variant="outlined"
                        sx={{ fontSize: "0.6rem", height: 20 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.75rem" }}>{device.channel}</TableCell>
                    <TableCell sx={{ fontSize: "0.75rem" }}>{device.clients}</TableCell>
                    <TableCell sx={{ fontSize: "0.75rem" }}>{device.lastSeen}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 500, color: getSignalColor(device.signal), fontSize: "0.7rem" }}>
                        {device.signal}dBm
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.75rem" }}>{device.location || "N/A"}</TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined" sx={{ minWidth: 30, p: 0.5, fontSize: "0.6rem" }}>
                        Q
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    <Box sx={{ textAlign: "center" }}>
                      <Typography variant="body1" color="textSecondary">
                        {kismetStatus === "running" ? "No devices detected yet..." : "Start scanning to see devices"}
                      </Typography>
                      {kismetStatus !== "running" && (
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          onClick={handleStartKismet}
                          disabled={!selectedInterface}
                          sx={{ mt: 2 }}
                        >
                          Start Scanning
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination Footer */}
        {sortedDevices.length > 0 && (
          <Box sx={{ px: 2, py: 1, display: "flex", alignItems: "center", justifyContent: "space-between", bgcolor: "#fff", borderTop: "1px solid #e0e7ef", flexShrink: 0, flexWrap: "wrap", gap: 1 }}>
            <Typography variant="body2" sx={{ color: "#64748b", fontSize: "0.75rem" }}>
              Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, sortedDevices.length)} of {sortedDevices.length} devices
            </Typography>

            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
              <Button
                size="small"
                variant="outlined"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                sx={{ minWidth: 36, px: 1, fontSize: "0.7rem", textTransform: "none" }}
              >
                First
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                sx={{ minWidth: 36, px: 1, fontSize: "0.7rem", textTransform: "none" }}
              >
                Prev
              </Button>
              {[...Array(Math.min(totalPages, 10))].map((_, i) => {
                const pageNum = i + 1;
                const isActive = currentPage === pageNum;
                return (
                  <Button
                    key={pageNum}
                    size="small"
                    variant={isActive ? "contained" : "outlined"}
                    onClick={() => setCurrentPage(pageNum)}
                    sx={{
                      minWidth: 32,
                      px: 0.8,
                      fontSize: "0.7rem",
                      borderRadius: 1,
                      bgcolor: isActive ? "#d1fae5" : "#fff",
                      borderColor: "#e0e7ef",
                      color: isActive ? "#065f46" : "#374151",
                      fontWeight: isActive ? 700 : 500,
                      boxShadow: "none",
                      textTransform: "none",
                    }}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                size="small"
                variant="outlined"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                sx={{ minWidth: 36, px: 1, fontSize: "0.7rem", textTransform: "none" }}
              >
                Next
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                sx={{ minWidth: 36, px: 1, fontSize: "0.7rem", textTransform: "none" }}
              >
                Last
              </Button>
            </Stack>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default LiveOperationSidebar;