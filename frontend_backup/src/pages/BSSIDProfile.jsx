import { useEffect, useMemo, useState } from "react";
import {
  Link as RouterLink,
  useNavigate,
  useParams,
} from "react-router-dom";
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
  Typography,
} from "@mui/material";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import SignalCellularAltIcon from "@mui/icons-material/SignalCellularAlt";
import WifiOutlinedIcon from "@mui/icons-material/WifiOutlined";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import BssidObservedDevices from "../components/scan/BssidObservedDevices";
import { formatManufacturerDisplay } from "../utils/wgipDisplay";

const API_BASE_URL = "http://127.0.0.1:8000";
const LOCATION_CLUSTER_RADIUS_METERS = 75;

function safeDecode(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeEncode(value = "") {
  try {
    return encodeURIComponent(value);
  } catch {
    return value;
  }
}

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

function normalizeMac(value = "") {
  return String(value || "").trim().toUpperCase();
}

function isValidMac(value = "") {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(
    String(value || "").trim()
  );
}

function isValidCoordinate(latitude, longitude) {
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

function formatNumber(value) {
  const number = Number(value || 0);

  return Number.isFinite(number)
    ? number.toLocaleString()
    : "0";
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString();
}

function formatCoordinate(latitude, longitude) {
  if (!isValidCoordinate(latitude, longitude)) {
    return "Location unavailable";
  }

  return `${Number(latitude).toFixed(6)}, ${Number(
    longitude
  ).toFixed(6)}`;
}

function formatValue(value, fallback = "—") {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  return String(value);
}

function getTimestamp(row = {}) {
  return getAny(
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

function getLatitude(row = {}) {
  return getAny(
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

function getLongitude(row = {}) {
  return getAny(
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

function getScanId(row = {}) {
  return getAny(
    row,
    [
      "import_batch_id",
      "batch_id",
      "scan_id",
      "survey_id",
      "import_id",
    ],
    ""
  );
}

function getCoordinateSource(
  row = {},
  fallback = ""
) {
  return String(
    getAny(
      row,
      [
        "point_source",
        "coordinate_source",
        "gps_source",
        "location_source",
        "source",
      ],
      fallback
    )
  ).trim();
}

function sortByTime(rows = []) {
  return rows.slice().sort((first, second) => {
    const firstTime =
      Date.parse(getTimestamp(first)) || 0;

    const secondTime =
      Date.parse(getTimestamp(second)) || 0;

    if (firstTime !== secondTime) {
      return firstTime - secondTime;
    }

    return (
      Number(getAny(first, ["id"], 0)) -
      Number(getAny(second, ["id"], 0))
    );
  });
}

function earlierDate(
  currentValue,
  candidateValue
) {
  if (!currentValue) {
    return candidateValue || "";
  }

  if (!candidateValue) {
    return currentValue;
  }

  const currentTime =
    new Date(currentValue).getTime();

  const candidateTime =
    new Date(candidateValue).getTime();

  if (!Number.isFinite(currentTime)) {
    return candidateValue;
  }

  if (!Number.isFinite(candidateTime)) {
    return currentValue;
  }

  return candidateTime < currentTime
    ? candidateValue
    : currentValue;
}

function laterDate(
  currentValue,
  candidateValue
) {
  if (!currentValue) {
    return candidateValue || "";
  }

  if (!candidateValue) {
    return currentValue;
  }

  const currentTime =
    new Date(currentValue).getTime();

  const candidateTime =
    new Date(candidateValue).getTime();

  if (!Number.isFinite(currentTime)) {
    return candidateValue;
  }

  if (!Number.isFinite(candidateTime)) {
    return currentValue;
  }

  return candidateTime > currentTime
    ? candidateValue
    : currentValue;
}

function normalizeSecurity(value) {
  const text = String(value || "")
    .trim()
    .toUpperCase();

  if (!text) return "Unknown";

  if (
    text.includes("WPA3") ||
    text.includes("SAE")
  ) {
    return "WPA3";
  }

  if (
    text.includes("WPA2") ||
    text.includes("RSN") ||
    text.includes("CCMP")
  ) {
    return "WPA2";
  }

  if (text.includes("WPA")) return "WPA";
  if (text.includes("WEP")) return "WEP";

  if (
    text.includes("OPEN") ||
    text.includes("NONE") ||
    text.includes("UNENCRYPTED")
  ) {
    return "Open";
  }

  return "Unknown";
}

function getSecurityColor(security) {
  if (security === "WPA3") return "success";
  if (security === "WPA2") return "primary";
  if (security === "WPA") return "warning";

  if (
    security === "WEP" ||
    security === "Open"
  ) {
    return "error";
  }

  return "default";
}

function normalizeSignal(value) {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number >= 0 ||
    number < -130
  ) {
    return null;
  }

  return number;
}

function getSignalDetails(value) {
  const signal = normalizeSignal(value);

  if (signal === null) {
    return {
      label: "Unknown",
      detail: "No reliable dBm value",
      color: "default",
    };
  }

  if (signal >= -55) {
    return {
      label: "Strong",
      detail: `${signal} dBm`,
      color: "success",
    };
  }

  if (signal >= -70) {
    return {
      label: "Fair",
      detail: `${signal} dBm`,
      color: "warning",
    };
  }

  return {
    label: "Weak",
    detail: `${signal} dBm`,
    color: "error",
  };
}

function normalizeChannel(value) {
  const text = String(value ?? "").trim();
  const frequency = Number(text);

  if (!text) return "";

  if (!Number.isFinite(frequency)) {
    return text;
  }

  if (
    frequency >= 1 &&
    frequency <= 233
  ) {
    return String(frequency);
  }

  if (frequency === 2484) return "14";

  if (
    frequency >= 2412 &&
    frequency <= 2472
  ) {
    return String(
      Math.round((frequency - 2407) / 5)
    );
  }

  if (
    frequency >= 5000 &&
    frequency <= 5900
  ) {
    return String(
      Math.round((frequency - 5000) / 5)
    );
  }

  if (
    frequency >= 5955 &&
    frequency <= 7115
  ) {
    return String(
      Math.round((frequency - 5950) / 5)
    );
  }

  return text;
}

function normalizeManufacturer(value) {
  const manufacturer = String(value || "").trim();

  if (!manufacturer || isValidMac(manufacturer)) {
    return "Unknown Manufacturer";
  }

  return formatManufacturerDisplay(manufacturer);
}

function getSourceLabel(source) {
  const original = String(source || "").trim();
  const text = original.toLowerCase();

  if (!text) return "Source not labeled";

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

  return original;
}

function getConfidence(row, source) {
  const explicit = getAny(
    row,
    [
      "coordinate_confidence",
      "location_confidence",
      "gps_confidence",
      "confidence",
    ],
    ""
  );

  if (explicit !== "") {
    const number = Number(explicit);

    if (Number.isFinite(number)) {
      const percentage =
        number <= 1 ? number * 100 : number;

      if (percentage >= 80) return "High";
      if (percentage >= 50) return "Medium";

      return "Low";
    }

    const text =
      String(explicit).toLowerCase();

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

  const sourceText =
    String(source || "").toLowerCase();

  if (
    sourceText.includes("packet") ||
    sourceText.includes("raw gps")
  ) {
    return "High";
  }

  if (
    sourceText.includes("gps") ||
    sourceText.includes("kismet") ||
    sourceText.includes("capture")
  ) {
    return "Medium";
  }

  return "Low";
}

function getConfidenceColor(confidence) {
  if (confidence === "High") return "success";
  if (confidence === "Medium") return "warning";

  return "default";
}

function haversineDistanceMeters(
  firstPoint,
  secondPoint
) {
  const earthRadius = 6371000;

  const toRadians = (degrees) =>
    (degrees * Math.PI) / 180;

  const firstLat = toRadians(
    firstPoint.latitude
  );

  const secondLat = toRadians(
    secondPoint.latitude
  );

  const deltaLat = toRadians(
    secondPoint.latitude -
      firstPoint.latitude
  );

  const deltaLon = toRadians(
    secondPoint.longitude -
      firstPoint.longitude
  );

  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(firstLat) *
      Math.cos(secondLat) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    earthRadius *
    2 *
    Math.atan2(
      Math.sqrt(value),
      Math.sqrt(1 - value)
    )
  );
}

function buildLocationClusters(points = []) {
  const clusters = [];

  points.forEach((point) => {
    if (
      !isValidCoordinate(
        point.latitude,
        point.longitude
      )
    ) {
      return;
    }

    const existingCluster = clusters.find(
      (cluster) =>
        haversineDistanceMeters(
          cluster,
          point
        ) <= LOCATION_CLUSTER_RADIUS_METERS
    );

    if (!existingCluster) {
      clusters.push({
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        count: 1,
      });

      return;
    }

    const nextCount =
      existingCluster.count + 1;

    existingCluster.latitude =
      (existingCluster.latitude *
        existingCluster.count +
        Number(point.latitude)) /
      nextCount;

    existingCluster.longitude =
      (existingCluster.longitude *
        existingCluster.count +
        Number(point.longitude)) /
      nextCount;

    existingCluster.count = nextCount;
  });

  return clusters;
}

function buildDetectionRows(
  packetPoints = [],
  processedRecords = []
) {
  const packetRows =
    normalizeArray(packetPoints);

  const processedRows =
    normalizeArray(processedRecords);

  const usePacketRows =
    packetRows.length > 0;

  const sourceRows = usePacketRows
    ? packetRows
    : processedRows;

  const defaultSource = usePacketRows
    ? "raw packet GPS"
    : "processed observation";

  return sortByTime(sourceRows).map(
    (row, index) => {
      const latitude = getLatitude(row);
      const longitude = getLongitude(row);

      const source = getCoordinateSource(
        row,
        defaultSource
      );

      const signal = getAny(
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

      const hasLocation =
        isValidCoordinate(
          latitude,
          longitude
        );

      return {
        id: `${getAny(
          row,
          ["id"],
          index
        )}-${index}`,

        rawRow: row,
        timestamp: getTimestamp(row),

        latitude: hasLocation
          ? Number(latitude)
          : "",

        longitude: hasLocation
          ? Number(longitude)
          : "",

        signal_dbm: signal,

        channel: normalizeChannel(
          getAny(
            row,
            [
              "channel",
              "frequency",
              "freq",
            ],
            ""
          )
        ),

        scanId: getScanId(row),
        source,

        confidence: hasLocation
          ? getConfidence(row, source)
          : "",

        source_mac: getAny(
          row,
          ["source_mac", "sourcemac"],
          ""
        ),

        destination_mac: getAny(
          row,
          [
            "destination_mac",
            "destmac",
          ],
          ""
        ),

        transmitter_mac: getAny(
          row,
          [
            "transmitter_mac",
            "transmac",
          ],
          ""
        ),
      };
    }
  );
}

function buildLinkedDeviceRows(rows = []) {
  return sortByTime(normalizeArray(rows)).map(
    (row, index) => ({
      id: getAny(row, ["id"], index),

      client_mac: normalizeMac(
        getAny(
          row,
          [
            "client_mac",
            "mac",
            "device_mac",
            "devmac",
            "identifier",
          ],
          ""
        )
      ),

      client_vendor: normalizeManufacturer(
        getAny(
          row,
          [
            "client_vendor",
            "vendor",
            "manufacturer",
            "device_vendor",
          ],
          ""
        )
      ),

      ssid: getAny(
        row,
        [
          "ssid",
          "linked_ssid",
          "network_name",
        ],
        "Hidden/Unknown"
      ),

      relationship_type: getAny(
        row,
        [
          "relationship_type",
          "type",
        ],
        "observed"
      ),

      signal_dbm: getAny(
        row,
        [
          "signal_dbm",
          "signal",
          "rssi",
          "strongest_signal",
        ],
        ""
      ),

      latitude: getLatitude(row),
      longitude: getLongitude(row),
      scanId: getScanId(row),
      timestamp: getTimestamp(row),
    })
  );
}

function buildScanHistory(
  detectionRows = [],
  processedRecords = []
) {
  const grouped = new Map();

  const combinedRows = [
    ...detectionRows,

    ...normalizeArray(processedRecords).map(
      (row, index) => ({
        id: `processed-${getAny(
          row,
          ["id"],
          index
        )}`,

        timestamp: getTimestamp(row),
        latitude: getLatitude(row),
        longitude: getLongitude(row),

        signal_dbm: getAny(
          row,
          [
            "signal_dbm",
            "signal",
            "rssi",
            "strongest_signal",
          ],
          ""
        ),

        scanId: getScanId(row),

        source: getCoordinateSource(
          row,
          "processed observation"
        ),
      })
    ),
  ];

  const seenRows = new Set();

  combinedRows.forEach((row) => {
    const signature = [
      row.scanId,
      row.timestamp,
      row.latitude,
      row.longitude,
      row.signal_dbm,
    ].join("|");

    if (seenRows.has(signature)) return;

    seenRows.add(signature);

    const id =
      row.scanId === null ||
      row.scanId === undefined ||
      row.scanId === ""
        ? "Unmapped"
        : String(row.scanId);

    if (!grouped.has(id)) {
      grouped.set(id, {
        scanId: id,
        detections: 0,
        firstSeen: "",
        lastSeen: "",
        locations: new Set(),
        sources: new Set(),
        bestSignal: null,
      });
    }

    const item = grouped.get(id);

    const signal = normalizeSignal(
      row.signal_dbm
    );

    item.detections += 1;

    item.firstSeen = earlierDate(
      item.firstSeen,
      row.timestamp
    );

    item.lastSeen = laterDate(
      item.lastSeen,
      row.timestamp
    );

    if (
      isValidCoordinate(
        row.latitude,
        row.longitude
      )
    ) {
      item.locations.add(
        `${Number(row.latitude).toFixed(
          5
        )}, ${Number(row.longitude).toFixed(
          5
        )}`
      );
    }

    if (row.source) {
      item.sources.add(
        getSourceLabel(row.source)
      );
    }

    if (
      signal !== null &&
      (item.bestSignal === null ||
        signal > item.bestSignal)
    ) {
      item.bestSignal = signal;
    }
  });

  return Array.from(grouped.values()).sort(
    (first, second) => {
      if (first.scanId === "Unmapped") {
        return 1;
      }

      if (second.scanId === "Unmapped") {
        return -1;
      }

      return (
        Number(second.scanId) -
        Number(first.scanId)
      );
    }
  );
}

function getFirstUsefulValue(
  rows,
  keys,
  fallback = ""
) {
  for (const row of rows) {
    const value = getAny(row, keys, "");

    if (value !== "") return value;
  }

  return fallback;
}

function buildProfileSummary({
  movementData,
  processedRecords,
  detectionRows,
  mapPoints,
  linkedDeviceRows,
  locationClusters,
  scanHistory,
  selectedBssid,
}) {
  const backendSummary =
    movementData?.summary || {};

  const allMetadataRows = [
    ...normalizeArray(processedRecords),

    ...detectionRows.map(
      (row) => row.rawRow || {}
    ),
  ];

  const securityHistory = Array.from(
    new Set(
      allMetadataRows
        .map((row) =>
          normalizeSecurity(
            getAny(
              row,
              [
                "encryption",
                "security",
                "crypt",
                "security_type",
                "privacy",
              ],
              ""
            )
          )
        )
        .filter(
          (security) =>
            security !== "Unknown"
        )
    )
  );

  const channels = Array.from(
    new Set(
      allMetadataRows
        .map((row) =>
          normalizeChannel(
            getAny(
              row,
              [
                "channel",
                "frequency",
                "freq",
              ],
              ""
            )
          )
        )
        .filter(Boolean)
    )
  );

  const signals = detectionRows
    .map((row) =>
      normalizeSignal(row.signal_dbm)
    )
    .filter((signal) => signal !== null);

  const uniqueDevices = new Set(
    linkedDeviceRows
      .map((row) => row.client_mac)
      .filter((clientMac) =>
        isValidMac(clientMac)
      )
  );

  const rawSsid = String(
    getFirstUsefulValue(
      allMetadataRows,
      [
        "ssid",
        "network_name",
        "wifi_name",
        "name",
      ],
      ""
    )
  ).trim();

  const ssid =
    !rawSsid ||
    normalizeMac(rawSsid) ===
      normalizeMac(selectedBssid)
      ? "Hidden/Unknown"
      : rawSsid;

  const manufacturer = normalizeManufacturer(
    getFirstUsefulValue(
      allMetadataRows,
      [
        "manufacturer",
        "vendor",
        "manuf",
        "brand",
        "bssid_vendor",
        "oui_vendor",
      ],
      ""
    )
  );

  const firstSeen = detectionRows.reduce(
    (value, row) =>
      earlierDate(value, row.timestamp),
    backendSummary.first_seen || ""
  );

  const lastSeen = detectionRows.reduce(
    (value, row) =>
      laterDate(value, row.timestamp),
    backendSummary.last_seen || ""
  );

  const mappedScanCount =
    scanHistory.filter(
      (scan) =>
        scan.scanId !== "Unmapped"
    ).length;

  const backendScanCount = Number(
    getAny(
      backendSummary,
      [
        "scan_count",
        "distinct_scans",
        "import_count",
      ],
      0
    )
  );

  const scanCount = Math.max(
    mappedScanCount,

    Number.isFinite(backendScanCount)
      ? backendScanCount
      : 0
  );

  const locationCount =
    locationClusters.length;

  const isTracked = scanCount >= 2;

  const movementDetected =
    isTracked && locationCount >= 2;

  const recurringPresence =
    isTracked && !movementDetected;

  return {
    ssid,
    manufacturer,
    channels,

    securityType:
      securityHistory.at(-1) || "Unknown",

    securityHistory,

    securityChanged:
      securityHistory.length > 1,

    bestSignal: signals.length
      ? Math.max(...signals)
      : null,

    detectionRecords:
      detectionRows.length,

    processedRecords:
      normalizeArray(processedRecords).length,

    mapPoints: mapPoints.length,
    scanCount,
    locationCount,

    observedDevices:
      uniqueDevices.size,

    linkedDeviceRecords:
      linkedDeviceRows.length,

    firstSeen,
    lastSeen,
    isTracked,
    movementDetected,
    recurringPresence,

    missingLocationRecords:
      detectionRows.filter(
        (row) =>
          !isValidCoordinate(
            row.latitude,
            row.longitude
          )
      ).length,

    unmappedScanRecords:
      detectionRows.filter(
        (row) =>
          row.scanId === null ||
          row.scanId === undefined ||
          row.scanId === ""
      ).length,
  };
}

function getTrackingStatus(summary) {
  if (summary.movementDetected) {
    return {
      label: "Movement Detected",
      color: "success",
      icon: <RouteOutlinedIcon />,

      text: `This BSSID was seen in ${formatNumber(
        summary.scanCount
      )} separate scans and ${formatNumber(
        summary.locationCount
      )} confirmed location clusters.`,
    };
  }

  if (summary.recurringPresence) {
    return {
      label: "Recurring Presence",
      color: "warning",
      icon: <HistoryOutlinedIcon />,

      text: `This BSSID was seen in ${formatNumber(
        summary.scanCount
      )} separate scans without a confirmed change of location.`,
    };
  }

  return {
    label: "One-time Detection",
    color: "info",
    icon: <WifiOutlinedIcon />,

    text: "This BSSID does not yet meet the tracking rule because its records are from fewer than two separate scans.",
  };
}

function MapAutoFit({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return undefined;

    const bounds = L.latLngBounds(
      points.map((point) => [
        Number(point.latitude),
        Number(point.longitude),
      ])
    );

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [28, 28],
        maxZoom: 18,
      });

      const timer = window.setTimeout(
        () => map.invalidateSize(),
        250
      );

      return () =>
        window.clearTimeout(timer);
    }

    return undefined;
  }, [map, points]);

  return null;
}

function DetectionMap({
  points = [],
  bssid = "",
}) {
  const center = useMemo(() => {
    if (points.length) {
      return [
        Number(points[0].latitude),
        Number(points[0].longitude),
      ];
    }

    return [14.5995, 120.9842];
  }, [points]);

  const pathPositions = useMemo(
    () =>
      points.map((point) => [
        Number(point.latitude),
        Number(point.longitude),
      ]),
    [points]
  );

  if (!points.length) {
    return (
      <Box
        sx={{
          height: 380,
          borderRadius: 3,
          border: "1px dashed #CBD5E1",
          bgcolor: "#F8FAFC",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          p: 2,
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
        >
          No valid location points are
          available for this BSSID.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: 430,
        width: "100%",
      }}
    >
      <MapContainer
        center={center}
        zoom={16}
        style={{
          height: "100%",
          width: "100%",
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapAutoFit points={points} />

        {pathPositions.length > 1 && (
          <Polyline
            positions={pathPositions}
            pathOptions={{
              color: "#2563EB",
              weight: 4,
              opacity: 0.8,
            }}
          />
        )}

        {points.map((point, index) => {
          const isFirst = index === 0;

          const isLast =
            index === points.length - 1;

          const signal = getSignalDetails(
            point.signal_dbm
          );

          let borderColor = "#2563EB";
          let fillColor = "#93C5FD";

          let label =
            `Detection #${index + 1}`;

          if (isFirst) {
            borderColor = "#16A34A";
            fillColor = "#BBF7D0";
            label = "First mapped detection";
          }

          if (isLast && !isFirst) {
            borderColor = "#DC2626";
            fillColor = "#FECACA";
            label = "Latest mapped detection";
          }

          return (
            <CircleMarker
              key={`${point.id}-${index}`}
              center={[
                Number(point.latitude),
                Number(point.longitude),
              ]}
              radius={
                isFirst || isLast ? 8 : 5
              }
              pathOptions={{
                color: borderColor,
                fillColor,
                fillOpacity: 0.95,
                weight: 2.5,
              }}
            >
              <Tooltip
                direction="top"
                offset={[0, -8]}
              >
                {label}
              </Tooltip>

              <Popup>
                <div
                  style={{ minWidth: 270 }}
                >
                  <strong>{label}</strong>
                  <br />
                  BSSID: {bssid}
                  <br />
                  Time:{" "}
                  {formatDateTime(
                    point.timestamp
                  )}
                  <br />
                  Location:{" "}
                  {formatCoordinate(
                    point.latitude,
                    point.longitude
                  )}
                  <br />
                  Signal: {signal.label} (
                  {signal.detail})
                  <br />
                  Channel:{" "}
                  {formatValue(point.channel)}
                  <br />
                  Scan ID:{" "}
                  {formatValue(
                    point.scanId,
                    "Unmapped"
                  )}
                  <br />
                  Source:{" "}
                  {getSourceLabel(
                    point.source
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </Box>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ minHeight: 100 }}>
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
              variant="caption"
              color="text.secondary"
            >
              {title}
            </Typography>

            <Typography
              variant="h5"
              fontWeight={900}
            >
              {value}
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

export default function BSSIDProfile() {
  const navigate = useNavigate();
  const params = useParams();

  const selectedBssid = safeDecode(
    params.bssid || ""
  );

  const [
    movementData,
    setMovementData,
  ] = useState(null);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  async function loadProfile() {
    if (!selectedBssid) {
      setErrorMessage(
        "No BSSID selected."
      );

      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/wifi-movement/${safeEncode(
          selectedBssid
        )}`
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            data?.message ||
            `Unable to load BSSID profile. Status: ${response.status}`
        );
      }

      setMovementData(data);
    } catch (error) {
      setErrorMessage(
        error?.message ||
          "Unable to load the BSSID profile. Check whether the backend is running."
      );

      setMovementData(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, [selectedBssid]);

  const processedRecords = useMemo(
    () =>
      normalizeArray(
        movementData?.processed_records
      ),
    [movementData]
  );

  const packetPoints = useMemo(
    () =>
      normalizeArray(
        movementData?.packet_points
      ),
    [movementData]
  );

  const detectionRows = useMemo(
    () =>
      buildDetectionRows(
        packetPoints,
        processedRecords
      ),
    [packetPoints, processedRecords]
  );

  const mapPoints = useMemo(
    () =>
      detectionRows.filter((row) =>
        isValidCoordinate(
          row.latitude,
          row.longitude
        )
      ),
    [detectionRows]
  );

  const linkedDeviceRows = useMemo(
    () =>
      buildLinkedDeviceRows(
        movementData?.linked_devices
      ),
    [movementData]
  );

  const locationClusters = useMemo(
    () => buildLocationClusters(mapPoints),
    [mapPoints]
  );

  const scanHistory = useMemo(
    () =>
      buildScanHistory(
        detectionRows,
        processedRecords
      ),
    [detectionRows, processedRecords]
  );

  const summary = useMemo(
    () =>
      buildProfileSummary({
        movementData:
          movementData || {},

        processedRecords,
        detectionRows,
        mapPoints,
        linkedDeviceRows,
        locationClusters,
        scanHistory,
        selectedBssid,
      }),
    [
      movementData,
      processedRecords,
      detectionRows,
      mapPoints,
      linkedDeviceRows,
      locationClusters,
      scanHistory,
      selectedBssid,
    ]
  );

  const trackingStatus = useMemo(
    () => getTrackingStatus(summary),
    [summary]
  );

  const strongestSignal = useMemo(
    () =>
      getSignalDetails(
        summary.bestSignal
      ),
    [summary.bestSignal]
  );

  const latestMappedPoint =
    mapPoints.at(-1);

  const mainMapPath = useMemo(() => {
    const query = new URLSearchParams({
      bssid: selectedBssid,
    });

    if (latestMappedPoint) {
      query.set(
        "latitude",
        String(
          latestMappedPoint.latitude
        )
      );

      query.set(
        "longitude",
        String(
          latestMappedPoint.longitude
        )
      );
    }

    return `/map?${query.toString()}`;
  }, [selectedBssid, latestMappedPoint]);

  useEffect(() => {
    if (
      !isLoading &&
      !errorMessage &&
      window.location.hash === "#timeline"
    ) {
      const timer = window.setTimeout(
        () => {
          document
            .getElementById("timeline")
            ?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
        },
        150
      );

      return () =>
        window.clearTimeout(timer);
    }

    return undefined;
  }, [isLoading, errorMessage]);

  function handleExportPdf() {
    if (!selectedBssid) return;

    window.open(
      `${API_BASE_URL}/wifi-reports/${safeEncode(
        selectedBssid
      )}/pdf`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <Box>
      <Stack spacing={2}>
        <Stack
          direction={{
            xs: "column",
            md: "row",
          }}
          spacing={1}
          alignItems={{
            xs: "flex-start",
            md: "center",
          }}
          justifyContent="space-between"
        >
          <Box>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              mb={0.5}
            >
              <Button
                variant="outlined"
                size="small"
                startIcon={
                  <ArrowBackOutlinedIcon />
                }
                onClick={() => navigate(-1)}
                sx={{ fontWeight: 700 }}
              >
                Back
              </Button>

              <Chip
                icon={<WifiOutlinedIcon />}
                label="BSSID Profile"
                size="small"
                variant="outlined"
                color="primary"
              />
            </Stack>

            <Typography
              variant="h4"
              fontWeight={900}
            >
              BSSID Profile
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
            >
              Detection history and movement
              summary for a tracked wireless
              identity.
            </Typography>
          </Box>

          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
          >
            <Button
              component={RouterLink}
              to={mainMapPath}
              variant="outlined"
              startIcon={<MapOutlinedIcon />}
              disabled={!mapPoints.length}
              sx={{
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              View on Main Map
            </Button>

            <Button
              variant="contained"
              startIcon={
                <DownloadOutlinedIcon />
              }
              onClick={handleExportPdf}
              disabled={!selectedBssid}
              sx={{
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              Export PDF
            </Button>
          </Stack>
        </Stack>

        {isLoading && (
          <Box>
            <Typography
              variant="body2"
              color="text.secondary"
              mb={0.5}
            >
              Loading BSSID profile...
            </Typography>

            <LinearProgress />
          </Box>
        )}

        {errorMessage && (
          <Alert severity="error">
            <Stack
              direction={{
                xs: "column",
                sm: "row",
              }}
              spacing={1}
              alignItems={{
                xs: "flex-start",
                sm: "center",
              }}
              justifyContent="space-between"
            >
              <span>{errorMessage}</span>

              <Button
                size="small"
                onClick={loadProfile}
              >
                Try Again
              </Button>
            </Stack>
          </Alert>
        )}

        {!isLoading && !errorMessage && (
          <>
            <Card>
              <CardContent>
                <Stack spacing={1.5}>
                  <Stack
                    direction={{
                      xs: "column",
                      md: "row",
                    }}
                    spacing={1}
                    alignItems={{
                      xs: "flex-start",
                      md: "center",
                    }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography
                        variant="h5"
                        fontWeight={900}
                      >
                        {summary.ssid}
                      </Typography>

                      <Typography
                        variant="body2"
                        color="primary"
                        fontWeight={800}
                      >
                        {selectedBssid}
                      </Typography>

                      <Stack
                        direction="row"
                        spacing={0.5}
                        alignItems="center"
                        mt={0.5}
                      >
                        <BusinessOutlinedIcon
                          sx={{
                            fontSize: 17,
                            color:
                              "text.secondary",
                          }}
                        />

                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
                          Manufacturer: {summary.manufacturer}
                        </Typography>
                      </Stack>
                    </Box>

                    <Chip
                      icon={
                        trackingStatus.icon
                      }
                      label={
                        trackingStatus.label
                      }
                      color={
                        trackingStatus.color
                      }
                      variant="outlined"
                      sx={{ fontWeight: 800 }}
                    />
                  </Stack>

                  <Alert
                    severity={
                      trackingStatus.color
                    }
                  >
                    {trackingStatus.text}
                  </Alert>

                  <Box
                    sx={{
                      display: "grid",

                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, 1fr)",
                        lg: "repeat(5, 1fr)",
                      },

                      gap: 1,
                    }}
                  >
                    <StatCard
                      title="Detection Records"
                      value={formatNumber(
                        summary.detectionRecords
                      )}
                      subtitle="Raw records retained"
                      icon={
                        <HistoryOutlinedIcon />
                      }
                    />

                    <StatCard
                      title="Separate Scans"
                      value={formatNumber(
                        summary.scanCount
                      )}
                      subtitle="Distinct scan/import IDs"
                      icon={
                        <WifiOutlinedIcon />
                      }
                    />

                    <StatCard
                      title="Location Clusters"
                      value={formatNumber(
                        summary.locationCount
                      )}
                      subtitle={`${formatNumber(
                        summary.mapPoints
                      )} mapped records`}
                      icon={
                        <LocationOnOutlinedIcon />
                      }
                    />

                    <StatCard
                      title="Observed Devices"
                      value={formatNumber(
                        summary.observedDevices
                      )}
                      subtitle={`${formatNumber(
                        summary.linkedDeviceRecords
                      )} linked records`}
                      icon={
                        <DevicesOutlinedIcon />
                      }
                    />

                    <StatCard
                      title="Best Signal"
                      value={
                        strongestSignal.label
                      }
                      subtitle={
                        strongestSignal.detail
                      }
                      icon={
                        <SignalCellularAltIcon />
                      }
                    />
                  </Box>

                  <Box
                    sx={{
                      display: "grid",

                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, 1fr)",
                        lg: "repeat(4, 1fr)",
                      },

                      gap: 1.5,
                    }}
                  >
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                      >
                        First Seen
                      </Typography>

                      <Typography
                        variant="body2"
                        fontWeight={700}
                      >
                        {formatDateTime(
                          summary.firstSeen
                        )}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                      >
                        Last Seen
                      </Typography>

                      <Typography
                        variant="body2"
                        fontWeight={700}
                      >
                        {formatDateTime(
                          summary.lastSeen
                        )}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                      >
                        Channel
                      </Typography>

                      <Typography
                        variant="body2"
                        fontWeight={700}
                      >
                        {summary.channels.length
                          ? summary.channels.join(
                              ", "
                            )
                          : "—"}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                      >
                        Security
                      </Typography>

                      <Stack
                        direction="row"
                        spacing={0.75}
                        alignItems="center"
                        flexWrap="wrap"
                      >
                        <Chip
                          icon={
                            <SecurityOutlinedIcon />
                          }
                          size="small"
                          color={getSecurityColor(
                            summary.securityType
                          )}
                          variant="outlined"
                          label={
                            summary.securityType
                          }
                          sx={{
                            fontWeight: 700,
                          }}
                        />

                        {summary.securityChanged && (
                          <Typography
                            variant="caption"
                            color="warning.main"
                          >
                            Changed:{" "}
                            {summary.securityHistory.join(
                              " → "
                            )}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                  </Box>

                  {(summary.missingLocationRecords >
                    0 ||
                    summary.unmappedScanRecords >
                      0) && (
                    <Alert severity="warning">
                      <strong>
                        Data notes:
                      </strong>{" "}

                      {summary.missingLocationRecords >
                        0 &&
                        `${formatNumber(
                          summary.missingLocationRecords
                        )} detection record(s) have no valid coordinates and are kept in the timeline but not plotted on the map. `}

                      {summary.unmappedScanRecords >
                        0 &&
                        `${formatNumber(
                          summary.unmappedScanRecords
                        )} detection record(s) have no linked scan/import ID.`}
                    </Alert>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack spacing={1.5}>
                  <Stack
                    direction={{
                      xs: "column",
                      md: "row",
                    }}
                    spacing={1}
                    alignItems={{
                      xs: "flex-start",
                      md: "center",
                    }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography
                        variant="h6"
                        fontWeight={900}
                      >
                        Detection Map
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        Green marks the first
                        mapped detection, red
                        marks the latest, and
                        the blue line follows
                        the chronological
                        detection path.
                      </Typography>
                    </Box>

                    <Stack
                      direction="row"
                      spacing={1}
                      flexWrap="wrap"
                    >
                      <Chip
                        label={`${formatNumber(
                          mapPoints.length
                        )} map points`}
                        size="small"
                        variant="outlined"
                      />

                      <Chip
                        label={`${formatNumber(
                          locationClusters.length
                        )} location clusters`}
                        size="small"
                        variant="outlined"
                        color={
                          locationClusters.length >
                          1
                            ? "success"
                            : "default"
                        }
                      />
                    </Stack>
                  </Stack>

                  <DetectionMap
                    points={mapPoints}
                    bssid={selectedBssid}
                  />
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack spacing={1.25}>
                  <Box>
                    <Typography
                      variant="h6"
                      fontWeight={900}
                    >
                      Scan History
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      Detection records grouped
                      by their original scan or
                      import ID.
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      overflowX: "auto",
                    }}
                  >
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>
                            Scan / Import ID
                          </TableCell>

                          <TableCell align="right">
                            Detection Records
                          </TableCell>

                          <TableCell align="right">
                            Locations
                          </TableCell>

                          <TableCell>
                            Best Signal
                          </TableCell>

                          <TableCell>
                            First Seen
                          </TableCell>

                          <TableCell>
                            Last Seen
                          </TableCell>

                          <TableCell>
                            Location Source
                          </TableCell>
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {scanHistory.map(
                          (scan) => {
                            const signal =
                              getSignalDetails(
                                scan.bestSignal
                              );

                            return (
                              <TableRow
                                key={
                                  scan.scanId
                                }
                                hover
                              >
                                <TableCell>
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    color={
                                      scan.scanId ===
                                      "Unmapped"
                                        ? "warning"
                                        : "primary"
                                    }
                                    label={
                                      scan.scanId ===
                                      "Unmapped"
                                        ? "Unmapped"
                                        : `Scan #${scan.scanId}`
                                    }
                                  />
                                </TableCell>

                                <TableCell align="right">
                                  {formatNumber(
                                    scan.detections
                                  )}
                                </TableCell>

                                <TableCell align="right">
                                  {formatNumber(
                                    scan.locations
                                      .size
                                  )}
                                </TableCell>

                                <TableCell>
                                  {
                                    signal.label
                                  }{" "}
                                  ·{" "}
                                  {
                                    signal.detail
                                  }
                                </TableCell>

                                <TableCell>
                                  {formatDateTime(
                                    scan.firstSeen
                                  )}
                                </TableCell>

                                <TableCell>
                                  {formatDateTime(
                                    scan.lastSeen
                                  )}
                                </TableCell>

                                <TableCell>
                                  {scan.sources
                                    .size
                                    ? Array.from(
                                        scan.sources
                                      ).join(", ")
                                    : "Source not labeled"}
                                </TableCell>
                              </TableRow>
                            );
                          }
                        )}

                        {!scanHistory.length && (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              align="center"
                              sx={{ py: 4 }}
                            >
                              <Typography color="text.secondary">
                                No scan history
                                is available.
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

            <Card
              id="timeline"
              sx={{ scrollMarginTop: 24 }}
            >
              <CardContent>
                <Stack spacing={1}>
                  <Typography
                    variant="h6"
                    fontWeight={900}
                  >
                    Detection Timeline
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    Complete chronological
                    detection history.
                    Repeated raw records remain
                    visible and are not
                    removed.
                  </Typography>

                  <Box
                    sx={{
                      overflowX: "auto",
                    }}
                  >
                    <Table
                      size="small"
                      sx={{ minWidth: 1150 }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell>
                            Time
                          </TableCell>

                          <TableCell>
                            Scan / Import ID
                          </TableCell>

                          <TableCell>
                            Location
                          </TableCell>

                          <TableCell>
                            Confidence
                          </TableCell>

                          <TableCell>
                            Signal
                          </TableCell>

                          <TableCell>
                            Channel
                          </TableCell>

                          <TableCell>
                            Location Source
                          </TableCell>
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {detectionRows.map(
                          (row, index) => {
                            const signal =
                              getSignalDetails(
                                row.signal_dbm
                              );

                            const hasLocation =
                              isValidCoordinate(
                                row.latitude,
                                row.longitude
                              );

                            return (
                              <TableRow
                                key={`${row.id}-${index}`}
                                hover
                              >
                                <TableCell
                                  sx={{
                                    whiteSpace:
                                      "nowrap",
                                  }}
                                >
                                  {formatDateTime(
                                    row.timestamp
                                  )}
                                </TableCell>

                                <TableCell>
                                  {row.scanId ===
                                    null ||
                                  row.scanId ===
                                    undefined ||
                                  row.scanId ===
                                    "" ? (
                                    <Chip
                                      size="small"
                                      color="warning"
                                      variant="outlined"
                                      label="Unmapped"
                                    />
                                  ) : (
                                    `Scan #${row.scanId}`
                                  )}
                                </TableCell>

                                <TableCell
                                  sx={{
                                    whiteSpace:
                                      "nowrap",
                                  }}
                                >
                                  {formatCoordinate(
                                    row.latitude,
                                    row.longitude
                                  )}
                                </TableCell>

                                <TableCell>
                                  {hasLocation ? (
                                    <Chip
                                      size="small"
                                      color={getConfidenceColor(
                                        row.confidence
                                      )}
                                      variant="outlined"
                                      label={`${row.confidence} confidence`}
                                    />
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>

                                <TableCell>
                                  {
                                    signal.label
                                  }{" "}
                                  ·{" "}
                                  {
                                    signal.detail
                                  }
                                </TableCell>

                                <TableCell>
                                  {formatValue(
                                    row.channel
                                  )}
                                </TableCell>

                                <TableCell>
                                  {hasLocation
                                    ? getSourceLabel(
                                        row.source
                                      )
                                    : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          }
                        )}

                        {!detectionRows.length && (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              align="center"
                              sx={{ py: 4 }}
                            >
                              <Typography color="text.secondary">
                                No detection
                                timeline is
                                available.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>

                  {!!detectionRows.length && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                    >
                      Showing all{" "}
                      {formatNumber(
                        detectionRows.length
                      )}{" "}
                      raw detection records
                      returned by the profile
                      endpoint.
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <BssidObservedDevices
              bssid={selectedBssid}
            />
          </>
        )}
      </Stack>
    </Box>
  );
}
