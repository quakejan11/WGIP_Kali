import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
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
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import { formatManufacturerDisplay } from "../../utils/wgipDisplay";

const API_BASE_URL = "http://127.0.0.1:8000";

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.observations)) return data.observations;
  if (Array.isArray(data?.client_observations)) return data.client_observations;
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
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeMac(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase();
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

function getNestedObjects(row, keys) {
  return keys
    .map((key) => row?.[key])
    .filter(
      (value) => value && typeof value === "object" && !Array.isArray(value),
    );
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

function dateValue(value) {
  if (!value) return null;

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : null;
}

function formatCoordinate(lat, lon) {
  if (!isValidCoordinate(lat, lon)) return "No GPS";

  return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
}

function titleCase(value = "") {
  const text = String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  return text.replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatRelationship(value) {
  const normalizedValue = normalize(value);

  const labels = {
    associated: "Associated",
    association: "Associated",
    assoc: "Associated",
    bridged: "Bridged",
    bridge: "Bridged",
    observed: "Observed",
    client: "Observed Client",
    probed: "Probe Request",
    probe: "Probe Request",
    connected: "Connected",
  };

  return labels[normalizedValue] || titleCase(value) || "Observed";
}

function signalLabel(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return "";
  if (numericValue >= -50) return "Strong";
  if (numericValue >= -67) return "Fair";
  return "Weak";
}

function formatSignal(value) {
  if (value === null || value === undefined || value === "") return "—";

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return String(value);

  return `${signalLabel(numericValue)} · ${numericValue} dBm`;
}

function confidenceLabel(value) {
  if (value === null || value === undefined || value === "") return "";

  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    const percent = numericValue <= 1 ? numericValue * 100 : numericValue;
    return `${Math.round(percent)}% confidence`;
  }

  const text = normalize(value);

  if (text.includes("high")) return "High confidence";
  if (text.includes("medium") || text.includes("moderate")) {
    return "Medium confidence";
  }
  if (text.includes("low")) return "Low confidence";

  return `${titleCase(value)} confidence`;
}

function getBssid(row) {
  const direct = getAny(
    row,
    [
      "bssid",
      "linked_bssid",
      "access_point_bssid",
      "ap_bssid",
      "wifi_bssid",
      "network_bssid",
    ],
    "",
  );

  if (direct) return normalizeMac(direct);

  const nested = getNestedObjects(row, [
    "wifi",
    "network",
    "access_point",
    "ap",
    "bssid_record",
  ]);

  for (const item of nested) {
    const value = getAny(item, ["bssid", "mac", "address"], "");
    if (value) return normalizeMac(value);
  }

  return "";
}

function getClientMac(row) {
  const direct = getAny(
    row,
    [
      "client_mac",
      "clientMac",
      "mac",
      "device_mac",
      "deviceMac",
      "devmac",
      "source_mac",
      "station_mac",
      "sta_mac",
    ],
    "",
  );

  if (direct) return normalizeMac(direct);

  const nested = getNestedObjects(row, [
    "client",
    "device",
    "station",
    "observed_device",
  ]);

  for (const item of nested) {
    const value = getAny(
      item,
      ["client_mac", "mac", "device_mac", "address"],
      "",
    );
    if (value) return normalizeMac(value);
  }

  return "";
}

function getVendor(row) {
  const direct = getAny(
    row,
    [
      "client_vendor",
      "clientVendor",
      "vendor",
      "device_vendor",
      "deviceVendor",
      "manufacturer",
      "manuf",
    ],
    "",
  );

  if (direct) return formatManufacturerDisplay(direct);

  const nested = getNestedObjects(row, [
    "client",
    "device",
    "station",
    "observed_device",
  ]);

  for (const item of nested) {
    const value = getAny(item, ["vendor", "manufacturer", "manuf"], "");
    if (value) return formatManufacturerDisplay(value);
  }

  return "";
}

function getRelationship(row) {
  return getAny(
    row,
    [
      "relationship_type",
      "relationshipType",
      "relationship",
      "association_type",
      "connection_type",
      "role",
    ],
    "observed",
  );
}

function getSignal(row) {
  const direct = getAny(
    row,
    [
      "signal_dbm",
      "signalDbm",
      "signal",
      "rssi",
      "best_signal",
      "strongest_signal",
      "max_signal",
    ],
    "",
  );

  if (direct !== "") return direct;

  const nested = getNestedObjects(row, ["radio", "signal_info", "wireless"]);

  for (const item of nested) {
    const value = getAny(
      item,
      ["signal_dbm", "signal", "rssi", "best_signal"],
      "",
    );
    if (value !== "") return value;
  }

  return "";
}

function getChannel(row) {
  const direct = getAny(
    row,
    ["channel", "wifi_channel", "frequency_channel"],
    "",
  );

  if (direct !== "") return direct;

  const nested = getNestedObjects(row, ["radio", "wireless"]);

  for (const item of nested) {
    const value = getAny(item, ["channel", "wifi_channel"], "");
    if (value !== "") return value;
  }

  return "";
}

function getTimestamp(row) {
  return getAny(
    row,
    [
      "timestamp",
      "observed_at",
      "observedAt",
      "seen_at",
      "seenAt",
      "packet_time",
      "last_seen",
      "lastSeen",
      "first_seen",
      "firstSeen",
      "created_at",
      "createdAt",
    ],
    "",
  );
}

function getLocation(row) {
  let latitude = getAny(
    row,
    ["latitude", "lat", "gps_latitude", "gps_lat"],
    "",
  );
  let longitude = getAny(
    row,
    ["longitude", "lon", "lng", "gps_longitude", "gps_lon", "gps_lng"],
    "",
  );
  let source = getAny(
    row,
    [
      "location_source",
      "locationSource",
      "gps_source",
      "coordinate_source",
      "source_type",
    ],
    "",
  );
  let confidence = getAny(
    row,
    [
      "location_confidence",
      "locationConfidence",
      "confidence",
      "gps_confidence",
      "confidence_level",
    ],
    "",
  );

  const nested = getNestedObjects(row, [
    "location",
    "gps",
    "coordinates",
    "geo",
  ]);

  for (const item of nested) {
    if (latitude === "") {
      latitude = getAny(item, ["latitude", "lat", "gps_latitude"], "");
    }

    if (longitude === "") {
      longitude = getAny(
        item,
        ["longitude", "lon", "lng", "gps_longitude"],
        "",
      );
    }

    if (!source) {
      source = getAny(
        item,
        ["source", "location_source", "gps_source", "source_type"],
        "",
      );
    }

    if (confidence === "") {
      confidence = getAny(
        item,
        ["confidence", "location_confidence", "confidence_level"],
        "",
      );
    }
  }

  return {
    latitude,
    longitude,
    source,
    confidence,
  };
}

function makeScanReference(value, prefix) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "object") {
    const nestedId = getAny(
      value,
      [
        "id",
        "scan_id",
        "survey_id",
        "import_id",
        "import_batch_id",
        "batch_id",
      ],
      "",
    );
    const nestedName = getAny(
      value,
      ["name", "scan_name", "survey_name", "import_name", "source_file"],
      "",
    );

    if (nestedId !== "") {
      return makeScanReference(nestedId, prefix);
    }

    if (nestedName) {
      return {
        key: `${prefix}:${String(nestedName)}`,
        label: String(nestedName),
      };
    }

    return null;
  }

  const text = String(value).trim();

  if (!text) return null;

  if (/^(scan|survey|import|batch)\s*#/i.test(text)) {
    return {
      key: `${prefix}:${text.toLowerCase()}`,
      label: text,
    };
  }

  return {
    key: `${prefix}:${text}`,
    label: /^\d+$/.test(text) ? `${prefix} #${text}` : text,
  };
}

