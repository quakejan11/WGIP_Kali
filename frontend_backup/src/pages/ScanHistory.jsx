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
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";

const API_BASE_URL = "http://127.0.0.1:8000";

function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "0";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return numericValue.toLocaleString();
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

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

function getStatusColor(status) {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  return "warning";
}

function getScanName(item) {
  return item.manual_area_label || item.scan_name || item.name || `Kismet Import #${item.id}`;
}

function getLocationText(item) {
  if (item.manual_latitude && item.manual_longitude) {
    return `${Number(item.manual_latitude).toFixed(6)}, ${Number(
      item.manual_longitude
    ).toFixed(6)}`;
  }

  return "No GPS / no fallback";
}

function getMovementInfo(movementByScan, scanId) {
  return (
    movementByScan[String(scanId)] || {
      isLoading: false,
      error: "",
      candidateCount: 0,
      topCandidate: null,
    }
  );
}

export default function ScanHistory() {
  const [imports, setImports] = useState([]);
  const [movementByScan, setMovementByScan] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isMovementLoading, setIsMovementLoading] = useState(false);
  const [error, setError] = useState("");

  const sortedImports = useMemo(() => {
    return [...imports].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
  }, [imports]);

  async function loadMovementCandidates(importRows) {
    if (!Array.isArray(importRows) || importRows.length === 0) {
      setMovementByScan({});
      return;
    }

    setIsMovementLoading(true);

    const initialState = {};

    importRows.forEach((item) => {
      initialState[String(item.id)] = {
        isLoading: true,
        error: "",
        candidateCount: 0,
        topCandidate: null,
      };
    });

    setMovementByScan(initialState);

    try {
      const results = await Promise.all(
        importRows.map(async (item) => {
          try {
            const response = await fetch(
              `${API_BASE_URL}/wifi-movement/candidates/${item.id}?min_locations=2&min_packets=10&limit=5`
            );

            let data = {};

            try {
              data = await response.json();
            } catch {
              data = {};
            }

            if (!response.ok) {
              throw new Error(
                data?.detail ||
                  data?.message ||
                  `Movement check failed. Status: ${response.status}`
              );
            }

            const candidates = Array.isArray(data?.candidates)
              ? data.candidates
              : [];

            return {
              scanId: String(item.id),
              info: {
                isLoading: false,
                error: "",
                candidateCount: candidates.length,
                topCandidate: candidates[0] || null,
              },
            };
          } catch (err) {
            return {
              scanId: String(item.id),
              info: {
                isLoading: false,
                error: err?.message || "Unable to check movement.",
                candidateCount: 0,
                topCandidate: null,
              },
            };
          }
        })
      );

      const nextMovementByScan = {};

      results.forEach((result) => {
        nextMovementByScan[result.scanId] = result.info;
      });

      setMovementByScan(nextMovementByScan);
    } finally {
      setIsMovementLoading(false);
    }
  }

  async function loadImports() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/kismet-imports/`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.detail || `Failed to load scans. Status: ${response.status}`);
      }

      const importRows = Array.isArray(data) ? data : [];

      setImports(importRows);
      await loadMovementCandidates(importRows);
    } catch (err) {
      setError(err.message || "Failed to load imported Kismet scans.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadImports();
  }, []);

  return (
    <Box>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{
            alignItems: { xs: "flex-start", md: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography variant="h4" fontWeight={800}>
              Scan Results
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.8 }}>
              View all imported Kismet scan batches. Each imported .kismet file is treated
              as one scan result for review.
            </Typography>
          </Box>

          <Button
            variant="contained"
            size="small"
            onClick={loadImports}
            disabled={isLoading || isMovementLoading}
            sx={{ fontWeight: 700 }}
          >
            Refresh
          </Button>
        </Stack>

        {(isLoading || isMovementLoading) && <LinearProgress />}

        {error && (
          <Alert severity="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <Alert severity="info">
          These scan results are based on authorized Kismet imports. Records show observed
          wireless scan data only and do not identify device owners.
        </Alert>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6" fontWeight={800}>
                  Imported Kismet Scans
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  Movement status is checked from raw packet GPS locations when available.
                </Typography>
              </Box>

              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Scan ID</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Scan Name / File</TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell>Movement</TableCell>
                      <TableCell align="right">Wi-Fi Networks</TableCell>
                      <TableCell align="right">Observed Devices</TableCell>
                      <TableCell align="right">Raw Devices</TableCell>
                      <TableCell>Imported</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {sortedImports.map((item) => {
                      const movementInfo = getMovementInfo(movementByScan, item.id);
                      const hasMovement = movementInfo.candidateCount > 0;

                      return (
                        <TableRow key={item.id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={800}>
                              #{item.id}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <Chip
                              size="small"
                              color={getStatusColor(item.import_status)}
                              label={item.import_status || "unknown"}
                            />
                          </TableCell>

                          <TableCell>
                            <Typography fontWeight={700}>
                              {getScanName(item)}
                            </Typography>

                            <Typography variant="caption" color="text.secondary">
                              {item.original_filename || "Unknown file"}
                            </Typography>
                          </TableCell>

                          <TableCell>{getLocationText(item)}</TableCell>

                          <TableCell>
                            {movementInfo.isLoading ? (
                              <Chip
                                size="small"
                                label="Checking..."
                                variant="outlined"
                              />
                            ) : movementInfo.error ? (
                              <Chip
                                size="small"
                                label="Not checked"
                                variant="outlined"
                                color="default"
                              />
                            ) : hasMovement ? (
                              <Stack spacing={0.5}>
                                <Chip
                                  size="small"
                                  icon={<RouteOutlinedIcon />}
                                  label={`${movementInfo.candidateCount} movement candidate${
                                    movementInfo.candidateCount === 1 ? "" : "s"
                                  }`}
                                  color="success"
                                  variant="outlined"
                                  sx={{ fontWeight: 700 }}
                                />

                                {movementInfo.topCandidate && (
                                  <Typography variant="caption" color="text.secondary">
                                    Top: {movementInfo.topCandidate.bssid} ·{" "}
                                    {formatNumber(
                                      movementInfo.topCandidate.unique_packet_locations
                                    )}{" "}
                                    GPS locations
                                  </Typography>
                                )}
                              </Stack>
                            ) : (
                              <Chip
                                size="small"
                                label="No movement"
                                variant="outlined"
                                color="default"
                              />
                            )}
                          </TableCell>

                          <TableCell align="right">
                            {formatNumber(item.wifi_observation_count)}
                          </TableCell>

                          <TableCell align="right">
                            {formatNumber(item.client_observation_count)}
                          </TableCell>

                          <TableCell align="right">{formatNumber(item.device_count)}</TableCell>

                          <TableCell>{formatDateTime(item.created_at)}</TableCell>

                          <TableCell align="right">
                            <Stack
                              direction="row"
                              spacing={1}
                              sx={{
                                justifyContent: "flex-end",
                                flexWrap: "wrap",
                              }}
                            >
                              {movementInfo.topCandidate && (
                                <Button
                                  component={RouterLink}
                                  to={`/bssids/${encodeURIComponent(
                                    movementInfo.topCandidate.bssid
                                  )}`}
                                  size="small"
                                  variant="outlined"
                                  startIcon={<RouteOutlinedIcon />}
                                  sx={{ whiteSpace: "nowrap", fontWeight: 700 }}
                                >
                                  Movement
                                </Button>
                              )}

                              <Button
                                component={RouterLink}
                                to={`/scans/${item.id}`}
                                size="small"
                                variant="contained"
                                startIcon={<VisibilityIcon />}
                                sx={{ whiteSpace: "nowrap", fontWeight: 700 }}
                              >
                                View Scan
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {sortedImports.length === 0 && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={10}>
                          <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                            No imported Kismet scans yet.
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
