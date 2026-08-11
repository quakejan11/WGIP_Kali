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
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import MapIcon from "@mui/icons-material/Map";
import WifiIcon from "@mui/icons-material/Wifi";
import DevicesIcon from "@mui/icons-material/Devices";
import StorageIcon from "@mui/icons-material/Storage";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import SecurityIcon from "@mui/icons-material/Security";
import SignalCellularAltIcon from "@mui/icons-material/SignalCellularAlt";
import BusinessIcon from "@mui/icons-material/Business";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Pane,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import {
  UNKNOWN_MANUFACTURER,
  formatManufacturerDisplay,
  formatSecurityType,
  getManufacturer,
  getReadableLocation,
  getSignalBandLabel,
} from "../utils/wgipDisplay";

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

const DEVICE_KEYS = [
  "client_observations",
  "clientObservations",
  "observed_devices",
  "observedDevices",
  "device_observations",
  "deviceObservations",
  "clients",
  "devices",
];

const CHART_COLORS = [
  "#0F766E",
  "#2563EB",
  "#7C3AED",
  "#EA580C",
  "#64748B",
  "#DC2626",
];

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.imports)) return data.imports;
  if (Array.isArray(data?.batches)) return data.batches;

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

function extractRows(data, keys) {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) {
      return data[key];
    }
  }

  return [];
}

function isValidCoordinate(lat, lon) {
  const numericLat = Number(lat);
  const numericLon = Number(lon);

  return (
    Number.isFinite(numericLat) &&
    Number.isFinite(numericLon) &&
    !(numericLat === 0 && numericLon === 0) &&
    numericLat >= -90 &&
    numericLat <= 90 &&
    numericLon >= -180 &&
    numericLon <= 180
  );
}

function isPhilippinesLikelyCoordinate(lat, lon) {
  const numericLat = Number(lat);
  const numericLon = Number(lon);

  return (
    isValidCoordinate(numericLat, numericLon) &&
    numericLat >= 4 &&
    numericLat <= 22 &&
    numericLon >= 116 &&
    numericLon <= 127
  );
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "0";

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return String(value);

  return numericValue.toLocaleString();
}

function formatDateTime(value) {
  if (!value) return "—";

  try {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString();
  } catch {
    return String(value);
  }
}

function getBatchId(batch) {
  return getAny(batch, ["id", "import_batch_id", "batch_id", "scan_id"], "");
}

function getBatchName(batch) {
  return (
    getAny(
      batch,
      ["manual_area_label", "scan_name", "name", "original_filename"],
      ""
    ) || `Scan #${getBatchId(batch) || "Unknown"}`
  );
}

function buildWifiRowsFromSummary(summary, batch) {
  const batchId = getBatchId(batch);
  const batchName = getBatchName(batch);
  const rows = extractRows(summary, WIFI_KEYS);

  return rows
    .map((row, index) => {
      const latitude = getAny(row, [
        "latitude",
        "lat",
        "avg_lat",
        "min_lat",
        "max_lat",
      ]);

      const longitude = getAny(row, [
        "longitude",
        "lon",
        "lng",
        "avg_lon",
        "min_lon",
        "max_lon",
      ]);

      return {
        ...row,
        id: `wifi-${batchId}-${getAny(row, ["id", "bssid"], index)}`,
        type: "Wi-Fi",
        label: getAny(row, ["ssid", "network_name", "name"], "Hidden/Unknown"),
        manufacturer: getManufacturer(row),
        identifier: getAny(row, ["bssid", "mac", "devmac"], "—"),
        latitude,
        longitude,
        coordinateSource: getAny(row, ["coordinate_source", "point_source", "source"], ""),
        signal: getAny(row, ["signal_dbm", "signal", "rssi", "strongest_signal"], "—"),
        channel: getAny(row, ["channel", "wifi_channel", "radio_channel"], ""),
        frequency: getAny(row, ["frequency", "freq", "freq_mhz", "frequency_mhz"], ""),
        security: getAny(row, ["encryption", "security", "crypt"], "Unknown"),
        scanId: batchId,
        scanName: batchName,
        timestamp: getAny(row, ["timestamp", "last_seen", "first_seen", "created_at"], ""),
      };
    })
    .filter((row) => isValidCoordinate(row.latitude, row.longitude));
}

