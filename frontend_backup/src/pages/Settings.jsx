import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import SettingsIcon from "@mui/icons-material/Settings";
import StorageIcon from "@mui/icons-material/Storage";
import WifiIcon from "@mui/icons-material/Wifi";
import DevicesIcon from "@mui/icons-material/Devices";
import ListAltIcon from "@mui/icons-material/ListAlt";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";

const API_BASE_URL = "http://127.0.0.1:8000";

export default function Settings() {
  const [apiStatus, setApiStatus] = useState("checking");
  const [apiMessage, setApiMessage] = useState("");

  const [imports, setImports] = useState([]);
  const [wifiObservations, setWifiObservations] = useState([]);
  const [clientObservations, setClientObservations] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const formatNumber = (value) => {
    if (value === null || value === undefined) {
      return "0";
    }

    return Number(value).toLocaleString();
  };

  const formatDateTime = (value) => {
    if (!value) {
      return "—";
    }

    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  const hasValidCoordinate = (item) => {
    const lat = Number(item.latitude);
    const lon = Number(item.longitude);

    return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
  };

  const getStatusColor = (status) => {
    if (status === "completed") {
      return "success";
    }

    if (status === "failed") {
      return "error";
    }

    return "warning";
  };

  const loadSystemStatus = async () => {
    setIsLoading(true);
    setError("");
    setApiStatus("checking");
    setApiMessage("Checking backend connection...");

    try {
      const [healthResponse, importsResponse, wifiResponse, clientsResponse] =
        await Promise.all([
          fetch(`${API_BASE_URL}/docs`),
          fetch(`${API_BASE_URL}/kismet-imports/`),
          fetch(`${API_BASE_URL}/observations`),
          fetch(`${API_BASE_URL}/client-observations`),
        ]);

      if (!healthResponse.ok) {
        throw new Error(`Backend health check failed. Status: ${healthResponse.status}`);
      }

      const importsData = await importsResponse.json();
      const wifiData = await wifiResponse.json();
      const clientsData = await clientsResponse.json();

      if (!importsResponse.ok) {
        throw new Error(
          importsData?.detail ||
            `Failed to load Kismet imports. Status: ${importsResponse.status}`
        );
      }

      if (!wifiResponse.ok) {
        throw new Error(
          wifiData?.detail ||
            `Failed to load Wi-Fi observations. Status: ${wifiResponse.status}`
        );
      }

      if (!clientsResponse.ok) {
        throw new Error(
          clientsData?.detail ||
            `Failed to load observed devices. Status: ${clientsResponse.status}`
        );
      }

      setImports(Array.isArray(importsData) ? importsData : []);
      setWifiObservations(Array.isArray(wifiData) ? wifiData : []);
      setClientObservations(Array.isArray(clientsData) ? clientsData : []);

      setApiStatus("online");
      setApiMessage(`Connected to ${API_BASE_URL}`);
    } catch (err) {
      setApiStatus("offline");
      setApiMessage(err.message || "Backend is not reachable.");
      setError(err.message || "Failed to load system status.");
    } finally {
      setIsLoading(false);
    }
  };

  const stats = useMemo(() => {
    const uniqueBssids = new Set();
    const uniqueSsids = new Set();
    const uniqueClients = new Set();

    wifiObservations.forEach((item) => {
      if (item.bssid) {
        uniqueBssids.add(String(item.bssid).toLowerCase());
      }

      if (item.ssid) {
        uniqueSsids.add(String(item.ssid).toLowerCase());
      }
    });

    clientObservations.forEach((item) => {
      if (item.client_mac) {
        uniqueClients.add(String(item.client_mac).toLowerCase());
      }
    });

    return {
      totalImports: imports.length,
      completedImports: imports.filter((item) => item.import_status === "completed").length,
      failedImports: imports.filter((item) => item.import_status === "failed").length,
      wifiObservations: wifiObservations.length,
      clientObservations: clientObservations.length,
      uniqueBssids: uniqueBssids.size,
      uniqueSsids: uniqueSsids.size,
      uniqueClients: uniqueClients.size,
      mappedWifi: wifiObservations.filter(hasValidCoordinate).length,
      mappedClients: clientObservations.filter(hasValidCoordinate).length,
    };
  }, [imports, wifiObservations, clientObservations]);

  const latestImport = useMemo(() => {
    if (imports.length === 0) {
      return null;
    }

    return [...imports].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    )[0];
  }, [imports]);

  const checks = useMemo(() => {
    const latestHasKismetFile =
      latestImport?.original_filename?.toLowerCase()?.endsWith(".kismet") || false;

    const latestHasKismetVersion = Boolean(latestImport?.kismet_version);
    const latestHasRawDevices = Number(latestImport?.device_count || 0) > 0;
    const latestHasProcessedWifi =
      Number(latestImport?.wifi_observation_count || 0) > 0 || wifiObservations.length > 0;
    const latestHasProcessedDevices =
      Number(latestImport?.client_observation_count || 0) > 0 ||
      clientObservations.length > 0;

    return [
      {
        label: "Backend API reachable",
        status: apiStatus === "online",
        detail: apiMessage,
      },
      {
        label: "Kismet import endpoint working",
        status: imports.length > 0,
        detail:
          imports.length > 0
            ? `${formatNumber(imports.length)} import batch record(s) found`
            : "No import batch records found yet",
      },
      {
        label: "Latest import is a .kismet file",
        status: latestHasKismetFile,
        detail: latestImport?.original_filename || "No latest import found",
      },
      {
        label: "Latest import has Kismet version",
        status: latestHasKismetVersion,
        detail: latestImport?.kismet_version || "No Kismet version available",
      },
      {
        label: "Raw Kismet devices saved",
        status: latestHasRawDevices,
        detail: `${formatNumber(latestImport?.device_count)} raw device record(s) in latest import`,
      },
      {
        label: "Processed Wi-Fi records available",
        status: latestHasProcessedWifi,
        detail: `${formatNumber(stats.wifiObservations)} processed Wi-Fi record(s)`,
      },
      {
        label: "Processed observed device records available",
        status: latestHasProcessedDevices,
        detail: `${formatNumber(stats.clientObservations)} observed device record(s)`,
      },
    ];
  }, [
    apiStatus,
    apiMessage,
    imports.length,
    latestImport,
    wifiObservations.length,
    clientObservations.length,
    stats.wifiObservations,
    stats.clientObservations,
  ]);

  const recentImports = useMemo(() => {
    return [...imports]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 8);
  }, [imports]);

  useEffect(() => {
    loadSystemStatus();
  }, []);

  return (
    <Box>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ alignItems: { xs: "flex-start", md: "center" } }}
          justifyContent="space-between"
        >
          <Box>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <SettingsIcon fontSize="large" />
              <Typography variant="h4" fontWeight={800}>
                Settings / System Status
              </Typography>
            </Stack>

            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.8 }}>
              Check backend connection, Kismet import readiness, processed records, and
              system data status.
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button
              component={RouterLink}
              to="/import"
              variant="contained"
              startIcon={<UploadFileIcon />}
            >
              Import Scan
            </Button>

            <Button
              component={RouterLink}
              to="/scans"
              variant="outlined"
              startIcon={<ListAltIcon />}
            >
              Scan Results
            </Button>

            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadSystemStatus}
              disabled={isLoading}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>

        {isLoading && <LinearProgress />}

        {error && (
          <Alert severity={apiStatus === "offline" ? "error" : "warning"} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <Alert severity="info">
          WGIP stores observed wireless scan records from authorized Kismet imports. It does
          not identify device owners.
        </Alert>

        <Card>
          <CardContent>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{ alignItems: { xs: "flex-start", md: "center" } }}
              justifyContent="space-between"
            >
              <Box>
                <Typography variant="h6" fontWeight={800}>
                  Backend Connection
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  API Base URL: {API_BASE_URL}
                </Typography>
              </Box>

              <Chip
                color={apiStatus === "online" ? "success" : apiStatus === "offline" ? "error" : "warning"}
                icon={apiStatus === "online" ? <CheckCircleIcon /> : <ErrorIcon />}
                label={apiStatus === "online" ? "Online" : apiStatus === "offline" ? "Offline" : "Checking"}
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="body2">{apiMessage}</Typography>
          </CardContent>
        </Card>

        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  <StorageIcon />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Import Batches
                    </Typography>
                    <Typography variant="h5" fontWeight={800}>
                      {formatNumber(stats.totalImports)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatNumber(stats.completedImports)} completed /{" "}
                      {formatNumber(stats.failedImports)} failed
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  <WifiIcon />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Wi-Fi Records
                    </Typography>
                    <Typography variant="h5" fontWeight={800}>
                      {formatNumber(stats.wifiObservations)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatNumber(stats.uniqueBssids)} unique BSSIDs
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  <DevicesIcon />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Device Records
                    </Typography>
                    <Typography variant="h5" fontWeight={800}>
                      {formatNumber(stats.clientObservations)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatNumber(stats.uniqueClients)} unique devices
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Mapped Records
                </Typography>

                <Typography variant="h5" fontWeight={800}>
                  {formatNumber(stats.mappedWifi + stats.mappedClients)}
                </Typography>

                <Typography variant="caption" color="text.secondary">
                  {formatNumber(stats.mappedWifi)} Wi-Fi / {formatNumber(stats.mappedClients)} devices
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {latestImport && (
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
                Latest Kismet Import
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    Scan ID
                  </Typography>
                  <Typography fontWeight={700}>#{latestImport.id}</Typography>
                </Grid>

                <Grid item xs={12} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    File
                  </Typography>
                  <Typography fontWeight={700}>{latestImport.original_filename || "—"}</Typography>
                </Grid>

                <Grid item xs={12} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    Kismet Version
                  </Typography>
                  <Typography fontWeight={700}>{latestImport.kismet_version || "—"}</Typography>
                </Grid>

                <Grid item xs={12} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    Status
                  </Typography>
                  <Chip
                    size="small"
                    color={getStatusColor(latestImport.import_status)}
                    label={latestImport.import_status || "unknown"}
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    Raw Devices
                  </Typography>
                  <Typography fontWeight={700}>{formatNumber(latestImport.device_count)}</Typography>
                </Grid>

                <Grid item xs={12} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    Raw Packets
                  </Typography>
                  <Typography fontWeight={700}>{formatNumber(latestImport.packet_count)}</Typography>
                </Grid>

                <Grid item xs={12} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    Processed Wi-Fi
                  </Typography>
                  <Typography fontWeight={700}>
                    {formatNumber(latestImport.wifi_observation_count)}
                  </Typography>
                </Grid>

                <Grid item xs={12} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    Processed Devices
                  </Typography>
                  <Typography fontWeight={700}>
                    {formatNumber(latestImport.client_observation_count)}
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <Button
                    component={RouterLink}
                    to={`/scans/${latestImport.id}`}
                    variant="contained"
                  >
                    Open Latest Scan
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
              Verification Checks
            </Typography>

            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Status</TableCell>
                    <TableCell>Check</TableCell>
                    <TableCell>Details</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {checks.map((item) => (
                    <TableRow key={item.label} hover>
                      <TableCell>
                        <Chip
                          size="small"
                          color={item.status ? "success" : "warning"}
                          icon={item.status ? <CheckCircleIcon /> : <ErrorIcon />}
                          label={item.status ? "PASS" : "REVIEW"}
                        />
                      </TableCell>

                      <TableCell>{item.label}</TableCell>
                      <TableCell>{item.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
              Recent Imports
            </Typography>

            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Scan</TableCell>
                    <TableCell>File</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Raw Devices</TableCell>
                    <TableCell align="right">Wi-Fi</TableCell>
                    <TableCell align="right">Devices</TableCell>
                    <TableCell>Imported</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {recentImports.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell>#{item.id}</TableCell>
                      <TableCell>{item.original_filename || "—"}</TableCell>

                      <TableCell>
                        <Chip
                          size="small"
                          color={getStatusColor(item.import_status)}
                          label={item.import_status || "unknown"}
                        />
                      </TableCell>

                      <TableCell align="right">{formatNumber(item.device_count)}</TableCell>
                      <TableCell align="right">
                        {formatNumber(item.wifi_observation_count)}
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(item.client_observation_count)}
                      </TableCell>
                      <TableCell>{formatDateTime(item.created_at)}</TableCell>

                      <TableCell align="right">
                        <Button
                          component={RouterLink}
                          to={`/scans/${item.id}`}
                          size="small"
                          variant="contained"
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {recentImports.length === 0 && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                          No imports found yet.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}