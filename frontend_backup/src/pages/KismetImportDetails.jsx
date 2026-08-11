import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link as RouterLink,
  useParams,
} from "react-router-dom";
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
import WifiIcon from "@mui/icons-material/Wifi";
import DevicesIcon from "@mui/icons-material/Devices";
import StorageIcon from "@mui/icons-material/Storage";
import UploadFileIcon from "@mui/icons-material/UploadFile";

import ScanReviewItemsCard from "../components/movement/MovementCandidatesCard";
import ScanWifiDeviceLinks from "../components/scan/ScanWifiDeviceLinks";
import { getManufacturer } from "../utils/wgipDisplay";

const API_BASE_URL =
  "http://127.0.0.1:8000";

export default function KismetImportDetails() {
  const { importBatchId } = useParams();

  const [summary, setSummary] =
    useState(null);

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const batch = summary?.batch || {};
  const stats = summary?.stats || {};

  const wifiObservations =
    summary?.wifi_observations || [];

  const clientObservations =
    summary?.client_observations || [];

  const rawBreakdown =
    summary?.raw_device_type_breakdown ||
    [];

  const rawPreview =
    summary?.raw_device_preview || [];

  const topWifiRows = useMemo(
    () => wifiObservations.slice(0, 50),
    [wifiObservations]
  );

  const topClientRows = useMemo(
    () =>
      clientObservations.slice(0, 80),
    [clientObservations]
  );

  const timelineRows = useMemo(() => {
    const wifiTimeline =
      wifiObservations.map((item) => ({
        id: `wifi-${item.id}`,
        type: "Wi-Fi Network",
        name:
          item.ssid ||
          "Hidden/Unknown",
        manufacturer: getManufacturer(item),
        identifier:
          item.bssid || "—",
        timestamp:
          item.timestamp ||
          item.created_at,
        signal:
          item.signal_dbm ??
          item.rssi ??
          "—",
        relationship:
          "network observed",
      }));

    const clientTimeline =
      clientObservations.map((item) => ({
        id: `client-${item.id}`,
        type: "Observed Device",
        name: "Observed Device",
        manufacturer: getManufacturer(item),
        identifier:
          item.client_mac || "—",
        timestamp: item.timestamp,
        signal:
          item.signal_dbm ?? "—",
        relationship:
          item.relationship_type ||
          "observed",
      }));

    return [
      ...wifiTimeline,
      ...clientTimeline,
    ]
      .filter((item) => item.timestamp)
      .sort(
        (a, b) =>
          new Date(a.timestamp) -
          new Date(b.timestamp)
      )
      .slice(0, 80);
  }, [
    wifiObservations,
    clientObservations,
  ]);

  const formatNumber = (value) => {
    if (
      value === null ||
      value === undefined
    ) {
      return "0";
    }

    return Number(
      value
    ).toLocaleString();
  };

  const formatDateTime = (value) => {
    if (!value) {
      return "—";
    }

    try {
      return new Date(
        value
      ).toLocaleString();
    } catch {
      return value;
    }
  };

  const formatCoordinate = (
    lat,
    lon
  ) => {
    if (
      lat === null ||
      lat === undefined ||
      lon === null ||
      lon === undefined
    ) {
      return "No GPS";
    }

    const numericLat = Number(lat);
    const numericLon = Number(lon);

    if (
      !Number.isFinite(numericLat) ||
      !Number.isFinite(numericLon)
    ) {
      return "No GPS";
    }

    if (
      numericLat === 0 &&
      numericLon === 0
    ) {
      return "No GPS";
    }

    return `${numericLat.toFixed(
      6
    )}, ${numericLon.toFixed(6)}`;
  };

  const getStatusColor = (status) => {
    if (status === "completed") {
      return "success";
    }

    if (status === "failed") {
      return "error";
    }

    return "warning";
  };

  const handleExportPdf = () => {
    if (!importBatchId) {
      return;
    }

    window.open(
      `${API_BASE_URL}/scan-reports/${importBatchId}/pdf`,
      "_blank"
    );
  };

  const loadSummary = async () => {
    if (!importBatchId) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/kismet-imports/${importBatchId}/processed-summary`
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            `Failed to load scan result. Status: ${response.status}`
        );
      }

      setSummary(data);
    } catch (err) {
      setError(
        err.message ||
          "Failed to load scan result."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importBatchId]);

  return (
    <Box>
      <Stack spacing={3}>
        <Box>
          <Stack
            direction={{
              xs: "column",
              sm: "row",
            }}
            spacing={1.5}
            sx={{ mb: 2 }}
          >
            <Button
              component={RouterLink}
              to="/scans"
              startIcon={
                <ArrowBackIcon />
              }
              variant="outlined"
            >
              Back to Scan Results
            </Button>

            <Button
              component={RouterLink}
              to="/import"
              startIcon={
                <UploadFileIcon />
              }
              variant="outlined"
            >
              Import New Scan
            </Button>
          </Stack>

          <Stack
            direction={{
              xs: "column",
              md: "row",
            }}
            spacing={2}
            sx={{
              alignItems: {
                xs: "flex-start",
                md: "center",
              },
            }}
            justifyContent="space-between"
          >
            <Box>
              <Typography
                variant="h4"
                fontWeight={800}
              >
                Scan Result
              </Typography>

              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ mt: 0.8 }}
              >
                Review Wi-Fi networks,
                observed devices, review
                items, map location, and
                timeline history from this
                imported Kismet scan.
              </Typography>
            </Box>

            <Stack
              direction={{
                xs: "column",
                sm: "row",
              }}
              spacing={1.5}
            >
              <Button
                variant="outlined"
                color="error"
                startIcon={
                  <PictureAsPdfIcon />
                }
                onClick={
                  handleExportPdf
                }
                disabled={
                  !summary ||
                  !importBatchId
                }
              >
                Export PDF
              </Button>

              <Button
                variant="contained"
                startIcon={
                  <RefreshIcon />
                }
                onClick={loadSummary}
                disabled={isLoading}
              >
                Refresh
              </Button>
            </Stack>
          </Stack>
        </Box>

        {isLoading && (
          <LinearProgress />
        )}

        {error && (
          <Alert
            severity="error"
            onClose={() => setError("")}
          >
            {error}
          </Alert>
        )}

        <Alert severity="info">
          This scan result shows observed
          wireless scan records only. It
          does not identify device owners.
        </Alert>

        {summary && (
          <>
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Stack
                    direction={{
                      xs: "column",
                      md: "row",
                    }}
                    spacing={2}
                    sx={{
                      alignItems: {
                        xs: "flex-start",
                        md: "center",
                      },
                    }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography
                        variant="h6"
                        fontWeight={800}
                      >
                        Scan ID #{batch.id}
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        Source file:{" "}
                        {batch.original_filename ||
                          "Unknown file"}
                      </Typography>
                    </Box>

                    <Chip
                      color={getStatusColor(
                        batch.import_status
                      )}
                      label={
                        batch.import_status ||
                        "unknown"
                      }
                    />
                  </Stack>

                  <Divider />

                  <Grid
                    container
                    spacing={2}
                  >
                    <Grid
                      item
                      xs={12}
                      md={3}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        Scan Name
                      </Typography>

                      <Typography
                        fontWeight={700}
                      >
                        {batch.manual_area_label ||
                          `Kismet Scan #${batch.id}`}
                      </Typography>
                    </Grid>

                    <Grid
                      item
                      xs={12}
                      md={3}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        Location
                      </Typography>

                      <Typography
                        fontWeight={700}
                      >
                        {formatCoordinate(
                          batch.manual_latitude,
                          batch.manual_longitude
                        )}
                      </Typography>
                    </Grid>

                    <Grid
                      item
                      xs={12}
                      md={3}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        Capture Source
                      </Typography>

                      <Typography
                        fontWeight={700}
                      >
                        Kismet{" "}
                        {batch.kismet_version ||
                          "—"}
                      </Typography>
                    </Grid>

                    <Grid
                      item
                      xs={12}
                      md={3}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        Imported
                      </Typography>

                      <Typography
                        fontWeight={700}
                      >
                        {formatDateTime(
                          batch.created_at
                        )}
                      </Typography>
                    </Grid>
                  </Grid>
                </Stack>
              </CardContent>
            </Card>

            <Grid
              container
              spacing={2}
            >
              <Grid
                item
                xs={12}
                md={3}
              >
                <Card>
                  <CardContent>
                    <Stack
                      direction="row"
                      spacing={1.5}
                      sx={{
                        alignItems:
                          "center",
                      }}
                    >
                      <WifiIcon />

                      <Box>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
                          Wi-Fi Networks
                        </Typography>

                        <Typography
                          variant="h5"
                          fontWeight={800}
                        >
                          {formatNumber(
                            stats.wifi_observations
                          )}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid
                item
                xs={12}
                md={3}
              >
                <Card>
                  <CardContent>
                    <Stack
                      direction="row"
                      spacing={1.5}
                      sx={{
                        alignItems:
                          "center",
                      }}
                    >
                      <WifiIcon />

                      <Box>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
                          Unique BSSIDs
                        </Typography>

                        <Typography
                          variant="h5"
                          fontWeight={800}
                        >
                          {formatNumber(
                            stats.unique_bssids
                          )}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid
                item
                xs={12}
                md={3}
              >
                <Card>
                  <CardContent>
                    <Stack
                      direction="row"
                      spacing={1.5}
                      sx={{
                        alignItems:
                          "center",
                      }}
                    >
                      <DevicesIcon />

                      <Box>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
                          Observed Devices
                        </Typography>

                        <Typography
                          variant="h5"
                          fontWeight={800}
                        >
                          {formatNumber(
                            stats.client_observations
                          )}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid
                item
                xs={12}
                md={3}
              >
                <Card>
                  <CardContent>
                    <Stack
                      direction="row"
                      spacing={1.5}
                      sx={{
                        alignItems:
                          "center",
                      }}
                    >
                      <StorageIcon />

                      <Box>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
                          Raw Devices
                        </Typography>

                        <Typography
                          variant="h5"
                          fontWeight={800}
                        >
                          {formatNumber(
                            batch.device_count
                          )}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <ScanReviewItemsCard
              importBatchId={
                importBatchId
              }
            />

            <ScanWifiDeviceLinks
              importBatchId={
                importBatchId
              }
            />

            <Card>
              <CardContent>
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="h6"
                    fontWeight={800}
                  >
                    Timeline History
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    Ordered activity
                    timeline from processed
                    Wi-Fi and observed device
                    records in this scan.
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
                          Time
                        </TableCell>

                        <TableCell>
                          Type
                        </TableCell>

                        <TableCell>
                          Name
                        </TableCell>

                        <TableCell>
                          Manufacturer
                        </TableCell>

                        <TableCell>
                          Identifier
                        </TableCell>

                        <TableCell>
                          Relationship
                        </TableCell>

                        <TableCell align="right">
                          Signal
                        </TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {timelineRows.map(
                        (item) => (
                          <TableRow
                            key={
                              item.id
                            }
                            hover
                          >
                            <TableCell>
                              {formatDateTime(
                                item.timestamp
                              )}
                            </TableCell>

                            <TableCell>
                              {item.type}
                            </TableCell>

                            <TableCell>
                              {item.name}
                            </TableCell>

                            <TableCell>
                              {item.manufacturer}
                            </TableCell>

                            <TableCell>
                              {
                                item.identifier
                              }
                            </TableCell>

                            <TableCell>
                              {
                                item.relationship
                              }
                            </TableCell>

                            <TableCell align="right">
                              {item.signal}
                            </TableCell>
                          </TableRow>
                        )
                      )}

                      {timelineRows.length ===
                        0 && (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                          >
                            <Typography
                              color="text.secondary"
                              align="center"
                              sx={{
                                py: 3,
                              }}
                            >
                              No timeline
                              records found.
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
                  <Typography
                    variant="h6"
                    fontWeight={800}
                  >
                    Wi-Fi Networks
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    Showing first 50
                    processed Wi-Fi/AP
                    records from this scan.
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
                          SSID
                        </TableCell>

                        <TableCell>
                          BSSID
                        </TableCell>

                        <TableCell>
                          Manufacturer
                        </TableCell>

                        <TableCell align="right">
                          Channel
                        </TableCell>

                        <TableCell>
                          Encryption
                        </TableCell>

                        <TableCell align="right">
                          Signal
                        </TableCell>

                        <TableCell>
                          Coordinates
                        </TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {topWifiRows.map(
                        (item) => (
                          <TableRow
                            key={
                              item.id
                            }
                            hover
                          >
                            <TableCell>
                              {item.ssid ||
                                "Hidden/Unknown"}
                            </TableCell>

                            <TableCell>
                              {item.bssid ||
                                "—"}
                            </TableCell>

                            <TableCell>
                              {getManufacturer(item)}
                            </TableCell>

                            <TableCell align="right">
                              {item.channel ??
                                "—"}
                            </TableCell>

                            <TableCell>
                              {item.encryption ||
                                "—"}
                            </TableCell>

                            <TableCell align="right">
                              {item.signal_dbm ??
                                item.rssi ??
                                "—"}
                            </TableCell>

                            <TableCell>
                              {formatCoordinate(
                                item.latitude,
                                item.longitude
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      )}

                      {topWifiRows.length ===
                        0 && (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                          >
                            <Typography
                              color="text.secondary"
                              align="center"
                              sx={{
                                py: 3,
                              }}
                            >
                              No Wi-Fi
                              network records
                              found.
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
                  <Typography
                    variant="h6"
                    fontWeight={800}
                  >
                    Observed Devices
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    Showing first 80
                    observed device records
                    linked to Wi-Fi networks
                    in this scan.
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
                          Client MAC
                        </TableCell>

                        <TableCell>
                          Linked BSSID
                        </TableCell>

                        <TableCell>
                          SSID
                        </TableCell>

                        <TableCell>
                          Manufacturer
                        </TableCell>

                        <TableCell>
                          Relationship
                        </TableCell>

                        <TableCell align="right">
                          Signal
                        </TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {topClientRows.map(
                        (item) => (
                          <TableRow
                            key={
                              item.id
                            }
                            hover
                          >
                            <TableCell>
                              <Link
                                component={
                                  RouterLink
                                }
                                to={`/clients/${encodeURIComponent(
                                  item.client_mac
                                )}/timeline`}
                                underline="hover"
                              >
                                {
                                  item.client_mac
                                }
                              </Link>
                            </TableCell>

                            <TableCell>
                              {item.bssid ||
                                "Unlinked"}
                            </TableCell>

                            <TableCell>
                              {item.ssid ||
                                "—"}
                            </TableCell>

                            <TableCell>
                              {getManufacturer(item)}
                            </TableCell>

                            <TableCell>
                              {item.relationship_type ||
                                "observed"}
                            </TableCell>

                            <TableCell align="right">
                              {item.signal_dbm ??
                                "—"}
                            </TableCell>
                          </TableRow>
                        )
                      )}

                      {topClientRows.length ===
                        0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                          >
                            <Typography
                              color="text.secondary"
                              align="center"
                              sx={{
                                py: 3,
                              }}
                            >
                              No observed
                              device records
                              found.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Box>
              </CardContent>
            </Card>

            <Grid
              container
              spacing={2}
            >
              <Grid
                item
                xs={12}
                md={5}
              >
                <Card>
                  <CardContent>
                    <Box sx={{ mb: 2 }}>
                      <Typography
                        variant="h6"
                        fontWeight={800}
                      >
                        Raw Device Type
                        Breakdown
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        Device categories
                        detected in the
                        original Kismet file
                        or Kismet CSV export.
                      </Typography>
                    </Box>

                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>
                            Device Type
                          </TableCell>

                          <TableCell align="right">
                            Total
                          </TableCell>
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {rawBreakdown.map(
                          (item) => (
                            <TableRow
                              key={
                                item.device_type
                              }
                              hover
                            >
                              <TableCell>
                                {
                                  item.device_type
                                }
                              </TableCell>

                              <TableCell align="right">
                                {formatNumber(
                                  item.total
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        )}

                        {rawBreakdown.length ===
                          0 && (
                          <TableRow>
                            <TableCell
                              colSpan={2}
                            >
                              <Typography
                                color="text.secondary"
                                align="center"
                                sx={{
                                  py: 3,
                                }}
                              >
                                No raw
                                breakdown
                                found.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </Grid>

              <Grid
                item
                xs={12}
                md={7}
              >
                <Card>
                  <CardContent>
                    <Box sx={{ mb: 2 }}>
                      <Typography
                        variant="h6"
                        fontWeight={800}
                      >
                        Raw Device Preview
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        First 20 raw device
                        rows saved from the
                        imported file.
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        overflowX:
                          "auto",
                      }}
                    >
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>
                              Type
                            </TableCell>

                            <TableCell>
                              MAC / BSSID
                            </TableCell>

                            <TableCell>
                              Manufacturer
                            </TableCell>

                            <TableCell align="right">
                              Signal
                            </TableCell>
                          </TableRow>
                        </TableHead>

                        <TableBody>
                          {rawPreview.map(
                            (item) => {
                              const deviceJson =
                                item.device_json ||
                                {};

                              const manufacturer =
                                deviceJson[
                                  "kismet.device.base.manuf"
                                ] ||
                                "Unknown Manufacturer";

                              return (
                                <TableRow
                                  key={
                                    item.id
                                  }
                                  hover
                                >
                                  <TableCell>
                                    {item.device_type ||
                                      "—"}
                                  </TableCell>

                                  <TableCell>
                                    {item.devmac ||
                                      "—"}
                                  </TableCell>

                                  <TableCell>
                                    {manufacturer}
                                  </TableCell>

                                  <TableCell align="right">
                                    {item.strongest_signal ??
                                      "—"}
                                  </TableCell>
                                </TableRow>
                              );
                            }
                          )}

                          {rawPreview.length ===
                            0 && (
                            <TableRow>
                              <TableCell
                                colSpan={
                                  4
                                }
                              >
                                <Typography
                                  color="text.secondary"
                                  align="center"
                                  sx={{
                                    py: 3,
                                  }}
                                >
                                  No raw
                                  device
                                  preview
                                  found.
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </>
        )}
      </Stack>
    </Box>
  );
}
