import { useEffect, useMemo, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
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
import { getManufacturer } from "../../utils/wgipDisplay";

const API_BASE_URL = "http://127.0.0.1:8000";

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.client_observations)) return data.client_observations;
  if (Array.isArray(data?.clientObservations)) return data.clientObservations;
  if (Array.isArray(data?.observed_devices)) return data.observed_devices;
  if (Array.isArray(data?.observedDevices)) return data.observedDevices;
  if (Array.isArray(data?.device_observations)) return data.device_observations;
  if (Array.isArray(data?.deviceObservations)) return data.deviceObservations;
  if (Array.isArray(data?.clients)) return data.clients;
  if (Array.isArray(data?.devices)) return data.devices;
  return [];
}

function getAny(source, keys, fallback = "") {
  for (const key of keys) {
    if (
      source &&
      Object.prototype.hasOwnProperty.call(source, key) &&
      source[key] !== null &&
      source[key] !== undefined &&
      source[key] !== ""
    ) {
      return source[key];
    }
  }

  return fallback;
}

function getBatchId(batch = {}) {
  const fromBatch = getAny(batch, ["id", "import_batch_id", "batch_id", "scan_id"]);

  if (fromBatch) return fromBatch;

  const match = window.location.pathname.match(/\/(?:scans|scan-results|imports)\/(\d+)/);

  return match ? match[1] : "";
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

function formatDateTime(value) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatCoordinate(lat, lon) {
  if (!isValidCoordinate(lat, lon)) return "No GPS";
  return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
}

function getBatchLatitude(batch = {}, summary = {}) {
  return getAny(
    batch,
    ["manual_latitude", "fallback_latitude", "latitude", "avg_lat", "min_lat"],
    getAny(summary, [
      "manual_latitude",
      "fallback_latitude",
      "latitude",
      "avg_lat",
      "min_lat",
    ])
  );
}

function getBatchLongitude(batch = {}, summary = {}) {
  return getAny(
    batch,
    ["manual_longitude", "fallback_longitude", "longitude", "avg_lon", "min_lon"],
    getAny(summary, [
      "manual_longitude",
      "fallback_longitude",
      "longitude",
      "avg_lon",
      "min_lon",
    ])
  );
}

function getPointLatitude(row, batch = {}, summary = {}) {
  return getAny(
    row,
    ["latitude", "lat", "avg_lat", "min_lat", "max_lat"],
    getBatchLatitude(batch, summary)
  );
}

function getPointLongitude(row, batch = {}, summary = {}) {
  return getAny(
    row,
    ["longitude", "lon", "lng", "avg_lon", "min_lon", "max_lon"],
    getBatchLongitude(batch, summary)
  );
}

function getCoordinateSource(row, batch = {}, summary = {}) {
  const rowLat = getAny(row, ["latitude", "lat", "avg_lat", "min_lat"]);
  const rowLon = getAny(row, ["longitude", "lon", "lng", "avg_lon", "min_lon"]);

  if (isValidCoordinate(rowLat, rowLon)) {
    return getAny(row, ["coordinate_source", "source"], "record coordinate");
  }

  const batchLat = getBatchLatitude(batch, summary);
  const batchLon = getBatchLongitude(batch, summary);

  if (isValidCoordinate(batchLat, batchLon)) {
    return "manual/fallback coordinate";
  }

  return "no coordinate";
}

function isManualOrFallback(source = "") {
  const normalized = String(source || "").toLowerCase();

  return (
    normalized.includes("manual") ||
    normalized.includes("fallback") ||
    normalized.includes("batch")
  );
}

function getWifiDotStyle(source = "") {
  const manual = isManualOrFallback(source);

  return {
    radius: 6,
    color: manual ? "#475569" : "#2563EB",
    fillColor: manual ? "#CBD5E1" : "#93C5FD",
    fillOpacity: 0.9,
    weight: manual ? 2.4 : 2,
  };
}

function getDeviceDotStyle(source = "") {
  const manual = isManualOrFallback(source);

  return {
    radius: 5,
    color: manual ? "#475569" : "#DC2626",
    fillColor: manual ? "#CBD5E1" : "#C4B5FD",
    fillOpacity: 0.9,
    weight: manual ? 2.4 : 2,
  };
}

function getMainRoutePoints(points) {
  if (!points || points.length === 0) return [];

  const validPoints = points.filter((point) =>
    isValidCoordinate(point.display_latitude, point.display_longitude)
  );

  if (validPoints.length <= 10) return validPoints;

  const sorted = validPoints.slice().sort((a, b) => {
    const aTime = Date.parse(a.timestamp || "") || 0;
    const bTime = Date.parse(b.timestamp || "") || 0;
    return aTime - bTime;
  });

  const centerLat =
    sorted.reduce((sum, point) => sum + Number(point.display_latitude), 0) /
    sorted.length;

  const centerLon =
    sorted.reduce((sum, point) => sum + Number(point.display_longitude), 0) /
    sorted.length;

  const withDistance = sorted
    .map((point) => {
      const latDiff = Number(point.display_latitude) - centerLat;
      const lonDiff = Number(point.display_longitude) - centerLon;

      return {
        ...point,
        distanceFromCenter: Math.sqrt(latDiff * latDiff + lonDiff * lonDiff),
      };
    })
    .sort((a, b) => a.distanceFromCenter - b.distanceFromCenter);

  const keepCount = Math.max(10, Math.floor(withDistance.length * 0.9));

  return withDistance.slice(0, keepCount);
}

function MapAutoFit({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;

    const focusPoints = getMainRoutePoints(points);

    if (focusPoints.length === 0) return;

    const bounds = L.latLngBounds(
      focusPoints.map((point) => [
        Number(point.display_latitude),
        Number(point.display_longitude),
      ])
    );

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [18, 18],
        maxZoom: 17,
      });

      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }
  }, [map, points]);

  return null;
}

