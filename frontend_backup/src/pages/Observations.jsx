import { useEffect, useState } from "react";
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
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/Visibility";
import WifiIcon from "@mui/icons-material/Wifi";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";

import { getManufacturer } from "../utils/wgipDisplay";

const API_BASE_URL = "http://127.0.0.1:8000";
const PAGE_SIZE_OPTIONS = [10, 50, 100];

const EMPTY_STATS = {
  total_processed: 0,
  wifi_record_count: 0,
  device_record_count: 0,
  mapped_record_count: 0,
  unique_bssids: 0,
  unique_devices: 0,
};

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatNumber(value) {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue)) return "0";

  return numericValue.toLocaleString();
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

function formatCoordinate(lat, lon) {
  if (!isValidCoordinate(lat, lon)) return "No GPS";

  return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

function normalizeObservationRow(item = {}) {
  const typeKey = item.record_type === "device" ? "device" : "wifi";
  const identifier = String(item.identifier || "").trim().toUpperCase();

  return {
    id: item.row_id || `${typeKey}-${item.source_id || identifier}`,
    type: item.type_label || (typeKey === "wifi" ? "Wi-Fi" : "Device"),
    typeKey,
    name: item.name || (typeKey === "wifi" ? "Hidden/Unknown" : "Observed Device"),
    manufacturer: getManufacturer(item),
    identifier: identifier || "—",
    linkedBssid: String(item.linked_bssid || "").trim().toUpperCase() || "Unlinked",
    relationship: item.relationship || "observed",
    scanId: item.scan_id ?? "—",
    scanName: item.scan_name || "Unknown Scan",
    channel: item.channel ?? "—",
    signal: item.signal ?? "—",
    latitude: item.latitude,
    longitude: item.longitude,
    coordinateSource: item.coordinate_source || "processed",
    timestamp: item.observed_at,
    actionPath:
      typeKey === "wifi"
        ? `/bssids/${encodeURIComponent(identifier)}`
        : `/devices/${encodeURIComponent(identifier)}/link-analysis`,
  };
}

function StatCard({ title, value, subtitle, icon }) {
  return (
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
            {icon}
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary" noWrap>
              {title}
            </Typography>

            <Typography variant="h5" fontWeight={800}>
              {formatNumber(value)}
            </Typography>

            {subtitle && (
              <Typography variant="body2" color="text.secondary" noWrap>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function Observations() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [scanOptions, setScanOptions] = useState([]);
  const [recordType, setRecordType] = useState("all");
  const [scanFilter, setScanFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(0);
      setDebouncedSearch(searchText.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPage() {
      setIsLoading(true);
      setErrorMessage("");

      const parameters = new URLSearchParams({
        page: String(page + 1),
        page_size: String(pageSize),
        record_type: recordType,
      });

      if (scanFilter !== "all") {
        parameters.set("import_batch_id", String(scanFilter));
      }

      if (debouncedSearch) {
        parameters.set("search", debouncedSearch);
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/processed-observations?${parameters.toString()}`,
          { signal: controller.signal }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data?.detail || `Failed to load observations. Status: ${response.status}`
          );
        }

        const responsePage = Math.max(0, Number(data.page || 1) - 1);

        if (responsePage !== page) {
          setPage(responsePage);
          return;
        }

        setRows(normalizeArray(data.items).map(normalizeObservationRow));
        setStats({ ...EMPTY_STATS, ...(data.stats || {}) });
        setScanOptions(normalizeArray(data.scan_options));
        setTotal(Number(data.total || 0));
      } catch (error) {
        if (error?.name === "AbortError") return;

        setRows([]);
        setTotal(0);
        setErrorMessage(error?.message || "Failed to load observation records.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadPage();

    return () => controller.abort();
  }, [page, pageSize, recordType, scanFilter, debouncedSearch, refreshKey]);

  const firstVisible = total > 0 ? page * pageSize + 1 : 0;
  const lastVisible = Math.min((page + 1) * pageSize, total);

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
              Observations
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Paginated processed Wi-Fi and observed device records from imported Kismet scans.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1}>
            <Button
              component={RouterLink}
              to="/scans"
              variant="outlined"
              startIcon={<TableChartOutlinedIcon />}
              sx={{ fontWeight: 800 }}
            >
              Scan Results
            </Button>

            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={() => setRefreshKey((value) => value + 1)}
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
          This page shows processed observation records only. It is not the raw Kismet packet
          table. Wireless identifiers shown here do not identify device owners.
        </Alert>

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
          <StatCard
            title="Total Processed Records"
            value={stats.total_processed}
            subtitle="Wi-Fi + observed devices"
            icon={<ListAltOutlinedIcon fontSize="small" />}
          />

          <StatCard
            title="Wi-Fi Records"
            value={stats.wifi_record_count}
            subtitle={`${formatNumber(stats.unique_bssids)} unique BSSIDs`}
            icon={<WifiIcon fontSize="small" />}
          />

          <StatCard
            title="Device Records"
            value={stats.device_record_count}
            subtitle={`${formatNumber(stats.unique_devices)} unique devices`}
            icon={<DevicesOutlinedIcon fontSize="small" />}
          />

          <StatCard
            title="Mapped Records"
            value={stats.mapped_record_count}
            subtitle="With valid coordinates"
            icon={<MapOutlinedIcon fontSize="small" />}
          />
        </Box>

        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", lg: "row" }}
                spacing={1}
                sx={{
                  alignItems: { xs: "stretch", lg: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography variant="h6" fontWeight={900}>
                    Processed Observation Records
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Filters, search, and page selection are processed by the backend.
                  </Typography>
                </Box>

                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <TextField
                    select
                    label="Record Type"
                    size="small"
                    value={recordType}
                    onChange={(event) => {
                      setPage(0);
                      setRecordType(event.target.value);
                    }}
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="all">All Records</MenuItem>
                    <MenuItem value="wifi">Wi-Fi Only</MenuItem>
                    <MenuItem value="device">Device Only</MenuItem>
                  </TextField>

                  <TextField
                    select
                    label="Scan"
                    size="small"
                    value={scanFilter}
                    onChange={(event) => {
                      setPage(0);
                      setScanFilter(event.target.value);
                    }}
                    sx={{ minWidth: 220 }}
                  >
                    <MenuItem value="all">All Scans</MenuItem>
                    {scanOptions.map((scan) => (
                      <MenuItem key={scan.id} value={String(scan.id)}>
                        #{scan.id} — {scan.name}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    size="small"
                    placeholder="Search MAC / SSID / manufacturer"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    sx={{ minWidth: { xs: "100%", md: 320 } }}
                  />
                </Stack>
              </Stack>

              <TablePagination
                component="div"
                count={total}
                page={page}
                onPageChange={(_event, nextPage) => setPage(nextPage)}
                rowsPerPage={pageSize}
                onRowsPerPageChange={(event) => {
                  setPage(0);
                  setPageSize(Number(event.target.value));
                }}
                rowsPerPageOptions={PAGE_SIZE_OPTIONS}
                labelRowsPerPage="Rows per page"
                sx={{ borderBottom: "1px solid", borderColor: "divider" }}
              />

              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" data-wgip-no-pagination="true">
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>Manufacturer</TableCell>
                      <TableCell>Identifier</TableCell>
                      <TableCell>Linked BSSID</TableCell>
                      <TableCell>Relationship / Detail</TableCell>
                      <TableCell>Scan</TableCell>
                      <TableCell align="right">Channel</TableCell>
                      <TableCell align="right">Signal</TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell>Source</TableCell>
                      <TableCell>Time</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Chip
                            size="small"
                            label={row.type}
                            color={row.typeKey === "wifi" ? "primary" : "secondary"}
                            variant="outlined"
                            sx={{ fontWeight: 700 }}
                          />
                        </TableCell>

                        <TableCell>{row.name || "—"}</TableCell>
                        <TableCell>{row.manufacturer}</TableCell>

                        <TableCell>
                          <Typography variant="body2" color="primary" fontWeight={700}>
                            {row.identifier}
                          </Typography>
                        </TableCell>

                        <TableCell>{row.linkedBssid}</TableCell>
                        <TableCell>{row.relationship}</TableCell>
                        <TableCell>{row.scanId === "—" ? "—" : `#${row.scanId}`}</TableCell>
                        <TableCell align="right">{row.channel}</TableCell>
                        <TableCell align="right">{row.signal}</TableCell>
                        <TableCell>{formatCoordinate(row.latitude, row.longitude)}</TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            label={row.coordinateSource}
                            variant="outlined"
                            sx={{ fontWeight: 700 }}
                          />
                        </TableCell>

                        <TableCell>{formatDateTime(row.timestamp)}</TableCell>

                        <TableCell align="right">
                          <Button
                            component={RouterLink}
                            to={row.actionPath}
                            variant="contained"
                            size="small"
                            startIcon={<VisibilityIcon fontSize="small" />}
                            sx={{ fontWeight: 800, whiteSpace: "nowrap" }}
                          >
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}

                    {rows.length === 0 && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={13}>
                          <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                            No processed observation records found.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>

              <Typography variant="caption" color="text.secondary">
                Showing {formatNumber(firstVisible)}-{formatNumber(lastVisible)} of{" "}
                {formatNumber(total)} matching records. Only the current page is rendered.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
