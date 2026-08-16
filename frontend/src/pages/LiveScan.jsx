import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  IconButton,
  Chip,
  Stack,
  CircularProgress,
} from "@mui/material";
import {
  Refresh,
  PlayCircleFilled,
  Stop,
  WifiOff,
  Wifi,
  SignalWifiOff,
  SignalWifi4Bar,
  SignalWifi1Bar,
  Storage,
  Visibility,
  Flag,
  Block,
} from "@mui/icons-material";

const LiveScan = () => {
  const [networks, setNetworks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({
    pcap: "disconnected",
    packetCount: 0,
    recordsCount: 0,
    oldestRecord: "",
    newestRecord: "",
  });
  const [scanning, setScanning] = useState(false);
  const [selectedInterface, setSelectedInterface] = useState("");
  const [interfaces, setInterfaces] = useState([]);
  const statusIntervalRef = useRef(null);
  const dataIntervalRef = useRef(null);

  useEffect(() => {
    fetchInterfaces();
    fetchStatus();
    statusIntervalRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
      if (dataIntervalRef.current) clearInterval(dataIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (scanning) {
      fetchNetworks();
      dataIntervalRef.current = setInterval(fetchNetworks, 3000);
    } else {
      if (dataIntervalRef.current) {
        clearInterval(dataIntervalRef.current);
        dataIntervalRef.current = null;
      }
    }
    return () => {
      if (dataIntervalRef.current) {
        clearInterval(dataIntervalRef.current);
        dataIntervalRef.current = null;
      }
    };
  }, [scanning]);

  const fetchInterfaces = async () => {
    try {
      const response = await fetch("/api/interfaces");
      if (!response.ok) throw new Error("Failed to fetch interfaces");
      const data = await response.json();
      setInterfaces(data.interfaces || []);
      if (data.interfaces && data.interfaces.length > 0 && !selectedInterface) {
        setSelectedInterface(data.interfaces[0]);
      }
    } catch (err) {
      console.error("Failed to fetch interfaces:", err);
      setError("Failed to load network interfaces");
    }
  };

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/kismet/status");
      if (!response.ok) throw new Error("Failed to fetch status");
      const data = await response.json();
      
      const isRunning = data.running || false;
      
      setStatus({
        pcap: isRunning ? "connected" : "disconnected",
        packetCount: 0,
        recordsCount: 0,
        oldestRecord: "",
        newestRecord: "",
      });
      
      setScanning(isRunning);
    } catch (err) {
      console.error("Failed to fetch status:", err);
      try {
        const fallbackResponse = await fetch("/api/live/status");
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          setStatus({
            pcap: "fallback",
            packetCount: 0,
            recordsCount: fallbackData.total_count || 0,
            oldestRecord: fallbackData.oldest_record || "",
            newestRecord: fallbackData.newest_record || "",
          });
        }
      } catch (fallbackErr) {
        console.error("Fallback status check failed:", fallbackErr);
      }
    }
  };

  const fetchNetworks = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/live/events/recent?limit=100");
      
      if (!response.ok) {
        throw new Error("Failed to fetch network data");
      }

      const data = await response.json();
      
      // Handle different response formats
      let networksData = [];
      
      if (Array.isArray(data)) {
        networksData = data;
      } else if (data.events && Array.isArray(data.events)) {
        networksData = data.events;
      } else if (data.data && Array.isArray(data.data)) {
        networksData = data.data;
      } else {
        // If data is an object with numeric keys, convert to array
        if (typeof data === 'object' && data !== null) {
          const values = Object.values(data);
          if (values.length > 0 && typeof values[0] === 'object') {
            networksData = values;
          }
        }
      }

      if (networksData.length === 0) {
        setNetworks([]);
        setLoading(false);
        return;
      }

      const transformedNetworks = networksData.map(event => ({
        bssid: event.bssid || event.source_mac || "00:00:00:00:00:00",
        essid: event.essid || event.ssid || "Unknown",
        channel: event.channel || 1,
        signal: event.signal || event.signal_dbm || -60,
        // 🔥 FIX: Get security, clients, vendor from the data object
        security: event.data?.security || event.security || "Unknown",
        clients: event.data?.clients || event.clients || 0,
        vendor: event.data?.vendor || event.vendor || "",
        lastSeen: event.data?.last_seen || event.last_seen || 
          (event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()),
        timestamp: event.timestamp || new Date().toISOString(),
        event_type: event.event_type || "kismet_network",
      }));

      // Remove duplicates by BSSID (keep strongest signal)
      const uniqueNetworks = {};
      transformedNetworks.forEach(net => {
        if (!uniqueNetworks[net.bssid] || net.signal > uniqueNetworks[net.bssid].signal) {
          uniqueNetworks[net.bssid] = net;
        }
      });

      const finalNetworks = Object.values(uniqueNetworks);
      finalNetworks.sort((a, b) => b.signal - a.signal);
      
      setNetworks(finalNetworks);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch networks:", err);
      setError("Failed to load network data. Please try refreshing.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartScan = async () => {
    if (!selectedInterface) {
      setError("Please select a network interface");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const selectResponse = await fetch("/api/interfaces/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interface: selectedInterface }),
      });

      if (!selectResponse.ok) {
        const errorData = await selectResponse.json();
        throw new Error(errorData.detail || "Failed to select interface");
      }

      const startResponse = await fetch("/api/kismet/start", {
        method: "POST",
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(errorData.detail || "Failed to start Kismet");
      }

      setScanning(true);
      await fetchStatus();
      await fetchNetworks();
    } catch (err) {
      console.error("Failed to start scan:", err);
      setError(err.message || "Failed to start scanning");
    } finally {
      setLoading(false);
    }
  };

  const handleStopScan = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/kismet/stop", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to stop Kismet");
      }

      setScanning(false);
      setNetworks([]);
      await fetchStatus();
    } catch (err) {
      console.error("Failed to stop scan:", err);
      setError(err.message || "Failed to stop scanning");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setError(null);
    await fetchStatus();
    if (scanning) {
      await fetchNetworks();
    } else {
      setNetworks([]);
    }
  };

  const handleClearData = async () => {
    try {
      const response = await fetch("/api/live/clear", {
        method: "POST",
      });
      if (response.ok) {
        setNetworks([]);
        await fetchStatus();
      }
    } catch (err) {
      console.error("Failed to clear data:", err);
      setError("Failed to clear data");
    }
  };

  const getSignalIcon = (signal) => {
    if (signal >= -50) return <SignalWifi4Bar fontSize="small" color="success" />;
    if (signal >= -60) return <SignalWifi4Bar fontSize="small" color="warning" />;
    if (signal >= -70) return <SignalWifi1Bar fontSize="small" color="warning" />;
    return <SignalWifiOff fontSize="small" color="error" />;
  };

  const getSignalColor = (signal) => {
    if (signal >= -50) return "success.main";
    if (signal >= -60) return "warning.main";
    if (signal >= -70) return "warning.main";
    return "error.main";
  };

  return (
    <Box sx={{ width: "100%", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 3, py: 2, bgcolor: "white", borderBottom: "1px solid #e0e0e0", display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor:
                  status.pcap === "connected"
                    ? "#22c55e"
                    : status.pcap === "fallback"
                    ? "#f59e0b"
                    : "#ef4444",
              }}
            />
            <Typography variant="body2" fontWeight="500">
              {status.pcap === "connected"
                ? "🟢 Live PCAP - Connected"
                : status.pcap === "fallback"
                ? "🟡 Fallback Mode (Temp DB)"
                : "🔴 Disconnected"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Wifi fontSize="small" color="info" />
              <Typography variant="body2">Networks: {networks.length}</Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Storage fontSize="small" color="info" />
              <Typography variant="body2">Records: {status.recordsCount.toLocaleString()}</Typography>
            </Box>
            {status.pcap === "fallback" && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="caption" color="#6b7280">
                  Oldest: {status.oldestRecord || "N/A"} │ Newest: {status.newestRecord || "N/A"}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" color="textSecondary">
              Interface: {selectedInterface || "None selected"}
            </Typography>
            
            <Tooltip title="Start Scanning">
              <span>
                <Button
                  variant="contained"
                  color="success"
                  disabled={scanning || loading || !selectedInterface}
                  onClick={handleStartScan}
                  startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <PlayCircleFilled />}
                >
                  Start
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Stop Scanning">
              <span>
                <Button
                  variant="contained"
                  color="error"
                  disabled={!scanning || loading}
                  onClick={handleStopScan}
                  startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Stop />}
                >
                  Stop
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Refresh Data">
              <IconButton onClick={handleRefresh} size="medium" disabled={loading}>
                <Refresh />
              </IconButton>
            </Tooltip>
            <Tooltip title="Clear All Data">
              <span>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={handleClearData}
                  disabled={networks.length === 0}
                >
                  Clear Data
                </Button>
              </span>
            </Tooltip>
          </Stack>
          <Chip
            label={scanning ? "Live" : "Paused"}
            color={scanning ? "success" : "warning"}
            sx={{ height: 28, "& .MuiChip-label": { px: 1.5, fontWeight: 500 } }}
          />
        </Box>

        {error && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="error">
              ⚠️ {error}
            </Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: "hidden", p: 2 }}>
        <Paper sx={{ elevation: 1, height: "100%" }}>
          <TableContainer sx={{ height: "100%" }}>
            <Table size="medium" stickyHeader sx={{
              "& th": {
                py: 1.25,
                px: 1.5,
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#666",
                bgcolor: "#fafafa",
                borderBottom: "1px solid #e0e0e0",
              },
              "& td": {
                py: 1,
                px: 1.5,
                fontSize: "0.9rem",
                color: "#1a1a1a",
                borderBottom: "1px solid #f0f0f0",
              },
            }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: "12%" }}>BSSID</TableCell>
                  <TableCell sx={{ width: "18%" }}>ESSID</TableCell>
                  <TableCell sx={{ width: "8%" }}>CH</TableCell>
                  <TableCell sx={{ width: "10%" }}>Signal</TableCell>
                  <TableCell sx={{ width: "12%" }}>Security</TableCell>
                  <TableCell sx={{ width: "10%" }}>Clients</TableCell>
                  <TableCell sx={{ width: "10%" }}>Last Seen</TableCell>
                  <TableCell sx={{ width: "20%" }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && networks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={40} />
                      <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                        Scanning for networks...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : networks.length > 0 ? (
                  networks.map((network) => (
                    <TableRow key={network.bssid} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="500">
                          {network.bssid}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {network.essid}
                        </Typography>
                        {network.vendor && (
                          <Typography variant="caption" color="textSecondary" display="block">
                            {network.vendor}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{network.channel}</TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          {getSignalIcon(network.signal)}
                          <Typography variant="body2" sx={{ fontWeight: 500, color: getSignalColor(network.signal) }}>
                            {network.signal}dBm
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={network.security}
                          size="small"
                          color={network.security === "Open" ? "success" : "warning"}
                          variant="outlined"
                          sx={{ fontSize: "0.75rem" }}
                        />
                      </TableCell>
                      <TableCell>{network.clients}</TableCell>
                      <TableCell>{network.lastSeen}</TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          <Tooltip title="View Details">
                            <IconButton size="small" sx={{ p: 0.5 }}>
                              <Visibility fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Flag Device">
                            <IconButton size="small" sx={{ p: 0.5, color: "warning.main" }}>
                              <Flag fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="DeAuth Attack">
                            <IconButton size="small" sx={{ p: 0.5, color: "error.main" }}>
                              <Block fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <SignalWifiOff sx={{ fontSize: 48, color: "#ccc" }} />
                        <Typography variant="body1" color="textSecondary">
                          No networks detected
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {scanning ? "Scanning in progress..." : "Click 'Start' to begin scanning"}
                        </Typography>
                        {!scanning && (
                          <Button
                            variant="contained"
                            color="primary"
                            onClick={handleStartScan}
                            disabled={!selectedInterface}
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
        </Paper>
      </Box>
    </Box>
  );
};

export default LiveScan;