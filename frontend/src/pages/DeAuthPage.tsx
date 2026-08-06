// src/pages/DeAuthPage.tsx
import React, { useState } from 'react';
import { Box, Typography, Alert, Snackbar } from '@mui/material';
import {
  DeAuthStats,
  DeAuthDeviceTable,
  DeAuthAPTable,
  DeAuthLogs,
  FlagDeviceDialog,
  DeAuthButtons,
} from '../components/deauth';
import useDeAuth from '../hooks/useDeAuth';

const DeAuthPage: React.FC = () => {
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
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({ open: false, message: '', severity: 'info' });

  const showNotification = (message: string, severity: 'success' | 'error' | 'info' | 'warning') => {
    setNotification({ open: true, message, severity });
  };

  const handleFlagDevice = async (clientMac: string, reason: string, operator: string) => {
    try {
      await flagDevice(clientMac, reason, operator);
      showNotification(`Device ${clientMac} flagged successfully`, 'success');
      setDialogOpen(false);
    } catch (error) {
      showNotification('Failed to flag device', 'error');
    }
  };

  const handleExecuteDeauth = async (clientMac: string) => {
    try {
      const result = await executeDeauth(clientMac);
      if (result.success) {
        showNotification(`Deauth successful for ${clientMac}`, 'success');
      } else {
        showNotification(`Deauth failed for ${clientMac}: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Failed to execute deauth', 'error');
    }
  };

  const handleDeauthAP = async (bssid: string, ssid: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to deauth ALL clients connected to "${ssid}"?`
    );
    if (!confirmed) return;

    try {
      const result = await deauthAP(bssid, `Deauth all clients on ${ssid}`);
      if (result.success) {
        showNotification(
          `Deauth successful for ${result.successful_deauths} clients on ${ssid}`,
          'success'
        );
      } else {
        showNotification(`Deauth failed for ${ssid}: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Failed to deauth AP', 'error');
    }
  };

  const handleViewClients = (bssid: string) => {
    showNotification(`Showing clients for ${bssid} (coming soon)`, 'info');
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">
          De-Authentication Module
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

      <DeAuthStats stats={stats} loading={loading} />

      <DeAuthAPTable
        aps={aps}
        loading={loading}
        onDeauthAP={handleDeauthAP}
        onViewClients={handleViewClients}
      />

      <DeAuthDeviceTable
        devices={devices}
        loading={loading}
        onExecuteDeauth={handleExecuteDeauth}
        onFlagDevice={(device) => {
          setDialogOpen(true);
        }}
      />

      <DeAuthLogs logs={logs} loading={loading} />

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

export default DeAuthPage;