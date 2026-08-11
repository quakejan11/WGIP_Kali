import { Fragment, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/Visibility";
import WifiIcon from "@mui/icons-material/Wifi";
import {
  UNKNOWN_MANUFACTURER,
  getManufacturer,
} from "../../utils/wgipDisplay";

const API_BASE_URL = "http://127.0.0.1:8000";

const WIFI_KEYS = [
  "review_items",
  "reviewItems",
  "wifi_networks",
  "wifiNetworks",
  "wifi",
  "networks",
  "observations",
  "bssid_summary",
  "bssidSummary",
  "items",
  "records",
];

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
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

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeMac(value = "") {
  return String(value || "").trim().toUpperCase();
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
  if (!value) return "-";

  try {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString();
  } catch {
    return String(value);
  }
}

function formatCoordinate(lat, lon) {
  if (!isValidCoordinate(lat, lon)) return "No GPS";

  return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
}

function formatSignal(value) {
  if (value === null || value === undefined || value === "") return "-";

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return String(value);

  return `${numericValue} dBm`;
}

function extractRows(data, keys) {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key]) && data[key].length > 0) {
      return data[key];
    }
  }

  return [];
}

function extractWifiRows(summary) {
  return extractRows(summary, WIFI_KEYS).filter((row) => {
    const bssid = getAny(row, ["bssid", "mac", "devmac", "device_mac"], "");
    return isValidMacLike(bssid);
  });
}

function getLatitude(row) {
  return getAny(row, ["latitude", "lat", "avg_lat", "min_lat", "max_lat"], "");
}

function getLongitude(row) {
  return getAny(row, ["longitude", "lon", "lng", "avg_lon", "min_lon", "max_lon"], "");
}

function getTimestamp(row) {
  return getAny(
    row,
    ["timestamp", "last_seen", "last_time", "first_seen", "first_time", "created_at"],
    ""
  );
}

function getSignal(row) {
  return getAny(row, ["signal_dbm", "signal", "rssi", "best_signal", "strongest_signal"], "");
}

function getChannel(row) {
  return getAny(row, ["channel", "frequency"], "");
}

function getRecordWeight(row) {
  const value = getAny(row, ["observation_count", "total_records", "count"], 1);
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) return 1;

  return numericValue;
}

async function safeJsonFetch(url, fallback) {
  try {
    const response = await fetch(url);
    const data = await response.json().catch(() => fallback);

    if (!response.ok) return fallback;

    return data;
  } catch {
    return fallback;
  }
}

