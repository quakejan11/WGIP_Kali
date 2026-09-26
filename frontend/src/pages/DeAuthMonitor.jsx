// src/pages/DeAuthMonitor.jsx
import React, { useState } from 'react';
import { Box, Typography, Alert, Snackbar } from '@mui/material';
import {
  DeAuthStats,
  DeAuthAPTable,
  DeAuthLogs,
  FlagDeviceDialog,
  DeAuthButtons,
} from '../components/deauth';
import useDeAuth from '../hooks/useDeAuth';
import deauthService from '../services/deauthService';

const DeAuthMonitor = () => {
  const {
    devices,
    aps,
    stats,
    logs,
    loading,
    error,
    fetchData,
    executeDeauth,
    deauthAP,
    flagDevice,
  } = useDeAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'info',
  });

  const showNotification = (message, severity) => {
    setNotification({ open: true, message, severity });
  };

  const handleFlagDevice = async (clientMac, reason, operator) => {
    try {
      await flagDevice(clientMac, reason, operator);
      showNotification(`Device ${clientMac} flagged successfully`, 'success');
      setDialogOpen(false);
    } catch (error) {
      showNotification('Failed to flag device', 'error');
    }
  };

  // ⬇️ UPDATED: Uses /api/deauth/execute with capture_handshake: true
  const handleDeauthAP = async (bssid, ssid, channel) => {
    const confirmed = window.confirm(
      `Start deauth attack on "${ssid}" and capture handshake?\n\nBSSID: ${bssid}\nChannel: ${channel}`
    );
    if (!confirmed) return;

    try {
      const response = await deauthService.executeDeauthFull({
        bssid,
        channel,
        count: 0,                    // 0 = continuous
        capture_handshake: true,
        reason: `Deauth from UI: ${ssid}`,
      });

      const data = response.data;

      if (data.success) {
        const captureMsg = data.capture?.started
          ? ' + handshake capture started'
          : '';
        showNotification(
          `Attack started on ${ssid}${captureMsg}`,
          'success'
        );
      } else {
        showNotification(data.message || `Failed to attack ${ssid}`, 'error');
      }
    } catch (error) {
      const detail = error.response?.data?.detail || error.message;
      showNotification(`Failed to start attack: ${detail}`, 'error');
    }
  };

  // ⬇️ Stop handler
  const handleStopDeauth = async (bssid) => {
    const confirmed = window.confirm(`Stop attack on ${bssid}?`);
    if (!confirmed) return;

    try {
      const response = await deauthService.stopDeauth(bssid);
      const data = response.data;

      if (data.success) {
        showNotification(`Stopped attack on ${bssid}`, 'success');
      } else {
        showNotification(data.message || `Failed to stop`, 'error');
      }
    } catch (error) {
      const detail = error.response?.data?.detail || error.message;
      showNotification(`Failed to stop attack: ${detail}`, 'error');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          DeAuth Monitor
        </Typography>
        <DeAuthButtons
          onRefresh={fetchData}
          onFlagDevice={() => setDialogOpen(true)}
          loading={loading}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Selected Targets Table */}
      <DeAuthAPTable
        onDeauthAP={handleDeauthAP}
        onStopDeauth={handleStopDeauth}
      />

      {/* ❌ REMOVED: DeAuthDeviceTable ("Handshake Captured" table) */}

      <FlagDeviceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleFlagDevice}
        loading={loading}
      />

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

export default DeAuthMonitor;