function buildDeviceRowsFromSummary(summary, batch) {
  const batchId = getBatchId(batch);
  const batchName = getBatchName(batch);
  const rows = extractRows(summary, DEVICE_KEYS);

  return rows
    .map((row, index) => {
      const latitude = getAny(row, [
        "latitude",
        "lat",
        "avg_lat",
        "min_lat",
        "max_lat",
      ]);

      const longitude = getAny(row, [
        "longitude",
        "lon",
        "lng",
        "avg_lon",
        "min_lon",
        "max_lon",
      ]);

      const manufacturer = getManufacturer(row);

      return {
        ...row,
        id: `device-${batchId}-${getAny(row, ["id", "client_mac", "mac", "devmac"], index)}`,
        type: "Observed Device",
        label: manufacturer,
        manufacturer,
        identifier: getAny(row, ["client_mac", "mac", "device_mac", "devmac"], "—"),
        bssid: getAny(row, ["bssid", "linked_bssid"], ""),
        ssid: getAny(row, ["ssid", "linked_ssid", "network_name"], "Hidden/Unknown"),
        latitude,
        longitude,
        coordinateSource: getAny(row, ["coordinate_source", "point_source", "source"], ""),
        signal: getAny(row, ["signal_dbm", "signal", "rssi", "strongest_signal"], "—"),
        channel: getAny(row, ["channel", "wifi_channel", "radio_channel"], ""),
        frequency: getAny(row, ["frequency", "freq", "freq_mhz", "frequency_mhz"], ""),
        security: getAny(row, ["encryption", "security", "crypt"], "Unknown"),
        scanId: batchId,
        scanName: batchName,
        timestamp: getAny(row, ["timestamp", "last_seen", "first_seen", "created_at"], ""),
      };
    })
    .filter((row) => isValidCoordinate(row.latitude, row.longitude));
}

function getPointStyle(type, coordinateSource = "") {
  const normalizedType = String(type || "").toLowerCase();
  const normalizedSource = String(coordinateSource || "").toLowerCase();

  const isManual =
    normalizedSource.includes("manual") ||
    normalizedSource.includes("fallback");

  if (normalizedType.includes("device") || normalizedType.includes("client")) {
    return {
      color: "#DC2626",
      fillColor: "#FCA5A5",
      fillOpacity: 0.85,
      weight: isManual ? 2.5 : 1.5,
      radius: 4.5,
      pane: "devicePane",
    };
  }

  return {
    color: isManual ? "#475569" : "#2563EB",
    fillColor: isManual ? "#CBD5E1" : "#93C5FD",
    fillOpacity: 0.9,
    weight: isManual ? 2.5 : 1.5,
    radius: 5,
    pane: "wifiPane",
  };
}

function spreadMarkers(points) {
  return points.map((point) => ({
    ...point,
    displayLatitude: Number(point.latitude),
    displayLongitude: Number(point.longitude),
  }));
}

function DashboardMapAutoFit({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;

    const fitPoints = points.filter((point) =>
      isPhilippinesLikelyCoordinate(point.latitude, point.longitude)
    );

    const usablePoints = fitPoints.length > 0 ? fitPoints : points;

    const bounds = L.latLngBounds(
      usablePoints.map((point) => [
        Number(point.latitude),
        Number(point.longitude),
      ])
    );

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [24, 24],
        maxZoom: 15,
      });

      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }
  }, [map, points]);

  return null;
}

function incrementCount(map, label) {
  const cleanLabel =
    label && String(label).trim()
      ? String(label).trim()
      : "Unknown";

  map.set(cleanLabel, (map.get(cleanLabel) || 0) + 1);
}

