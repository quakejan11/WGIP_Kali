﻿import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import {
  Avatar,
  Badge,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
  Collapse,
} from "@mui/material";

import DashboardIcon from "@mui/icons-material/Dashboard";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import WifiIcon from "@mui/icons-material/Wifi";
import DeviceHubIcon from "@mui/icons-material/DeviceHub";
import MapIcon from "@mui/icons-material/Map";
import ManageSearchIcon from "@mui/icons-material/ManageSearch";
import NotificationsIcon from "@mui/icons-material/Notifications";
import StorageIcon from "@mui/icons-material/Storage";
import SettingsIcon from "@mui/icons-material/Settings";
import SecurityIcon from "@mui/icons-material/Security";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import SignalCellularAltIcon from "@mui/icons-material/SignalCellularAlt";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import WifiOffIcon from "@mui/icons-material/WifiOff";

import api from "../../services/api";
import { currentUser } from "../../config/currentUser";

const drawerWidth = 248;

const menuItems = [
  { label: "Dashboard", path: "/", icon: <DashboardIcon /> },
  { label: "Import Scan", path: "/import", icon: <FileUploadIcon /> },
  { label: "Scan Results", path: "/scans", icon: <FactCheckIcon /> },
  { label: "Tracked Wi-Fi", path: "/bssid-history", icon: <WifiIcon /> },
  { label: "Tracked Devices", path: "/devices", icon: <DeviceHubIcon /> },
  { label: "Map", path: "/map", icon: <MapIcon /> },
  { label: "Review Items", path: "/signals", icon: <ManageSearchIcon /> },
  { label: "Observations", path: "/observations", icon: <StorageIcon /> },
  {
    label: "Monitoring",
    icon: <SecurityIcon />,
    children: [
      { label: "Live Scanning", path: "/live-operation/scan", icon: <SignalCellularAltIcon /> },
      { label: "DeAuth Monitor", path: "/live-operation/deauth", icon: <WifiOffIcon /> },
      { label: "Signal Map", path: "/live-operation/map", icon: <GpsFixedIcon /> },
    ],
  },
  { label: "Settings", path: "/settings", icon: <SettingsIcon /> },
];

