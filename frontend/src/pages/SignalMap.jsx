// src/pages/SignalMap.jsx
import React, { useState } from 'react';
import { Box, Alert, Snackbar } from '@mui/material';
import SignalMapView from '../components/SignalMap/SignalMapView';

// ─── SAMPLE DATA (12 networks — mixed bands, manufacturers, signals) ───
const MOCK_NETWORKS = [
  // ─── STRONG (≥ -60 dBm) ───
  {
    id: '1',
    ssid: 'CAFE_SOLAIRE_POS',
    bssid: '74:DA:38:6E:0F:B2',
    manufacturer: 'Edimax Technology',
    encryption: 'WPA2-PSK (CCMP)',
    band: '2.4 GHz',
    channel: 1,
    signal: -45,
    signalHistory: [-44, -45, -46, -45, -44, -43, -45, -46, -45, -45],
    location: '14.5995° N, 120.9842° E',
    clients: 2,
  },
  {
    id: '2',
    ssid: 'KAJANDRASTORE',
    bssid: '54:1F:8D:8E:33:95',
    manufacturer: 'TP-Link Corporation',
    encryption: 'WPA2-PSK (CCMP)',
    band: '2.4 GHz',
    channel: 11,
    signal: -58,
    signalHistory: [-57, -58, -59, -58, -57, -58, -59, -58, -57, -58],
    location: '14.5998° N, 120.9845° E',
    clients: 10,
  },
  {
    id: '3',
    ssid: 'HOME_WIFI_5G',
    bssid: 'A0:BD:1D:4E:2C:88',
    manufacturer: 'AsusTek Computer',
    encryption: 'WPA3-SAE',
    band: '5 GHz',
    channel: 44,
    signal: -52,
    signalHistory: [-51, -52, -53, -52, -51, -52, -53, -52, -51, -52],
    location: '14.5995° N, 120.9842° E',
    clients: 6,
  },

  // ─── MID (-60 to -75 dBm) ───
  {
    id: '4',
    ssid: 'CONVERGE_FIBERX_5G',
    bssid: 'E8:65:04:19:80:5C',
    manufacturer: 'ZTE Corporation',
    encryption: 'WPA2/WPA3-SAE',
    band: '5 GHz',
    channel: 36,
    signal: -62,
    signalHistory: [-61, -62, -63, -62, -61, -62, -63, -62, -61, -62],
    location: '14.5995° N, 120.9842° E',
    clients: 5,
  },
  {
    id: '5',
    ssid: 'UBMT_BACKHAUL_M5',
    bssid: '24:5A:4C:90:E1:44',
    manufacturer: 'Ubiquiti Inc.',
    encryption: 'WPA2-Enterprise',
    band: '5 GHz',
    channel: 149,
    signal: -71,
    signalHistory: [-70, -71, -72, -71, -70, -71, -72, -71, -70, -71],
    location: 'No GPS fix',
    clients: 1,
  },
  {
    id: '6',
    ssid: 'MERCURY_MW325R',
    bssid: 'B0:4E:26:11:AA:33',
    manufacturer: 'MERCURY',
    encryption: 'WPA2-PSK (CCMP)',
    band: '2.4 GHz',
    channel: 6,
    signal: -68,
    signalHistory: [-67, -68, -69, -68, -67, -68, -69, -68, -67, -68],
    location: '14.6001° N, 120.9848° E',
    clients: 3,
  },
  {
    id: '7',
    ssid: 'PLDTHOMEFIBR_A2B3C',
    bssid: 'F8:8E:85:12:34:56',
    manufacturer: 'PLDT',
    encryption: 'WPA2-PSK (CCMP)',
    band: '2.4 GHz',
    channel: 9,
    signal: -73,
    signalHistory: [-72, -73, -74, -73, -72, -73, -74, -73, -72, -73],
    location: '14.5997° N, 120.9843° E',
    clients: 4,
  },

  // ─── WEAK (< -75 dBm) ───
  {
    id: '8',
    ssid: 'GLOBE_AT_HOME_88A',
    bssid: 'B0:95:75:2A:4C:10',
    manufacturer: 'Huawei Technologies',
    encryption: 'WPA2-PSK (CCMP)',
    band: '2.4 GHz',
    channel: 6,
    signal: -82,
    signalHistory: [-81, -82, -83, -82, -81, -82, -83, -82, -81, -82],
    location: 'No GPS fix',
    clients: 4,
  },
  {
    id: '9',
    ssid: 'PLDTHOMEFIBR5Yvpc',
    bssid: 'D4:4F:67:C7:0E:70',
    manufacturer: 'FiberHome Telecommunication',
    encryption: 'WPA2-PSK (CCMP)',
    band: '2.4 GHz',
    channel: 3,
    signal: -87,
    signalHistory: [-86, -87, -88, -87, -86, -87, -88, -87, -86, -87],
    location: '14.5995° N, 120.9842° E',
    clients: 2,
  },
  {
    id: '10',
    ssid: 'SMART_WIFI_5G_2F',
    bssid: 'C4:41:1E:9F:BB:22',
    manufacturer: 'Smart Communications',
    encryption: 'WPA2-PSK (CCMP)',
    band: '5 GHz',
    channel: 100,
    signal: -79,
    signalHistory: [-78, -79, -80, -79, -78, -79, -80, -79, -78, -79],
    location: 'No GPS fix',
    clients: 8,
  },
  {
    id: '11',
    ssid: 'TP-LINK_GUEST',
    bssid: '48:22:54:77:99:11',
    manufacturer: 'TP-Link Corporation',
    encryption: 'Open',
    band: '2.4 GHz',
    channel: 13,
    signal: -84,
    signalHistory: [-83, -84, -85, -84, -83, -84, -85, -84, -83, -84],
    location: 'No GPS fix',
    clients: 15,
  },
  {
    id: '12',
    ssid: 'ANDROID_AP_HOTSPOT',
    bssid: '9C:35:EB:22:44:66',
    manufacturer: 'Samsung Electronics',
    encryption: 'WPA2-PSK',
    band: '5 GHz',
    channel: 157,
    signal: -76,
    signalHistory: [-75, -76, -77, -76, -75, -76, -77, -76, -75, -76],
    location: '14.5999° N, 120.9846° E',
    clients: 1,
  },
];

const SignalMap = () => {
  const [error, setError] = useState(null);
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [bandFilter, setBandFilter] = useState('Both');
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  const handleToggleGps = () => setGpsEnabled((prev) => !prev);

  const handleSendToDeAuth = (net) => {
    setSnackbar({
      open: true,
      message: `Queued ${net.ssid} in DeAuth Monitor`,
    });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <SignalMapView
        networks={MOCK_NETWORKS}
        bandFilter={bandFilter}
        onBandFilterChange={setBandFilter}
        gpsEnabled={gpsEnabled}
        onToggleGps={handleToggleGps}
        onSendToDeAuth={handleSendToDeAuth}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        message={snackbar.message}
      />
    </Box>
  );
};

export default SignalMap;