function makeRowsFromMap(grouped) {
  return Array.from(grouped.entries())
    .map(([label, count]) => ({
      label,
      count,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return String(a.label).localeCompare(String(b.label));
    });
}

function getSecurityCategory(value) {
  const formatted = formatSecurityType(value);

  if (formatted.includes("No Password")) {
    return "No Password (Open)";
  }

  if (formatted.includes("Password-Protected")) {
    return "Password-Protected (WPA/WPA2/WPA3)";
  }

  if (formatted.includes("Older Security")) {
    return "Older Security (WEP)";
  }

  if (formatted.includes("Unknown")) {
    return "Unknown Security";
  }

  return formatted;
}

function KpiCard({ title, value, subtitle, icon }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              display: "grid",
              placeItems: "center",
              backgroundColor: "#EEF2FF",
              color: "#1D4ED8",
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary" noWrap>
              {title}
            </Typography>

            <Typography variant="h5" fontWeight={900} lineHeight={1.1}>
              {value}
            </Typography>

            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function DonutChart({ rows, size = 150 }) {
  const total = rows.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const radius = 48;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;

  if (total <= 0) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "18px solid #E5E7EB",
          display: "grid",
          placeItems: "center",
          color: "text.secondary",
          fontWeight: 800,
        }}
      >
        0
      </Box>
    );
  }

  return (
    <Box sx={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
        />

        {rows.map((item, index) => {
          const value = Number(item.count || 0);
          const dashLength = (value / total) * circumference;
          const dashOffset = -cumulative;

          cumulative += dashLength;

          return (
            <circle
              key={item.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
            />
          );
        })}
      </svg>

      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={900}>
            {formatNumber(total)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            total
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function DonutChartCard({ title, subtitle, rows }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" fontWeight={900}>
              {title}
            </Typography>

            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          </Box>

          <Stack
            direction={{
              xs: "column",
              sm: "row",
            }}
            spacing={2}
            sx={{ alignItems: "center" }}
          >
            <DonutChart rows={rows} />

            <Stack spacing={1} sx={{ width: "100%" }}>
              {rows.slice(0, 5).map((item, index) => (
                <Stack
                  key={item.label}
                  direction="row"
                  spacing={1}
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                        flexShrink: 0,
                      }}
                    />

                    <Typography variant="body2" noWrap>
                      {item.label}
                    </Typography>
                  </Stack>

                  <Chip
                    label={formatNumber(item.count)}
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 800 }}
                  />
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function BarChartCard({ title, subtitle, rows }) {
  const maxValue = Math.max(...rows.map((item) => Number(item.count || 0)), 1);

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h6" fontWeight={900}>
              {title}
            </Typography>

            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          </Box>

          {rows.length > 0 ? (
            <Stack spacing={1.25}>
              {rows.slice(0, 6).map((item, index) => {
                const width = `${Math.max(
                  6,
                  (Number(item.count || 0) / maxValue) * 100
                )}%`;

                return (
                  <Box key={item.label}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 0.5,
                      }}
                    >
                      <Typography variant="body2" fontWeight={800} noWrap>
                        {item.label}
                      </Typography>

                      <Typography variant="body2" color="text.secondary">
                        {formatNumber(item.count)}
                      </Typography>
                    </Stack>

                    <Box
                      sx={{
                        height: 9,
                        borderRadius: 999,
                        backgroundColor: "#E5E7EB",
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        sx={{
                          width,
                          height: "100%",
                          borderRadius: 999,
                          backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                        }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No data available yet.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [imports, setImports] = useState([]);
  const [wifiRecords, setWifiRecords] = useState([]);
  const [deviceRecords, setDeviceRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const mappedPoints = useMemo(() => {
    const wifiPoints = wifiRecords.map((item) => ({
      ...item,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
    }));

    const devicePoints = deviceRecords.map((item) => ({
      ...item,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
    }));

    return spreadMarkers([...wifiPoints, ...devicePoints]);
  }, [wifiRecords, deviceRecords]);

  const mapCenter = useMemo(() => {
    const validPoints = mappedPoints.filter((point) =>
      isPhilippinesLikelyCoordinate(point.latitude, point.longitude)
    );

    const sourcePoints = validPoints.length > 0 ? validPoints : mappedPoints;

    if (sourcePoints.length > 0) {
      return [sourcePoints[0].latitude, sourcePoints[0].longitude];
    }

    return [14.5995, 120.9842];
  }, [mappedPoints]);

  const latestImports = useMemo(() => {
    return [...imports]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 6);
  }, [imports]);

  const securityOverview = useMemo(() => {
    const grouped = new Map();

    wifiRecords.forEach((item) => {
      incrementCount(grouped, getSecurityCategory(item.security));
    });

    return makeRowsFromMap(grouped);
  }, [wifiRecords]);

  const signalBandOverview = useMemo(() => {
    const grouped = new Map();

    wifiRecords.forEach((item) => {
      incrementCount(grouped, getSignalBandLabel(item));
    });

    return makeRowsFromMap(grouped);
  }, [wifiRecords]);

  const manufacturerOverview = useMemo(() => {
    const grouped = new Map();

    [...wifiRecords, ...deviceRecords].forEach((item) => {
      const manufacturer = item.manufacturer || item.label;
      incrementCount(grouped, formatManufacturerDisplay(manufacturer));
    });

    return makeRowsFromMap(grouped);
  }, [wifiRecords, deviceRecords]);

  const reviewItems = useMemo(() => {
    const grouped = new Map();

    deviceRecords.forEach((item) => {
      const key = item.bssid || "Unlinked";

      if (!grouped.has(key)) {
        grouped.set(key, {
          bssid: item.bssid || "Unlinked",
          ssid: item.ssid || "Hidden/Unknown",
          total_records: 0,
          unique_devices: new Set(),
          latest_seen: item.timestamp || "",
        });
      }

      const current = grouped.get(key);
      current.total_records += 1;

      if (item.identifier && item.identifier !== "—") {
        current.unique_devices.add(String(item.identifier).toLowerCase());
      }

      const itemTime = item.timestamp || "";

      if (
        itemTime &&
        (!current.latest_seen ||
          new Date(itemTime) > new Date(current.latest_seen))
      ) {
        current.latest_seen = itemTime;
      }
    });

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        unique_device_count: item.unique_devices.size,
      }))
      .sort((a, b) => b.total_records - a.total_records)
      .slice(0, 6);
  }, [deviceRecords]);

  const openNetworkCount =
    securityOverview.find((item) => item.label === "No Password (Open)")?.count || 0;

  const topBand = signalBandOverview[0]?.label || "Unknown Band";

  const unknownManufacturerCount = manufacturerOverview
    .filter((item) => item.label === UNKNOWN_MANUFACTURER)
    .reduce((sum, item) => sum + Number(item.count || 0), 0);

  const reviewFocusRows = [
    {
      label: "No Password (Open)",
      count: openNetworkCount,
    },
    {
      label: "Unknown Manufacturer",
      count: unknownManufacturerCount,
    },
    {
      label: "Review Groups",
      count: reviewItems.length,
    },
    {
      label: "Mapped Points",
      count: mappedPoints.length,
    },
  ];

  const loadDashboard = async () => {
    setIsLoading(true);
    setError("");

    try {
      const importsResponse = await fetch(`${API_BASE_URL}/kismet-imports/`);
      const importsData = await importsResponse.json();

      if (!importsResponse.ok) {
        throw new Error(importsData?.detail || "Failed to load scan imports.");
      }

      const importRows = normalizeArray(importsData);

      const summaryResults = await Promise.all(
        importRows.map(async (batch) => {
          const batchId = getBatchId(batch);

          if (!batchId) {
            return {
              batch,
              summary: {},
              failed: true,
            };
          }

          try {
            const response = await fetch(
              `${API_BASE_URL}/kismet-imports/${batchId}/processed-summary`
            );

            const data = await response.json();

            if (!response.ok) {
              return {
                batch,
                summary: {},
                failed: true,
              };
            }

            return {
              batch,
              summary: data,
              failed: false,
            };
          } catch {
            return {
              batch,
              summary: {},
              failed: true,
            };
          }
        })
      );

      const wifiRows = summaryResults.flatMap(({ batch, summary }) =>
        buildWifiRowsFromSummary(summary, batch)
      );

      const deviceRows = summaryResults.flatMap(({ batch, summary }) =>
        buildDeviceRowsFromSummary(summary, batch)
      );

      setImports(importRows);
      setWifiRecords(wifiRows);
      setDeviceRecords(deviceRows);
    } catch (err) {
      setError(err?.message || "Unable to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <Box>
      <Stack spacing={2}>
        <Stack
          direction={{
            xs: "column",
            md: "row",
          }}
          spacing={1}
          sx={{
            alignItems: {
              xs: "flex-start",
              md: "center",
            },
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography variant="h4" fontWeight={900}>
              Dashboard
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Visual overview of scans, wireless records, security, signal bands,
              manufacturers, locations, and review items.
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={loadDashboard}
            disabled={isLoading}
            sx={{ fontWeight: 800 }}
          >
            Refresh
          </Button>
        </Stack>

        {isLoading && <LinearProgress />}

        {error && (
          <Alert severity="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              lg: "repeat(6, 1fr)",
            },
            gap: 1.5,
          }}
        >
          <KpiCard
            title="Total Scans"
            value={formatNumber(imports.length)}
            subtitle="Imported files"
            icon={<StorageIcon />}
          />

          <KpiCard
            title="Wi-Fi Records"
            value={formatNumber(wifiRecords.length)}
            subtitle="Wi-Fi detection records"
            icon={<WifiIcon />}
          />

          <KpiCard
            title="Observed Devices"
            value={formatNumber(deviceRecords.length)}
            subtitle="Client/device records"
            icon={<DevicesIcon />}
          />

          <KpiCard
            title="Mapped Points"
            value={formatNumber(mappedPoints.length)}
            subtitle="With valid GPS"
            icon={<MapIcon />}
          />

          <KpiCard
            title="No Password"
            value={formatNumber(openNetworkCount)}
            subtitle="Open Wi-Fi records"
            icon={<SecurityIcon />}
          />

          <KpiCard
            title="Top Band"
            value={topBand}
            subtitle="Most common signal band"
            icon={<SignalCellularAltIcon />}
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              lg: "1fr 1fr",
            },
            gap: 1.5,
          }}
        >
          <DonutChartCard
            title="Security Overview"
            subtitle="Password protection and open Wi-Fi breakdown."
            rows={securityOverview}
          />

          <DonutChartCard
            title="Signal Band Overview"
            subtitle="Detected 2.4 GHz, 5 GHz, 6 GHz, and unknown bands."
            rows={signalBandOverview}
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              lg: "1fr 1fr",
            },
            gap: 1.5,
          }}
        >
          <BarChartCard
            title="Manufacturer Overview"
            subtitle="Most visible manufacturers from Wi-Fi and observed device records."
            rows={manufacturerOverview}
          />

          <BarChartCard
            title="Review Focus"
            subtitle="Quick view of items that may need analyst attention."
            rows={reviewFocusRows}
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              xl: "1.05fr 0.95fr",
            },
            gap: 1.5,
          }}
        >
          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Stack
                  direction={{
                    xs: "column",
                    sm: "row",
                  }}
                  spacing={1}
                  sx={{
                    alignItems: {
                      xs: "flex-start",
                      sm: "center",
                    },
                    justifyContent: "space-between",
                  }}
                >
                  <Box>
                    <Typography variant="h6" fontWeight={900}>
                      Map Preview
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                      Blue = Wi-Fi records, red = observed devices.
                    </Typography>
                  </Box>

                  <Button
                    component={RouterLink}
                    to="/map"
                    variant="outlined"
                    startIcon={<MapIcon />}
                    sx={{ fontWeight: 800 }}
                  >
                    Open Map
                  </Button>
                </Stack>

                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", flexWrap: "wrap" }}
                >
                  <Chip
                    size="small"
                    label="Wi-Fi"
                    sx={{
                      borderColor: "#2563EB",
                      color: "#2563EB",
                    }}
                    variant="outlined"
                  />
                  <Chip
                    size="small"
                    label="Observed Device"
                    sx={{
                      borderColor: "#DC2626",
                      color: "#DC2626",
                    }}
                    variant="outlined"
                  />
                  <Chip
                    size="small"
                    label="Manual/Fallback"
                    variant="outlined"
                  />
                </Stack>

                <Box
                  sx={{
                    height: 330,
                    borderRadius: 3,
                    overflow: "hidden",
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <MapContainer
                    center={mapCenter}
                    zoom={13}
                    style={{
                      height: "100%",
                      width: "100%",
                    }}
                    scrollWheelZoom={false}
                  >
                    <Pane name="wifiPane" style={{ zIndex: 420 }} />
                    <Pane name="devicePane" style={{ zIndex: 430 }} />

                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <DashboardMapAutoFit points={mappedPoints} />

                    {mappedPoints.map((point) => {
                      const style = getPointStyle(
                        point.type,
                        point.coordinateSource
                      );

                      return (
                        <CircleMarker
                          key={point.id}
                          center={[
                            point.displayLatitude,
                            point.displayLongitude,
                          ]}
                          pathOptions={{
                            color: style.color,
                            fillColor: style.fillColor,
                            fillOpacity: style.fillOpacity,
                            weight: style.weight,
                          }}
                          radius={style.radius}
                          pane={style.pane}
                        >
                          <Tooltip direction="top" offset={[0, -4]}>
                            {point.label || point.type}
                          </Tooltip>

                          <Popup>
                            <Box sx={{ minWidth: 220 }}>
                              <Typography variant="body2" fontWeight={900}>
                                {point.label || point.type}
                              </Typography>

                              <Typography variant="caption" color="text.secondary">
                                {point.type}
                              </Typography>

                              <Typography variant="body2" sx={{ mt: 1 }}>
                                Device ID: {point.identifier || "—"}
                                <br />
                                Manufacturer: {point.manufacturer || UNKNOWN_MANUFACTURER}
                                <br />
                                Scan: #{point.scanId || "—"}
                                <br />
                                Signal Band: {getSignalBandLabel(point)}
                                <br />
                                Signal Level (dBm): {point.signal}
                                <br />
                                Location: {getReadableLocation(point)}
                              </Typography>
                            </Box>
                          </Popup>
                        </CircleMarker>
                      );
                    })}
                  </MapContainer>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Box>
                    <Typography variant="h6" fontWeight={900}>
                      Latest Scan Results
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                      Recently imported Kismet files.
                    </Typography>
                  </Box>

                  <Button
                    component={RouterLink}
                    to="/scan-results"
                    variant="outlined"
                    sx={{ fontWeight: 800 }}
                  >
                    View All
                  </Button>
                </Stack>

                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Scan</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Wi-Fi</TableCell>
                        <TableCell align="right">Devices</TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {latestImports.map((item) => (
                        <TableRow key={getBatchId(item)} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={800}>
                              #{getBatchId(item)} {getBatchName(item)}
                            </Typography>

                            <Typography variant="caption" color="text.secondary">
                              {formatDateTime(item.created_at)}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <Chip
                              label={item.status || "completed"}
                              color="success"
                              size="small"
                              sx={{ fontWeight: 800 }}
                            />
                          </TableCell>

                          <TableCell align="right">
                            {formatNumber(
                              item.wifi_count ||
                                item.wifi_records ||
                                item.total_wifi ||
                                0
                            )}
                          </TableCell>

                          <TableCell align="right">
                            {formatNumber(
                              item.device_count ||
                                item.client_count ||
                                item.total_devices ||
                                0
                            )}
                          </TableCell>
                        </TableRow>
                      ))}

                      {latestImports.length === 0 && !isLoading && (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              align="center"
                              sx={{ py: 3 }}
                            >
                              No imported scans yet.
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
        </Box>

        <Card>
          <CardContent>
            <Stack spacing={1.25}>
              <Stack
                direction={{
                  xs: "column",
                  md: "row",
                }}
                spacing={1}
                sx={{
                  alignItems: {
                    xs: "flex-start",
                    md: "center",
                  },
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography variant="h6" fontWeight={900}>
                    Review Items
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Wi-Fi networks with the most observed device activity.
                  </Typography>
                </Box>

                <Chip
                  icon={<WarningAmberIcon fontSize="small" />}
                  label={`${formatNumber(reviewItems.length)} items`}
                  color="warning"
                  variant="outlined"
                  sx={{ fontWeight: 800 }}
                />
              </Stack>

              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Wi-Fi Name (SSID)</TableCell>
                      <TableCell>Wi-Fi Device ID (BSSID)</TableCell>
                      <TableCell align="right">Device Records</TableCell>
                      <TableCell align="right">Unique Devices</TableCell>
                      <TableCell>Latest Seen</TableCell>
                      <TableCell align="right">Profile</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {reviewItems.map((item) => (
                      <TableRow key={item.bssid} hover>
                        <TableCell>{item.ssid}</TableCell>

                        <TableCell>{item.bssid}</TableCell>

                        <TableCell align="right">
                          {formatNumber(item.total_records)}
                        </TableCell>

                        <TableCell align="right">
                          {formatNumber(item.unique_device_count)}
                        </TableCell>

                        <TableCell>{formatDateTime(item.latest_seen)}</TableCell>

                        <TableCell align="right">
                          {item.bssid !== "Unlinked" ? (
                            <Link
                              component={RouterLink}
                              to={`/bssids/${encodeURIComponent(item.bssid)}`}
                              underline="hover"
                            >
                              View
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}

                    {reviewItems.length === 0 && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            align="center"
                            sx={{ py: 3 }}
                          >
                            No review items available yet.
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
