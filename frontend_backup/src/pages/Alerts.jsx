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
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import WifiIcon from "@mui/icons-material/Wifi";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";

import {
  formatDateTime,
  formatNumber,
  loadReviewItems,
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

export default function Alerts() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({
    reviewItems: 0,
    movementDetected: 0,
    recurringPresence: 0,
    trackedWifi: 0,
    trackedDevices: 0,
    scansReviewed: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const movementItems = useMemo(() => {
    return items.filter((item) => item.statusKey === "movement");
  }, [items]);

  const recurringItems = useMemo(() => {
    return items.filter((item) => item.statusKey === "recurring");
  }, [items]);

  async function loadPage() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const result = await loadReviewItems();

      setItems(result.items);
      setStats(result.stats);
    } catch (error) {
      setErrorMessage(error?.message || "Failed to load alerts.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, []);

  function renderAlertItem(item) {
    return (
      <Card key={item.id} variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            sx={{
              alignItems: { xs: "flex-start", md: "center" },
              justifyContent: "space-between",
            }}
          >
            <Stack spacing={0.75} sx={{ minWidth: 0 }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  flexWrap: "wrap",
                }}
              >
                <Chip
                  size="small"
                  label={item.category}
                  color={item.category === "Wi-Fi" ? "primary" : "secondary"}
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />

                <Chip
                  size="small"
                  label={item.statusLabel}
                  color={getStatusColor(item.statusKey)}
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              </Stack>

              <Box>
                <Typography variant="h6" fontWeight={900}>
                  {item.title}
                </Typography>

                <Typography variant="body2" fontWeight={800}>
                  {item.identifier}
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  {item.secondary || "—"}
                </Typography>
              </Box>

              <Typography variant="body2">{item.details}</Typography>

              <Typography variant="caption" color="text.secondary">
                Locations: {formatNumber(item.locationCount)} · Scans:{" "}
                {formatNumber(item.scanCount)} · Observations:{" "}
                {formatNumber(item.observationCount)} · Last seen:{" "}
                {formatDateTime(item.lastSeen)}
              </Typography>
            </Stack>

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
          </Stack>
        </CardContent>
      </Card>
    );
  }

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
              Review Notifications
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Alert-style view of movement and recurring presence items.
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
          Alerts are generated from tracked Wi-Fi and tracked device activity. This does not
          identify a person or owner; it only reviews wireless identifiers observed in imported scan data.
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
            title="Pending Review"
            value={stats.reviewItems}
            subtitle={`${formatNumber(stats.scansReviewed)} scans reviewed`}
            icon={<NotificationsActiveOutlinedIcon fontSize="small" />}
          />

          <StatCard
            title="Movement Alerts"
            value={stats.movementDetected}
            subtitle="Highest priority"
            icon={<RouteOutlinedIcon fontSize="small" />}
          />

          <StatCard
            title="Recurring Alerts"
            value={stats.recurringPresence}
            subtitle="Repeated presence"
            icon={<NotificationsActiveOutlinedIcon fontSize="small" />}
          />

          <StatCard
            title="Wi-Fi Alerts"
            value={stats.trackedWifi}
            subtitle="Tracked BSSIDs"
            icon={<WifiIcon fontSize="small" />}
          />

          <StatCard
            title="Device Alerts"
            value={stats.trackedDevices}
            subtitle="Tracked devices"
            icon={<DevicesOutlinedIcon fontSize="small" />}
          />
        </Box>

        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="h6" fontWeight={900}>
                  Movement Alerts
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  Items with movement across multiple GPS locations.
                </Typography>
              </Box>

              {movementItems.length > 0 ? (
                movementItems.map(renderAlertItem)
              ) : (
                <Alert severity="success">No movement alerts found.</Alert>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="h6" fontWeight={900}>
                  Recurring Presence Alerts
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  Items observed repeatedly across multiple scans.
                </Typography>
              </Box>

              {recurringItems.length > 0 ? (
                recurringItems.map(renderAlertItem)
              ) : (
                <Alert severity="success">No recurring presence alerts found.</Alert>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
