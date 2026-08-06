import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import EditIcon from "@mui/icons-material/Edit";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import TimelineIcon from "@mui/icons-material/Timeline";
import RouterIcon from "@mui/icons-material/Router";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import WifiIcon from "@mui/icons-material/Wifi";

import L from "leaflet";

import {
  getDeviceLinkAnalysis,
  updateDeviceProfile,
} from "../api/wgipClientApi";

import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

function formatDate(value) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";

  return value;
}

function hasCoordinates(item) {
  return (
    item?.latitude !== null &&
    item?.latitude !== undefined &&
    item?.longitude !== null &&
    item?.longitude !== undefined
  );
}

function getMapPoints(movementPath) {
  return (movementPath || [])
    .filter(hasCoordinates)
    .map((item) => ({
      ...item,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
    }));
}

function getMovementText(movementPath) {
  if (!movementPath || movementPath.length === 0) {
    return "No movement history yet.";
  }

  return movementPath
    .map((item) => item.label || item.scan_name || item.coordinate_label)
    .filter(Boolean)
    .join(" → ");
}

function createNumberedMarkerIcon(sequence) {
  return L.divIcon({
    className: "wgip-numbered-marker",
    html: `
      <div style="
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: #D32F2F;
        color: white;
        border: 3px solid white;
        box-shadow: 0 3px 10px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 900;
      ">
        ${sequence}
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

function FitMapToMovement({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;

    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 15);
      return;
    }

    const bounds = L.latLngBounds(
      points.map((point) => [point.latitude, point.longitude])
    );

    map.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom: 16,
    });
  }, [map, points]);

  return null;
}

function MiniStatCard({ title, value, subtitle }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 4,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography color="text.secondary" fontWeight={700}>
        {title}
      </Typography>

      <Typography variant="h5" fontWeight={900}>
        {value}
      </Typography>

      {subtitle && (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </Paper>
  );
}

export default function DeviceLinkAnalysis() {
  const { clientMac } = useParams();

  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [editingName, setEditingName] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  async function loadAnalysis() {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const data = await getDeviceLinkAnalysis(clientMac);

      setAnalysis(data);
      setDisplayNameInput(
        data?.profile?.display_name || data?.display_name || clientMac
      );
      setNotesInput(data?.profile?.notes || "");
    } catch (error) {
      setAnalysis(null);
      setErrorMessage(
        error?.response?.data?.detail ||
          error?.message ||
          "Failed to load device link analysis."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await updateDeviceProfile(clientMac, {
        display_name: displayNameInput,
        notes: notesInput,
      });

      setSuccessMessage("Device name updated.");
      setEditingName(false);
      await loadAnalysis();
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.detail ||
          error?.message ||
          "Failed to update device name."
      );
    } finally {
      setSavingProfile(false);
    }
  }

  function handleCancelEdit() {
    setEditingName(false);
    setDisplayNameInput(
      analysis?.profile?.display_name || analysis?.display_name || clientMac
    );
    setNotesInput(analysis?.profile?.notes || "");
  }

  useEffect(() => {
    loadAnalysis();
  }, [clientMac]);

  const movementPath = analysis?.movement_path || [];
  const locationHistory = analysis?.location_history || [];
  const wifiHistory = analysis?.wifi_history || [];
  const timeline = analysis?.timeline || [];
  const summary = analysis?.summary || {};

  const mapPoints = useMemo(() => {
    return getMapPoints(movementPath);
  }, [movementPath]);

  const mapCenter = useMemo(() => {
    if (mapPoints.length === 0) {
      return [14.5995, 120.9842];
    }

    return [mapPoints[0].latitude, mapPoints[0].longitude];
  }, [mapPoints]);

  const linePoints = useMemo(() => {
    return mapPoints.map((item) => [item.latitude, item.longitude]);
  }, [mapPoints]);

  const displayName = analysis?.display_name || clientMac;
  const movementText = getMovementText(movementPath);

  return (
    <Container maxWidth="xl" sx={{ py: 1 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h3" fontWeight={900} sx={{ mb: 1 }}>
          Device Link Analysis
        </Typography>

        <Typography variant="h6" color="text.secondary" fontWeight={400}>
          Visual view of where this device was observed across scan locations.
        </Typography>

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ xs: "flex-start", md: "center" }}
          sx={{ mt: 2 }}
        >
          <Chip
            label={displayName}
            sx={{
              fontWeight: 900,
              fontSize: 15,
              height: 36,
              borderRadius: 999,
              px: 1,
            }}
          />

          <Chip
            label={`Raw ID: ${clientMac}`}
            variant="outlined"
            sx={{
              fontFamily: "monospace",
              fontWeight: 700,
              height: 36,
              borderRadius: 999,
            }}
          />

          <Button
            onClick={loadAnalysis}
            disabled={loading}
            startIcon={<RefreshIcon />}
            variant="outlined"
            sx={{ borderRadius: 999, height: 40 }}
          >
            Refresh
          </Button>

          <Button
            component={Link}
            to={`/clients/${encodeURIComponent(clientMac)}/timeline`}
            startIcon={<TimelineIcon />}
            variant="outlined"
            sx={{ borderRadius: 999, height: 40 }}
          >
            Timeline
          </Button>
        </Stack>
      </Box>

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
          {errorMessage}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: 3 }}>
          {successMessage}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
          <CircularProgress />
        </Stack>
      ) : analysis ? (
        <>
          <Alert severity="info" sx={{ mb: 3, borderRadius: 3 }}>
            {analysis.plain_language_note ||
              "This page shows where the device was observed in imported scan data. It does not identify the owner of the device."}
          </Alert>

          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 3,
              borderRadius: 4,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", md: "flex-start" }}
              justifyContent="space-between"
            >
              <Box sx={{ flex: 1 }}>
                <Typography color="text.secondary" fontWeight={700}>
                  Device Name
                </Typography>

                {editingName ? (
                  <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField
                      label="Display Name"
                      value={displayNameInput}
                      onChange={(event) =>
                        setDisplayNameInput(event.target.value)
                      }
                      placeholder="Example: CP1"
                      fullWidth
                    />

                    <TextField
                      label="Notes"
                      value={notesInput}
                      onChange={(event) => setNotesInput(event.target.value)}
                      placeholder="Optional notes for this device"
                      fullWidth
                      multiline
                      minRows={2}
                    />

                    <Stack direction="row" spacing={1}>
                      <Button
                        onClick={handleSaveProfile}
                        disabled={savingProfile}
                        variant="contained"
                        startIcon={<SaveIcon />}
                      >
                        Save
                      </Button>

                      <Button
                        onClick={handleCancelEdit}
                        disabled={savingProfile}
                        variant="outlined"
                        startIcon={<CloseIcon />}
                      >
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                ) : (
                  <>
                    <Typography variant="h4" fontWeight={900}>
                      {displayName}
                    </Typography>

                    <Typography fontFamily="monospace" color="text.secondary">
                      {clientMac}
                    </Typography>

                    {analysis.profile?.notes && (
                      <Typography sx={{ mt: 1 }}>
                        {analysis.profile.notes}
                      </Typography>
                    )}
                  </>
                )}
              </Box>

              {!editingName && (
                <Button
                  onClick={() => setEditingName(true)}
                  variant="outlined"
                  startIcon={<EditIcon />}
                  sx={{ borderRadius: 999 }}
                >
                  Edit Device Name
                </Button>
              )}
            </Stack>
          </Paper>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(4, 1fr)",
              },
              gap: 2,
              mb: 3,
            }}
          >
            <MiniStatCard
              title="Total Records"
              value={summary.total_observations || 0}
              subtitle="Observation records"
            />

            <MiniStatCard
              title="Scan Count"
              value={summary.scan_count || 0}
              subtitle="Scans where seen"
            />

            <MiniStatCard
              title="Location Count"
              value={summary.location_count || 0}
              subtitle="Places recorded"
            />

            <MiniStatCard
              title="Wi-Fi / BSSID"
              value={`${summary.wifi_count || 0} / ${summary.bssid_count || 0}`}
              subtitle="Wi-Fi names / BSSIDs"
            />
          </Box>

          <Paper
            elevation={0}
            sx={{
              mb: 3,
              borderRadius: 4,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                p: 2.5,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <TravelExploreIcon color="primary" />

                <Box>
                  <Typography variant="h6" fontWeight={900}>
                    Observed Movement
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    {movementText}
                  </Typography>
                </Box>
              </Stack>
            </Box>

            {mapPoints.length === 0 ? (
              <Alert severity="info" sx={{ m: 2.5, borderRadius: 3 }}>
                No map coordinates recorded for this device yet. Location
                history is still shown below if scan locations are available.
              </Alert>
            ) : (
              <Box
                sx={{
                  height: 380,
                  width: "100%",
                }}
              >
                <MapContainer
                  center={mapCenter}
                  zoom={13}
                  style={{
                    height: "100%",
                    width: "100%",
                  }}
                >
                  <FitMapToMovement points={mapPoints} />

                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  {linePoints.length >= 2 && (
                    <Polyline
                      positions={linePoints}
                      pathOptions={{
                        color: "#D32F2F",
                        weight: 5,
                        opacity: 0.9,
                      }}
                    />
                  )}

                  {mapPoints.map((point) => (
                    <Marker
                      key={`${point.sequence}-${point.latitude}-${point.longitude}`}
                      position={[point.latitude, point.longitude]}
                      icon={createNumberedMarkerIcon(point.sequence)}
                    >
                      <Popup>
                        <strong>
                          {point.sequence}. {point.label || "Location"}
                        </strong>
                        <br />
                        Scan: {point.scan_name}
                        <br />
                        First seen: {formatDate(point.first_seen)}
                        <br />
                        Last seen: {formatDate(point.last_seen)}
                        <br />
                        Coordinates: {point.coordinate_label}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </Box>
            )}
          </Paper>

          <Paper
            elevation={0}
            sx={{
              mb: 3,
              borderRadius: 4,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                p: 2.5,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography variant="h6" fontWeight={900}>
                Location History
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Places where this device was observed.
              </Typography>
            </Box>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Location</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Scan</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>First Seen</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Last Seen</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Wi-Fi Seen</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Records</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {locationHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography color="text.secondary" sx={{ py: 3 }}>
                          No location history found.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    locationHistory.map((item) => (
                      <TableRow key={`${item.sequence}-${item.survey_id}`} hover>
                        <TableCell>
                          <Chip
                            label={item.sequence}
                            size="small"
                            sx={{
                              fontWeight: 900,
                              minWidth: 32,
                            }}
                          />
                        </TableCell>

                        <TableCell>
                          <Typography fontWeight={800}>
                            {item.location}
                          </Typography>

                          <Typography variant="body2" color="text.secondary">
                            {item.coordinate_label}
                          </Typography>
                        </TableCell>

                        <TableCell>{item.scan_name}</TableCell>

                        <TableCell>{formatDate(item.first_seen)}</TableCell>

                        <TableCell>{formatDate(item.last_seen)}</TableCell>

                        <TableCell>
                          {(item.wifi_seen || []).slice(0, 3).map((wifi) => (
                            <Chip
                              key={wifi}
                              label={wifi}
                              size="small"
                              icon={<WifiIcon />}
                              sx={{ mr: 0.5, mb: 0.5 }}
                            />
                          ))}
                        </TableCell>

                        <TableCell>{item.observation_count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              mb: 3,
              borderRadius: 4,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                p: 2.5,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography variant="h6" fontWeight={900}>
                Wi-Fi / BSSID History
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Wi-Fi networks and BSSIDs where this device was observed.
              </Typography>
            </Box>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>Wi-Fi</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>BSSID</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>First Seen</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Last Seen</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Records</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Last Signal</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>
                      Action
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {wifiHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography color="text.secondary" sx={{ py: 3 }}>
                          No Wi-Fi/BSSID history found.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    wifiHistory.map((item) => (
                      <TableRow key={`${item.ssid}-${item.bssid}`} hover>
                        <TableCell>
                          <Typography fontWeight={800}>
                            {item.ssid || "Hidden/Unknown"}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Typography fontFamily="monospace">
                            {item.bssid}
                          </Typography>
                        </TableCell>

                        <TableCell>{formatDate(item.first_seen)}</TableCell>

                        <TableCell>{formatDate(item.last_seen)}</TableCell>

                        <TableCell>{item.observation_count}</TableCell>

                        <TableCell>
                          {item.last_signal_dbm !== null &&
                          item.last_signal_dbm !== undefined
                            ? `${item.last_signal_dbm} dBm`
                            : "—"}
                        </TableCell>

                        <TableCell align="right">
                          {item.bssid ? (
                            <Button
                              component={Link}
                              to={`/bssids/${encodeURIComponent(item.bssid)}`}
                              size="small"
                              variant="outlined"
                              startIcon={<RouterIcon />}
                            >
                              BSSID
                            </Button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              borderRadius: 4,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                p: 2.5,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <TimelineIcon color="primary" />

                <Box>
                  <Typography variant="h6" fontWeight={900}>
                    Timeline History
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Time-based list of observations for this device.
                  </Typography>
                </Box>
              </Stack>
            </Box>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>Time</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Location</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Scan</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Wi-Fi</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>BSSID</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Signal</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Source</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {timeline.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography color="text.secondary" sx={{ py: 3 }}>
                          No timeline records found.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    timeline.map((item) => (
                      <TableRow key={item.observation_id} hover>
                        <TableCell>{formatDate(item.timestamp)}</TableCell>

                        <TableCell>
                          <Typography fontWeight={700}>
                            {item.scan_location}
                          </Typography>

                          <Typography variant="body2" color="text.secondary">
                            {item.coordinate_label}
                          </Typography>
                        </TableCell>

                        <TableCell>{item.scan_name}</TableCell>

                        <TableCell>{formatValue(item.ssid)}</TableCell>

                        <TableCell>
                          <Typography fontFamily="monospace">
                            {formatValue(item.bssid)}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          {item.signal_dbm !== null && item.signal_dbm !== undefined
                            ? `${item.signal_dbm} dBm`
                            : "—"}
                        </TableCell>

                        <TableCell>{formatValue(item.source)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      ) : null}
    </Container>
  );
}