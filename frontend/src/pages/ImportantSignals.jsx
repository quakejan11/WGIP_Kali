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
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import WifiIcon from "@mui/icons-material/Wifi";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";

import {
  formatDateTime,
  formatNumber,
  loadReviewItems,
  normalize,
} from "../utils/reviewItems";

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

function getStatusColor(statusKey) {
  if (statusKey === "movement") return "success";
  if (statusKey === "recurring") return "warning";

  return "default";
}

export default function ImportantSignals() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({
    reviewItems: 0,
    movementDetected: 0,
    recurringPresence: 0,
    trackedWifi: 0,
    trackedDevices: 0,
    scansReviewed: 0,
  });
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const filteredItems = useMemo(() => {
    const search = normalize(searchText);

    return items.filter((item) => {
      const matchesFilter =
        filterType === "all" ||
        item.statusKey === filterType ||
        item.category.toLowerCase() === filterType;

      if (!matchesFilter) return false;

      if (!search) return true;

      return [
        item.title,
        item.category,
        item.statusLabel,
        item.identifier,
        item.secondary,
        item.details,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [items, searchText, filterType]);

  async function loadPage() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const result = await loadReviewItems();

      setItems(result.items);
      setStats(result.stats);
    } catch (error) {
      setErrorMessage(error?.message || "Failed to load review items.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, []);

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
              Review Items
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Movement and recurring presence items that need analyst review.
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={loadPage}
            disabled={isLoading}
            sx={{ fontWeight: 800 }}
          >
            Refresh
          </Button>
        </Stack>

        {isLoading && <LinearProgress />}

        {errorMessage && (
          <Alert severity="error" onClose={() => setErrorMessage("")}>
            {errorMessage}
          </Alert>
        )}

        <Alert severity="info">
          This page is filtered to tracked Wi-Fi and tracked device activity only.
          Ordinary one-time detections remain available in Scan Results, Observations, and Map.
        </Alert>

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
          <StatCard
            title="Review Items"
            value={stats.reviewItems}
            subtitle={`${formatNumber(stats.scansReviewed)} scans reviewed`}
            icon={<NotificationsActiveOutlinedIcon fontSize="small" />}
          />

          <StatCard
            title="Movement Detected"
            value={stats.movementDetected}
            subtitle="Location movement"
            icon={<RouteOutlinedIcon fontSize="small" />}
          />

          <StatCard
            title="Recurring Presence"
            value={stats.recurringPresence}
            subtitle="Seen repeatedly"
            icon={<VisibilityIcon fontSize="small" />}
          />

          <StatCard
            title="Tracked Wi-Fi"
            value={stats.trackedWifi}
            subtitle="BSSID/MAC items"
            icon={<WifiIcon fontSize="small" />}
          />

          <StatCard
            title="Tracked Devices"
            value={stats.trackedDevices}
            subtitle="Observed device items"
            icon={<DevicesOutlinedIcon fontSize="small" />}
          />
        </Box>

        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1}
                sx={{
                  alignItems: { xs: "flex-start", md: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography variant="h6" fontWeight={900}>
                    Items for Review
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Prioritized by movement first, then recurring presence.
                  </Typography>
                </Box>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <TextField
                    select
                    size="small"
                    label="Filter"
                    value={filterType}
                    onChange={(event) => setFilterType(event.target.value)}
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="all">All Items</MenuItem>
                    <MenuItem value="movement">Movement Detected</MenuItem>
                    <MenuItem value="recurring">Recurring Presence</MenuItem>
                    <MenuItem value="wi-fi">Tracked Wi-Fi</MenuItem>
                    <MenuItem value="device">Tracked Devices</MenuItem>
                  </TextField>

                  <TextField
                    size="small"
                    placeholder="Search item / MAC / SSID"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    sx={{ minWidth: { xs: "100%", sm: 320 } }}
                  />
                </Stack>
              </Stack>

              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>Identifier</TableCell>
                      <TableCell>Tracking Status</TableCell>
                      <TableCell>Details</TableCell>
                      <TableCell align="right">Locations</TableCell>
                      <TableCell align="right">Scans</TableCell>
                      <TableCell align="right">Observations</TableCell>
                      <TableCell>Last Seen</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Chip
                            size="small"
                            label={item.category}
                            color={item.category === "Wi-Fi" ? "primary" : "secondary"}
                            variant="outlined"
                            sx={{ fontWeight: 700 }}
                          />
                        </TableCell>

                        <TableCell>
                          <Typography variant="body2" fontWeight={800}>
                            {item.identifier}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.category === "Device"
                              ? `Manufacturer: ${item.secondary || "Unknown Manufacturer"}`
                              : `Wi-Fi Name: ${item.secondary || "Hidden/Unknown"}`}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            color={getStatusColor(item.statusKey)}
                            variant="outlined"
                            label={item.statusLabel}
                            sx={{ fontWeight: 700 }}
                          />
                        </TableCell>

                        <TableCell>{item.details}</TableCell>

                        <TableCell align="right">{formatNumber(item.locationCount)}</TableCell>
                        <TableCell align="right">{formatNumber(item.scanCount)}</TableCell>
                        <TableCell align="right">{formatNumber(item.observationCount)}</TableCell>

                        <TableCell>{formatDateTime(item.lastSeen)}</TableCell>

                        <TableCell align="right">
                          <Button
                            component={RouterLink}
                            to={item.actionPath}
                            variant={item.statusKey === "movement" ? "contained" : "outlined"}
                            size="small"
                            startIcon={<RouteOutlinedIcon fontSize="small" />}
                            sx={{ fontWeight: 800, whiteSpace: "nowrap" }}
                          >
                            {item.actionLabel}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}

                    {filteredItems.length === 0 && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={9}>
                          <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                            No review items found.
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
