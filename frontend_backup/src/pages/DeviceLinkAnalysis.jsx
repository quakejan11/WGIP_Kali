import {
  useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/Visibility";
import TimelineIcon from "@mui/icons-material/Timeline";
import SearchIcon from "@mui/icons-material/Search";
import MapIcon from "@mui/icons-material/Map";
import DeviceWifiConnections from "../components/scan/DeviceWifiConnections";
import { clusterDetectionsByArea, summarizeClusterMovement } from "../utils/movementClustering";
import { analyzeTrackedDevices } from "../utils/trackingRules";
import {
  UNKNOWN_MANUFACTURER,
  getManufacturer,
} from "../utils/wgipDisplay";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

const API_BASE_URL = "http://127.0.0.1:8000";

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "0";
  }

  return Number(value).toLocaleString();
}

function isValidCoordinate(lat, lon) {
  const numericLat = Number(lat);
  const numericLon = Number(lon);

  return (
    Number.isFinite(numericLat) &&
    Number.isFinite(numericLon) &&
    !(numericLat === 0 && numericLon === 0)
  );
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatCoordinate(lat, lon) {
  if (!isValidCoordinate(lat, lon)) {
    return "No GPS";
  }

  return `${Number(lat).toFixed(7)}, ${Number(lon).toFixed(7)}`;
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function getDeviceMapPointStyle(coordinateSource = "") {
  const normalizedSource = String(coordinateSource || "").toLowerCase();

  const isManual =
    normalizedSource.includes("manual") ||
    normalizedSource.includes("fallback");

  return {
    color: isManual ? "#475569" : "#DC2626",
    fillColor: isManual ? "#CBD5E1" : "#C4B5FD",
    fillOpacity: 0.85,
    weight: isManual ? 2.5 : 1.5,
    radius: 8,
  };
}

function buildDeviceGroups(records) {
  const grouped = new Map();

  records.forEach((item) => {
    const clientMac = item.client_mac || "Unknown";

    if (!grouped.has(clientMac)) {
      grouped.set(clientMac, {
        client_mac: clientMac,
        client_vendor: getManufacturer(item),
        scans: new Set(),
        observations: 0,
        linked_bssids: new Set(),
        linked_ssids: new Set(),
        relationships: new Set(),
        best_signal: null,
        first_seen: item.timestamp || item.created_at,
        last_seen: item.timestamp || item.created_at,
      });
    }

    const current = grouped.get(clientMac);

    current.observations += 1;

    const itemManufacturer = getManufacturer(item);

    if (
      itemManufacturer !== UNKNOWN_MANUFACTURER ||
      current.client_vendor === UNKNOWN_MANUFACTURER
    ) {
      current.client_vendor = itemManufacturer;
    }

    if (item.import_batch_id !== null && item.import_batch_id !== undefined) {
      current.scans.add(item.import_batch_id);
    }

    if (item.bssid) {
      current.linked_bssids.add(item.bssid);
    }

    if (item.ssid) {
      current.linked_ssids.add(item.ssid);
    }

    if (item.relationship_type) {
      current.relationships.add(item.relationship_type);
    }

    const signal = Number(item.signal_dbm);

    if (Number.isFinite(signal)) {
      if (current.best_signal === null || signal > current.best_signal) {
        current.best_signal = signal;
      }
    }

    const itemTime = item.timestamp || item.created_at;

    if (itemTime) {
      if (!current.first_seen || new Date(itemTime) < new Date(current.first_seen)) {
        current.first_seen = itemTime;
      }

      if (!current.last_seen || new Date(itemTime) > new Date(current.last_seen)) {
        current.last_seen = itemTime;
      }
    }
  });

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      scan_count: item.scans.size,
      linked_bssid_count: item.linked_bssids.size,
      linked_ssid_list: Array.from(item.linked_ssids),
      relationship_list: Array.from(item.relationships),
    }))
    .sort((a, b) => b.observations - a.observations);
}

