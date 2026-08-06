import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import WifiIcon from "@mui/icons-material/Wifi";
import DevicesIcon from "@mui/icons-material/Devices";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ListAltIcon from "@mui/icons-material/ListAlt";
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

const API_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_CENTER = [14.5995, 120.9842];
const MAX_POINT_LIMIT = 5000;

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatDateTime(value) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "No GPS";
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

function hasValidBounds(bounds) {
  if (!bounds) return false;

  const values = [bounds.south, bounds.north, bounds.west, bounds.east].map(
    Number
  );

  return (
    values.every(Number.isFinite) &&
    values[0] < values[1] &&
    values[2] < values[3]
  );
}

function getPointStyle(recordType) {
  if (recordType === "device") {
    return {
      radius: 5,
      color: "#DC2626",
      fillColor: "#C4B5FD",
      fillOpacity: 0.9,
      weight: 2,
    };
  }

  return {
    radius: 6,
    color: "#2563EB",
    fillColor: "#93C5FD",
    fillOpacity: 0.9,
    weight: 2,
  };
}

function getClusterStyle(marker) {
  const radius = Math.min(25, 9 + Math.log2(marker.record_count) * 2.2);

  if (marker.wifi_count === marker.record_count) {
    return {
      radius,
      color: "#1D4ED8",
      fillColor: "#60A5FA",
      fillOpacity: 0.85,
      weight: 3,
    };
  }

  if (marker.device_count === marker.record_count) {
    return {
      radius,
      color: "#B91C1C",
      fillColor: "#A78BFA",
      fillOpacity: 0.85,
      weight: 3,
    };
  }

  return {
    radius,
    color: "#6D28D9",
    fillColor: "#C4B5FD",
    fillOpacity: 0.88,
    weight: 3,
  };
}

function clusterPoints(points, zoom) {
  if (zoom >= 18 || points.length <= 1) {
    return points.map((point) => ({
      ...point,
      marker_kind: "point",
      record_count: 1,
      wifi_count: point.record_type === "wifi" ? 1 : 0,
      device_count: point.record_type === "device" ? 1 : 0,
    }));
  }

  const cellSize = 70.3125 / 2 ** Math.max(1, zoom);
  const groups = new Map();

  points.forEach((point) => {
    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);
    const row = Math.floor(latitude / cellSize);
    const column = Math.floor(longitude / cellSize);
    const key = `${row}:${column}`;
    const existing = groups.get(key) || {
      key,
      latitudeTotal: 0,
      longitudeTotal: 0,
      points: [],
      wifiCount: 0,
      deviceCount: 0,
    };

    existing.latitudeTotal += latitude;
    existing.longitudeTotal += longitude;
    existing.points.push(point);

    if (point.record_type === "wifi") existing.wifiCount += 1;
    if (point.record_type === "device") existing.deviceCount += 1;

    groups.set(key, existing);
  });

  return Array.from(groups.values()).map((group) => {
    if (group.points.length === 1) {
      const point = group.points[0];

      return {
        ...point,
        marker_kind: "point",
        record_count: 1,
        wifi_count: group.wifiCount,
        device_count: group.deviceCount,
      };
    }

    return {
      row_id: `cluster-${zoom}-${group.key}`,
      marker_kind: "cluster",
      record_type:
        group.wifiCount === group.points.length
          ? "wifi"
          : group.deviceCount === group.points.length
            ? "device"
            : "mixed",
      latitude: group.latitudeTotal / group.points.length,
      longitude: group.longitudeTotal / group.points.length,
      record_count: group.points.length,
      wifi_count: group.wifiCount,
      device_count: group.deviceCount,
    };
  });
}

