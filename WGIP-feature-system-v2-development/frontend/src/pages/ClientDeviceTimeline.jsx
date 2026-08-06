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
  Grid,
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
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RefreshIcon from "@mui/icons-material/Refresh";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DevicesIcon from "@mui/icons-material/Devices";
import WifiIcon from "@mui/icons-material/Wifi";
import PlaceIcon from "@mui/icons-material/Place";
import TimelineIcon from "@mui/icons-material/Timeline";
import {
  UNKNOWN_MANUFACTURER,
  getManufacturer,
} from "../utils/wgipDisplay";

const API_BASE_URL = "http://127.0.0.1:8000";

export default function ClientDeviceTimeline() {
  const params = useParams();

  const clientMac = params.mac || params.clientMac || "";

  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const encodedClientMac = useMemo(() => {
    if (!clientMac) {
      return "";
    }

    return encodeURIComponent(clientMac);
  }, [clientMac]);

  const formatNumber = (value) => {
    if (value === null || value === undefined) {
      return "0";
    }

    return Number(value).toLocaleString();
  };

  const formatDateTime = (value) => {
    if (!value) {
      return "—";
    }

    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  const formatCoordinate = (lat, lon) => {
    if (lat === null || lat === undefined || lon === null || lon === undefined) {
      return "No GPS";
    }

    const numericLat = Number(lat);
    const numericLon = Number(lon);

    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLon)) {
      return "No GPS";
    }

    if (numericLat === 0 && numericLon === 0) {
      return "No GPS";
    }

    return `${numericLat.toFixed(6)}, ${numericLon.toFixed(6)}`;
  };

  const uniqueScanCount = useMemo(() => {
    const values = new Set();

    records.forEach((item) => {
      if (item.import_batch_id !== null && item.import_batch_id !== undefined) {
        values.add(item.import_batch_id);
      }
    });

    return values.size;
  }, [records]);

  const uniqueBssidCount = useMemo(() => {
    const values = new Set();

    records.forEach((item) => {
      if (item.bssid) {
        values.add(String(item.bssid).toLowerCase());
      }
    });

    return values.size;
  }, [records]);

  const uniqueLocationCount = useMemo(() => {
    const values = new Set();

    records.forEach((item) => {
      const lat = Number(item.latitude);
      const lon = Number(item.longitude);

      if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
        values.add(`${lat.toFixed(6)},${lon.toFixed(6)}`);
      }
    });

    return values.size;
  }, [records]);

  const manufacturer = useMemo(() => {
    const found = records
      .map((item) => getManufacturer(item))
      .find((value) => value !== UNKNOWN_MANUFACTURER);

    return found || getManufacturer(summary || {});
  }, [records, summary]);

  const firstSeen = useMemo(() => {
    const validDates = records
      .map((item) => item.timestamp)
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((a, b) => a - b);

    return validDates[0] || null;
  }, [records]);

  const lastSeen = useMemo(() => {
    const validDates = records
      .map((item) => item.timestamp)
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((a, b) => b - a);

    return validDates[0] || null;
  }, [records]);

  const linkedNetworks = useMemo(() => {
    const grouped = new Map();

    records.forEach((item) => {
      const key = item.bssid || "Unlinked";

      if (!grouped.has(key)) {
        grouped.set(key, {
          bssid: item.bssid || "Unlinked",
          ssid: item.ssid || "Hidden/Unknown",
          channel: item.channel ?? "—",
          relationship_type: item.relationship_type || "observed",
          total_records: 0,
          first_seen: item.timestamp,
          last_seen: item.timestamp,
        });
      }

      const current = grouped.get(key);

      current.total_records += 1;

      if (item.timestamp) {
        if (!current.first_seen || new Date(item.timestamp) < new Date(current.first_seen)) {
          current.first_seen = item.timestamp;
        }

        if (!current.last_seen || new Date(item.timestamp) > new Date(current.last_seen)) {
          current.last_seen = item.timestamp;
        }
      }
    });

    return Array.from(grouped.values()).sort(
      (a, b) => b.total_records - a.total_records
    );
  }, [records]);

  const scanHistory = useMemo(() => {
    const grouped = new Map();

    records.forEach((item) => {
      const key = item.import_batch_id || "Unknown";

      if (!grouped.has(key)) {
        grouped.set(key, {
          import_batch_id: item.import_batch_id,
          total_records: 0,
          linked_bssids: new Set(),
          first_seen: item.timestamp,
          last_seen: item.timestamp,
        });
      }

      const current = grouped.get(key);

      current.total_records += 1;

      if (item.bssid) {
        current.linked_bssids.add(item.bssid);
      }

      if (item.timestamp) {
        if (!current.first_seen || new Date(item.timestamp) < new Date(current.first_seen)) {
          current.first_seen = item.timestamp;
        }

        if (!current.last_seen || new Date(item.timestamp) > new Date(current.last_seen)) {
          current.last_seen = item.timestamp;
        }
      }
    });

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        linked_bssid_count: item.linked_bssids.size,
      }))
      .sort((a, b) => {
        const aDate = a.first_seen ? new Date(a.first_seen).getTime() : 0;
        const bDate = b.first_seen ? new Date(b.first_seen).getTime() : 0;

        return aDate - bDate;
      });
  }, [records]);

  const handleExportPdf = () => {
    if (!encodedClientMac) {
      return;
    }

    window.open(`${API_BASE_URL}/device-reports/${encodedClientMac}/pdf`, "_blank");
  };

  const loadTimeline = async () => {
    if (!encodedClientMac) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/client-observations/timeline/${encodedClientMac}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail || `Failed to load device timeline. Status: ${response.status}`
        );
      }

      if (Array.isArray(data)) {
        setRecords(data);
        setSummary(null);
        return;
      }

      const timelineRecords = data.records || data.timeline || [];

      setRecords(Array.isArray(timelineRecords) ? timelineRecords : []);
      setSummary(data);
    } catch (err) {
      setError(err.message || "Failed to load device timeline.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encodedClientMac]);

  return (
    <Box>
      <Stack spacing={3}>
        <Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
            <Button
              component={RouterLink}
              to="/devices"
              startIcon={<ArrowBackIcon />}
              variant="outlined"
            >
              Back to Tracked Devices
            </Button>
          </Stack>

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            sx={{ alignItems: { xs: "flex-start", md: "center" } }}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="h4" fontWeight={800}>
                Device Timeline History
              </Typography>

              <Typography variant="body1" color="text.secondary" sx={{ mt: 0.8 }}>
                Review where this observed device appeared across imported scan records.
                This does not identify the device owner.
              </Typography>
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button
                variant="outlined"
                color="error"
                startIcon={<PictureAsPdfIcon />}
                onClick={handleExportPdf}
                disabled={!clientMac || records.length === 0}
              >
                Export PDF
              </Button>

              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={loadTimeline}
                disabled={isLoading}
              >
                Refresh
              </Button>
            </Stack>
          </Stack>
        </Box>

        {isLoading && <LinearProgress />}

        {error && (
          <Alert severity="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <Alert severity="info">
          Device timeline records are based only on authorized imported Kismet scan data.
          These records show observed wireless activity only and do not identify device
          owners.
        </Alert>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                sx={{ alignItems: { xs: "flex-start", md: "center" } }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="h6" fontWeight={800}>
                    {clientMac || "Unknown Device"}
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Manufacturer: {manufacturer}
                  </Typography>
                </Box>

                <Chip
                  color={records.length > 0 ? "success" : "warning"}
                  label={records.length > 0 ? "Records Found" : "No Records"}
                />
              </Stack>

              <Divider />

              <Grid container spacing={2}>
                <Grid item xs={12} md={3}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                    <TimelineIcon />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Timeline Records
                      </Typography>
                      <Typography variant="h5" fontWeight={800}>
                        {formatNumber(records.length)}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>

                <Grid item xs={12} md={3}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                    <DevicesIcon />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Scan Count
                      </Typography>
                      <Typography variant="h5" fontWeight={800}>
                        {formatNumber(uniqueScanCount)}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>

                <Grid item xs={12} md={3}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                    <WifiIcon />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Linked BSSIDs
                      </Typography>
                      <Typography variant="h5" fontWeight={800}>
                        {formatNumber(uniqueBssidCount)}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>

                <Grid item xs={12} md={3}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                    <PlaceIcon />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Locations
                      </Typography>
                      <Typography variant="h5" fontWeight={800}>
                        {formatNumber(uniqueLocationCount)}
                      </Typography>
                    </Box>
                  </Stack>
                </Grid>
              </Grid>

              <Divider />

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    First Seen
                  </Typography>
                  <Typography fontWeight={700}>{formatDateTime(firstSeen)}</Typography>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="body2" color="text.secondary">
                    Last Seen
                  </Typography>
                  <Typography fontWeight={700}>{formatDateTime(lastSeen)}</Typography>
                </Grid>
              </Grid>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={800}>
                Scan History
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Imported scans where this device was observed.
              </Typography>
            </Box>

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
                  {scanHistory.map((item) => (
                    <TableRow key={item.import_batch_id || "unknown"} hover>
                      <TableCell>#{item.import_batch_id || "—"}</TableCell>
                      <TableCell align="right">{formatNumber(item.total_records)}</TableCell>
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
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}

                  {scanHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography color="text.secondary" align="center" sx={{ py: 3 }}>
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
          <CardContent>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={800}>
                Linked Wi-Fi Networks
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Wi-Fi networks or BSSIDs connected to this observed device in imported scan
                records.
              </Typography>
            </Box>

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
                  {linkedNetworks.map((item) => (
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
                        {formatNumber(item.total_records)}
                      </TableCell>
                      <TableCell>{formatDateTime(item.first_seen)}</TableCell>
                      <TableCell>{formatDateTime(item.last_seen)}</TableCell>
                    </TableRow>
                  ))}

                  {linkedNetworks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography color="text.secondary" align="center" sx={{ py: 3 }}>
                          No linked Wi-Fi network records found.
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
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={800}>
                Timeline History
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Full timeline of observed records for this device.
              </Typography>
            </Box>

            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Scan ID</TableCell>
                    <TableCell>Client MAC</TableCell>
                    <TableCell>Manufacturer</TableCell>
                    <TableCell>Linked BSSID</TableCell>
                    <TableCell>SSID</TableCell>
                    <TableCell>Relationship</TableCell>
                    <TableCell align="right">Signal</TableCell>
                    <TableCell>Location</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {records.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell>{formatDateTime(item.timestamp)}</TableCell>
                      <TableCell>#{item.import_batch_id || "—"}</TableCell>
                      <TableCell>{item.client_mac || clientMac}</TableCell>
                      <TableCell>{getManufacturer(item)}</TableCell>
                      <TableCell>{item.bssid || "Unlinked"}</TableCell>
                      <TableCell>{item.ssid || "—"}</TableCell>
                      <TableCell>{item.relationship_type || "observed"}</TableCell>
                      <TableCell align="right">{item.signal_dbm ?? "—"}</TableCell>
                      <TableCell>
                        {formatCoordinate(item.latitude, item.longitude)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {records.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9}>
                        <Typography color="text.secondary" align="center" sx={{ py: 3 }}>
                          No timeline records found for this device.
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