function getScanReference(row) {
  const candidates = [
    {
      keys: [
        "import_batch_id",
        "importBatchId",
        "kismet_import_id",
        "source_import_id",
        "import_id",
        "importId",
        "batch_id",
        "batchId",
      ],
      prefix: "Import",
    },
    {
      keys: [
        "survey_id",
        "surveyId",
        "scan_id",
        "scanId",
        "scan_result_id",
        "scanResultId",
        "source_scan_id",
        "capture_id",
        "session_id",
      ],
      prefix: "Scan",
    },
    {
      keys: [
        "scan_name",
        "survey_name",
        "import_name",
        "source_file",
        "source_filename",
        "filename",
        "kismet_file",
        "capture_file",
      ],
      prefix: "Source",
    },
  ];

  for (const candidate of candidates) {
    const value = getAny(row, candidate.keys, "");
    const reference = makeScanReference(value, candidate.prefix);

    if (reference) return reference;
  }

  const nestedCandidates = [
    { key: "import_batch", prefix: "Import" },
    { key: "import", prefix: "Import" },
    { key: "batch", prefix: "Import" },
    { key: "scan", prefix: "Scan" },
    { key: "survey", prefix: "Scan" },
    { key: "scan_result", prefix: "Scan" },
    { key: "capture", prefix: "Scan" },
    { key: "session", prefix: "Scan" },
  ];

  for (const candidate of nestedCandidates) {
    const reference = makeScanReference(row?.[candidate.key], candidate.prefix);

    if (reference) return reference;
  }

  return null;
}

