import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
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
import VisibilityIcon from "@mui/icons-material/Visibility";
import WifiIcon from "@mui/icons-material/Wifi";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";

const API_BASE_URL = "http://127.0.0.1:8000";

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.timeline)) return data.timeline;
  return [];
}

function safeDecode(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeMac(value = "") {
  return String(value || "").trim().toUpperCase();
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

function isValidMacLike(value = "") {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(String(value || "").trim());
}

function isValidCoordinate(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
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

function formatCoordinate(lat, lon) {
  if (!isValidCoordinate(lat, lon)) return "No GPS";

  return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
}

function formatSignal(value) {
  if (value === null || value === undefined || value === "") return "—";

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return String(value);

  return `${numericValue} dBm`;
}

function buildWifiGroups(rows, targetClientMac) {
  const target = normalizeMac(targetClientMac);
  const grouped = new Map();

  rows.forEach((row) => {
    const clientMac = normalizeMac(
      getAny(row, ["client_mac", "mac", "device_mac", "devmac"], "")
    );

    if (!target || !clientMac || clientMac !== target) return;

    const bssid = normalizeMac(getAny(row, ["bssid", "linked_bssid"], "")) || "Unlinked";
    const ssid = getAny(row, ["ssid", "linked_ssid", "network_name"], "Hidden/Unknown");
    const groupKey = `${bssid}|${ssid}`;

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        bssid,
        ssid,
        relationships: new Set(),
        scans: new Set(),
        records: 0,
        bestSignal: null,
        latitude: "",
        longitude: "",
        firstSeen: "",
        lastSeen: "",
      });
    }

    const current = grouped.get(groupKey);

    const relationship = getAny(row, ["relationship_type", "relationship"], "observed");
    const scanId = getAny(row, ["import_batch_id", "survey_id", "scan_id", "batch_id"], "");
    const signal = getAny(row, ["signal_dbm", "signal", "rssi"], "");
    const latitude = getAny(row, ["latitude", "lat"], "");
    const longitude = getAny(row, ["longitude", "lon", "lng"], "");
    const timestamp = getAny(row, ["timestamp", "last_seen", "created_at"], "");

    current.records += 1;

    if (relationship) current.relationships.add(relationship);
    if (scanId !== "") current.scans.add(String(scanId));

    const numericSignal = Number(signal);

    if (
      Number.isFinite(numericSignal) &&
      (current.bestSignal === null || numericSignal > current.bestSignal)
    ) {
      current.bestSignal = numericSignal;
    }

    if (isValidCoordinate(latitude, longitude)) {
      current.latitude = Number(latitude);
      current.longitude = Number(longitude);
    }

    if (timestamp) {
      if (!current.firstSeen || new Date(timestamp) < new Date(current.firstSeen)) {
        current.firstSeen = timestamp;
      }

      if (!current.lastSeen || new Date(timestamp) > new Date(current.lastSeen)) {
        current.lastSeen = timestamp;
      }
    }
  });

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.records !== a.records) return b.records - a.records;
    if (b.scans.size !== a.scans.size) return b.scans.size - a.scans.size;
    return String(a.bssid).localeCompare(String(b.bssid));
  });
}