function buildAnalysis(records, clientMac) {
  const linkedNetworks = new Map();
  const scanHistory = new Map();
  const movementLocationsMap = new Map();

  const sortedRecords = records
    .slice()
    .sort((a, b) => {
      const aTime = a.timestamp || a.created_at || "";
      const bTime = b.timestamp || b.created_at || "";

      return new Date(aTime) - new Date(bTime);
    });

  sortedRecords.forEach((item) => {
    const itemTime = item.timestamp || item.created_at;

    const networkKey = item.bssid || "Unlinked";

    if (!linkedNetworks.has(networkKey)) {
      linkedNetworks.set(networkKey, {
        bssid: item.bssid || "Unlinked",
        ssid: item.ssid || "-",
        channel: item.channel ?? "-",
        relationship_type: item.relationship_type || "observed",
        records: 0,
        first_seen: itemTime,
        last_seen: itemTime,
      });
    }

    const network = linkedNetworks.get(networkKey);

    network.records += 1;

    if (item.ssid) {
      network.ssid = item.ssid;
    }

    if (item.channel !== null && item.channel !== undefined) {
      network.channel = item.channel;
    }

    if (item.relationship_type) {
      network.relationship_type = item.relationship_type;
    }

    if (itemTime) {
      if (!network.first_seen || new Date(itemTime) < new Date(network.first_seen)) {
        network.first_seen = itemTime;
      }

      if (!network.last_seen || new Date(itemTime) > new Date(network.last_seen)) {
        network.last_seen = itemTime;
      }
    }

    const scanKey = item.import_batch_id || "Unknown";

    if (!scanHistory.has(scanKey)) {
      scanHistory.set(scanKey, {
        import_batch_id: item.import_batch_id,
        records: 0,
        linked_bssids: new Set(),
        first_seen: itemTime,
        last_seen: itemTime,
      });
    }

    const scan = scanHistory.get(scanKey);

    scan.records += 1;

    if (item.bssid) {
      scan.linked_bssids.add(item.bssid);
    }

    if (itemTime) {
      if (!scan.first_seen || new Date(itemTime) < new Date(scan.first_seen)) {
        scan.first_seen = itemTime;
      }

      if (!scan.last_seen || new Date(itemTime) > new Date(scan.last_seen)) {
        scan.last_seen = itemTime;
      }
    }

    if (isValidCoordinate(item.latitude, item.longitude)) {
      const lat = Number(item.latitude);
      const lon = Number(item.longitude);
      const locationKey = `${lat.toFixed(7)},${lon.toFixed(7)}`;

      if (!movementLocationsMap.has(locationKey)) {
        movementLocationsMap.set(locationKey, {
          key: locationKey,
          latitude: lat,
          longitude: lon,
          coordinate_source: item.coordinate_source || "unknown",
          records: 0,
          scan_ids: new Set(),
          linked_bssids: new Set(),
          linked_ssids: new Set(),
          relationships: new Set(),
          signals: [],
          first_seen: itemTime,
          last_seen: itemTime,
        });
      }

      const location = movementLocationsMap.get(locationKey);

      location.records += 1;

      if (item.import_batch_id !== null && item.import_batch_id !== undefined) {
        location.scan_ids.add(item.import_batch_id);
      }

      if (item.bssid) {
        location.linked_bssids.add(item.bssid);
      }

      if (item.ssid) {
        location.linked_ssids.add(item.ssid);
      }

      if (item.relationship_type) {
        location.relationships.add(item.relationship_type);
      }

      const signal = Number(item.signal_dbm);

      if (Number.isFinite(signal)) {
        location.signals.push(signal);
      }

      if (itemTime) {
        if (!location.first_seen || new Date(itemTime) < new Date(location.first_seen)) {
          location.first_seen = itemTime;
        }

        if (!location.last_seen || new Date(itemTime) > new Date(location.last_seen)) {
          location.last_seen = itemTime;
        }
      }
    }
  });

  const movementLocations = Array.from(movementLocationsMap.values())
    .map((item) => ({
      ...item,
      scan_id_list: Array.from(item.scan_ids).sort((a, b) => Number(a) - Number(b)),
      linked_bssid_list: Array.from(item.linked_bssids),
      linked_ssid_list: Array.from(item.linked_ssids),
      relationship_list: Array.from(item.relationships),
      best_signal: item.signals.length > 0 ? Math.max(...item.signals) : null,
    }))
    .sort((a, b) => {
      const aTime = a.first_seen ? new Date(a.first_seen).getTime() : 0;
      const bTime = b.first_seen ? new Date(b.first_seen).getTime() : 0;

      return aTime - bTime;
    })
    .map((item, index) => ({
      ...item,
      location_number: index + 1,
    }));

  const manufacturer =
    records
      .map((item) => getManufacturer(item))
      .find((value) => value !== UNKNOWN_MANUFACTURER) ||
    UNKNOWN_MANUFACTURER;

  const firstSeen =
    records
      .map((item) => item.timestamp || item.created_at)
      .filter(Boolean)
      .sort((a, b) => new Date(a) - new Date(b))[0] || null;

  const lastSeen =
    records
      .map((item) => item.timestamp || item.created_at)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;

  return {
    client_mac: clientMac,
    manufacturer,
    total_records: records.length,
    scan_count: new Set(records.map((item) => item.import_batch_id).filter(Boolean)).size,
    linked_bssid_count: new Set(records.map((item) => item.bssid).filter(Boolean)).size,
    location_count: movementLocations.length,
    first_seen: firstSeen,
    last_seen: lastSeen,
    movement_locations: movementLocations,
    linked_networks: Array.from(linkedNetworks.values()).sort(
      (a, b) => b.records - a.records
    ),
    scan_history: Array.from(scanHistory.values())
      .map((item) => ({
        ...item,
        linked_bssid_count: item.linked_bssids.size,
      }))
      .sort((a, b) => {
        const aTime = a.first_seen ? new Date(a.first_seen).getTime() : 0;
        const bTime = b.first_seen ? new Date(b.first_seen).getTime() : 0;

        return aTime - bTime;
      }),
    timeline: sortedRecords,
  };
}