function WgipLogo() {
  return (
    <Box
      sx={{
        width: 38,
        height: 38,
        borderRadius: "50%",
        bgcolor: "#e8f5ee",
        color: "#087443",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <WifiIcon sx={{ fontSize: 24 }} />
    </Box>
  );
}

export default function MainLayout({ children }) {
  const location = useLocation();
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  
  // State for expanded/collapsed menu items
  const [expandedMenus, setExpandedMenus] = useState({
    Monitoring: true, // Monitoring is expanded by default
  });

  useEffect(() => {
    async function loadUnreadAlerts() {
      try {
        const response = await api.get("/alerts/unread-count");
        const count =
          response.data?.count ??
          response.data?.unread_count ??
          response.data?.total ??
          0;
        setUnreadAlerts(count);
      } catch {
        setUnreadAlerts(0);
      }
    }
    loadUnreadAlerts();
  }, []);

  const userName = currentUser?.name || "Admin";

  // Check if any child path is active
  const isChildActive = (children) => {
    return children.some((child) => location.pathname === child.path);
  };

  // Toggle expand/collapse
  const handleToggle = (label) => {
    setExpandedMenus((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f7f8fa" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
            borderRight: "1px solid #e5e7eb",
            bgcolor: "#ffffff",
          },
        }}
      >
        <Box
          sx={{
            height: 64,
            px: 2,
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <Stack direction="row" spacing={1.25} alignItems="center">
            <WgipLogo />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 19,
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: "-0.025em",
                  color: "#0f172a",
                }}
              >
                WGIP
              </Typography>
              <Typography
                sx={{
                  mt: 0.25,
                  fontSize: 12.6,
                  fontWeight: 400,
                  lineHeight: 1.2,
                  color: "#475569",
                  whiteSpace: "nowrap",
                }}
              >
                Wireless Intelligence
              </Typography>
            </Box>
          </Stack>
        </Box>

        <List sx={{ px: 1.5, py: 1.5 }}>
          {menuItems.map((item) => {
            // Check if item has children (nested menu)
            if (item.children) {
              const isExpanded = expandedMenus[item.label] || false;
              const hasActiveChild = isChildActive(item.children);

              return (
                <Box key={item.label}>
                  <ListItemButton
                    onClick={() => handleToggle(item.label)}
                    sx={{
                      mb: 0.35,
                      minHeight: 42,
                      px: 1.4,
                      borderRadius: 2,
                      color: hasActiveChild ? "#087443" : "#4b5563",
                      bgcolor: hasActiveChild ? "#e8f5ee" : "transparent",
                      "& .MuiListItemIcon-root": {
                        minWidth: 36,
                        color: "inherit",
                      },
                      "& .MuiSvgIcon-root": {
                        fontSize: 20,
                      },
                      "& .MuiListItemText-primary": {
                        fontSize: 14,
                        fontWeight: hasActiveChild ? 700 : 500,
                      },
                      "&:hover": {
                        bgcolor: "#f3f4f6",
                        color: "#111827",
                      },
                    }}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} />
                    {isExpanded ? <ExpandLess /> : <ExpandMore />}
                  </ListItemButton>

                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                      {item.children.map((child) => {
                        const isActive = location.pathname === child.path;
                        return (
                          <ListItemButton
                            key={child.path}
                            component={NavLink}
                            to={child.path}
                            sx={{
                              mb: 0.25,
                              minHeight: 38,
                              pl: 4.8,
                              pr: 1.4,
                              py: 0.6,
                              borderRadius: 2,
                              color: isActive ? "#087443" : "#4b5563",
                              bgcolor: isActive ? "#e8f5ee" : "transparent",
                              "& .MuiListItemIcon-root": {
                                minWidth: 32,
                                color: "inherit",
                              },
                              "& .MuiSvgIcon-root": {
                                fontSize: 18,
                              },
                              "& .MuiListItemText-primary": {
                                fontSize: 13.5,
                                fontWeight: isActive ? 700 : 400,
                              },
                              "&:hover": {
                                bgcolor: "#f3f4f6",
                                color: "#111827",
                              },
                              "&.active": {
                                bgcolor: "#e8f5ee",
                                color: "#087443",
                              },
                              "&.active .MuiListItemText-primary": {
                                fontWeight: 700,
                              },
                            }}
                          >
                            {child.icon && <ListItemIcon>{child.icon}</ListItemIcon>}
                            <ListItemText primary={child.label} />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  </Collapse>
                </Box>
              );
            }

            // Regular menu item (no children)
            const isActive = location.pathname === item.path;
            return (
              <ListItemButton
                key={item.path}
                component={NavLink}
                to={item.path}
                end={item.path === "/"}
                sx={{
                  mb: 0.35,
                  minHeight: 42,
                  px: 1.4,
                  borderRadius: 2,
                  color: isActive ? "#087443" : "#4b5563",
                  bgcolor: isActive ? "#e8f5ee" : "transparent",
                  "& .MuiListItemIcon-root": {
                    minWidth: 36,
                    color: "inherit",
                  },
                  "& .MuiSvgIcon-root": {
                    fontSize: 20,
                  },
                  "& .MuiListItemText-primary": {
                    fontSize: 14,
                    fontWeight: isActive ? 700 : 500,
                  },
                  "&:hover": {
                    bgcolor: "#f3f4f6",
                    color: "#111827",
                  },
                  "&.active": {
                    bgcolor: "#e8f5ee",
                    color: "#087443",
                  },
                  "&.active .MuiListItemText-primary": {
                    fontWeight: 700,
                  },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            );
          })}
        </List>

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ px: 2, pb: 2 }}>
          <Box
            sx={{
              px: 1.5,
              py: 1.2,
              borderRadius: 2.5,
              bgcolor: "#f8fafc",
              border: "1px solid #e5e7eb",
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: "#22c55e",
                  boxShadow: "0 0 0 4px rgba(34, 197, 94, 0.12)",
                }}
              />
              <Box>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, lineHeight: 1.2 }}
                >
                  Operational
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 400 }}
                >
                  Authorized analysis only
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Box>
      </Drawer>

      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          component="header"
          sx={{
            height: 64,
            px: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            bgcolor: "#ffffff",
            borderBottom: "1px solid #e5e7eb",
            position: "sticky",
            top: 0,
            zIndex: 20,
          }}
        >
          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.01em",
              color: "#111827",
            }}
          >
            Wireless Geospatial Intelligence Platform
          </Typography>

          <Stack direction="row" spacing={1.2} alignItems="center">
            <Tooltip title="Review Notifications">
              <IconButton
                component={Link}
                to="/alerts"
                size="small"
                sx={{
                  width: 38,
                  height: 38,
                  border: "1px solid #e5e7eb",
                  bgcolor: "#ffffff",
                  "&:hover": {
                    bgcolor: "#f8fafc",
                  },
                }}
              >
                <Badge badgeContent={unreadAlerts} color="error" max={99}>
                  <NotificationsIcon sx={{ fontSize: 19 }} />
                </Badge>
              </IconButton>
            </Tooltip>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                height: 38,
                pl: 0.45,
                pr: 1.25,
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                bgcolor: "#ffffff",
              }}
            >
              <Avatar
                sx={{
                  width: 30,
                  height: 30,
                  fontSize: 13,
                  fontWeight: 700,
                  bgcolor: "#087443",
                }}
              >
                {userName.charAt(0).toUpperCase()}
              </Avatar>
              <Box
                sx={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Typography
                  sx={{
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1,
                    color: "#111827",
                  }}
                >
                  {userName}
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Box>

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            px: 3,
            py: 2.5,
          }}
        >
          {children || <Outlet />}
        </Box>
      </Box>
    </Box>
  );
}