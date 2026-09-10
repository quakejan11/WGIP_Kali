import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Chip,
  Stack,
  Button,
  Tooltip,
  IconButton,
} from "@mui/material";
import {
  SignalWifiOff,
  SignalWifi4Bar,
  SignalWifi1Bar,
  Block,
} from "@mui/icons-material";

const tableHeaders = [
  "BSSID",
  "SSID",
  "MAC Address",
  "Channel",
  "Actions",
];

const LiveOperationSidebar = () => {
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [kismetStatus, setKismetStatus] = useState("stopped");
  const [recordsCount, setRecordsCount] = useState(0);
  const [newestRecord, setNewestRecord] = useState("");
  const [sortBy, setSortBy] = useState("signal");
  const [sortDir, setSortDir] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchStatus();

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

  const fetchStatus = async () => {
    try {
      const [kismetRes, liveRes] = await Promise.all([
        fetch("/api/kismet/status"),
        fetch("/api/live/status"),
      ]);

      const kismetData = await kismetRes.json();
      const liveData = await liveRes.json();

      setKismetStatus(kismetData.running ? "running" : "stopped");
      setRecordsCount(liveData.total_count || 0);

      if (liveData.newest_record) {
        const date = new Date(liveData.newest_record);
        setNewestRecord(date.toLocaleString());
      }
    } catch (err) {
      console.error("Failed to fetch status", err);
    }
  };

  const fetchDevices = async () => {
    setLoadingDevices(true);

    try {
      const response = await fetch("/api/live/events/recent?limit=100");

      if (!response.ok) {
        throw new Error("Failed to fetch devices");
      }

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
        if (
          !uniqueDevices[device.bssid] ||
          device.signal > uniqueDevices[device.bssid].signal
        ) {
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

  const handleSort = (column) => {
    const sortMap = {
      "BSSID": "bssid",
      "SSID": "ssid",
      "Manufacturer": "manufacturer",
      "Encryption": "encryption",
      "Channel": "channel",
      "Clients": "clients",
      "Last seen": "lastSeen",
      Signal: "signal",
    };

    const key = sortMap[column];

    if (!key) {
      return;
    }

    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const getSignalIcon = (signal) => {
    if (signal >= -50) {
      return <SignalWifi4Bar fontSize="small" color="success" />;
    }

    if (signal >= -60) {
      return <SignalWifi4Bar fontSize="small" color="warning" />;
    }

    if (signal >= -70) {
      return <SignalWifi1Bar fontSize="small" color="warning" />;
    }

    return <SignalWifiOff fontSize="small" color="error" />;
  };

  const getSignalColor = (signal) => {
    if (signal >= -50) return "#22c55e";
    if (signal >= -60) return "#eab308";
    if (signal >= -70) return "#eab308";

    return "#ef4444";
  };

  const sortedDevices = [...devices].sort((a, b) => {
    let valA = a[sortBy] || "";
    let valB = b[sortBy] || "";

    if (typeof valA === "string") {
      valA = valA.toLowerCase();
    }

    if (typeof valB === "string") {
      valB = valB.toLowerCase();
    }

    if (valA < valB) {
      return sortDir === "asc" ? -1 : 1;
    }

    if (valA > valB) {
      return sortDir === "asc" ? 1 : -1;
    }

    return 0;
  });

  const totalPages = Math.ceil(sortedDevices.length / itemsPerPage);

  const startIndex = (currentPage - 1) * itemsPerPage;

  const paginatedDevices = sortedDevices.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#f5f7fa",
        p: 2,
      }}
    >
      <Paper
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRadius: 2,
          border: "1px solid #e0e7ef",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        <TableContainer sx={{ flex: 1 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "#f8fafb" }}>
                {tableHeaders.map((column) => {
                  const sortMap = {
                    "BSSID": "bssid",
                    "SSID": "ssid",
                    "Manufacturer": "manufacturer",
                    "Encryption": "encryption",
                    "Channel": "channel",
                    "Clients": "clients",
                    "Last seen": "lastSeen",
                    Signal: "signal",
                  };

                  const isSortable = Boolean(sortMap[column]);
                  const isSorted = sortBy === sortMap[column];

                  const arrow = isSorted
                    ? sortDir === "asc"
                      ? "▲"
                      : "▼"
                    : "";

                  return (
                    <TableCell
                      key={column}
                      onClick={() => handleSort(column)}
                      sx={{
                        fontWeight: isSorted ? 700 : 600,
                        color: isSorted ? "#065f46" : "#64748b",
                        fontSize: "0.75rem",
                        cursor: isSortable ? "pointer" : "default",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                        py: 1.5,
                        px: 1,
                        bgcolor: "#f8fafb",
                        textAlign: column === "Actions" ? "center" : "left",
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
                  <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={40} />

                    <Typography
                      variant="body2"
                      color="textSecondary"
                      sx={{ mt: 2 }}
                    >
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
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        {getSignalIcon(device.signal)}
                        <Typography sx={{ fontWeight: 500, color: getSignalColor(device.signal), fontSize: "0.7rem" }}>
                          {device.signal}dBm
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.75rem" }}>{device.location || "N/A"}</TableCell>
                    <TableCell>
                      <Tooltip title="View Details">
                        <IconButton size="small" sx={{ p: 0.5 }}>
                          <Search fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <SignalWifiOff sx={{ fontSize: 48, color: "#ccc" }} />
                      <Typography variant="body1" color="textSecondary">
                        {kismetStatus === "running"
                          ? "No devices detected yet..."
                          : "Start scanning to see devices"}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box
          sx={{
            px: 2,
            py: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            bgcolor: "#fff",
            borderTop: "1px solid #e0e7ef",
            flexShrink: 0,
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: "#64748b",
              fontSize: "0.75rem",
            }}
          >
            Records: {recordsCount}
          </Typography>

          <Typography
            variant="body2"
            sx={{
              color: "#64748b",
              fontSize: "0.75rem",
            }}
          >
            Newest: {newestRecord || "N/A"}
          </Typography>

          <Stack direction="row" spacing={0.5} alignItems="center">
            <Button
              size="small"
              variant="outlined"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              sx={{
                minWidth: 36,
                px: 1,
                fontSize: "0.7rem",
                textTransform: "none",
              }}
            >
              First
            </Button>

            <Button
              size="small"
              variant="outlined"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              sx={{
                minWidth: 36,
                px: 1,
                fontSize: "0.7rem",
                textTransform: "none",
              }}
            >
              Prev
            </Button>

            {[...Array(Math.min(totalPages, 5))].map((_, i) => {
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
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={currentPage === totalPages || totalPages === 0}
              sx={{
                minWidth: 36,
                px: 1,
                fontSize: "0.7rem",
                textTransform: "none",
              }}
            >
              Next
            </Button>

            <Button
              size="small"
              variant="outlined"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              sx={{
                minWidth: 36,
                px: 1,
                fontSize: "0.7rem",
                textTransform: "none",
              }}
            >
              Last
            </Button>
          </Stack>
        </Box>
      </Paper>

      {/* Deauth Dialog */}
      <Dialog open={deauthDialogOpen} onClose={handleDeauthClose}>
        <DialogTitle>Deauth Attack</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Send deauthentication packets to disconnect all clients from:
            <br />
            <strong>BSSID:</strong> {selectedDevice?.bssid}
            <br />
            <strong>SSID:</strong> {selectedDevice?.ssid}
            <br />
            <strong>Channel:</strong> {selectedDevice?.channel}
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Number of packets (0 = unlimited)"
            type="number"
            fullWidth
            variant="outlined"
            value={deauthCount}
            onChange={(e) => setDeauthCount(parseInt(e.target.value) || 0)}
            helperText="0 will send packets continuously until stopped"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeauthClose} disabled={deauthLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleDeauthConfirm}
            color="error"
            variant="contained"
            disabled={deauthLoading}
            startIcon={deauthLoading ? <CircularProgress size={20} /> : <Block />}
          >
            {deauthLoading ? "Starting..." : "Start Deauth"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default LiveOperationSidebar;