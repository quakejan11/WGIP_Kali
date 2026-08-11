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
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import SignalCellularAltIcon from "@mui/icons-material/SignalCellularAlt";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import WifiIcon from "@mui/icons-material/Wifi";

import { analyzeTrackedWifi } from "../utils/trackingRules";
import { formatManufacturerDisplay } from "../utils/wgipDisplay";

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

const TRACKING_OPTIONS = {
  defaultRadiusMeters: 75,
  minRadiusMeters: 35,
  maxRadiusMeters: 160,
  minimumRecurringGapMinutes: 60,
};

function arrayFrom(data) {
  if (Array.isArray(data)) return data;

  for (const key of [
    "items",
    "records",
    "data",
    "results",
    "imports",
    "batches",
  ]) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return [];
}

function rowsFrom(data, keys) {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key]) && data[key].length) {
      return data[key];
    }
  }

  return [];
}

function valueOf(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row?.[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function mac(value = "") {
  return String(value || "").trim().toUpperCase();
}

function validMac(value = "") {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(
    String(value).trim()
  );
}

function validCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !(lat === 0 && lon === 0) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function numberText(value) {
  const number = Number(value || 0);

  return Number.isFinite(number)
    ? number.toLocaleString()
    : "0";
}

function dateText(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString();
}

function coordinateText(latitude, longitude) {
  if (!validCoordinates(latitude, longitude)) {
    return "Location unavailable";
  }

  return `${Number(latitude).toFixed(6)}, ${Number(
    longitude
  ).toFixed(6)}`;
}

function batchId(batch) {
  return valueOf(
    batch,
    ["id", "import_batch_id", "batch_id", "scan_id"],
    ""
  );
}

function batchName(batch) {
  return (
    valueOf(
      batch,
      [
        "manual_area_label",
        "scan_name",
        "name",
        "original_filename",
      ],
      ""
    ) || `Scan #${batchId(batch) || "Unknown"}`
  );
}

function latitudeOf(row) {
  return valueOf(
    row,
    [
      "latitude",
      "lat",
      "avg_lat",
      "average_latitude",
      "min_lat",
      "max_lat",
    ],
    ""
  );
}

function longitudeOf(row) {
  return valueOf(
    row,
    [
      "longitude",
      "lon",
      "lng",
      "avg_lon",
      "average_longitude",
      "min_lon",
      "max_lon",
    ],
    ""
  );
}

function timeOf(row) {
  return valueOf(
    row,
    [
      "timestamp",
      "last_seen",
      "last_time",
      "first_seen",
      "first_time",
      "created_at",
      "time",
    ],
    ""
  );
}

function earlier(current, candidate) {
  if (!current) return candidate || "";
  if (!candidate) return current;

  const currentTime = new Date(current).getTime();
  const candidateTime = new Date(candidate).getTime();

  if (!Number.isFinite(currentTime)) return candidate;
  if (!Number.isFinite(candidateTime)) return current;

  return candidateTime < currentTime ? candidate : current;
}

function later(current, candidate) {
  if (!current) return candidate || "";
  if (!candidate) return current;

  const currentTime = new Date(current).getTime();
  const candidateTime = new Date(candidate).getTime();

  if (!Number.isFinite(currentTime)) return candidate;
  if (!Number.isFinite(candidateTime)) return current;

  return candidateTime > currentTime ? candidate : current;
}

function securityOf(row) {
  const raw = String(
    valueOf(
      row,
      [
        "encryption",
        "security",
        "crypt",
        "security_type",
        "encryption_type",
        "privacy",
      ],
      ""
    )
  ).toUpperCase();

  if (raw.includes("WPA3") || raw.includes("SAE")) {
    return "WPA3";
  }

  if (
    raw.includes("WPA2") ||
    raw.includes("RSN") ||
    raw.includes("CCMP")
  ) {
    return "WPA2";
  }

  if (raw.includes("WPA")) return "WPA";
  if (raw.includes("WEP")) return "WEP";

  if (
    raw.includes("OPEN") ||
    raw.includes("NONE") ||
    raw.includes("UNENCRYPTED")
  ) {
    return "Open";
  }

  return "Unknown";
}

function securityColor(type) {
  if (type === "WPA3") return "success";
  if (type === "WPA2") return "primary";
  if (type === "WPA") return "warning";
  if (type === "WEP" || type === "Open") return "error";

  return "default";
}

function signalOf(row) {
  const raw = valueOf(
    row,
    [
      "signal_dbm",
      "signal",
      "rssi",
      "strongest_signal",
      "best_signal",
    ],
    ""
  );

  const number = Number(raw);

  return Number.isFinite(number) &&
    number < 0 &&
    number >= -130
    ? number
    : null;
}

function signalDetails(value) {
  if (value === null || value === undefined) {
    return {
      label: "Unknown",
      detail: "No reliable dBm value",
      color: "default",
    };
  }

  if (value >= -55) {
    return {
      label: "Strong",
      detail: `${value} dBm`,
      color: "success",
    };
  }

  if (value >= -70) {
    return {
      label: "Fair",
      detail: `${value} dBm`,
      color: "warning",
    };
  }

  return {
    label: "Weak",
    detail: `${value} dBm`,
    color: "error",
  };
}

function channelOf(row) {
  const raw = valueOf(
    row,
    ["channel", "frequency", "freq"],
    ""
  );

  const frequency = Number(raw);

  if (!raw) return "";

  if (
    !Number.isFinite(frequency) ||
    (frequency >= 1 && frequency <= 233)
  ) {
    return String(raw);
  }

  if (frequency === 2484) return "14";

  if (frequency >= 2412 && frequency <= 2472) {
    return String(Math.round((frequency - 2407) / 5));
  }

  if (frequency >= 5000 && frequency <= 5900) {
    return String(Math.round((frequency - 5000) / 5));
  }

  if (frequency >= 5955 && frequency <= 7115) {
    return String(Math.round((frequency - 5950) / 5));
  }

  return String(raw);
}

function manufacturerOf(row) {
  const manufacturer = String(
    valueOf(
      row,
      [
        "manufacturer",
        "vendor",
        "manuf",
        "brand",
        "device_vendor",
        "bssid_vendor",
        "oui_vendor",
      ],
      ""
    )
  ).trim();

  if (!manufacturer || validMac(manufacturer)) {
    return "Unknown Manufacturer";
  }

  return formatManufacturerDisplay(manufacturer);
}

function ssidOf(row, bssid) {
  const ssid = String(
    valueOf(
      row,
      ["ssid", "network_name", "wifi_name", "name"],
      ""
    )
  ).trim();

  return !ssid || mac(ssid) === mac(bssid)
    ? "Hidden/Unknown"
    : ssid;
}

function sourceOf(row) {
  return String(
    valueOf(
      row,
      [
        "coordinate_source",
        "point_source",
        "gps_source",
        "location_source",
        "source",
      ],
      ""
    )
  ).trim();
}

function confidenceOf(row, source) {
  const raw = valueOf(
    row,
    [
      "coordinate_confidence",
      "location_confidence",
      "gps_confidence",
      "confidence",
    ],
    ""
  );

  if (raw !== "") {
    const number = Number(raw);

    if (Number.isFinite(number)) {
      const percent =
        number <= 1 ? number * 100 : number;

      if (percent >= 80) return "High";
      if (percent >= 50) return "Medium";

      return "Low";
    }

    const text = String(raw).toLowerCase();

    if (
      text.includes("high") ||
      text.includes("verified")
    ) {
      return "High";
    }

    if (
      text.includes("medium") ||
      text.includes("moderate")
    ) {
      return "Medium";
    }
  }

  const sourceValue = String(source).toLowerCase();

  if (
    sourceValue.includes("packet") ||
    sourceValue.includes("raw gps")
  ) {
    return "High";
  }

  if (
    sourceValue.includes("gps") ||
    sourceValue.includes("kismet") ||
    sourceValue.includes("capture")
  ) {
    return "Medium";
  }

  return "Low";
}

function sourceText(source) {
  if (!source) return "Source not labeled";

  const text = String(source).toLowerCase();

  if (text.includes("packet")) {
    return "Raw packet GPS";
  }

  if (text.includes("manual")) {
    return "Manual scan location";
  }

  if (text.includes("import")) {
    return "Imported location";
  }

  if (
    text.includes("kismet") ||
    text.includes("capture")
  ) {
    return "Scan GPS";
  }

  return source;
}

function confidenceColor(confidence) {
  if (confidence === "High") return "success";
  if (confidence === "Medium") return "warning";

  return "default";
}

function wifiRows(summary) {
  return rowsFrom(summary, WIFI_KEYS).filter((row) =>
    validMac(
      valueOf(
        row,
        ["bssid", "mac", "devmac", "device_mac"],
        ""
      )
    )
  );
}

function deviceRows(summary) {
  return rowsFrom(summary, DEVICE_KEYS).filter(
    (row) => {
      const client = valueOf(
        row,
        [
          "client_mac",
          "mac",
          "device_mac",
          "devmac",
        ],
        ""
      );

      const bssid = valueOf(
        row,
        ["bssid", "linked_bssid"],
        ""
      );

      return validMac(client) || validMac(bssid);
    }
  );
}

function emptyMetadata() {
  return {
    ssid: "Hidden/Unknown",
    manufacturer: "Unknown Manufacturer",
    scanIds: new Set(),
    scanNames: new Set(),
    devices: new Set(),
    channels: new Set(),
    security: new Set(),
    latestSecurity: "Unknown",
    securityTime: 0,
    bestSignal: null,
    latitude: "",
    longitude: "",
    coordinateSource: "",
    confidence: "",
    coordinateTime: 0,
    firstSeen: "",
    lastSeen: "",
  };
}

function buildData(scanSummaries) {
  const sourceRows = [];
  const metadata = new Map();

  const ensure = (bssid) => {
    if (!metadata.has(bssid)) {
      metadata.set(bssid, emptyMetadata());
    }

    return metadata.get(bssid);
  };

  scanSummaries.forEach(({ batch, summary }) => {
    const id = String(batchId(batch) || "");
    const name = batchName(batch);

    wifiRows(summary).forEach((row) => {
      const bssid = mac(
        valueOf(
          row,
          ["bssid", "mac", "devmac", "device_mac"],
          ""
        )
      );

      if (!validMac(bssid)) return;

      const latitude = latitudeOf(row);
      const longitude = longitudeOf(row);
      const timestamp = timeOf(row);
      const timestampNumber =
        new Date(timestamp).getTime();
      const security = securityOf(row);
      const signal = signalOf(row);
      const source = sourceOf(row);
      const item = ensure(bssid);

      sourceRows.push({
        ...row,
        bssid,
        mac: bssid,

        import_batch_id:
          valueOf(
            row,
            [
              "import_batch_id",
              "survey_id",
              "scan_id",
              "batch_id",
            ],
            ""
          ) || id,

        scan_id:
          valueOf(
            row,
            [
              "scan_id",
              "import_batch_id",
              "survey_id",
              "batch_id",
            ],
            ""
          ) || id,

        scan_name:
          valueOf(
            row,
            [
              "scan_name",
              "manual_area_label",
              "area_name",
              "location_name",
            ],
            ""
          ) || name,

        latitude,
        longitude,
        timestamp,
      });

      const ssid = ssidOf(row, bssid);
      const manufacturer = manufacturerOf(row);
      const channel = channelOf(row);

      if (
        ssid !== "Hidden/Unknown" &&
        item.ssid === "Hidden/Unknown"
      ) {
        item.ssid = ssid;
      }

      if (
        manufacturer !== "Unknown Manufacturer" &&
        item.manufacturer === "Unknown Manufacturer"
      ) {
        item.manufacturer = manufacturer;
      }

      if (channel) item.channels.add(channel);
      if (id) item.scanIds.add(id);
      if (name) item.scanNames.add(name);

      item.security.add(security);

      if (
        item.latestSecurity === "Unknown" ||
        (Number.isFinite(timestampNumber) &&
          timestampNumber >= item.securityTime)
      ) {
        item.latestSecurity = security;

        item.securityTime = Number.isFinite(
          timestampNumber
        )
          ? timestampNumber
          : item.securityTime;
      }

      if (
        signal !== null &&
        (item.bestSignal === null ||
          signal > item.bestSignal)
      ) {
        item.bestSignal = signal;
      }

      item.firstSeen = earlier(
        item.firstSeen,
        timestamp
      );

      item.lastSeen = later(
        item.lastSeen,
        timestamp
      );

      if (validCoordinates(latitude, longitude)) {
        const replaceCoordinate =
          !validCoordinates(
            item.latitude,
            item.longitude
          ) ||
          (Number.isFinite(timestampNumber) &&
            timestampNumber >= item.coordinateTime);

        if (replaceCoordinate) {
          item.latitude = Number(latitude);
          item.longitude = Number(longitude);
          item.coordinateSource = source;

          item.confidence = confidenceOf(
            row,
            source
          );

          item.coordinateTime = Number.isFinite(
            timestampNumber
          )
            ? timestampNumber
            : item.coordinateTime;
        }
      }
    });

    deviceRows(summary).forEach((row) => {
      const bssid = mac(
        valueOf(
          row,
          ["bssid", "linked_bssid"],
          ""
        )
      );

      const client = mac(
        valueOf(
          row,
          [
            "client_mac",
            "mac",
            "device_mac",
            "devmac",
          ],
          ""
        )
      );

      if (validMac(bssid) && validMac(client)) {
        ensure(bssid).devices.add(client);
      }
    });
  });

  return analyzeTrackedWifi(
    sourceRows,
    TRACKING_OPTIONS
  )
    .map((wifi) => {
      const item =
        metadata.get(wifi.bssid) ||
        emptyMetadata();

      const scanList =
        wifi.trackingAnalysis?.scanIds?.length
          ? wifi.trackingAnalysis.scanIds.map(
              String
            )
          : Array.from(item.scanIds);

      const securityHistory = Array.from(
        item.security
      ).filter((type) => type !== "Unknown");

      const analyzedSsid =
        wifi.ssid &&
        mac(wifi.ssid) !== mac(wifi.bssid)
          ? wifi.ssid
          : "";

      return {
        bssid: wifi.bssid,

        ssid:
          analyzedSsid &&
          analyzedSsid !== "Hidden/Unknown"
            ? analyzedSsid
            : item.ssid,

        manufacturer: item.manufacturer,

        scanCount: Number(
          wifi.scanCount ||
            scanList.length ||
            0
        ),

        scanList,
        scanNames: Array.from(item.scanNames),

        observations: Number(
          wifi.observations ||
            wifi.observationCount ||
            wifi.rows?.length ||
            0
        ),

        deviceCount: item.devices.size,
        channels: Array.from(item.channels),

        securityType:
          item.latestSecurity !== "Unknown"
            ? item.latestSecurity
            : securityHistory.at(-1) || "Unknown",

        securityHistory,

        securityChanged:
          securityHistory.length > 1,

        bestSignal: item.bestSignal,
        latitude: item.latitude,
        longitude: item.longitude,
        coordinateSource: item.coordinateSource,
        confidence: item.confidence,

        firstSeen:
          wifi.firstSeen || item.firstSeen,

        lastSeen:
          wifi.lastSeen || item.lastSeen,

        areaCount: Number(
          wifi.scannedAreaCount || 0
        ),

        hasLocation: validCoordinates(
          item.latitude,
          item.longitude
        ),

        movement: Boolean(
          wifi.movementDetected
        ),

        recurring: Boolean(
          wifi.recurringPresence
        ),

        tracked: Boolean(wifi.isTracked),
      };
    })
    .sort((a, b) => {
      if (a.movement !== b.movement) {
        return (
          Number(b.movement) -
          Number(a.movement)
        );
      }

      if (a.scanCount !== b.scanCount) {
        return b.scanCount - a.scanCount;
      }

      return b.observations - a.observations;
    });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mapPath(item) {
  const query = new URLSearchParams({
    bssid: item.bssid,
  });

  if (item.hasLocation) {
    query.set(
      "latitude",
      String(item.latitude)
    );

    query.set(
      "longitude",
      String(item.longitude)
    );
  }

  return `/map?${query.toString()}`;
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}) {
  return (
    <Card>
      <CardContent sx={{ minHeight: 92 }}>
        <Stack
          direction="row"
          spacing={1.25}
          alignItems="center"
        >
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              bgcolor: "#EEF2FF",
              color: "#1D4ED8",
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>

          <Box>
            <Typography
              variant="body2"
              color="text.secondary"
            >
              {title}
            </Typography>

            <Typography
              variant="h5"
              fontWeight={800}
            >
              {numberText(value)}
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
            >
              {subtitle}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function BssidHistory() {
  const [scanSummaries, setScanSummaries] =
    useState([]);

  const [search, setSearch] = useState("");

  const [
    trackingFilter,
    setTrackingFilter,
  ] = useState("all");

  const [
    securityFilter,
    setSecurityFilter,
  ] = useState("all");

  const [scanFilter, setScanFilter] =
    useState("all");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] = useState("");

  const [failedScans, setFailedScans] =
    useState(0);

  const allRows = useMemo(
    () => buildData(scanSummaries),
    [scanSummaries]
  );

  const trackedRows = useMemo(
    () =>
      allRows.filter((item) => item.tracked),
    [allRows]
  );

  const scans = useMemo(
    () =>
      scanSummaries
        .map(({ batch }) => ({
          id: String(batchId(batch) || ""),
          name: batchName(batch),
        }))
        .filter((scan) => scan.id)
        .sort(
          (a, b) =>
            Number(b.id) - Number(a.id)
        ),
    [scanSummaries]
  );

  const filteredRows = useMemo(() => {
    const term = search
      .trim()
      .toLowerCase();

    return trackedRows.filter((item) => {
      if (
        trackingFilter === "movement" &&
        !item.movement
      ) {
        return false;
      }

      if (
        trackingFilter === "recurring" &&
        !item.recurring
      ) {
        return false;
      }

      if (
        trackingFilter === "with-location" &&
        !item.hasLocation
      ) {
        return false;
      }

      if (
        trackingFilter ===
          "without-location" &&
        item.hasLocation
      ) {
        return false;
      }

      if (
        securityFilter !== "all" &&
        item.securityType !== securityFilter
      ) {
        return false;
      }

      if (
        scanFilter !== "all" &&
        !item.scanList
          .map(String)
          .includes(String(scanFilter))
      ) {
        return false;
      }

      if (!term) return true;

      return [
        item.ssid,
        item.bssid,
        item.manufacturer,
        item.securityType,
        item.channels.join(" "),
        item.scanList.join(" "),
        item.scanNames.join(" "),
        item.coordinateSource,
        coordinateText(
          item.latitude,
          item.longitude
        ),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [
    trackedRows,
    search,
    trackingFilter,
    securityFilter,
    scanFilter,
  ]);

  const movementCount =
    trackedRows.filter(
      (item) => item.movement
    ).length;

  const recurringCount =
    trackedRows.filter(
      (item) => item.recurring
    ).length;

  const locationCount =
    trackedRows.filter(
      (item) => item.hasLocation
    ).length;

  const detectionCount =
    trackedRows.reduce(
      (sum, item) =>
        sum + item.observations,
      0
    );

  async function loadData() {
    setLoading(true);
    setError("");
    setFailedScans(0);

    try {
      const importsResponse = await fetch(
        `${API_BASE_URL}/kismet-imports/`
      );

      const importsData =
        await importsResponse
          .json()
          .catch(() => []);

      if (!importsResponse.ok) {
        throw new Error(
          importsData?.detail ||
            "Failed to load scan imports."
        );
      }

      const imports = arrayFrom(importsData);

      const results = await Promise.all(
        imports.map(async (batch) => {
          const id = batchId(batch);

          if (!id) {
            return {
              batch,
              summary: {},
              failed: true,
            };
          }

          try {
            const response = await fetch(
              `${API_BASE_URL}/kismet-imports/${id}/processed-summary`
            );

            const summary = await response
              .json()
              .catch(() => ({}));

            return {
              batch,
              summary,
              failed: !response.ok,
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

      const failures = results.filter(
        (result) => result.failed
      ).length;

      if (
        imports.length &&
        failures === imports.length
      ) {
        throw new Error(
          "Failed to load processed scan summaries."
        );
      }

      setFailedScans(failures);

      setScanSummaries(
        results.filter(
          (result) => !result.failed
        )
      );
    } catch (loadError) {
      setError(
        loadError?.message ||
          "Failed to load tracked Wi-Fi records."
      );

      setScanSummaries([]);
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setTrackingFilter("all");
    setSecurityFilter("all");
    setScanFilter("all");
  }

  function exportPdf() {
    if (!filteredRows.length) return;

    const report = window.open(
      "",
      "_blank",
      "width=1200,height=800"
    );

    if (!report) {
      setError(
        "Allow pop-ups, then try Export PDF again."
      );

      return;
    }

    const rows = filteredRows
      .map((item) => {
        const signal = signalDetails(
          item.bestSignal
        );

        return `
          <tr>
            <td>${escapeHtml(item.ssid)}</td>
            <td>${escapeHtml(item.bssid)}</td>
            <td>${escapeHtml(item.manufacturer)}</td>
            <td>
              ${
                item.movement
                  ? "Movement Detected"
                  : "Recurring Presence"
              }
            </td>
            <td>${escapeHtml(
              item.securityType
            )}</td>
            <td>
              ${escapeHtml(signal.label)}
              (${escapeHtml(signal.detail)})
            </td>
            <td>${item.scanCount}</td>
            <td>${item.observations}</td>
            <td>${escapeHtml(
              coordinateText(
                item.latitude,
                item.longitude
              )
            )}</td>
            <td>${escapeHtml(
              dateText(item.lastSeen)
            )}</td>
          </tr>
        `;
      })
      .join("");

    report.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Tracked Wi-Fi Report</title>
          <style>
            @page {
              size: landscape;
              margin: 12mm;
            }

            body {
              font-family: Arial;
              color: #0f172a;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 9px;
            }

            th,
            td {
              border: 1px solid #cbd5e1;
              padding: 6px;
              text-align: left;
            }

            th {
              background: #f1f5f9;
            }
          </style>
        </head>

        <body>
          <h1>Tracked Wi-Fi Report</h1>

          <p>
            Generated
            ${escapeHtml(
              new Date().toLocaleString()
            )}
            · ${filteredRows.length} record(s)
          </p>

          <table>
            <thead>
              <tr>
                <th>Wi-Fi Name</th>
                <th>BSSID</th>
                <th>Manufacturer</th>
                <th>Status</th>
                <th>Security</th>
                <th>Signal</th>
                <th>Scans</th>
                <th>Detections</th>
                <th>Location</th>
                <th>Last Seen</th>
              </tr>
            </thead>

            <tbody>
              ${rows}
            </tbody>
          </table>
        </body>
      </html>
    `);

    report.document.close();
    report.focus();

    window.setTimeout(
      () => report.print(),
      300
    );
  }

  useEffect(() => {
    loadData();
  }, []);

  const hasFilters =
    Boolean(search) ||
    trackingFilter !== "all" ||
    securityFilter !== "all" ||
    scanFilter !== "all";

  return (
    <Box>
      <Stack spacing={2}>
        <Stack
          direction={{
            xs: "column",
            md: "row",
          }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{
            xs: "flex-start",
            md: "center",
          }}
        >
          <Box>
            <Typography
              variant="h4"
              fontWeight={900}
            >
              Tracked Wi-Fi
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
            >
              Wi-Fi networks seen in separate
              scans, with movement, security,
              signal, device, and location
              details.
            </Typography>
          </Box>

          <Stack
            direction="row"
            spacing={1}
          >
            <Button
              color="error"
              variant="outlined"
              startIcon={
                <PictureAsPdfOutlinedIcon />
              }
              onClick={exportPdf}
              disabled={
                loading ||
                !filteredRows.length
              }
              sx={{ fontWeight: 800 }}
            >
              Export PDF
            </Button>

            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={loadData}
              disabled={loading}
              sx={{ fontWeight: 800 }}
            >
              Refresh
            </Button>
          </Stack>
        </Stack>

        {loading && <LinearProgress />}

        {error && (
          <Alert
            severity="error"
            onClose={() => setError("")}
          >
            {error}
          </Alert>
        )}

        {failedScans > 0 && (
          <Alert severity="warning">
            {numberText(failedScans)} scan
            summary could not be loaded.
            Totals use the scans that loaded
            successfully.
          </Alert>
        )}

        <Alert severity="info">
          A Wi-Fi network becomes tracked only
          after it appears in at least two
          separate scans. Movement Detected
          means it was confirmed in at least
          two location clusters; otherwise it
          is Recurring Presence. Repeated
          records from only one scan do not
          make it tracked.
        </Alert>

        <Card>
          <CardContent>
            <Box
              sx={{
                display: "grid",

                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  lg: "2fr repeat(3, 1fr) auto",
                },

                gap: 1,
              }}
            >
              <TextField
                size="small"
                label="Search tracked Wi-Fi"
                placeholder="Name, BSSID, manufacturer, security, or location"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
              />

              <TextField
                select
                size="small"
                label="Tracking / Location"
                value={trackingFilter}
                onChange={(event) =>
                  setTrackingFilter(
                    event.target.value
                  )
                }
              >
                <MenuItem value="all">
                  All Tracked Wi-Fi
                </MenuItem>

                <MenuItem value="movement">
                  Movement Detected
                </MenuItem>

                <MenuItem value="recurring">
                  Recurring Presence
                </MenuItem>

                <MenuItem value="with-location">
                  With Location
                </MenuItem>

                <MenuItem value="without-location">
                  Without Location
                </MenuItem>
              </TextField>

              <TextField
                select
                size="small"
                label="Security"
                value={securityFilter}
                onChange={(event) =>
                  setSecurityFilter(
                    event.target.value
                  )
                }
              >
                <MenuItem value="all">
                  All Security Types
                </MenuItem>

                {[
                  "WPA3",
                  "WPA2",
                  "WPA",
                  "WEP",
                  "Open",
                  "Unknown",
                ].map((type) => (
                  <MenuItem
                    key={type}
                    value={type}
                  >
                    {type}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                size="small"
                label="Scan / Import"
                value={scanFilter}
                onChange={(event) =>
                  setScanFilter(
                    event.target.value
                  )
                }
              >
                <MenuItem value="all">
                  All Scans
                </MenuItem>

                {scans.map((scan) => (
                  <MenuItem
                    key={scan.id}
                    value={scan.id}
                  >
                    Scan #{scan.id} ·{" "}
                    {scan.name}
                  </MenuItem>
                ))}
              </TextField>

              <Button
                onClick={clearFilters}
                disabled={!hasFilters}
                sx={{
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                Clear Filters
              </Button>
            </Box>

            <Stack
              direction="row"
              spacing={1}
              mt={1.5}
              alignItems="center"
              flexWrap="wrap"
            >
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={`${numberText(
                  filteredRows.length
                )} shown`}
              />

              <Chip
                size="small"
                variant="outlined"
                label="Raw detection records retained"
              />
            </Stack>
          </CardContent>
        </Card>

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
          <StatCard
            title="Tracked Wi-Fi"
            value={trackedRows.length}
            subtitle={`${numberText(
              allRows.length
            )} total Wi-Fi networks found`}
            icon={<WifiIcon />}
          />

          <StatCard
            title="Movement Detected"
            value={movementCount}
            subtitle="Confirmed in multiple location clusters"
            icon={<RouteOutlinedIcon />}
          />

          <StatCard
            title="Recurring Presence"
            value={recurringCount}
            subtitle="Seen in separate scans without confirmed movement"
            icon={<HistoryOutlinedIcon />}
          />

          <StatCard
            title="Detection Records"
            value={detectionCount}
            subtitle="Raw records for tracked Wi-Fi"
            icon={<SignalCellularAltIcon />}
          />

          <StatCard
            title="Location Available"
            value={locationCount}
            subtitle="Tracked Wi-Fi with valid coordinates"
            icon={<MapOutlinedIcon />}
          />
        </Box>

        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Box>
                <Typography
                  variant="h6"
                  fontWeight={900}
                >
                  Tracked Wi-Fi Records
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  Review identity, security,
                  signal, scan history, linked
                  devices, and location
                  confidence.
                </Typography>
              </Box>

              <Box
                sx={{ overflowX: "auto" }}
              >
                <Table
                  size="small"
                  sx={{ minWidth: 1850 }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        Wi-Fi Name
                      </TableCell>

                      <TableCell>
                        BSSID / Manufacturer
                      </TableCell>

                      <TableCell>
                        Status
                      </TableCell>

                      <TableCell>
                        Security
                      </TableCell>

                      <TableCell>
                        Channel
                      </TableCell>

                      <TableCell>
                        Best Signal
                      </TableCell>

                      <TableCell align="right">
                        Areas
                      </TableCell>

                      <TableCell align="right">
                        Scans
                      </TableCell>

                      <TableCell align="right">
                        Detection Records
                      </TableCell>

                      <TableCell align="right">
                        Observed Devices
                      </TableCell>

                      <TableCell>
                        Location & Confidence
                      </TableCell>

                      <TableCell>
                        First Seen
                      </TableCell>

                      <TableCell>
                        Last Seen
                      </TableCell>

                      <TableCell align="right">
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {filteredRows.map(
                      (item) => {
                        const signal =
                          signalDetails(
                            item.bestSignal
                          );

                        const profile =
                          `/bssids/${encodeURIComponent(
                            item.bssid
                          )}`;

                        return (
                          <TableRow
                            key={item.bssid}
                            hover
                          >
                            <TableCell>
                              <Typography
                                fontWeight={800}
                                variant="body2"
                              >
                                {item.ssid ||
                                  "Hidden/Unknown"}
                              </Typography>

                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {item.ssid ===
                                "Hidden/Unknown"
                                  ? "Wi-Fi name not broadcast"
                                  : "Broadcast name"}
                              </Typography>
                            </TableCell>

                            <TableCell>
                              <Typography
                                variant="body2"
                                color="primary"
                                fontWeight={800}
                                whiteSpace="nowrap"
                              >
                                {item.bssid}
                              </Typography>

                              <Stack
                                direction="row"
                                spacing={0.5}
                                alignItems="center"
                              >
                                <BusinessOutlinedIcon
                                  sx={{
                                    fontSize: 15,
                                    color:
                                      "text.secondary",
                                  }}
                                />

                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {item.manufacturer}
                                </Typography>
                              </Stack>
                            </TableCell>

                            <TableCell>
                              <Chip
                                size="small"
                                variant="outlined"
                                color={
                                  item.movement
                                    ? "success"
                                    : "warning"
                                }
                                icon={
                                  item.movement ? (
                                    <RouteOutlinedIcon />
                                  ) : (
                                    <HistoryOutlinedIcon />
                                  )
                                }
                                label={
                                  item.movement
                                    ? "Movement Detected"
                                    : "Recurring Presence"
                                }
                                sx={{
                                  fontWeight: 700,
                                }}
                              />
                            </TableCell>

                            <TableCell>
                              <Stack
                                spacing={0.5}
                                alignItems="flex-start"
                              >
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  icon={
                                    <SecurityOutlinedIcon />
                                  }
                                  color={securityColor(
                                    item.securityType
                                  )}
                                  label={
                                    item.securityType
                                  }
                                  sx={{
                                    fontWeight: 700,
                                  }}
                                />

                                {item.securityChanged && (
                                  <Typography
                                    variant="caption"
                                    color="warning.main"
                                  >
                                    Changed:{" "}
                                    {item.securityHistory.join(
                                      " → "
                                    )}
                                  </Typography>
                                )}
                              </Stack>
                            </TableCell>

                            <TableCell>
                              {item.channels.length
                                ? item.channels.join(
                                    ", "
                                  )
                                : "—"}
                            </TableCell>

                            <TableCell>
                              <Chip
                                size="small"
                                variant="outlined"
                                color={signal.color}
                                label={signal.label}
                                sx={{
                                  fontWeight: 700,
                                }}
                              />

                              <Typography
                                display="block"
                                variant="caption"
                                color="text.secondary"
                              >
                                {signal.detail}
                              </Typography>
                            </TableCell>

                            <TableCell align="right">
                              {numberText(
                                item.areaCount
                              )}
                            </TableCell>

                            <TableCell align="right">
                              <Typography
                                variant="body2"
                                fontWeight={700}
                              >
                                {numberText(
                                  item.scanCount
                                )}
                              </Typography>

                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {item.scanList
                                  .map(
                                    (id) =>
                                      `#${id}`
                                  )
                                  .join(", ")}
                              </Typography>
                            </TableCell>

                            <TableCell align="right">
                              {numberText(
                                item.observations
                              )}
                            </TableCell>

                            <TableCell align="right">
                              <Chip
                                size="small"
                                variant="outlined"
                                icon={
                                  <DevicesOutlinedIcon />
                                }
                                label={numberText(
                                  item.deviceCount
                                )}
                              />
                            </TableCell>

                            <TableCell>
                              {item.hasLocation ? (
                                <Stack
                                  spacing={0.35}
                                  alignItems="flex-start"
                                >
                                  <Typography
                                    variant="body2"
                                    whiteSpace="nowrap"
                                  >
                                    {coordinateText(
                                      item.latitude,
                                      item.longitude
                                    )}
                                  </Typography>

                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                  >
                                    {sourceText(
                                      item.coordinateSource
                                    )}
                                  </Typography>

                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    color={confidenceColor(
                                      item.confidence
                                    )}
                                    label={`${
                                      item.confidence ||
                                      "Low"
                                    } confidence`}
                                  />
                                </Stack>
                              ) : (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label="Location unavailable"
                                />
                              )}
                            </TableCell>

                            <TableCell
                              sx={{
                                whiteSpace:
                                  "nowrap",
                              }}
                            >
                              {dateText(
                                item.firstSeen
                              )}
                            </TableCell>

                            <TableCell
                              sx={{
                                whiteSpace:
                                  "nowrap",
                              }}
                            >
                              {dateText(
                                item.lastSeen
                              )}
                            </TableCell>

                            <TableCell align="right">
                              <Stack
                                direction="row"
                                spacing={0.75}
                                justifyContent="flex-end"
                              >
                                <Button
                                  component={
                                    RouterLink
                                  }
                                  to={profile}
                                  size="small"
                                  variant={
                                    item.movement
                                      ? "contained"
                                      : "outlined"
                                  }
                                  startIcon={
                                    <VisibilityOutlinedIcon />
                                  }
                                  sx={{
                                    fontWeight:
                                      800,
                                    whiteSpace:
                                      "nowrap",
                                  }}
                                >
                                  Wi-Fi Profile
                                </Button>

                                <Button
                                  component={
                                    RouterLink
                                  }
                                  to={`${profile}#timeline`}
                                  size="small"
                                  variant="outlined"
                                  startIcon={
                                    <HistoryOutlinedIcon />
                                  }
                                  sx={{
                                    fontWeight:
                                      800,
                                    whiteSpace:
                                      "nowrap",
                                  }}
                                >
                                  Timeline History
                                </Button>

                                <Button
                                  component={
                                    RouterLink
                                  }
                                  to={mapPath(item)}
                                  disabled={
                                    !item.hasLocation
                                  }
                                  size="small"
                                  variant="outlined"
                                  startIcon={
                                    <LocationOnOutlinedIcon />
                                  }
                                  sx={{
                                    fontWeight:
                                      800,
                                    whiteSpace:
                                      "nowrap",
                                  }}
                                >
                                  View on Map
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      }
                    )}

                    {!filteredRows.length &&
                      !loading && (
                        <TableRow>
                          <TableCell
                            colSpan={14}
                            align="center"
                            sx={{ py: 5 }}
                          >
                            <Typography color="text.secondary">
                              No tracked Wi-Fi
                              records match the
                              current filters.
                            </Typography>

                            {hasFilters && (
                              <Button
                                onClick={
                                  clearFilters
                                }
                                sx={{ mt: 1 }}
                              >
                                Clear Filters
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                  </TableBody>
                </Table>
              </Box>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Showing{" "}
                {numberText(
                  filteredRows.length
                )}{" "}
                of{" "}
                {numberText(
                  trackedRows.length
                )}{" "}
                tracked Wi-Fi records from{" "}
                {numberText(allRows.length)}{" "}
                total Wi-Fi networks.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
