import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeviceHubOutlinedIcon from "@mui/icons-material/DeviceHubOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import { analyzeTrackedDevices } from "../utils/trackingRules";

const API_BASE_URL = "http://127.0.0.1:8000";

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function getAny(row, keys, fallback = "") {
  for (const key of keys) {
    if (
      row &&
      Object.prototype.hasOwnProperty.call(row, key) &&
      row[key] !== null &&
      row[key] !== undefined &&
      row[key] !== ""
    ) {
      return row[key];
    }
  }

  return fallback;
}

function formatNumber(value) {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue)) return "0";

  return numericValue.toLocaleString();
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

function formatSignal(value) {
  if (value === null || value === undefined || value === "") return "—";

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return String(value);

  return `${numericValue} dBm`;
}

function getLinkedBssids(rows = []) {
  return Array.from(
    new Set(
      rows
        .map((row) => getAny(row, ["bssid", "linked_bssid"], ""))
        .filter(Boolean)
        .map((value) => String(value).toUpperCase())
    )
  );
}

function getLinkedSsids(rows = []) {
  return Array.from(
    new Set(
      rows
        .map((row) => getAny(row, ["ssid", "linked_ssid"], ""))
        .filter(Boolean)
    )
  );
}

function getRelationships(rows = []) {
  return Array.from(
    new Set(
      rows
        .map((row) => getAny(row, ["relationship_type", "relationship"], "observed"))
        .filter(Boolean)
    )
  );
}

function getBestSignal(rows = []) {
  const signals = rows
    .map((row) => Number(getAny(row, ["signal_dbm", "signal", "rssi"], "")))
    .filter(Number.isFinite);

  if (signals.length === 0) return "";

  return Math.max(...signals);
}

function enrichDevice(device) {
  const rows = device.rows || device.rawRows || [];
  const linkedBssids = getLinkedBssids(rows);
  const linkedSsids = getLinkedSsids(rows);
  const relationships = getRelationships(rows);
  const bestSignal = getBestSignal(rows);

  return {
    ...device,
    linkedBssids,
    linkedSsids,
    relationships,
    bestSignal,
  };
}