function normalizeObservation(row, index, targetBssid) {
  const rowBssid = getBssid(row);
  const clientMac = getClientMac(row);

  if (!targetBssid || !rowBssid || rowBssid !== targetBssid) return null;
  if (!clientMac || !isValidMacLike(clientMac)) return null;

  const location = getLocation(row);
  const scanReference = getScanReference(row);
  const signal = getSignal(row);

  return {
    raw: row,
    rawIndex: index,
    bssid: rowBssid,
    clientMac,
    vendor: getVendor(row) || "Unknown Manufacturer",
    relationship: getRelationship(row),
    scanReference,
    signal:
      signal === null || signal === undefined || signal === ""
        ? null
        : Number(signal),
    channel: getChannel(row),
    timestamp: getTimestamp(row),
    latitude: location.latitude,
    longitude: location.longitude,
    locationSource: location.source,
    locationConfidence: location.confidence,
  };
}

function buildDeviceGroups(records) {
  const grouped = new Map();

  records.forEach((record) => {
    if (!grouped.has(record.clientMac)) {
      grouped.set(record.clientMac, {
        clientMac: record.clientMac,
        vendor: "Unknown Manufacturer",
        relationships: new Set(),
        scans: new Map(),
        records: [],
        bestSignal: null,
        latitude: "",
        longitude: "",
        locationSource: "",
        locationConfidence: "",
        firstSeen: "",
        lastSeen: "",
      });
    }

    const current = grouped.get(record.clientMac);
    const numericSignal =
      record.signal === null || record.signal === undefined
        ? null
        : Number(record.signal);
    const timestampValue = dateValue(record.timestamp);
    const firstSeenValue = dateValue(current.firstSeen);
    const lastSeenValue = dateValue(current.lastSeen);

    current.records.push(record);

    if (
      record.vendor &&
      normalize(record.vendor) !== "unknown" &&
      normalize(record.vendor) !== "unknown vendor" &&
      normalize(record.vendor) !== "unknown manufacturer"
    ) {
      current.vendor = record.vendor;
    }

    current.relationships.add(formatRelationship(record.relationship));

    if (record.scanReference) {
      current.scans.set(record.scanReference.key, record.scanReference.label);
    }

    if (
      numericSignal !== null &&
      Number.isFinite(numericSignal) &&
      (current.bestSignal === null || numericSignal > current.bestSignal)
    ) {
      current.bestSignal = numericSignal;
    }

    if (isValidCoordinate(record.latitude, record.longitude)) {
      current.latitude = Number(record.latitude);
      current.longitude = Number(record.longitude);
      current.locationSource = record.locationSource;
      current.locationConfidence = record.locationConfidence;
    }

    if (record.timestamp) {
      if (
        !current.firstSeen ||
        (timestampValue !== null &&
          (firstSeenValue === null || timestampValue < firstSeenValue))
      ) {
        current.firstSeen = record.timestamp;
      }

      if (
        !current.lastSeen ||
        (timestampValue !== null &&
          (lastSeenValue === null || timestampValue > lastSeenValue))
      ) {
        current.lastSeen = record.timestamp;
      }
    }
  });

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.records.length !== a.records.length) {
      return b.records.length - a.records.length;
    }

    if (b.scans.size !== a.scans.size) {
      return b.scans.size - a.scans.size;
    }

    return a.clientMac.localeCompare(b.clientMac);
  });
}

