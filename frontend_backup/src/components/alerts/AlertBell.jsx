import { useEffect, useRef, useState } from "react";
import {
  Badge,
  IconButton,
  Popover,
  Box,
  Typography,
  Stack,
  Button,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  Snackbar,
} from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { useNavigate } from "react-router-dom";

import api from "../../services/api";

function getAlertLabel(alertType) {
  if (alertType === "new_location") {
    return "New location";
  }

  if (alertType === "repeat_activity") {
    return "Repeated detection";
  }

  return alertType || "Alert";
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString();
}

export default function AlertBell() {
  const navigate = useNavigate();

  const [anchorEl, setAnchorEl] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const previousUnreadCountRef = useRef(0);
  const hasInitializedRef = useRef(false);

  const open = Boolean(anchorEl);

  async function loadAlerts({ showLoading = false } = {}) {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const [alertsResponse, countResponse] = await Promise.all([
        api.get("/alerts/?unread_only=true&limit=20"),
        api.get("/alerts/unread-count"),
      ]);

      const nextUnreadCount = countResponse.data?.unread_count || 0;

      setAlerts(alertsResponse.data || []);
      setUnreadCount(nextUnreadCount);

      if (
        hasInitializedRef.current &&
        nextUnreadCount > previousUnreadCountRef.current
      ) {
        setSnackbarOpen(true);
      }

      previousUnreadCountRef.current = nextUnreadCount;
      hasInitializedRef.current = true;
    } catch (err) {
      console.error("Unable to load alerts:", err);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  async function markAlertAsRead(alert) {
    try {
      await api.patch(`/alerts/${alert.id}/read`);
      await loadAlerts();

      if (alert.bssid) {
        navigate(`/bssid-history/${encodeURIComponent(alert.bssid)}`);
        setAnchorEl(null);
      }
    } catch (err) {
      console.error("Unable to mark alert as read:", err);
    }
  }

  async function markAllAsRead() {
    try {
      setLoading(true);
      await api.patch("/alerts/read-all");
      await loadAlerts();
    } catch (err) {
      console.error("Unable to mark all alerts as read:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen(event) {
    setAnchorEl(event.currentTarget);
    loadAlerts({ showLoading: true });
  }

  function handleClose() {
    setAnchorEl(null);
  }

  useEffect(() => {
    loadAlerts();

    const intervalId = window.setInterval(() => {
      loadAlerts();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <>
      <IconButton onClick={handleOpen}>
        <Badge badgeContent={unreadCount} color="error" max={99}>
          {unreadCount > 0 ? (
            <NotificationsActiveIcon color="primary" />
          ) : (
            <NotificationsNoneIcon />
          )}
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          sx: {
            width: 420,
            maxWidth: "calc(100vw - 32px)",
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={2}
            sx={{ mb: 1 }}
          >
            <Box>
              <Typography variant="h6">Alerts</Typography>

              <Typography variant="body2" color="text.secondary">
                BSSID movement and repeat activity notifications
              </Typography>
            </Box>

            {loading && <CircularProgress size={18} />}
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Chip
              label={`${unreadCount} unread`}
              size="small"
              color={unreadCount > 0 ? "primary" : "default"}
            />

            <Button
              size="small"
              onClick={markAllAsRead}
              disabled={unreadCount === 0 || loading}
            >
              Mark all read
            </Button>
          </Stack>

          <Divider sx={{ mb: 1 }} />

          {alerts.length === 0 ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              No unread alerts.
            </Alert>
          ) : (
            <Stack spacing={1.25} sx={{ maxHeight: 420, overflowY: "auto" }}>
              {alerts.map((alert) => (
                <Box
                  key={alert.id}
                  onClick={() => markAlertAsRead(alert)}
                  sx={{
                    p: 1.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    cursor: "pointer",
                    backgroundColor: alert.is_read
                      ? "background.paper"
                      : "primary.light",
                    "&:hover": {
                      backgroundColor: "#F9FAFB",
                    },
                  }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    spacing={1}
                    sx={{ mb: 0.75 }}
                  >
                    <Chip
                      label={getAlertLabel(alert.alert_type)}
                      size="small"
                      color={
                        alert.alert_type === "new_location"
                          ? "primary"
                          : "default"
                      }
                    />

                    <Typography variant="caption" color="text.secondary">
                      {formatDate(alert.created_at)}
                    </Typography>
                  </Stack>

                  <Typography sx={{ fontWeight: 800, mb: 0.5 }}>
                    {alert.bssid}
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    {alert.message}
                  </Typography>

                  {alert.current_area && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.75 }}
                    >
                      Current area: {alert.current_area}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Popover>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={5000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
      >
        <Alert
          severity="info"
          variant="filled"
          onClose={() => setSnackbarOpen(false)}
        >
          New BSSID alert detected.
        </Alert>
      </Snackbar>
    </>
  );
}