function spreadMarkers(points, type) {
  return points.map((point) => ({
    ...point,
    display_latitude: Number(point.latitude),
    display_longitude: Number(point.longitude),
    visual_offset_note: "",
  }));
}

function getDeviceRowsFromProcessedSummary(summary = {}) {
  const candidates = [
    summary?.client_observations,
    summary?.clientObservations,
    summary?.observed_devices,
    summary?.observedDevices,
    summary?.device_observations,
    summary?.deviceObservations,
    summary?.clients,
    summary?.devices,
  ];

  for (const candidate of candidates) {
    const rows = normalizeArray(candidate);

    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
}

function buildWifiPoints(reviewItems = [], batch = {}, summary = {}) {
  return normalizeArray(reviewItems)
    .map((item, index) => {
      const lat = getPointLatitude(item, batch, summary);
      const lon = getPointLongitude(item, batch, summary);

      if (!isValidCoordinate(lat, lon)) return null;

      return {
        id: `wifi-${getAny(item, ["id", "bssid"], index)}`,
        marker_type: "wifi",
        latitude: Number(lat),
        longitude: Number(lon),
        display_latitude: Number(lat),
        display_longitude: Number(lon),
        coordinate_source: getCoordinateSource(item, batch, summary),
        ssid: getAny(item, ["ssid", "network_name", "name"], "Hidden/Unknown"),
        bssid: getAny(item, ["bssid", "mac", "devmac", "identifier"], "Unknown BSSID"),
        manufacturer: getManufacturer(item),
        channel: getAny(item, ["channel", "frequency"], "—"),
        encryption: getAny(item, ["encryption", "security"], "—"),
        signal: getAny(item, ["signal_dbm", "rssi", "strongest_signal"], "—"),
        observed_device_count: getAny(
          item,
          ["observed_device_count", "client_count", "device_count", "linked_device_count"],
          0
        ),
        timestamp: getAny(item, ["timestamp", "last_time", "first_time", "created_at"]),
      };
    })
    .filter(Boolean);
}

function buildDevicePoints(clientObservations = [], batch = {}, summary = {}) {
  return normalizeArray(clientObservations)
    .map((item, index) => {
      const lat = getPointLatitude(item, batch, summary);
      const lon = getPointLongitude(item, batch, summary);

      if (!isValidCoordinate(lat, lon)) return null;

      return {
        id: `device-${getAny(item, ["id", "client_mac", "mac"], index)}`,
        marker_type: "device",
        latitude: Number(lat),
        longitude: Number(lon),
        display_latitude: Number(lat),
        display_longitude: Number(lon),
        coordinate_source: getCoordinateSource(item, batch, summary),
        client_mac: getAny(
          item,
          ["client_mac", "mac", "device_mac", "devmac", "identifier"],
          "Unknown Device"
        ),
        manufacturer: getManufacturer(item),
        linked_bssid: getAny(item, ["bssid", "linked_bssid", "associated_bssid"], ""),
        linked_ssid: getAny(item, ["ssid", "linked_ssid", "network_name"], "—"),
        channel: getAny(item, ["channel", "frequency"], "—"),
        relationship_type: getAny(item, ["relationship_type", "type"], "observed"),
        signal: getAny(item, ["signal_dbm", "rssi", "strongest_signal"], "—"),
        timestamp: getAny(item, ["timestamp", "last_time", "first_time", "created_at"]),
      };
    })
    .filter(Boolean);
}

async function fetchJsonOrNull(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) return null;

    return data;
  } catch {
    return null;
  }
}