function buildWifiMap(summary) {
  const wifiMap = new Map();
  const wifiRows = extractWifiRows(summary);

  wifiRows.forEach((row) => {
    const bssid = normalizeMac(
      getAny(row, ["bssid", "mac", "devmac", "device_mac"], "")
    );

    if (!bssid || !isValidMacLike(bssid)) return;

    if (!wifiMap.has(bssid)) {
      wifiMap.set(bssid, {
        bssid,
        ssid: "Hidden/Unknown",
        manufacturer: UNKNOWN_MANUFACTURER,
        channel: "",
        signal: null,
        latitude: "",
        longitude: "",
        firstSeen: "",
        lastSeen: "",
        observationCount: 0,
        devices: [],
      });
    }

    const current = wifiMap.get(bssid);
    const ssid = getAny(row, ["ssid", "network_name", "name"], "");
    const manufacturer = getManufacturer(row);
    const channel = getChannel(row);
    const signal = getSignal(row);
    const latitude = getLatitude(row);
    const longitude = getLongitude(row);
    const timestamp = getTimestamp(row);

    if (ssid && current.ssid === "Hidden/Unknown") current.ssid = ssid;
    if (
      manufacturer !== UNKNOWN_MANUFACTURER &&
      current.manufacturer === UNKNOWN_MANUFACTURER
    ) {
      current.manufacturer = manufacturer;
    }
    if (channel && !current.channel) current.channel = channel;

    const numericSignal = Number(signal);

    if (
      Number.isFinite(numericSignal) &&
      (current.signal === null || numericSignal > current.signal)
    ) {
      current.signal = numericSignal;
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

    current.observationCount += getRecordWeight(row);
  });

  return wifiMap;
}

function attachDevicesToWifi(wifiMap, clientRows) {
  const unlistedWifiMap = new Map();

  clientRows.forEach((row) => {
    const bssid = normalizeMac(getAny(row, ["bssid", "linked_bssid"], ""));
    const clientMac = normalizeMac(
      getAny(row, ["client_mac", "mac", "device_mac", "devmac"], "")
    );

    if (!clientMac || !isValidMacLike(clientMac)) return;

    if (!bssid || !isValidMacLike(bssid)) return;

    if (!wifiMap.has(bssid)) {
      if (!unlistedWifiMap.has(bssid)) {
        unlistedWifiMap.set(bssid, {
          bssid,
          ssid: getAny(row, ["ssid", "linked_ssid", "network_name"], "Unknown/Unlisted Wi-Fi"),
          manufacturer: UNKNOWN_MANUFACTURER,
          channel: getAny(row, ["channel"], ""),
          signal: null,
          latitude: getLatitude(row),
          longitude: getLongitude(row),
          firstSeen: "",
          lastSeen: "",
          observationCount: 0,
          devices: [],
        });
      }

      wifiMap.set(bssid, unlistedWifiMap.get(bssid));
    }

    const wifi = wifiMap.get(bssid);
    const timestamp = getTimestamp(row);
    const signal = getSignal(row);
    const latitude = getLatitude(row);
    const longitude = getLongitude(row);
    const relationship = getAny(row, ["relationship_type", "relationship"], "observed");
    const manufacturer = getManufacturer(row);

    let device = wifi.devices.find((item) => item.clientMac === clientMac);

    if (!device) {
      device = {
        clientMac,
        manufacturer,
        relationships: new Set(),
        records: 0,
        bestSignal: null,
        latitude: "",
        longitude: "",
        firstSeen: "",
        lastSeen: "",
      };

      wifi.devices.push(device);
    }

    device.records += 1;

    if (
      manufacturer !== UNKNOWN_MANUFACTURER &&
      device.manufacturer === UNKNOWN_MANUFACTURER
    ) {
      device.manufacturer = manufacturer;
    }

    if (relationship) {
      device.relationships.add(relationship);
    }

    const numericSignal = Number(signal);

    if (
      Number.isFinite(numericSignal) &&
      (device.bestSignal === null || numericSignal > device.bestSignal)
    ) {
      device.bestSignal = numericSignal;
    }

    if (isValidCoordinate(latitude, longitude)) {
      device.latitude = Number(latitude);
      device.longitude = Number(longitude);
    }

    if (timestamp) {
      if (!device.firstSeen || new Date(timestamp) < new Date(device.firstSeen)) {
        device.firstSeen = timestamp;
      }

      if (!device.lastSeen || new Date(timestamp) > new Date(device.lastSeen)) {
        device.lastSeen = timestamp;
      }

      if (!wifi.firstSeen || new Date(timestamp) < new Date(wifi.firstSeen)) {
        wifi.firstSeen = timestamp;
      }

      if (!wifi.lastSeen || new Date(timestamp) > new Date(wifi.lastSeen)) {
        wifi.lastSeen = timestamp;
      }
    }
  });

  wifiMap.forEach((wifi) => {
    wifi.devices.sort((a, b) => {
      if (b.records !== a.records) return b.records - a.records;
      return a.clientMac.localeCompare(b.clientMac);
    });
  });

  return Array.from(wifiMap.values()).sort((a, b) => {
    if (b.devices.length !== a.devices.length) {
      return b.devices.length - a.devices.length;
    }

    if (b.observationCount !== a.observationCount) {
      return b.observationCount - a.observationCount;
    }

    return a.bssid.localeCompare(b.bssid);
  });
}

export default function ScanWifiDeviceLinks() {
  const params = useParams();
  const importBatchId = params.importBatchId || params.scanId || params.id;

  const [wifiList, setWifiList] = useState([]);
  const [expandedBssid, setExpandedBssid] = useState("");
  const [filterMode, setFilterMode] = useState("with_devices");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const filteredWifiList = useMemo(() => {
    const search = normalize(searchText);

    return wifiList.filter((wifi) => {
      const matchesFilter =
        filterMode === "all" ||
        (filterMode === "with_devices" && wifi.devices.length > 0) ||
        (filterMode === "without_devices" && wifi.devices.length === 0);

      if (!matchesFilter) return false;

      if (!search) return true;

      const deviceText = wifi.devices
        .map((device) => `${device.clientMac} ${device.manufacturer}`)
        .join(" ");

      return [wifi.ssid, wifi.bssid, wifi.manufacturer, wifi.channel, deviceText]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [wifiList, filterMode, searchText]);

  const stats = useMemo(() => {
    const wifiWithDevices = wifiList.filter((wifi) => wifi.devices.length > 0).length;
    const deviceLinks = wifiList.reduce((sum, wifi) => sum + wifi.devices.length, 0);

    return {
      totalWifi: wifiList.length,
      wifiWithDevices,
      deviceLinks,
    };
  }, [wifiList]);

  async function loadLinks() {
    if (!importBatchId) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      const summary = await safeJsonFetch(
        `${API_BASE_URL}/kismet-imports/${importBatchId}/processed-summary`,
        {}
      );

      let clientRows = normalizeArray(
        await safeJsonFetch(
          `${API_BASE_URL}/client-observations?import_batch_id=${importBatchId}&limit=20000`,
          []
        )
      );

      const wifiMap = buildWifiMap(summary);
      const scanBssids = new Set(Array.from(wifiMap.keys()));

      if (clientRows.length === 0) {
        const allClientRows = normalizeArray(
          await safeJsonFetch(`${API_BASE_URL}/client-observations?limit=20000`, [])
        );

        const scanMatchedRows = allClientRows.filter((row) => {
          const rowScanId =
            row.import_batch_id ?? row.survey_id ?? row.scan_id ?? row.batch_id ?? "";

          return String(rowScanId) === String(importBatchId);
        });

        const bssidMatchedRows = allClientRows.filter((row) => {
          const rowBssid = normalizeMac(getAny(row, ["bssid", "linked_bssid"], ""));

          return rowBssid && scanBssids.has(rowBssid);
        });

        const dedupe = new Map();

        [...scanMatchedRows, ...bssidMatchedRows].forEach((row, index) => {
          const key = [
            row.id ?? index,
            row.client_mac ?? row.mac ?? row.device_mac ?? row.devmac ?? "",
            row.bssid ?? row.linked_bssid ?? "",
            row.timestamp ?? row.created_at ?? "",
          ].join("|");

          dedupe.set(key, row);
        });

        clientRows = Array.from(dedupe.values());
      }

      const nextWifiList = attachDevicesToWifi(wifiMap, clientRows);

      setWifiList(nextWifiList);
    } catch (error) {
      setErrorMessage(error?.message || "Failed to load Wi-Fi device links.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importBatchId]);

  return (
    <Card>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={1}
            sx={{
              alignItems: { xs: "flex-start", lg: "center" },
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography variant="h6" fontWeight={900}>
                Wi-Fi Device Links
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Shows which observed devices were associated, bridged, or observed with each Wi-Fi/BSSID in this scan.
              </Typography>
            </Box>

            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
              <TextField
                select
                label="View"
                size="small"
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value)}
                sx={{ minWidth: 190 }}
              >
                <MenuItem value="with_devices">Wi-Fi with devices</MenuItem>
                <MenuItem value="all">All Wi-Fi</MenuItem>
                <MenuItem value="without_devices">Wi-Fi without devices</MenuItem>
              </TextField>

              <TextField
                size="small"
                placeholder="Search BSSID / SSID / manufacturer / device"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                sx={{ minWidth: { xs: "100%", md: 320 } }}
              />

              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={loadLinks}
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
            Device links are based on imported scan relationships. They show wireless identifiers observed with a BSSID and do not identify a device owner.
          </Alert>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              icon={<WifiIcon />}
              label={`${formatNumber(stats.totalWifi)} Wi-Fi/BSSID records`}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
            <Chip
              icon={<DevicesOutlinedIcon />}
              label={`${formatNumber(stats.wifiWithDevices)} Wi-Fi with devices`}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
            <Chip
              icon={<DevicesOutlinedIcon />}
              label={`${formatNumber(stats.deviceLinks)} observed device links`}
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
                  <TableCell>Manufacturer</TableCell>
                  <TableCell align="right">Observed Devices</TableCell>
                  <TableCell align="right">Observations</TableCell>
                  <TableCell align="right">Channel</TableCell>
                  <TableCell align="right">Best Signal</TableCell>
                  <TableCell>Last Seen</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {filteredWifiList.map((wifi) => {
                  const isExpanded = expandedBssid === wifi.bssid;

                  return (
                    <Fragment key={wifi.bssid}>
                      <TableRow hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={800}>
                            {wifi.ssid || "Hidden/Unknown"}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Typography variant="body2" color="primary" fontWeight={700}>
                            {wifi.bssid}
                          </Typography>
                        </TableCell>

                        <TableCell>{wifi.manufacturer}</TableCell>

                        <TableCell align="right">
                          <Chip
                            size="small"
                            label={formatNumber(wifi.devices.length)}
                            color={wifi.devices.length > 0 ? "success" : "default"}
                            variant="outlined"
                            sx={{ fontWeight: 700 }}
                          />
                        </TableCell>

                        <TableCell align="right">
                          {formatNumber(wifi.observationCount)}
                        </TableCell>

                        <TableCell align="right">{wifi.channel || "-"}</TableCell>

                        <TableCell align="right">{formatSignal(wifi.signal)}</TableCell>

                        <TableCell>{formatDateTime(wifi.lastSeen)}</TableCell>

                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                              component={RouterLink}
                              to={`/bssids/${encodeURIComponent(wifi.bssid)}`}
                              size="small"
                              variant="outlined"
                              startIcon={<VisibilityIcon fontSize="small" />}
                              sx={{ fontWeight: 800, whiteSpace: "nowrap" }}
                            >
                              Open Wi-Fi
                            </Button>

                            <Button
                              size="small"
                              variant="contained"
                              disabled={wifi.devices.length === 0}
                              startIcon={
                                isExpanded ? (
                                  <KeyboardArrowUpIcon fontSize="small" />
                                ) : (
                                  <KeyboardArrowDownIcon fontSize="small" />
                                )
                              }
                              onClick={() =>
                                setExpandedBssid(isExpanded ? "" : wifi.bssid)
                              }
                              sx={{ fontWeight: 800, whiteSpace: "nowrap" }}
                            >
                              {isExpanded ? "Hide Devices" : "View Devices"}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell colSpan={9} sx={{ p: 0, borderBottom: 0 }}>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box sx={{ p: 2, backgroundColor: "#F8FAFC" }}>
                              <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1 }}>
                                Observed Devices for {wifi.ssid || wifi.bssid}
                              </Typography>

                              <Box sx={{ overflowX: "auto" }}>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Device MAC</TableCell>
                                      <TableCell>Manufacturer</TableCell>
                                      <TableCell>Relationship</TableCell>
                                      <TableCell align="right">Records</TableCell>
                                      <TableCell align="right">Best Signal</TableCell>
                                      <TableCell>Location</TableCell>
                                      <TableCell>Last Seen</TableCell>
                                      <TableCell align="right">Action</TableCell>
                                    </TableRow>
                                  </TableHead>

                                  <TableBody>
                                    {wifi.devices.map((device) => (
                                      <TableRow key={device.clientMac} hover>
                                        <TableCell>
                                          <Typography
                                            variant="body2"
                                            color="primary"
                                            fontWeight={700}
                                          >
                                            {device.clientMac}
                                          </Typography>
                                        </TableCell>

                                        <TableCell>{device.manufacturer}</TableCell>

                                        <TableCell>
                                          {Array.from(device.relationships).join(", ") ||
                                            "observed"}
                                        </TableCell>

                                        <TableCell align="right">
                                          {formatNumber(device.records)}
                                        </TableCell>

                                        <TableCell align="right">
                                          {formatSignal(device.bestSignal)}
                                        </TableCell>

                                        <TableCell>
                                          {formatCoordinate(device.latitude, device.longitude)}
                                        </TableCell>

                                        <TableCell>{formatDateTime(device.lastSeen)}</TableCell>

                                        <TableCell align="right">
                                          <Button
                                            component={RouterLink}
                                            to={`/devices/${encodeURIComponent(
                                              device.clientMac
                                            )}/link-analysis`}
                                            size="small"
                                            variant="contained"
                                            startIcon={<VisibilityIcon fontSize="small" />}
                                            sx={{ fontWeight: 800, whiteSpace: "nowrap" }}
                                          >
                                            View Device
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </Box>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}

                {filteredWifiList.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                        No Wi-Fi device links found for this scan.
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

