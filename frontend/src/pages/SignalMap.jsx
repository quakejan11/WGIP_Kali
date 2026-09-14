// src/pages/SignalMap.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Alert,
  Snackbar,
  Paper,
  CircularProgress,
} from '@mui/material';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet default marker icon (broken by webpack/vite)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom red signal icon for APs
const apIcon = new L.Icon({
  iconUrl:
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Default map center (Manila, Philippines — change to your location)
const DEFAULT_CENTER = [14.5995, 120.9842];
const DEFAULT_ZOOM = 13;

const SignalMap = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aps, setAps] = useState([]);
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'info',
  });

  const showNotification = (message, severity) => {
    setNotification({ open: true, message, severity });
  };

  // Fetch APs with GPS coordinates from your backend
  useEffect(() => {
    const fetchAps = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/live/events/recent?limit=100');
        if (!res.ok) throw new Error('Failed to fetch APs');

        const data = await res.json();
        const events = Array.isArray(data)
          ? data
          : data.events || data.data || [];

        // Filter only events that have GPS data
        const withGps = events
          .map((e) => {
            const lat =
              parseFloat(e.gps_lat || e.latitude || e.location?.lat) || null;
            const lng =
              parseFloat(e.gps_lon || e.longitude || e.location?.lon) || null;
            return {
              bssid: e.bssid || '00:00:00:00:00:00',
              ssid: e.essid || e.ssid || 'Unknown',
              channel: e.channel || 1,
              signal: e.signal || -60,
              lat,
              lng,
            };
          })
          .filter((ap) => ap.lat !== null && ap.lng !== null);

        setAps(withGps);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAps();
    const interval = setInterval(fetchAps, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <Box sx={{ p: 3, bgcolor: '#f5f7fa', minHeight: '100vh' }}>
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          mb: 3,
          color: '#0f172a',
          letterSpacing: '-0.02em',
        }}
      >
        Signal Map
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper
        sx={{
          borderRadius: 2,
          border: '1px solid #e5e7eb',
          boxShadow: 'none',
          overflow: 'hidden',
          position: 'relative',
          height: 'calc(100vh - 180px)',
          minHeight: 500,
        }}
      >
        {loading && aps.length === 0 && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(255,255,255,0.6)',
            }}
          >
            <CircularProgress />
          </Box>
        )}

        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {aps.map((ap, idx) => (
            <React.Fragment key={`${ap.bssid}-${idx}`}>
              <Marker position={[ap.lat, ap.lng]} icon={apIcon}>
                <Popup>
                  <Box sx={{ minWidth: 180 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, mb: 0.5 }}
                    >
                      {ap.ssid}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', fontFamily: 'monospace' }}
                    >
                      {ap.bssid}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block' }}>
                      CH {ap.channel} · {ap.signal} dBm
                    </Typography>
                  </Box>
                </Popup>
              </Marker>

              {/* Signal radius circle (approximate coverage) */}
              <Circle
                center={[ap.lat, ap.lng]}
                radius={50}
                pathOptions={{
                  color: '#dc2626',
                  fillColor: '#dc2626',
                  fillOpacity: 0.15,
                  weight: 1,
                }}
              />
            </React.Fragment>
          ))}
        </MapContainer>
      </Paper>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={() => setNotification({ ...notification, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={notification.severity} variant="filled">
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SignalMap;