function MapViewportController({ bounds, onViewportChange, refreshKey }) {
  const map = useMap();
  const timerRef = useRef(null);
  const fittedBoundsRef = useRef("");

  const reportViewport = useCallback(() => {
    const mapBounds = map.getBounds();

    onViewportChange({
      south: mapBounds.getSouth(),
      north: mapBounds.getNorth(),
      west: mapBounds.getWest(),
      east: mapBounds.getEast(),
      zoom: map.getZoom(),
    });
  }, [map, onViewportChange]);

  const scheduleViewportReport = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(reportViewport, 250);
  }, [reportViewport]);

  useEffect(() => {
    map.on("moveend", scheduleViewportReport);
    map.on("zoomend", scheduleViewportReport);
    scheduleViewportReport();

    return () => {
      map.off("moveend", scheduleViewportReport);
      map.off("zoomend", scheduleViewportReport);

      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [map, scheduleViewportReport]);

  useEffect(() => {
    if (!hasValidBounds(bounds)) return;

    const signature = [
      bounds.south,
      bounds.north,
      bounds.west,
      bounds.east,
    ].join(":");

    if (fittedBoundsRef.current === signature) return;

    fittedBoundsRef.current = signature;
    const leafletBounds = L.latLngBounds(
      [Number(bounds.south), Number(bounds.west)],
      [Number(bounds.north), Number(bounds.east)]
    );

    map.fitBounds(leafletBounds, {
      padding: [45, 45],
      maxZoom: 17,
    });
  }, [bounds, map]);

  useEffect(() => {
    scheduleViewportReport();
  }, [refreshKey, scheduleViewportReport]);

  return null;
}

function MapMarkerLayer({ markers, zoom, selectedPoint, onSelectPoint }) {
  const map = useMap();

  return (
    <>
      <Pane name="mapPointPane" style={{ zIndex: 430 }}>
        {markers.map((marker) => {
          const isCluster = marker.marker_kind === "cluster";

          return (
            <CircleMarker
              key={marker.row_id}
              center={[Number(marker.latitude), Number(marker.longitude)]}
              pathOptions={
                isCluster
                  ? getClusterStyle(marker)
                  : getPointStyle(marker.record_type)
              }
              pane="mapPointPane"
              eventHandlers={{
                click: () => {
                  if (isCluster) {
                    map.setView(
                      [Number(marker.latitude), Number(marker.longitude)],
                      Math.min(18, zoom + 2)
                    );
                    return;
                  }

                  onSelectPoint(marker);
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                {isCluster
                  ? `${formatNumber(marker.record_count)} records — ${formatNumber(
                      marker.wifi_count
                    )} Wi-Fi, ${formatNumber(marker.device_count)} devices`
                  : marker.record_type === "wifi"
                    ? `Wi-Fi: ${marker.name}`
                    : `Device: ${marker.identifier}`}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </Pane>

      {selectedPoint && (
        <Popup
          position={[
            Number(selectedPoint.latitude),
            Number(selectedPoint.longitude),
          ]}
          eventHandlers={{ remove: () => onSelectPoint(null) }}
        >
          <div style={{ minWidth: 300 }}>
            <strong>
              {selectedPoint.record_type === "wifi"
                ? "Wi-Fi Record"
                : "Observed Device Record"}
            </strong>
            <br />
            Scan ID: {selectedPoint.scan_id ? `#${selectedPoint.scan_id}` : "—"}
            <br />
            Scan Name: {selectedPoint.scan_name || "Unknown Scan"}
            <br />
            {selectedPoint.record_type === "wifi" ? "SSID" : "Device MAC"}: {" "}
            {selectedPoint.record_type === "wifi"
              ? selectedPoint.name
              : selectedPoint.identifier}
            <br />
            {selectedPoint.record_type === "wifi" && (
              <>
                BSSID: {selectedPoint.identifier}
                <br />
              </>
            )}
            Manufacturer: {selectedPoint.manufacturer || "Unknown Manufacturer"}
            <br />
            {selectedPoint.record_type === "device" && (
              <>
                Linked BSSID: {selectedPoint.linked_bssid || "Unlinked"}
                <br />
                Linked SSID: {selectedPoint.linked_ssid || "—"}
                <br />
              </>
            )}
            Channel/Frequency: {selectedPoint.channel ?? "—"}
            <br />
            {selectedPoint.record_type === "wifi" ? "Encryption" : "Relationship"}: {" "}
            {selectedPoint.relationship || "observed"}
            <br />
            Signal: {selectedPoint.signal ?? "—"}
            <br />
            {selectedPoint.record_type === "wifi" && (
              <>
                Observed Devices: {selectedPoint.observed_device_count || 0}
                <br />
              </>
            )}
            Time: {formatDateTime(selectedPoint.observed_at)}
            <br />
            Location: {formatCoordinate(
              selectedPoint.latitude,
              selectedPoint.longitude
            )}
            <br />
            Source: {selectedPoint.coordinate_source || "processed"}
            <br />
            <br />
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                component={RouterLink}
                to={
                  selectedPoint.record_type === "wifi"
                    ? `/bssids/${encodeURIComponent(selectedPoint.identifier)}`
                    : `/devices/${encodeURIComponent(
                        selectedPoint.identifier
                      )}/link-analysis`
                }
                size="small"
                variant="contained"
                startIcon={<VisibilityIcon fontSize="small" />}
                sx={{ fontWeight: 600, whiteSpace: "nowrap" }}
              >
                Analyze
              </Button>

              {selectedPoint.scan_id && (
                <Button
                  component={RouterLink}
                  to={`/scans/${selectedPoint.scan_id}`}
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 600, whiteSpace: "nowrap" }}
                >
                  View Scan
                </Button>
              )}
            </Stack>
          </div>
        </Popup>
      )}
    </>
  );
}

export default function MapPage() {
  const [summary, setSummary] = useState({
    total_mapped: 0,
    wifi_mapped: 0,
    device_mapped: 0,
    scans_on_map: 0,
    total_scans: 0,
    location_count: 0,
    bounds: null,
  });
  const [points, setPoints] = useState([]);
  const [viewportInfo, setViewportInfo] = useState({
    viewport_total: 0,
    returned_count: 0,
    truncated: false,
  });
  const [recordType, setRecordType] = useState("all");
  const [mapZoom, setMapZoom] = useState(14);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [isPointsLoading, setIsPointsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const pointsAbortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSummary() {
      setIsSummaryLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(`${API_BASE_URL}/map-data/summary`, {
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.detail || "Failed to load map summary.");
        }

        setSummary(data);
      } catch (error) {
        if (error.name !== "AbortError") {
          setErrorMessage(error.message || "Failed to load General Map data.");
        }
      } finally {
        if (!controller.signal.aborted) setIsSummaryLoading(false);
      }
    }

    loadSummary();

    return () => controller.abort();
  }, [refreshKey]);

  const loadViewport = useCallback(
    async (viewport) => {
      pointsAbortRef.current?.abort();
      const controller = new AbortController();
      pointsAbortRef.current = controller;
      setIsPointsLoading(true);
      setMapZoom(viewport.zoom);
      setErrorMessage("");

      const parameters = new URLSearchParams({
        south: String(viewport.south),
        north: String(viewport.north),
        west: String(viewport.west),
        east: String(viewport.east),
        record_type: recordType,
        limit: String(MAX_POINT_LIMIT),
      });

      try {
        const response = await fetch(
          `${API_BASE_URL}/map-data/points?${parameters.toString()}`,
          { signal: controller.signal }
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.detail || "Failed to load visible map records.");
        }

        setPoints(Array.isArray(data.items) ? data.items : []);
        setViewportInfo({
          viewport_total: data.viewport_total || 0,
          returned_count: data.returned_count || 0,
          truncated: Boolean(data.truncated),
        });
      } catch (error) {
        if (error.name !== "AbortError") {
          setErrorMessage(error.message || "Failed to load visible map records.");
        }
      } finally {
        if (!controller.signal.aborted) setIsPointsLoading(false);
      }
    },
    [recordType, refreshKey]
  );

  useEffect(() => {
    return () => pointsAbortRef.current?.abort();
  }, []);

  const displayMarkers = useMemo(
    () => clusterPoints(points, mapZoom),
    [points, mapZoom]
  );

  const isLoading = isSummaryLoading || isPointsLoading;

  return (
    <Box>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          sx={{ alignItems: { xs: "flex-start", md: "center" } }}
          spacing={1}
        >
          <Box>
            <Typography variant="h4" fontWeight={800}>
              Map
            </Typography>
            <Typography variant="body2" color="text.secondary">
              General map view using processed records from all imported scans.
            </Typography>
          </Box>

          <Button
            variant="contained"
            size="small"
            startIcon={<RefreshIcon fontSize="small" />}
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={isLoading}
            sx={{
              minHeight: 34,
              px: 1.5,
              whiteSpace: "nowrap",
              borderRadius: 2,
              fontWeight: 600,
            }}
          >
            Refresh
          </Button>
        </Stack>

        <Alert severity="info">
          Blue dots are Wi-Fi/BSSID records. Red dots are observed device records.
          Grouped dots separate automatically as you zoom in.
        </Alert>

        {isLoading && <LinearProgress />}

        {errorMessage && (
          <Alert severity="error" onClose={() => setErrorMessage("")}>
            {errorMessage}
          </Alert>
        )}

        <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Records on Map
              </Typography>
              <Typography variant="h6" fontWeight={800}>
                {formatNumber(summary.total_mapped)}
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Wi-Fi Records
              </Typography>
              <Typography variant="h6" fontWeight={800}>
                {formatNumber(summary.wifi_mapped)}
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Device Records
              </Typography>
              <Typography variant="h6" fontWeight={800}>
                {formatNumber(summary.device_mapped)}
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Scans on Map
              </Typography>
              <Typography variant="h6" fontWeight={800}>
                {formatNumber(summary.scans_on_map)} / {formatNumber(summary.total_scans)}
              </Typography>
            </CardContent>
          </Card>
        </Stack>

        <Card>
          <CardContent>
            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
              spacing={1}
              sx={{ mb: 1 }}
            >
              <Box>
                <Typography variant="h6" fontWeight={800}>
                  General Map — All Processed Scan Records
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Only records inside the visible map area are loaded.
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  icon={<WifiIcon />}
                  label="Blue = Wi-Fi"
                  size="small"
                  variant="outlined"
                />
                <Chip
                  icon={<DevicesIcon />}
                  label="Red = Observed Device"
                  size="small"
                  variant="outlined"
                />
                <Chip
                  icon={<ListAltIcon />}
                  label={`${formatNumber(summary.location_count)} locations`}
                  size="small"
                />
              </Stack>
            </Stack>

            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", sm: "center" }}
              spacing={1}
              sx={{ mb: 1.5 }}
            >
              <Stack direction="row" spacing={1}>
                {[
                  ["all", "All"],
                  ["wifi", "Wi-Fi"],
                  ["device", "Devices"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    size="small"
                    variant={recordType === value ? "contained" : "outlined"}
                    onClick={() => {
                      setSelectedPoint(null);
                      setRecordType(value);
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </Stack>

              <Typography variant="body2" color="text.secondary">
                Visible records: {formatNumber(viewportInfo.viewport_total)} · Map dots: {" "}
                {formatNumber(displayMarkers.length)}
              </Typography>
            </Stack>

            {viewportInfo.truncated && (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                This view contains more than {formatNumber(MAX_POINT_LIMIT)} records.
                Zoom in to load all records in a smaller area.
              </Alert>
            )}

            <Box sx={{ height: 650, width: "100%" }}>
              <MapContainer
                center={DEFAULT_CENTER}
                zoom={14}
                preferCanvas
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapViewportController
                  bounds={summary.bounds}
                  onViewportChange={loadViewport}
                  refreshKey={refreshKey}
                />

                <MapMarkerLayer
                  markers={displayMarkers}
                  zoom={mapZoom}
                  selectedPoint={selectedPoint}
                  onSelectPoint={setSelectedPoint}
                />
              </MapContainer>
            </Box>

            {!isPointsLoading && viewportInfo.viewport_total === 0 && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                No processed records with valid coordinates are visible in this map area.
              </Alert>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