function DeviceMovementMapAutoFit({ locations }) {
  const map = useMap();

  useEffect(() => {
    const coordinates = (locations || [])
      .map((location) => [
        Number(location.display_latitude ?? location.latitude),
        Number(location.display_longitude ?? location.longitude),
      ])
      .filter(([latitude, longitude]) => {
        return (
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          !(latitude === 0 && longitude === 0) &&
          latitude >= -90 &&
          latitude <= 90 &&
          longitude >= -180 &&
          longitude <= 180
        );
      });

    if (coordinates.length === 0) return;

    if (coordinates.length === 1) {
      map.setView(coordinates[0], 18);
      return;
    }

    map.fitBounds(coordinates, {
      padding: [70, 70],
      maxZoom: 20,
      animate: true,
    });
  }, [map, locations]);

  return null;
}

function buildClusteredDeviceLocations(rawLocations = []) {
  const sourceLocations = Array.isArray(rawLocations) ? rawLocations : [];

  const movementSummary = summarizeClusterMovement(sourceLocations, {
    defaultRadiusMeters: 75,
    minRadiusMeters: 35,
    maxRadiusMeters: 160,
  });

  const clusteredLocations = movementSummary.clusters.map((cluster, index) => {
    const firstItem = cluster.items[0] || {};
    const lastItem = cluster.items[cluster.items.length - 1] || firstItem;

    return {
      ...firstItem,
      location_number: index + 1,
      area_number: index + 1,
      latitude: cluster.centerLatitude,
      longitude: cluster.centerLongitude,
      display_latitude: cluster.centerLatitude,
      display_longitude: cluster.centerLongitude,
      records: cluster.detectionCount,
      detection_count: cluster.detectionCount,
      scan_ids: cluster.scanIdsList,
      date_keys: cluster.dateKeysList,
      first_seen: cluster.firstSeen || firstItem.first_seen || firstItem.timestamp || "",
      last_seen: cluster.lastSeen || lastItem.last_seen || lastItem.timestamp || "",
      linked_bssids:
        cluster.items
          .map((item) => item.linked_bssids || item.linked_bssid || item.bssid || "")
          .flat()
          .filter(Boolean),
      linked_ssids:
        cluster.items
          .map((item) => item.linked_ssids || item.linked_ssid || item.ssid || "")
          .flat()
          .filter(Boolean),
      relationship:
        firstItem.relationship ||
        firstItem.relationship_type ||
        firstItem.relationships ||
        "observed",
      source_items: cluster.items,
      cluster_radius_meters: movementSummary.clusterRadiusMeters,
      is_area_cluster: true,
      is_visual_offset: false,
    };
  });

  return {
    movementSummary,
    clusteredLocations,
  };
}

function buildAdaptiveTrackedDeviceRows(clientRows = []) {
  return analyzeTrackedDevices(clientRows, {
    defaultRadiusMeters: 75,
    minRadiusMeters: 35,
    maxRadiusMeters: 160,
    minimumRecurringGapMinutes: 60,
  })
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
}