function deviceSearchText(device) {
  return [
    device.clientMac,
    device.vendor,
    Array.from(device.relationships).join(" "),
    Array.from(device.scans.values()).join(" "),
    formatCoordinate(device.latitude, device.longitude),
    confidenceLabel(device.locationConfidence),
    device.locationSource,
  ]
    .join(" ")
    .toLowerCase();
}

function recordSearchText(record) {
  return [
    record.clientMac,
    record.vendor,
    formatRelationship(record.relationship),
    record.scanReference?.label,
    formatSignal(record.signal),
    record.channel,
    formatCoordinate(record.latitude, record.longitude),
    record.locationSource,
    confidenceLabel(record.locationConfidence),
    formatDateTime(record.timestamp),
  ]
    .join(" ")
    .toLowerCase();
}

function locationDetails(source, confidence) {
  const parts = [];

  if (source) parts.push(titleCase(source));

  const formattedConfidence = confidenceLabel(confidence);
  if (formattedConfidence) parts.push(formattedConfidence);

  return parts.join(" · ") || "Not supplied";
}

export default function BssidObservedDevices({ bssid }) {
  const params = useParams();
  const routeBssid = params.bssid || params.mac || "";
  const targetBssid = normalizeMac(safeDecode(bssid || routeBssid));

  const [rows, setRows] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const records = useMemo(
    () =>
      rows
        .map((row, index) => normalizeObservation(row, index, targetBssid))
        .filter(Boolean),
    [rows, targetBssid],
  );

  const devices = useMemo(() => buildDeviceGroups(records), [records]);
  const search = normalize(searchText);

  const filteredDevices = useMemo(() => {
    if (!search) return devices;
    return devices.filter((device) =>
      deviceSearchText(device).includes(search),
    );
  }, [devices, search]);

  const filteredRecords = useMemo(() => {
    if (!search) return records;
    return records.filter((record) =>
      recordSearchText(record).includes(search),
    );
  }, [records, search]);

  const distinctScans = useMemo(() => {
    const scans = new Set();

    records.forEach((record) => {
      if (record.scanReference) scans.add(record.scanReference.key);
    });

    return scans.size;
  }, [records]);

  async function loadDevices() {
    if (!targetBssid) {
      setRows([]);
      setErrorMessage("BSSID was not found in the page URL.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const encodedBssid = encodeURIComponent(targetBssid);
      const filteredResponse = await fetch(
        `${API_BASE_URL}/client-observations?bssid=${encodedBssid}&limit=20000`,
      );
      const filteredData = await filteredResponse.json().catch(() => []);
      let nextRows = filteredResponse.ok ? normalizeArray(filteredData) : [];

      if (nextRows.length === 0) {
        const allResponse = await fetch(
          `${API_BASE_URL}/client-observations?limit=20000`,
        );
        const allData = await allResponse.json().catch(() => []);

        if (!allResponse.ok) {
          const detail =
            allData?.detail ||
            allData?.message ||
            `Unable to load observed devices. Status: ${allResponse.status}`;
          throw new Error(detail);
        }

        nextRows = normalizeArray(allData);
      }

      setRows(nextRows);
    } catch (error) {
      setRows([]);
      setErrorMessage(
        error?.message ||
          "Unable to load observed devices. Please check the backend.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetBssid]);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={1.5}
            sx={{
              alignItems: { xs: "flex-start", lg: "center" },
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography variant="h6" fontWeight={900}>
                Observed Devices with this Wi-Fi
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Devices associated, bridged, or observed with this BSSID in
                imported scan data.
              </Typography>
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                size="small"
                placeholder="Search device, manufacturer, scan, or location"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                sx={{ minWidth: { xs: "100%", sm: 340 } }}
              />

              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={loadDevices}
                disabled={isLoading}
                sx={{ fontWeight: 800, whiteSpace: "nowrap" }}
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
            These are wireless identifiers observed with the selected BSSID.
            This does not identify a device owner. Every raw observation remains
            available below.
          </Alert>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              icon={<DevicesOutlinedIcon />}
              label={`${formatNumber(devices.length)} observed ${
                devices.length === 1 ? "device" : "devices"
              }`}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />

            <Chip
              label={`${formatNumber(records.length)} raw device ${
                records.length === 1 ? "record" : "records"
              }`}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />

            <Chip
              label={
                distinctScans > 0
                  ? `${formatNumber(distinctScans)} linked ${
                      distinctScans === 1 ? "scan/import" : "scans/imports"
                    }`
                  : "Scan/import ID not supplied"
              }
              color={distinctScans > 0 ? "success" : "default"}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Stack>

          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Device MAC</TableCell>
                  <TableCell>Manufacturer</TableCell>
                  <TableCell>Relationship</TableCell>
                  <TableCell align="right">Scans</TableCell>
                  <TableCell align="right">Raw Records</TableCell>
                  <TableCell>Best Signal</TableCell>
                  <TableCell>Latest Location</TableCell>
                  <TableCell>Location Source</TableCell>
                  <TableCell>First Seen</TableCell>
                  <TableCell>Last Seen</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {filteredDevices.map((device) => (
                  <TableRow key={device.clientMac} hover>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color="primary"
                        fontWeight={800}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        {device.clientMac}
                      </Typography>
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {device.vendor || "Unknown Manufacturer"}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {Array.from(device.relationships).join(", ") ||
                        "Observed"}
                    </TableCell>

                    <TableCell align="right">
                      {device.scans.size > 0
                        ? formatNumber(device.scans.size)
                        : "—"}
                    </TableCell>

                    <TableCell align="right">
                      {formatNumber(device.records.length)}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatSignal(device.bestSignal)}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatCoordinate(device.latitude, device.longitude)}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {locationDetails(
                        device.locationSource,
                        device.locationConfidence,
                      )}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatDateTime(device.firstSeen)}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatDateTime(device.lastSeen)}
                    </TableCell>

                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={1}
                        justifyContent="flex-end"
                        sx={{ minWidth: 300 }}
                      >
                        <Button
                          component={RouterLink}
                          to={`/devices/${encodeURIComponent(
                            device.clientMac,
                          )}/link-analysis`}
                          size="small"
                          variant="contained"
                          startIcon={
                            <VisibilityOutlinedIcon fontSize="small" />
                          }
                          sx={{ fontWeight: 800, whiteSpace: "nowrap" }}
                        >
                          Device Profile
                        </Button>

                        <Button
                          component={RouterLink}
                          to={`/clients/${encodeURIComponent(
                            device.clientMac,
                          )}/timeline`}
                          size="small"
                          variant="outlined"
                          startIcon={<TimelineOutlinedIcon fontSize="small" />}
                          sx={{ fontWeight: 800, whiteSpace: "nowrap" }}
                        >
                          Timeline History
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredDevices.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={11}>
                      <Typography
                        color="text.secondary"
                        align="center"
                        sx={{ py: 4 }}
                      >
                        {search
                          ? "No observed devices match the current search."
                          : "No observed devices were found for this Wi-Fi/BSSID."}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>

          <Divider />

          <Box>
            <Typography variant="h6" fontWeight={900}>
              Raw Device Observation History
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Complete device-observation rows returned by the backend. Repeated
              records remain visible and are not removed.
            </Typography>
          </Box>

          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Device MAC</TableCell>
                  <TableCell>Relationship</TableCell>
                  <TableCell>Scan / Import</TableCell>
                  <TableCell>Signal</TableCell>
                  <TableCell>Channel</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Location Source</TableCell>
                  <TableCell>Observed</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {filteredRecords.map((record) => (
                  <TableRow
                    key={`${record.clientMac}-${record.rawIndex}`}
                    hover
                  >
                    <TableCell>
                      <Typography
                        variant="body2"
                        color="primary"
                        fontWeight={800}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        {record.clientMac}
                      </Typography>
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatRelationship(record.relationship)}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {record.scanReference?.label || "Not supplied"}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatSignal(record.signal)}
                    </TableCell>

                    <TableCell>{record.channel || "—"}</TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatCoordinate(record.latitude, record.longitude)}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {locationDetails(
                        record.locationSource,
                        record.locationConfidence,
                      )}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatDateTime(record.timestamp)}
                    </TableCell>
                  </TableRow>
                ))}

                {filteredRecords.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Typography
                        color="text.secondary"
                        align="center"
                        sx={{ py: 4 }}
                      >
                        {search
                          ? "No raw device records match the current search."
                          : "No raw device observation records are available."}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Showing all {formatNumber(filteredRecords.length)} of{" "}
            {formatNumber(records.length)} raw device observation records for
            this BSSID.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
