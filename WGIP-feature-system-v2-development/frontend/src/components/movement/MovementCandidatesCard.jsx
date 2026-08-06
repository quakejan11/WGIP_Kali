import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import WifiOutlinedIcon from "@mui/icons-material/WifiOutlined";

import {
  formatDateTime,
  formatNumber,
  loadReviewItems,
} from "../../utils/reviewItems";

function normalizeResult(result) {
  return {
    items: Array.isArray(result?.items)
      ? result.items
      : [],
    stats: result?.stats || {},
  };
}

function getStatusColor(statusKey) {
  return statusKey === "movement"
    ? "warning"
    : "info";
}

function getCategoryIcon(category) {
  return category === "Device" ? (
    <DevicesOutlinedIcon fontSize="small" />
  ) : (
    <WifiOutlinedIcon fontSize="small" />
  );
}

export default function ScanReviewItemsCard({
  importBatchId,
}) {
  const navigate = useNavigate();
  const params = useParams();

  const effectiveImportBatchId =
    importBatchId ||
    params.importBatchId ||
    params.batchId ||
    params.id ||
    params.scanId ||
    "";

  const [result, setResult] = useState({
    items: [],
    stats: {},
  });

  const [isLoading, setIsLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    let isActive = true;

    async function loadScanReviewItems() {
      if (!effectiveImportBatchId) {
        setResult({
          items: [],
          stats: {},
        });

        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      try {
        const nextResult =
          await loadReviewItems({
            scanId: effectiveImportBatchId,
          });

        if (isActive) {
          setResult(
            normalizeResult(nextResult)
          );
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage(
            error?.message ||
              "Unable to load review items. Please check the backend."
          );

          setResult({
            items: [],
            stats: {},
          });
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadScanReviewItems();

    return () => {
      isActive = false;
    };
  }, [effectiveImportBatchId]);

  const items = useMemo(
    () =>
      Array.isArray(result.items)
        ? result.items
        : [],
    [result.items]
  );

  return (
    <Card>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack
            direction={{
              xs: "column",
              md: "row",
            }}
            spacing={1}
            sx={{
              alignItems: {
                xs: "flex-start",
                md: "center",
              },
              justifyContent:
                "space-between",
            }}
          >
            <Box>
              <Typography
                variant="h6"
                fontWeight={900}
              >
                Review Items for this Scan
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                Tracked Wi-Fi and observed
                devices from this scan that
                were also detected in at least
                one separate scan or import.
              </Typography>
            </Box>

            <Chip
              icon={
                <FactCheckOutlinedIcon />
              }
              label={`${formatNumber(
                items.length
              )} review item${
                items.length === 1
                  ? ""
                  : "s"
              }`}
              color={
                items.length > 0
                  ? "warning"
                  : "default"
              }
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Stack>

          <Alert severity="info">
            Repeated records within this scan
            alone do not make a Wi-Fi network
            or device tracked. It must appear
            in at least two separate
            scans/imports.
          </Alert>

          {!effectiveImportBatchId && (
            <Alert severity="warning">
              Scan ID was not found from the
              page URL.
            </Alert>
          )}

          {isLoading && (
            <Box>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 0.5 }}
              >
                Checking review items...
              </Typography>

              <LinearProgress />
            </Box>
          )}

          {errorMessage && (
            <Alert severity="warning">
              {errorMessage}
            </Alert>
          )}

          {!isLoading &&
            !errorMessage &&
            effectiveImportBatchId &&
            items.length === 0 && (
              <Alert severity="success">
                No tracked Wi-Fi or observed
                devices from this scan were
                found in another scan/import.
              </Alert>
            )}

          {!isLoading &&
            !errorMessage &&
            items.length > 0 && (
              <Box
                sx={{
                  overflowX: "auto",
                }}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        Type
                      </TableCell>

                      <TableCell>
                        Status
                      </TableCell>

                      <TableCell>
                        Identifier
                      </TableCell>

                      <TableCell>
                        Name / Manufacturer
                      </TableCell>

                      <TableCell align="right">
                        Scans
                      </TableCell>

                      <TableCell align="right">
                        Scanned Areas
                      </TableCell>

                      <TableCell align="right">
                        Detections
                      </TableCell>

                      <TableCell>
                        Last Seen
                      </TableCell>

                      <TableCell align="right">
                        Action
                      </TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {items.map((item) => (
                      <TableRow
                        key={item.id}
                        hover
                      >
                        <TableCell>
                          <Chip
                            size="small"
                            icon={getCategoryIcon(
                              item.category
                            )}
                            label={
                              item.category ||
                              "Unknown"
                            }
                            variant="outlined"
                          />
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            label={
                              item.statusLabel ||
                              "For Review"
                            }
                            color={getStatusColor(
                              item.statusKey
                            )}
                            variant="outlined"
                          />
                        </TableCell>

                        <TableCell>
                          <Typography
                            variant="body2"
                            fontFamily="monospace"
                            fontWeight={800}
                          >
                            {item.identifier ||
                              "—"}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          {item.secondary ||
                            "—"}
                        </TableCell>

                        <TableCell align="right">
                          {formatNumber(
                            item.scanCount
                          )}
                        </TableCell>

                        <TableCell align="right">
                          {formatNumber(
                            item.scannedAreaCount ??
                              item.locationCount
                          )}
                        </TableCell>

                        <TableCell align="right">
                          {formatNumber(
                            item.observationCount
                          )}
                        </TableCell>

                        <TableCell>
                          {formatDateTime(
                            item.lastSeen
                          )}
                        </TableCell>

                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={
                              <VisibilityOutlinedIcon />
                            }
                            onClick={() =>
                              navigate(
                                item.actionPath ||
                                  "/signals"
                              )
                            }
                            sx={{
                              fontWeight: 700,
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {item.actionLabel ||
                              "View History"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
        </Stack>
      </CardContent>
    </Card>
  );
}
