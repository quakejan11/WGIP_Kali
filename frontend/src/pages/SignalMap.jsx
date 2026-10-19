// src/pages/SignalMap.jsx
import React, { useState } from 'react';
import { Box, Alert, Snackbar } from '@mui/material';
import SignalMapView from '../components/SignalMap/SignalMapView';

const SignalMap = () => {
  const [error, setError] = useState(null);
  const [bandFilter, setBandFilter] = useState('Both');
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

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

      {/* No networks prop → SignalMapView fetches live from /api/live/events/recent */}
      <SignalMapView
        bandFilter={bandFilter}
        onBandFilterChange={setBandFilter}
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