export default function DeviceWifiConnections({ clientMac }) {
  const params = useParams();
  const routeClientMac = params.clientMac || params.mac || "";
  const targetClientMac = normalizeMac(safeDecode(clientMac || routeClientMac));

  const [rows, setRows] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const wifiConnections = useMemo(() => {
    return buildWifiGroups(rows, targetClientMac);
  }, [rows, targetClientMac]);

  const filteredWifiConnections = useMemo(() => {
    const search = normalize(searchText);

    if (!search) return wifiConnections;

    return wifiConnections.filter((item) =>
      [
        item.ssid,
        item.bssid,
        Array.from(item.relationships).join(" "),
        Array.from(item.scans).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }, [wifiConnections, searchText]);

  const stats = useMemo(() => {
    const linkedBssids = wifiConnections.filter((item) => item.bssid !== "Unlinked");
    const totalRecords = wifiConnections.reduce(
      (sum, item) => sum + Number(item.records || 0),
      0
    );
    const movementLike = wifiConnections.filter((item) => item.scans.size >= 2).length;

    return {
      wifiCount: linkedBssids.length,
      totalRecords,
      recurringWifiCount: movementLike,
    };
  }, [wifiConnections]);

  async function loadConnections() {
    if (!targetClientMac) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      const encodedMac = encodeURIComponent(targetClientMac);

      let response = await fetch(
        `${API_BASE_URL}/client-observations/timeline/${encodedMac}`
      );

      let data = await response.json().catch(() => []);
      let nextRows = response.ok ? normalizeArray(data) : [];

      if (nextRows.length === 0) {
        response = await fetch(`${API_BASE_URL}/client-observations?limit=20000`);
        data = await response.json().catch(() => []);
        const allRows = response.ok ? normalizeArray(data) : [];

        nextRows = allRows.filter((row) => {
          const rowClientMac = normalizeMac(
            getAny(row, ["client_mac", "mac", "device_mac", "devmac"], "")
          );

          return rowClientMac === targetClientMac;
        });
      }

      setRows(nextRows);
    } catch (error) {
      setErrorMessage(error?.message || "Failed to load Wi-Fi connections.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetClientMac]);

  return (
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
                Observed Wi-Fi Connections
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Wi-Fi/BSSID records where this device MAC was associated, bridged, or observed.
              </Typography>
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                size="small"
                placeholder="Search Wi-Fi / BSSID / scan"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                sx={{ minWidth: { xs: "100%", sm: 320 } }}
              />

              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={loadConnections}
                disabled={isLoading}
                sx={{ fontWeight: 800 }}
              >
                Refresh
              </Button>
            </Stack>
          </Stack>

          {isLoading && <LinearProgress />}

          {errorMessage && (
            <Alert severity="error" onClose={() => setErrorMessage("")}>
              {errorMessage}
            </Alert>
          )}

          <Alert severity="info">
            These are wireless identifiers observed with this device MAC in imported scan data.
            This does not identify the device owner.
          </Alert>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              icon={<WifiIcon />}
              label={`${formatNumber(stats.wifiCount)} linked Wi-Fi/BSSID`}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />

            <Chip
              icon={<RouteOutlinedIcon />}
              label={`${formatNumber(stats.recurringWifiCount)} recurring Wi-Fi links`}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />

            <Chip
              label={`${formatNumber(stats.totalRecords)} connection records`}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Stack>

          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Wi-Fi / SSID</TableCell>
                  <TableCell>BSSID</TableCell>
                  <TableCell>Relationship</TableCell>
                  <TableCell align="right">Scans</TableCell>
                  <TableCell align="right">Records</TableCell>
                  <TableCell align="right">Best Signal</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Last Seen</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {filteredWifiConnections.map((item) => (
                  <TableRow key={`${item.bssid}-${item.ssid}`} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={800}>
                        {item.ssid || "Hidden/Unknown"}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" color="primary" fontWeight={800}>
                        {item.bssid}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      {Array.from(item.relationships).join(", ") || "observed"}
                    </TableCell>

                    <TableCell align="right">{formatNumber(item.scans.size)}</TableCell>

                    <TableCell align="right">{formatNumber(item.records)}</TableCell>

                    <TableCell align="right">{formatSignal(item.bestSignal)}</TableCell>

                    <TableCell>{formatCoordinate(item.latitude, item.longitude)}</TableCell>

                    <TableCell>{formatDateTime(item.lastSeen)}</TableCell>

                    <TableCell align="right">
                      {item.bssid !== "Unlinked" && isValidMacLike(item.bssid) ? (
                        <Button
                          component={RouterLink}
                          to={`/bssids/${encodeURIComponent(item.bssid)}`}
                          size="small"
                          variant="contained"
                          startIcon={<VisibilityIcon fontSize="small" />}
                          sx={{ fontWeight: 800, whiteSpace: "nowrap" }}
                        >
                          View Wi-Fi
                        </Button>
                      ) : (
                        <Chip size="small" label="Unlinked" variant="outlined" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {filteredWifiConnections.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                        No Wi-Fi connections found for this device.
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
  );
}

