import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Alert,
  Chip,
  Stack,
  CircularProgress,
  IconButton,
  Divider,
  Button,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DataGrid } from "@mui/x-data-grid";

import api from "../services/api";

const historyColumns = [
  { field: "id", headerName: "Detection ID", width: 120 },
  { field: "survey_id", headerName: "Survey ID", width: 110 },
  { field: "ssid", headerName: "SSID", width: 170 },
  { field: "area_label_display", headerName: "Resolved Area", width: 280 },
  { field: "rssi_display", headerName: "RSSI", width: 100 },
  { field: "channel", headerName: "CH", width: 80 },
  { field: "encryption", headerName: "Security", width: 130 },
  { field: "latitude_display", headerName: "Latitude", width: 130 },
  { field: "longitude_display", headerName: "Longitude", width: 140 },
  { field: "timestamp_display", headerName: "Timestamp", width: 220 },
];

function DetailItem({ label, value }) {
  return (
    <Box>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontSize: 11,
        }}
      >
        {label}
      </Typography>

      <Typography sx={{ mt: 0.5, fontWeight: 700, wordBreak: "break-word" }}>
        {value || "—"}
      </Typography>
    </Box>
  );
}

export default function BssidDossier() {
  const params = useParams();
  const bssid = decodeURIComponent(params.bssid || "");

  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDossier() {
    try {
      setLoading(true);
      setError("");

      const [summaryResponse, historyResponse] = await Promise.all([
        api.get("/analytics/bssid-summary"),
        api.get(`/analytics/bssid-history?bssid=${encodeURIComponent(bssid)}`),
      ]);

      const matchedSummary = summaryResponse.data.find(
        (item) => item.bssid === bssid
      );

      if (!matchedSummary) {
        setError("BSSID not found in analytics summary.");
        setSummary(null);
        setHistoryRows([]);
        return;
      }

      setSummary({
        ...matchedSummary,
        first_area_label: matchedSummary.first_area_label || "Unresolved",
        last_area_label: matchedSummary.last_area_label || "Unresolved",
        latest_area_label: matchedSummary.latest_area_label || "Unresolved",
        first_seen_display: matchedSummary.first_seen
          ? new Date(matchedSummary.first_seen).toLocaleString()
          : "",
        last_seen_display: matchedSummary.last_seen
          ? new Date(matchedSummary.last_seen).toLocaleString()
          : "",
      });

      const formattedHistory = historyResponse.data.map((item) => ({
        ...item,
        area_label_display: item.area_label || "Unresolved",
        rssi_display:
          item.rssi !== null && item.rssi !== undefined
            ? `${item.rssi} dBm`
            : "",
        latitude_display:
          item.latitude !== null && item.latitude !== undefined
            ? Number(item.latitude).toFixed(5)
            : "",
        longitude_display:
          item.longitude !== null && item.longitude !== undefined
            ? Number(item.longitude).toFixed(5)
            : "",
        timestamp_display: item.timestamp
          ? new Date(item.timestamp).toLocaleString()
          : "",
      }));

      setHistoryRows(formattedHistory);
    } catch (err) {
      console.error(err);
      setError("Unable to load BSSID profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDossier();
  }, [bssid]);

  const hasMovement = summary?.locations_seen > 1;

  const movementLabel = hasMovement
    ? "Multiple locations observed"
    : "Single known location";

  const summaryText = hasMovement
    ? `This BSSID was detected across ${summary?.locations_seen} resolved locations. First resolved area: ${summary?.first_area_label}. Latest resolved area: ${summary?.last_area_label}.`
    : `This BSSID has been observed in one resolved location: ${summary?.latest_area_label}. No location change is currently indicated by the available records.`;

  const latestCoordinates =
    summary?.latest_latitude !== null &&
    summary?.latest_latitude !== undefined &&
    summary?.latest_longitude !== null &&
    summary?.latest_longitude !== undefined
      ? `${Number(summary.latest_latitude).toFixed(5)}, ${Number(
          summary.latest_longitude
        ).toFixed(5)}`
      : "—";

  const placesObserved = useMemo(() => {
    const uniquePlaces = new Set();

    historyRows.forEach((item) => {
      if (item.area_label_display && item.area_label_display !== "Unresolved") {
        uniquePlaces.add(item.area_label_display);
      }
    });

    return Array.from(uniquePlaces);
  }, [historyRows]);

  const recentHistoryRows = useMemo(() => {
    return [...historyRows]
      .sort((a, b) => {
        const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 10);
  }, [historyRows]);

  const printHistoryRows = useMemo(() => {
    return [...historyRows]
      .sort((a, b) => {
        const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 25);
  }, [historyRows]);

  function handlePrint() {
    window.print();
  }

  const generatedAt = new Date().toLocaleString();

  return (
    <Box>
      <Box className="screen-only">
        <Stack direction="row" sx={{ alignItems: "center" }} spacing={1.5} sx={{ mb: 3 }}>
          <IconButton
            size="small"
            onClick={() => navigate("/bssid-history")}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              backgroundColor: "background.paper",
            }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>

          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h4" gutterBottom>
              BSSID Profile
            </Typography>

            <Typography color="text.secondary">
              Detection history and movement summary for a tracked wireless
              identity.
            </Typography>
          </Box>

          <Button variant="outlined" onClick={handlePrint}>
            Print / Save PDF
          </Button>

          <IconButton
            size="small"
            onClick={loadDossier}
            disabled={loading}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              backgroundColor: "background.paper",
              width: 32,
              height: 32,
            }}
          >
            {loading ? (
              <CircularProgress size={16} />
            ) : (
              <RefreshIcon fontSize="small" />
            )}
          </IconButton>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={24} />
            <Typography>Loading BSSID profile...</Typography>
          </Box>
        ) : (
          summary && (
            <>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 3,
                  mb: 3,
                }}
              >
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  justifyContent="space-between"
                  sx={{ alignItems: { xs: "flex-start", md: "center" } }}
                  spacing={2}
                >
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Tracking Key
                    </Typography>

                    <Typography variant="h5" sx={{ fontWeight: 800 }}>
                      {bssid}
                    </Typography>

                    <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                      Latest SSID: {summary.latest_ssid || "Unknown"}
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip
                      label={movementLabel}
                      color={hasMovement ? "primary" : "default"}
                    />

                    <Chip
                      label={`${summary.total_detections} detections`}
                      variant="outlined"
                    />

                    <Chip
                      label={`Security: ${
                        summary.latest_encryption || "Unknown"
                      }`}
                      variant="outlined"
                    />
                  </Stack>
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 3,
                  mb: 3,
                  backgroundColor: hasMovement
                    ? "primary.light"
                    : "background.paper",
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Summary
                </Typography>

                <Typography
                  sx={{
                    color: hasMovement ? "primary.dark" : "text.primary",
                    fontWeight: 600,
                  }}
                >
                  {summaryText}
                </Typography>

                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  Detection window: {summary.first_seen_display || "—"} to{" "}
                  {summary.last_seen_display || "—"}.
                </Typography>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 3,
                  mb: 3,
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Places Observed
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  All unique resolved locations associated with this BSSID.
                </Typography>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {placesObserved.length > 0 ? (
                    placesObserved.map((place) => (
                      <Chip key={place} label={place} color="primary" />
                    ))
                  ) : (
                    <Chip label="No resolved places available" />
                  )}
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 3,
                  mb: 3,
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Key Details
                </Typography>

                <Divider sx={{ mb: 3 }} />

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "1fr 1fr",
                      md: "repeat(3, 1fr)",
                    },
                    gap: 3,
                  }}
                >
                  <DetailItem
                    label="Total Detections"
                    value={summary.total_detections}
                  />

                  <DetailItem
                    label="Locations Seen"
                    value={summary.locations_seen}
                  />

                  <DetailItem
                    label="Latest Area"
                    value={summary.latest_area_label}
                  />

                  <DetailItem
                    label="First Seen"
                    value={summary.first_seen_display}
                  />

                  <DetailItem
                    label="Last Seen"
                    value={summary.last_seen_display}
                  />

                  <DetailItem
                    label="Latest Coordinates"
                    value={latestCoordinates}
                  />
                </Box>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Recent Detections
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  Showing the latest {recentHistoryRows.length} of{" "}
                  {historyRows.length} detection records. Full history remains
                  stored in the database.
                </Typography>

                <Box sx={{ width: "100%", overflowX: "auto" }}>
                  <Box sx={{ height: 500, minWidth: 1500 }}>
                    <DataGrid
                      rows={recentHistoryRows}
                      columns={historyColumns}
                      density="compact"
                      pageSizeOptions={[10, 25, 50]}
                      initialState={{
                        pagination: {
                          paginationModel: {
                            pageSize: 10,
                            page: 0,
                          },
                        },
                      }}
                      disableRowSelectionOnClick
                      sx={{
                        border: "none",
                        "& .MuiDataGrid-columnHeaders": {
                          backgroundColor: "background.default",
                        },
                        "& .MuiDataGrid-cell": {
                          fontSize: 13,
                        },
                        "& .MuiDataGrid-columnHeaderTitle": {
                          fontSize: 13,
                          fontWeight: 700,
                        },
                      }}
                    />
                  </Box>
                </Box>
              </Paper>
            </>
          )
        )}
      </Box>

      {summary && (
        <Box className="print-only report-document">
          <div className="report-header">
            <div>
              <h1>BSSID Profile</h1>
              <p>Wireless Geospatial Intelligence Platform</p>
            </div>

            <div className="report-meta">
              <div>Generated: {generatedAt}</div>
              <div>Report Type: BSSID Detection Profile</div>
            </div>
          </div>

          <section className="report-section">
            <h2>Tracking Identity</h2>

            <table className="report-info-table">
              <tbody>
                <tr>
                  <th>BSSID</th>
                  <td>{bssid}</td>
                </tr>
                <tr>
                  <th>Latest SSID</th>
                  <td>{summary.latest_ssid || "Unknown"}</td>
                </tr>
                <tr>
                  <th>Security</th>
                  <td>{summary.latest_encryption || "Unknown"}</td>
                </tr>
                <tr>
                  <th>Movement Signal</th>
                  <td>{movementLabel}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="report-section">
            <h2>Summary</h2>

            <p>{summaryText}</p>

            <p>
              Detection window:{" "}
              <strong>{summary.first_seen_display || "—"}</strong> to{" "}
              <strong>{summary.last_seen_display || "—"}</strong>.
            </p>
          </section>

          <section className="report-section">
            <h2>Key Details</h2>

            <table className="report-info-table">
              <tbody>
                <tr>
                  <th>Total Detections</th>
                  <td>{summary.total_detections}</td>
                </tr>
                <tr>
                  <th>Locations Seen</th>
                  <td>{summary.locations_seen}</td>
                </tr>
                <tr>
                  <th>Latest Area</th>
                  <td>{summary.latest_area_label}</td>
                </tr>
                <tr>
                  <th>Latest Coordinates</th>
                  <td>{latestCoordinates}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="report-section">
            <h2>Places Observed</h2>

            {placesObserved.length > 0 ? (
              <ul className="report-list">
                {placesObserved.map((place) => (
                  <li key={place}>{place}</li>
                ))}
              </ul>
            ) : (
              <p>No resolved places available.</p>
            )}
          </section>

          <section className="report-section">
            <h2>Recent Detection Timeline</h2>

            <p>
              Showing the latest {printHistoryRows.length} of{" "}
              {historyRows.length} detection records. Full detection history
              remains available in the WGIP database.
            </p>

            <table className="report-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>SSID</th>
                  <th>Resolved Area</th>
                  <th>RSSI</th>
                  <th>CH</th>
                  <th>Security</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th>Timestamp</th>
                </tr>
              </thead>

              <tbody>
                {printHistoryRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.ssid || "—"}</td>
                    <td>{row.area_label_display}</td>
                    <td>{row.rssi_display || "—"}</td>
                    <td>
                      {row.channel !== null && row.channel !== undefined
                        ? row.channel
                        : "—"}
                    </td>
                    <td>{row.encryption || "—"}</td>
                    <td>{row.latitude_display || "—"}</td>
                    <td>{row.longitude_display || "—"}</td>
                    <td>{row.timestamp_display || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="report-footer">
            Generated by WGIP. Data is based on imported wireless observation
            records.
          </div>
        </Box>
      )}
    </Box>
  );
}