export default function TrackedDevices() {
  const [clientRows, setClientRows] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/client-observations?limit=20000`);
      const data = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error("Failed to load client observations.");
      }

      setClientRows(normalizeArray(data));
    } catch (error) {
      setErrorMessage(error?.message || "Failed to load tracked devices.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const allAnalyzedDevices = useMemo(() => {
    return analyzeTrackedDevices(clientRows, {
      defaultRadiusMeters: 75,
      minRadiusMeters: 35,
      maxRadiusMeters: 160,
      minimumRecurringGapMinutes: 60,
    }).map(enrichDevice);
  }, [clientRows]);

  const trackedDevices = useMemo(() => {
    return allAnalyzedDevices
      .filter((device) => device.isTracked)
      .sort((a, b) => {
        if (Number(b.scannedAreaCount || 0) !== Number(a.scannedAreaCount || 0)) {
          return Number(b.scannedAreaCount || 0) - Number(a.scannedAreaCount || 0);
        }

        if (Number(b.observations || 0) !== Number(a.observations || 0)) {
          return Number(b.observations || 0) - Number(a.observations || 0);
        }

        return String(a.clientMac || "").localeCompare(String(b.clientMac || ""));
      });
  }, [allAnalyzedDevices]);

  const filteredDevices = useMemo(() => {
    const search = normalize(searchText);

    if (!search) return trackedDevices;

    return trackedDevices.filter((device) => {
      return [
        device.clientMac,
        device.vendor,
        device.trackingStatus,
        device.linkedBssids.join(" "),
        device.linkedSsids.join(" "),
        device.relationships.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [trackedDevices, searchText]);

  const stats = useMemo(() => {
    const movementCount = trackedDevices.filter((device) => device.movementDetected).length;
    const recurringCount = trackedDevices.filter((device) => device.recurringPresence).length;
    const trackedObservations = trackedDevices.reduce(
      (sum, device) => sum + Number(device.observations || 0),
      0
    );
    const withCoordinates = trackedDevices.filter(
      (device) => Number(device.scannedAreaCount || 0) > 0
    ).length;

    return {
      totalDevices: allAnalyzedDevices.length,
      trackedDevices: trackedDevices.length,
      movementCount,
      recurringCount,
      trackedObservations,
      withCoordinates,
    };
  }, [allAnalyzedDevices, trackedDevices]);

  return (
    <Box>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1}
          sx={{
            alignItems: { xs: "flex-start", md: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography variant="h4" fontWeight={900}>
              Tracked Devices
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Devices are tracked only when they show valid movement across scanned areas or recurring presence over time.
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={loadData}
            disabled={isLoading}
            sx={{ fontWeight: 900 }}
          >
            Refresh
          </Button>
        </Stack>

        {isLoading && <LinearProgress />}

        {errorMessage && (
          <Alert severity="error" onClose={() => setErrorMessage("")}>
            {errorMessage}
          </Alert>
        )}

        <Alert severity="info">
          Nearby GPS detections are grouped into scanned areas. A device with only one scanned area is not marked as movement unless it appears again across another scan, date, or meaningful time gap.
        </Alert>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              lg: "repeat(5, 1fr)",
            },
            gap: 1.5,
          }}
        >
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Tracked Devices
              </Typography>
              <Typography variant="h5" fontWeight={900}>
                {formatNumber(stats.trackedDevices)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatNumber(stats.totalDevices)} total observed devices
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Movement Detected
              </Typography>
              <Typography variant="h5" fontWeight={900}>
                {formatNumber(stats.movementCount)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                2+ scanned area clusters
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Recurring Presence
              </Typography>
              <Typography variant="h5" fontWeight={900}>
                {formatNumber(stats.recurringCount)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Same area, repeated over time
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Tracked Observations
              </Typography>
              <Typography variant="h5" fontWeight={900}>
                {formatNumber(stats.trackedObservations)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                For tracked devices only
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                With Coordinates
              </Typography>
              <Typography variant="h5" fontWeight={900}>
                {formatNumber(stats.withCoordinates)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Valid scanned areas
              </Typography>
            </CardContent>
          </Card>
        </Box>

        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1}
                sx={{
                  alignItems: { xs: "flex-start", md: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography variant="h6" fontWeight={900}>
                    Tracked Device Records
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    One-area same-scan detections are excluded from this tracked list.
                  </Typography>
                </Box>

                <TextField
                  size="small"
                  placeholder="Search MAC / Manufacturer / SSID"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  sx={{ minWidth: { xs: "100%", md: 420 } }}
                />
              </Stack>

              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Client MAC</TableCell>
                      <TableCell>Manufacturer</TableCell>
                      <TableCell>Tracking Status</TableCell>
                      <TableCell align="right">Scanned Areas</TableCell>
                      <TableCell align="right">Detections</TableCell>
                      <TableCell align="right">Scans</TableCell>
                      <TableCell align="right">Linked BSSIDs</TableCell>
                      <TableCell>Linked SSID</TableCell>
                      <TableCell>Relationship</TableCell>
                      <TableCell align="right">Best Signal</TableCell>
                      <TableCell>Last Seen</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {filteredDevices.map((device) => (
                      <TableRow key={device.clientMac} hover>
                        <TableCell>
                          <Typography variant="body2" color="primary" fontWeight={900}>
                            {device.clientMac}
                          </Typography>
                        </TableCell>

                        <TableCell>{device.vendor || "Unknown Manufacturer"}</TableCell>

                        <TableCell>
                          <Stack spacing={0.5}>
                            <Chip
                              size="small"
                              icon={
                                device.movementDetected ? (
                                  <RouteOutlinedIcon fontSize="small" />
                                ) : (
                                  <PlaceOutlinedIcon fontSize="small" />
                                )
                              }
                              label={device.trackingStatus}
                              color={device.movementDetected ? "success" : "warning"}
                              variant="outlined"
                              sx={{ width: "fit-content", fontWeight: 800 }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {formatNumber(device.scannedAreaCount)} scanned area
                              {Number(device.scannedAreaCount || 0) === 1 ? "" : "s"}
                            </Typography>
                          </Stack>
                        </TableCell>

                        <TableCell align="right">
                          {formatNumber(device.scannedAreaCount)}
                        </TableCell>

                        <TableCell align="right">{formatNumber(device.observations)}</TableCell>

                        <TableCell align="right">{formatNumber(device.scanCount)}</TableCell>

                        <TableCell align="right">{formatNumber(device.linkedBssids.length)}</TableCell>

                        <TableCell>
                          {device.linkedSsids.slice(0, 3).join(", ") || "Hidden/Unknown"}
                        </TableCell>

                        <TableCell>
                          {device.relationships.slice(0, 3).join(", ") || "observed"}
                        </TableCell>

                        <TableCell align="right">{formatSignal(device.bestSignal)}</TableCell>

                        <TableCell>{formatDateTime(device.lastSeen)}</TableCell>

                        <TableCell align="right">
                          <Button
                            component={RouterLink}
                            to={`/devices/${encodeURIComponent(device.clientMac)}/link-analysis`}
                            size="small"
                            variant="contained"
                            startIcon={<VisibilityIcon fontSize="small" />}
                            sx={{ fontWeight: 900, whiteSpace: "nowrap" }}
                          >
                            View Movement
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}

                    {filteredDevices.length === 0 && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={12}>
                          <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
                            No tracked devices found using adaptive scanned-area clustering.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