export default function ScanResultMap({ batch = {}, reviewItems = [] }) {
  const [clientObservations, setClientObservations] = useState([]);
  const [processedSummary, setProcessedSummary] = useState({});
  const [loadNote, setLoadNote] = useState("");

  const batchId = getBatchId(batch);

  useEffect(() => {
    async function loadDevices() {
      if (!batchId) {
        setClientObservations([]);
        setProcessedSummary({});
        setLoadNote("No scan ID found for loading observed devices.");
        return;
      }

      setLoadNote("");

      const directClientData = await fetchJsonOrNull(
        `${API_BASE_URL}/client-observations?import_batch_id=${batchId}&limit=20000`
      );

      const directClientRows = normalizeArray(directClientData);

      const summaryData =
        (await fetchJsonOrNull(
          `${API_BASE_URL}/kismet-imports/${batchId}/processed-summary`
        )) || {};

      const summaryDeviceRows = getDeviceRowsFromProcessedSummary(summaryData);

      const combined = [...directClientRows, ...summaryDeviceRows];
      const seen = new Set();

      const deduped = combined.filter((item, index) => {
        const key = `${getAny(item, ["id"], index)}-${getAny(item, [
          "client_mac",
          "mac",
          "device_mac",
          "devmac",
          "identifier",
        ])}-${getAny(item, ["latitude", "lat", "avg_lat"])}-${getAny(item, [
          "longitude",
          "lon",
          "lng",
          "avg_lon",
        ])}`;

        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      });

      setProcessedSummary(summaryData);
      setClientObservations(deduped);

      if (deduped.length === 0) {
        setLoadNote(
          `No observed device rows loaded for scan #${batchId}. Check processed-summary/device endpoint.`
        );
      }
    }

    loadDevices();
  }, [batchId]);

  const wifiPoints = useMemo(() => {
    return spreadMarkers(buildWifiPoints(reviewItems, batch, processedSummary), "wifi");
  }, [reviewItems, batch, processedSummary]);

  const devicePoints = useMemo(() => {
    return spreadMarkers(
      buildDevicePoints(clientObservations, batch, processedSummary),
      "device"
    );
  }, [clientObservations, batch, processedSummary]);

  const allPoints = useMemo(() => {
    return [...wifiPoints, ...devicePoints];
  }, [wifiPoints, devicePoints]);

  const mapCenter = useMemo(() => {
    if (wifiPoints.length > 0) {
      return [wifiPoints[0].display_latitude, wifiPoints[0].display_longitude];
    }

    if (allPoints.length > 0) {
      return [allPoints[0].display_latitude, allPoints[0].display_longitude];
    }

    if (
      isValidCoordinate(
        getBatchLatitude(batch, processedSummary),
        getBatchLongitude(batch, processedSummary)
      )
    ) {
      return [
        Number(getBatchLatitude(batch, processedSummary)),
        Number(getBatchLongitude(batch, processedSummary)),
      ];
    }

    return [14.5995, 120.9842];
  }, [wifiPoints, allPoints, batch, processedSummary]);

  if (allPoints.length === 0) {
    return (
      <Box>
        <Typography variant="h6" fontWeight={800}>
          Map Preview
        </Typography>
        <Typography variant="body2" color="text.secondary">
          No valid GPS or fallback coordinates found for this scan.
        </Typography>
        {loadNote && (
          <Typography variant="caption" color="error">
            {loadNote}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
        spacing={1}
        sx={{ mb: 1 }}
      >
        <Box>
          <Typography variant="h6" fontWeight={800}>
            Map Preview
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Blue = Wi-Fi/BSSID, red = observed device, gray outline =
            manual/fallback coordinates.
          </Typography>
          {loadNote && (
            <Typography variant="caption" color="error">
              {loadNote}
            </Typography>
          )}
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={`${wifiPoints.length} Wi-Fi`} size="small" variant="outlined" />
          <Chip
            label={`${devicePoints.length} observed devices`}
            size="small"
            variant="outlined"
          />
        </Stack>
      </Stack>

      <Box className="wgip-map-legend" sx={{ mb: 1 }}>
        <span className="wgip-map-legend-item">
          <span
            className="wgip-map-dot"
            style={{ background: "#93C5FD", borderColor: "#2563EB" }}
          />
          Wi-Fi
        </span>

        <span className="wgip-map-legend-item">
          <span
            className="wgip-map-dot"
            style={{ background: "#C4B5FD", borderColor: "#DC2626" }}
          />
          Observed Device
        </span>

        <span className="wgip-map-legend-item">
          <span
            className="wgip-map-dot"
            style={{ background: "#CBD5E1", borderColor: "#475569" }}
          />
          Manual/Fallback
        </span>
      </Box>

      <Box sx={{ height: 330, width: "100%" }}>
        <MapContainer
          center={mapCenter}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapAutoFit points={wifiPoints.length > 0 ? wifiPoints : allPoints} />

          <Pane name="scanDevicePane" style={{ zIndex: 420 }}>
            {devicePoints.map((point) => (
              <CircleMarker
                key={point.id}
                center={[point.display_latitude, point.display_longitude]}
                pathOptions={getDeviceDotStyle(point.coordinate_source)}
                pane="scanDevicePane"
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  Device: {point.client_mac}
                </Tooltip>

                <Popup>
                  <div style={{ minWidth: 290 }}>
                    <strong>Observed Device</strong>
                    <br />
                    Device MAC: {point.client_mac}
                    <br />
                    Manufacturer: {point.manufacturer}
                    <br />
                    Linked BSSID: {point.linked_bssid || "Unlinked"}
                    <br />
                    Linked SSID: {point.linked_ssid || "—"}
                    <br />
                    Channel/Frequency: {point.channel}
                    <br />
                    Relationship: {point.relationship_type}
                    <br />
                    Signal: {point.signal}
                    <br />
                    Time: {formatDateTime(point.timestamp)}
                    <br />
                    Original Location: {formatCoordinate(point.latitude, point.longitude)}
                    <br />
                    Dot Display Location:{" "}
                    {formatCoordinate(point.display_latitude, point.display_longitude)}
                    <br />
                    Source: {point.coordinate_source}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </Pane>

          <Pane name="scanWifiPane" style={{ zIndex: 430 }}>
            {wifiPoints.map((point) => (
              <CircleMarker
                key={point.id}
                center={[point.display_latitude, point.display_longitude]}
                pathOptions={getWifiDotStyle(point.coordinate_source)}
                pane="scanWifiPane"
              >
                <Tooltip direction="top" offset={[0, -10]}>
                  Wi-Fi: {point.ssid}
                </Tooltip>

                <Popup>
                  <div style={{ minWidth: 290 }}>
                    <strong>Wi-Fi/BSSID</strong>
                    <br />
                    SSID: {point.ssid}
                    <br />
                    BSSID: {point.bssid}
                    <br />
                    Manufacturer: {point.manufacturer}
                    <br />
                    Channel/Frequency: {point.channel}
                    <br />
                    Encryption: {point.encryption}
                    <br />
                    Signal: {point.signal}
                    <br />
                    Observed Devices: {point.observed_device_count}
                    <br />
                    Time: {formatDateTime(point.timestamp)}
                    <br />
                    Original Location: {formatCoordinate(point.latitude, point.longitude)}
                    <br />
                    Dot Display Location:{" "}
                    {formatCoordinate(point.display_latitude, point.display_longitude)}
                    <br />
                    Source: {point.coordinate_source}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </Pane>
        </MapContainer>
      </Box>
    </Box>
  );
}