export default function DeviceLinkAnalysis() {
  const params = useParams();
  const navigate = useNavigate();

  const routeClientMac = params.mac || params.clientMac || "";

  const [records, setRecords] = useState([]);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isAnalyzeMode = Boolean(routeClientMac);

  const encodedRouteClientMac = useMemo(() => {
    if (!routeClientMac) {
      return "";
    }

    return encodeURIComponent(routeClientMac);
  }, [routeClientMac]);
  const deviceGroups = useMemo(() => buildDeviceGroups(records), [records]);
  const trackedDeviceDetails = useMemo(() => {
    const grouped = new Map();

    records.forEach((row) => {
      const clientMac = normalize(
        row.client_mac || row.mac || row.device_mac || row.devmac || ""
      );

      if (!clientMac) return;

      if (!grouped.has(clientMac)) {
        grouped.set(clientMac, {
          observations: 0,
          scans: new Set(),
          locations: new Set(),
        });
      }

      const current = grouped.get(clientMac);

      current.observations += 1;

      if (
        ((row.import_batch_id ?? row.survey_id ?? row.scan_id ?? row.batch_id) !== null && (row.import_batch_id ?? row.survey_id ?? row.scan_id ?? row.batch_id) !== undefined && (row.import_batch_id ?? row.survey_id ?? row.scan_id ?? row.batch_id) !== "")
      ) {
        current.scans.add(String(row.import_batch_id ?? row.survey_id ?? row.scan_id ?? row.batch_id));
      }

      const latitude = Number(row.latitude ?? row.lat ?? row.avg_lat);
      const longitude = Number(row.longitude ?? row.lon ?? row.lng ?? row.avg_lon);

      const hasValidCoordinate =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        !(latitude === 0 && longitude === 0) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180;

      if (hasValidCoordinate) {
        current.locations.add(`${latitude.toFixed(7)},${longitude.toFixed(7)}`);
      }
    });

    const details = new Map();

    grouped.forEach((value, clientMac) => {
      const hasMovement = value.locations.size >= 2;
      const hasRecurringPresence = value.scans.size >= 2;
      const isTracked = hasMovement || hasRecurringPresence;

      if (!isTracked) return;

      details.set(clientMac, {
        is_tracked: true,
        has_movement: hasMovement,
        has_recurring_presence: hasRecurringPresence,
        tracking_status: hasMovement ? "Movement Detected" : "Recurring Presence",
        location_count: value.locations.size,
        tracked_scan_count: value.scans.size,
        tracked_observations: value.observations,
      });
    });

    return details;
  }, [records]);

  const trackedDeviceMacs = useMemo(() => {
    return new Set(Array.from(trackedDeviceDetails.keys()));
  }, [trackedDeviceDetails]);

  const trackedDeviceGroups = useMemo(() => {
    return deviceGroups
      .filter((item) => trackedDeviceMacs.has(normalize(item.client_mac)))
      .map((item) => {
        const details = trackedDeviceDetails.get(normalize(item.client_mac)) || {};

        return {
          ...item,
          ...details,
          scan_count: details.tracked_scan_count ?? item.scan_count,
          observations: details.tracked_observations ?? item.observations,
        };
      });
  }, [deviceGroups, trackedDeviceMacs, trackedDeviceDetails]);

  const trackedDeviceStats = useMemo(() => {
    const grouped = new Map();

    records.forEach((row) => {
      const clientMac = normalize(
        row.client_mac || row.mac || row.device_mac || row.devmac || ""
      );

      if (!clientMac) return;

      if (!grouped.has(clientMac)) {
        grouped.set(clientMac, {
          observations: 0,
          scans: new Set(),
          locations: new Set(),
        });
      }

      const current = grouped.get(clientMac);

      current.observations += 1;

      if (
        ((row.import_batch_id ?? row.survey_id ?? row.scan_id ?? row.batch_id) !== null && (row.import_batch_id ?? row.survey_id ?? row.scan_id ?? row.batch_id) !== undefined && (row.import_batch_id ?? row.survey_id ?? row.scan_id ?? row.batch_id) !== "")
      ) {
        current.scans.add(String(row.import_batch_id ?? row.survey_id ?? row.scan_id ?? row.batch_id));
      }

      const latitude = Number(row.latitude ?? row.lat ?? row.avg_lat);
      const longitude = Number(row.longitude ?? row.lon ?? row.lng ?? row.avg_lon);

      const hasValidCoordinate =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        !(latitude === 0 && longitude === 0) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180;

      if (hasValidCoordinate) {
        current.locations.add(`${latitude.toFixed(7)},${longitude.toFixed(7)}`);
      }
    });

    const stats = {
      totalObservedDevices: grouped.size,
      trackedDeviceCount: 0,
      movementDetectedCount: 0,
      recurringPresenceCount: 0,
      trackedObservations: 0,
      withCoordinatesCount: 0,
    };

    grouped.forEach((value) => {
      const hasMovement = value.locations.size >= 2;
      const hasRecurringPresence = value.scans.size >= 2;
      const isTracked = hasMovement || hasRecurringPresence;

      if (!isTracked) return;

      stats.trackedDeviceCount += 1;
      stats.trackedObservations += value.observations;

      if (hasMovement) {
        stats.movementDetectedCount += 1;
      } else if (hasRecurringPresence) {
        stats.recurringPresenceCount += 1;
      }

      if (value.locations.size > 0) {
        stats.withCoordinatesCount += 1;
      }
    });

    return stats;
  }, [records]);

  const filteredDeviceGroups = useMemo(() => {
    const keyword = normalize(searchTerm);

    if (!keyword) {
      return trackedDeviceGroups;
    }

    return trackedDeviceGroups.filter((item) => {
      const linkedSsids = item.linked_ssid_list.join(" ");
      const relationships = item.relationship_list.join(" ");

      return (
        normalize(item.client_mac).includes(keyword) ||
        normalize(item.client_vendor).includes(keyword) ||
        normalize(linkedSsids).includes(keyword) ||
        normalize(relationships).includes(keyword)
      );
    });
  }, [trackedDeviceGroups, searchTerm]);

  const analysis = useMemo(() => {
    if (!isAnalyzeMode) {
      return null;
    }

    return buildAnalysis(selectedRecords, routeClientMac);
  }, [isAnalyzeMode, selectedRecords, routeClientMac]);
  const movementMapCenter = useMemo(() => {
    const locations = analysis?.movement_locations || [];

    const coordinates = locations
      .map((location) => ({
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
      }))
      .filter((location) => {
        return (
          Number.isFinite(location.latitude) &&
          Number.isFinite(location.longitude) &&
          !(location.latitude === 0 && location.longitude === 0)
        );
      });

    if (coordinates.length === 0) {
      return [14.5995, 120.9842];
    }

    const averageLatitude =
      coordinates.reduce((sum, location) => sum + location.latitude, 0) /
      coordinates.length;

    const averageLongitude =
      coordinates.reduce((sum, location) => sum + location.longitude, 0) /
      coordinates.length;

    return [averageLatitude, averageLongitude];
  }, [analysis]);

  const movementMapZoom = useMemo(() => {
    const locations = analysis?.movement_locations || [];

    const coordinates = locations
      .map((location) => ({
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
      }))
      .filter((location) => {
        return (
          Number.isFinite(location.latitude) &&
          Number.isFinite(location.longitude) &&
          !(location.latitude === 0 && location.longitude === 0)
        );
      });

    if (coordinates.length <= 1) {
      return 20;
    }

    const latitudes = coordinates.map((location) => location.latitude);
    const longitudes = coordinates.map((location) => location.longitude);

    const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes);
    const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes);
    const maxSpan = Math.max(latitudeSpan, longitudeSpan);

    if (maxSpan <= 0.00015) return 21;
    if (maxSpan <= 0.0005) return 20;
    if (maxSpan <= 0.0015) return 19;
    if (maxSpan <= 0.004) return 16;
    if (maxSpan <= 0.01) return 15;
    if (maxSpan <= 0.03) return 14;

    return 12;
  }, [analysis]);

  const displayMovementLocations = useMemo(() => {
    const rawLocations =
      analysis?.location_history ||
      analysis?.locations ||
      analysis?.movement_locations ||
      analysis?.movementLocations ||
      [];

    return buildClusteredDeviceLocations(rawLocations).clusteredLocations;
  }, [analysis]);
  const movementLine = useMemo(() => {
    return displayMovementLocations.map((location) => [
      location.display_latitude,
      location.display_longitude,
    ]);
  }, [displayMovementLocations]);

  const loadAllDevices = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/client-observations?limit=20000`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.detail || "Failed to load observed device records.");
      }

      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load observed device records.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadDeviceAnalysis = async () => {
    if (!encodedRouteClientMac) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/client-observations/timeline/${encodedRouteClientMac}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.detail || "Failed to load device analysis.");
      }

      const timelineRecords = Array.isArray(data)
        ? data
        : data.records || data.timeline || [];

      setSelectedRecords(Array.isArray(timelineRecords) ? timelineRecords : []);
    } catch (err) {
      setError(err.message || "Failed to load device analysis.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyze = (clientMac) => {
    const encodedMac = encodeURIComponent(clientMac);
    navigate(`/devices/${encodedMac}/link-analysis`);
  };

  const handleOpenTimeline = (clientMac) => {
    const encodedMac = encodeURIComponent(clientMac);
    navigate(`/clients/${encodedMac}/timeline`);
  };

  useEffect(() => {
    if (isAnalyzeMode) {
      loadDeviceAnalysis();
    } else {
      loadAllDevices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnalyzeMode, encodedRouteClientMac]);

  if (isAnalyzeMode) {
    return (
      <Box>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Button
              component={RouterLink}
              to="/devices"
              variant="outlined"
              size="small"
              startIcon={<ArrowBackIcon fontSize="small" />}
            >
              Back to Tracked Devices
            </Button>

            <Button
              variant="contained"
              size="small"
              startIcon={<RefreshIcon fontSize="small" />}
              onClick={loadDeviceAnalysis}
              disabled={isLoading}
            >
              Refresh
            </Button>
          </Stack>

          <Box>
            <Typography variant="h4" fontWeight={800}>
              Device Analysis
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Shows where this observed device appeared across scanned areas. This does
              not identify the device owner.
            </Typography>
          </Box>

          {isLoading && <LinearProgress />}

          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          {analysis && (
            <>
              <Card>
                <CardContent>
                  <Stack spacing={1.5}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      justifyContent="space-between"
                      sx={{ alignItems: { xs: "flex-start", md: "center" } }}
                      spacing={1}
                    >
                      <Box>
                        <Typography variant="h6" fontWeight={800}>
                          {analysis.client_mac}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Manufacturer: {analysis.manufacturer}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Chip size="small" label={`${analysis.total_records} records`} />
                        <Chip size="small" label={`${analysis.scan_count} scans`} />
                        <Chip
                          size="small"
                          label={`${analysis.linked_bssid_count} linked BSSIDs`}
                        />
                        <Chip
                          size="small"
                          color="secondary"
                          label={`${analysis.location_count} scanned areas`}
                        />
                      </Stack>
                    </Stack>

                    <Divider />

                    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          First Seen
                        </Typography>
                        <Typography fontWeight={700}>
                          {formatDateTime(analysis.first_seen)}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Last Seen
                        </Typography>
                        <Typography fontWeight={700}>
                          {formatDateTime(analysis.last_seen)}
                        </Typography>
                      </Box>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1}
                    justifyContent="space-between"
                    sx={{ alignItems: { xs: "flex-start", md: "center" } }}
                    sx={{ mb: 1 }}
                  >
                    <Box>
                      <Typography variant="h6" fontWeight={800}>
                        Device Movement Map
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Red markers show scanned areas where this device appeared.
                        The amber line connects scanned area clusters by timeline order.
                      </Typography>
                    </Box>

                    <Chip
                      icon={<MapIcon />}
                      label={`${analysis.movement_locations.length} scanned areas`}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>

                  <Box className="wgip-map-legend" sx={{ mb: 1 }}>
                    <span className="wgip-map-legend-item">
                      <span
                        className="wgip-map-dot"
                        style={{ background: "#C4B5FD", borderColor: "#DC2626" }}
                      />
                      Device scanned area
                    </span>

                    <span className="wgip-map-legend-item">
                      <span
                        className="wgip-map-dot"
                        style={{ background: "#FDE68A", borderColor: "#B45309" }}
                      />
                      Movement timeline
                    </span>

                    <span className="wgip-map-legend-item">
                      <span
                        className="wgip-map-dot"
                        style={{ background: "#CBD5E1", borderColor: "#475569" }}
                      />
                      Manual/Fallback
                    </span>
                  </Box>

                  {analysis.movement_locations.length === 0 ? (
                    <Alert severity="info">
                      No valid GPS coordinates found for this device. Import scans with GPS
                      or fallback coordinates to show movement/location history.
                    </Alert>
                  ) : (
                    <Box sx={{ height: 360, width: "100%" }}>
                      <MapContainer
                        center={movementMapCenter}
                        zoom={16}
                        maxZoom={21}
                        style={{ height: "100%", width: "100%" }}
                      >
                        <TileLayer
                          attribution="&copy; OpenStreetMap contributors"
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          maxNativeZoom={19}
                          maxZoom={21}
                        />

                        <DeviceMovementMapAutoFit locations={displayMovementLocations} />

                        {movementLine.length > 1 && (
                          <Polyline
                            positions={movementLine}
                            pathOptions={{
                              color: "#B45309",
                              weight: 3,
                              opacity: 0.8,
                            }}
                          />
                        )}

                        {displayMovementLocations.map((location) => {
                          const style = getDeviceMapPointStyle(
                            location.coordinate_source
                          );

                          return (
                            <CircleMarker
                              key={location.key}
                              center={[location.display_latitude, location.display_longitude]}
                              pathOptions={style}
                              radius={style.radius}
                            >
                              <Tooltip direction="top" offset={[0, -8]}>
                                #{location.location_number}
                              </Tooltip>

                              <Popup>
                                <strong>Location #{location.location_number}</strong>
                                <br />
                                Coordinates:{" "}
                                {formatCoordinate(location.latitude, location.longitude)}
                                <br />
                                Scan IDs:{" "}
                                {location.scan_id_list.length > 0
                                  ? location.scan_id_list
                                      .map((scanId) => `#${scanId}`)
                                      .join(", ")
                                  : "-"}
                                <br />
                                Records: {location.records}
                                <br />
                                Linked BSSIDs:{" "}
                                {location.linked_bssid_list.length > 0
                                  ? location.linked_bssid_list.slice(0, 4).join(", ")
                                  : "Unlinked"}
                                <br />
                                Linked SSIDs:{" "}
                                {location.linked_ssid_list.length > 0
                                  ? location.linked_ssid_list.slice(0, 4).join(", ")
                                  : "-"}
                                <br />
                                Relationship:{" "}
                                {location.relationship_list.length > 0
                                  ? location.relationship_list.join(", ")
                                  : "observed"}
                                <br />
                                Best Signal: {location.best_signal ?? "-"}
                                <br />
                                First Seen: {formatDateTime(location.first_seen)}
                                <br />
                                Last Seen: {formatDateTime(location.last_seen)}
                              </Popup>
                            </CircleMarker>
                          );
                        })}
                      </MapContainer>
                    </Box>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>
                    Location History
                  </Typography>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Grouped scanned areas where this device was observed.
                  </Typography>

                  <Box sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Location #</TableCell>
                          <TableCell>Coordinates</TableCell>
                          <TableCell>Scan IDs</TableCell>
                          <TableCell align="right">Records</TableCell>
                          <TableCell>Linked BSSIDs</TableCell>
                          <TableCell>First Seen</TableCell>
                          <TableCell>Last Seen</TableCell>
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {analysis.movement_locations.map((location) => (
                          <TableRow key={location.key} hover>
                            <TableCell>#{location.location_number}</TableCell>
                            <TableCell>
                              {formatCoordinate(location.latitude, location.longitude)}
                            </TableCell>
                            <TableCell>
                              {location.scan_id_list.length > 0
                                ? location.scan_id_list
                                    .map((scanId) => `#${scanId}`)
                                    .join(", ")
                                : "-"}
                            </TableCell>
                            <TableCell align="right">
                              {formatNumber(location.records)}
                            </TableCell>
                            <TableCell>
                              {location.linked_bssid_list.length > 0
                                ? location.linked_bssid_list.slice(0, 3).join(", ")
                                : "Unlinked"}
                            </TableCell>
                            <TableCell>{formatDateTime(location.first_seen)}</TableCell>
                            <TableCell>{formatDateTime(location.last_seen)}</TableCell>
                          </TableRow>
                        ))}

                        {analysis.movement_locations.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7}>
                              <Typography
                                color="text.secondary"
                                align="center"
                                sx={{ py: 2 }}
                              >
                                No valid scanned areas found for this device.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
                    Scan History
                  </Typography>

                  <Box sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Scan ID</TableCell>
                          <TableCell align="right">Records</TableCell>
                          <TableCell align="right">Linked BSSIDs</TableCell>
                          <TableCell>First Seen</TableCell>
                          <TableCell>Last Seen</TableCell>
                          <TableCell>Open Scan</TableCell>
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {analysis.scan_history.map((item) => (
                          <TableRow key={item.import_batch_id || "unknown"} hover>
                            <TableCell>#{item.import_batch_id || "-"}</TableCell>
                            <TableCell align="right">
                              {formatNumber(item.records)}
                            </TableCell>
                            <TableCell align="right">
                              {formatNumber(item.linked_bssid_count)}
                            </TableCell>
                            <TableCell>{formatDateTime(item.first_seen)}</TableCell>
                            <TableCell>{formatDateTime(item.last_seen)}</TableCell>
                            <TableCell>
                              {item.import_batch_id ? (
                                <Link
                                  component={RouterLink}
                                  to={`/scans/${item.import_batch_id}`}
                                  underline="hover"
                                >
                                  View Scan
                                </Link>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                          </TableRow>
                        ))}

                        {analysis.scan_history.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6}>
                              <Typography
                                color="text.secondary"
                                align="center"
                                sx={{ py: 2 }}
                              >
                                No scan history found.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>
                </CardContent>
              </Card>

              <Card>
                
              <DeviceWifiConnections />

<CardContent>
                  <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
                    Linked Wi-Fi Networks
                  </Typography>

                  <Box sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>BSSID</TableCell>
                          <TableCell>SSID</TableCell>
                          <TableCell align="right">Channel</TableCell>
                          <TableCell>Relationship</TableCell>
                          <TableCell align="right">Records</TableCell>
                          <TableCell>First Seen</TableCell>
                          <TableCell>Last Seen</TableCell>
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {analysis.linked_networks.map((item) => (
                          <TableRow key={item.bssid} hover>
                            <TableCell>
                              {item.bssid !== "Unlinked" ? (
                                <Link
                                  component={RouterLink}
                                  to={`/bssids/${encodeURIComponent(item.bssid)}`}
                                  underline="hover"
                                >
                                  {item.bssid}
                                </Link>
                              ) : (
                                "Unlinked"
                              )}
                            </TableCell>
                            <TableCell>{item.ssid}</TableCell>
                            <TableCell align="right">{item.channel}</TableCell>
                            <TableCell>{item.relationship_type}</TableCell>
                            <TableCell align="right">
                              {formatNumber(item.records)}
                            </TableCell>
                            <TableCell>{formatDateTime(item.first_seen)}</TableCell>
                            <TableCell>{formatDateTime(item.last_seen)}</TableCell>
                          </TableRow>
                        ))}

                        {analysis.linked_networks.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7}>
                              <Typography
                                color="text.secondary"
                                align="center"
                                sx={{ py: 2 }}
                              >
                                No linked Wi-Fi networks found.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
                    Timeline Records
                  </Typography>

                  <Box sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Time</TableCell>
                          <TableCell>Scan ID</TableCell>
                          <TableCell>BSSID</TableCell>
                          <TableCell>SSID</TableCell>
                          <TableCell>Relationship</TableCell>
                          <TableCell align="right">Signal</TableCell>
                          <TableCell>Location</TableCell>
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {analysis.timeline.map((item) => (
                          <TableRow key={`${item.id}-${item.import_batch_id}`} hover>
                            <TableCell>
                              {formatDateTime(item.timestamp || item.created_at)}
                            </TableCell>
                            <TableCell>#{item.import_batch_id || "-"}</TableCell>
                            <TableCell>{item.bssid || "Unlinked"}</TableCell>
                            <TableCell>{item.ssid || "-"}</TableCell>
                            <TableCell>
                              {item.relationship_type || "observed"}
                            </TableCell>
                            <TableCell align="right">
                              {item.signal_dbm ?? "-"}
                            </TableCell>
                            <TableCell>
                              {formatCoordinate(item.latitude, item.longitude)}
                            </TableCell>
                          </TableRow>
                        ))}

                        {analysis.timeline.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7}>
                              <Typography
                                color="text.secondary"
                                align="center"
                                sx={{ py: 2 }}
                              >
                                No timeline records found.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>
                </CardContent>
              </Card>
            </>
          )}
        </Stack>
      </Box>
    );
  }

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
              Tracked Devices
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Only observed device MACs with movement or repeated scan presence.
            </Typography>
          </Box>

          <Button
            variant="contained"
            size="small"
            startIcon={<RefreshIcon fontSize="small" />}
            onClick={loadAllDevices}
            disabled={isLoading}
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
              lg: "repeat(5, 1fr)",
            },
            gap: 1.5,
          }}
        >
          <Card>
            <CardContent sx={{ minHeight: 76 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    backgroundColor: "#EEF2FF",
                    color: "#1D4ED8",
                    flexShrink: 0,
                  }}
                >
                  <VisibilityIcon fontSize="small" />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    Tracked Devices
                  </Typography>
                  <Typography variant="h5" fontWeight={800}>
                    {formatNumber(trackedDeviceStats.trackedDeviceCount)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {formatNumber(trackedDeviceStats.totalObservedDevices)} total devices observed
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ minHeight: 76 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    backgroundColor: "#EEF2FF",
                    color: "#1D4ED8",
                    flexShrink: 0,
                  }}
                >
                  <TimelineIcon fontSize="small" />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    Movement Detected
                  </Typography>
                  <Typography variant="h5" fontWeight={800}>
                    {formatNumber(trackedDeviceStats.movementDetectedCount)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    Multiple GPS locations
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ minHeight: 76 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    backgroundColor: "#EEF2FF",
                    color: "#1D4ED8",
                    flexShrink: 0,
                  }}
                >
                  <TimelineIcon fontSize="small" />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    Recurring Presence
                  </Typography>
                  <Typography variant="h5" fontWeight={800}>
                    {formatNumber(trackedDeviceStats.recurringPresenceCount)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    Seen in multiple scans
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ minHeight: 76 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    backgroundColor: "#EEF2FF",
                    color: "#1D4ED8",
                    flexShrink: 0,
                  }}
                >
                  <VisibilityIcon fontSize="small" />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    Tracked Observations
                  </Typography>
                  <Typography variant="h5" fontWeight={800}>
                    {formatNumber(trackedDeviceStats.trackedObservations)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    For tracked devices only
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ minHeight: 76 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    backgroundColor: "#EEF2FF",
                    color: "#1D4ED8",
                    flexShrink: 0,
                  }}
                >
                  <MapIcon fontSize="small" />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    With Coordinates
                  </Typography>
                  <Typography variant="h5" fontWeight={800}>
                    {formatNumber(trackedDeviceStats.withCoordinatesCount)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    Valid GPS/fallback
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Box>
        <Card>
          <CardContent>
            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              sx={{ alignItems: { xs: "flex-start", md: "center" } }}
              spacing={1}
              sx={{ mb: 1.5 }}
            >
              <Box>
                <Typography variant="h6" fontWeight={800}>
                  Tracked Device Records
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Only observed device MACs with movement or repeated scan presence.
                </Typography>
              </Box>

              <TextField
                size="small"
                placeholder="Search MAC / Manufacturer / SSID"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1 }} />,
                }}
                sx={{ width: { xs: "100%", md: 360 } }}
              />
            </Stack>

            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Client MAC</TableCell>
                    <TableCell>Manufacturer</TableCell>
                    <TableCell>Tracking Status</TableCell>
                    <TableCell align="right">Scans</TableCell>
                    <TableCell align="right">Observations</TableCell>
                    <TableCell align="right">Linked BSSIDs</TableCell>
                    <TableCell>Linked SSID</TableCell>
                    <TableCell>Relationship</TableCell>
                    <TableCell align="right">Best Signal</TableCell>
                    <TableCell>Last Seen</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {filteredDeviceGroups.map((item) => (
                    <TableRow key={item.client_mac} hover>
                      <TableCell>
                        <Link
                          component={RouterLink}
                          to={`/clients/${encodeURIComponent(item.client_mac)}/timeline`}
                          underline="hover"
                        >
                          {item.client_mac}
                        </Link>
                      </TableCell>

                      <TableCell>{item.client_vendor}</TableCell>
                      <TableCell>
                        <Stack spacing={0.5}>
                          <Chip
                            size="small"
                            color={item.has_movement ? "success" : "warning"}
                            variant="outlined"
                            label={item.tracking_status || "Tracked"}
                            sx={{ fontWeight: 700 }}
                          />

                          <Typography variant="caption" color="text.secondary">
                            {formatNumber(item.location_count || 0)} locations
                          </Typography>
                        </Stack>
                      </TableCell>

                      <TableCell align="right">
                        {formatNumber(item.scan_count)}
                      </TableCell>

                      <TableCell align="right">
                        {formatNumber(item.observations)}
                      </TableCell>

                      <TableCell align="right">
                        {formatNumber(item.linked_bssid_count)}
                      </TableCell>

                      <TableCell>
                        {item.linked_ssid_list.length > 0
                          ? item.linked_ssid_list.slice(0, 2).join(", ")
                          : "-"}
                      </TableCell>

                      <TableCell>
                        {item.relationship_list.length > 0
                          ? item.relationship_list.slice(0, 2).join(", ")
                          : "observed"}
                      </TableCell>

                      <TableCell align="right">
                        {item.best_signal === null ? "-" : item.best_signal}
                      </TableCell>

                      <TableCell>{formatDateTime(item.last_seen)}</TableCell>

                      <TableCell align="right">
                                                  <Button
                            variant="contained"
                            size="small"
                            startIcon={<TimelineIcon fontSize="small" />}
                            onClick={() => handleAnalyze(item.client_mac)}
                            sx={{ fontWeight: 800, whiteSpace: "nowrap" }}
                          >
                            View Movement
                          </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredDeviceGroups.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11}>
                        <Typography
                          color="text.secondary"
                          align="center"
                          sx={{ py: 2 }}
                        >
                          No tracked device records found.
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


























