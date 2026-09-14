// src/pages/DeAuthMonitor.jsx
import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Snackbar,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import useDeAuth from '../hooks/useDeAuth';

const getStatusChipProps = (status) => {
  const normalized = status?.toLowerCase();
  if (normalized === 'success') {
    return { bgcolor: '#22c55e', color: '#fff', label: 'Success' };
  }
  if (normalized === 'failed') {
    return { bgcolor: '#dc2626', color: '#fff', label: 'Failed' };
  }
  return { bgcolor: '#e5e7eb', color: '#374151', label: status || 'Unknown' };
};

// Column definitions with equal widths (20% each for 5 columns)
const columns = [
  { key: 'ssid', label: 'SSID', width: '20%' },
  { key: 'mac', label: 'MAC Address', width: '20%' },
  { key: 'gps', label: 'GPS', width: '20%' },
  { key: 'status', label: 'Status', width: '20%' },
  { key: 'handshake_status', label: 'Handshake Status', width: '20%' },
];

const DeAuthMonitor = () => {
  const {
    devices,
    aps,
    loading,
    error,
    fetchData,
    deauthAP,
  } = useDeAuth();

  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'info',
  });

  const showNotification = (message, severity) => {
    setNotification({ open: true, message, severity });
  };

  const handleDeauthAP = async (bssid, ssid) => {
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
        showNotification(`Deauth failed for ${ssid}`, 'error');
      }
    } catch (err) {
      showNotification('Failed to deauth AP', 'error');
    }
  };

  // Combine APs + devices into one list
  const combinedRows = [
    ...(aps || []).map((ap) => ({
      id: `ap-${ap.bssid}`,
      ssid: ap.ssid || 'Unknown',
      mac: ap.bssid,
      gps: ap.gps || 'N/A',
      status: ap.status,
      handshake_status: ap.handshake_status,
      type: 'AP',
    })),
    ...(devices || []).map((d) => ({
      id: `dev-${d.id || d.client_mac}`,
      ssid: d.ssid || 'Unknown',
      mac: d.client_mac,
      gps: d.gps || 'N/A',
      status: d.status,
      handshake_status: d.handshake_status,
      type: 'Device',
    })),
  ];

  const isEmpty = combinedRows.length === 0;

  return (
    <Box sx={{ p: 3, bgcolor: '#f5f7fa', minHeight: '100vh' }}>
      {/* Header: Title + Refresh */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        {/* Title font updated to match page headings */}
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            color: '#0f172a',
            fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' },
            letterSpacing: '-0.02em',
          }}
        >
          DeAuth Monitor
        </Typography>

        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon sx={{ fontSize: 18 }} />}
          onClick={fetchData}
          disabled={loading}
          sx={{
            textTransform: 'none',
            borderColor: '#10b981',
            color: '#10b981',
            fontWeight: 600,
            fontSize: '0.8rem',
            px: 2,
            py: 0.5,
            borderRadius: 1.5,
            bgcolor: '#fff',
            '&:hover': {
              borderColor: '#059669',
              bgcolor: '#ecfdf5',
            },
          }}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* ONE single table with equal column widths */}
      <Paper
        sx={{
          borderRadius: 2,
          border: '1px solid #e5e7eb',
          boxShadow: 'none',
          bgcolor: '#fff',
          overflow: 'hidden',
        }}
      >
        <TableContainer>
          <Table size="medium" sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafb' }}>
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    sx={{
                      width: col.width,
                      fontWeight: 600,
                      py: 2,
                      px: 2,
                      fontSize: '0.85rem',
                      color: '#64748b',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={32} />
                  </TableCell>
                </TableRow>
              ) : isEmpty ? (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center" sx={{ py: 6 }}>
                    <Typography variant="body1" sx={{ color: '#475569' }}>
                      No devices found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                combinedRows.map((row) => {
                  const deauthChip = getStatusChipProps(row.status);
                  const handshakeChip = getStatusChipProps(row.handshake_status);

                  return (
                    <TableRow
                      key={row.id}
                      hover
                      sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                    >
                      <TableCell sx={{ py: 2.5, px: 2, width: '20%' }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, fontSize: '0.9rem' }}
                        >
                          {row.ssid}
                        </Typography>
                      </TableCell>

                      <TableCell sx={{ py: 2.5, px: 2, width: '20%' }}>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                        >
                          {row.mac}
                        </Typography>
                      </TableCell>

                      <TableCell sx={{ py: 2.5, px: 2, width: '20%' }}>
                        <Typography
                          variant="body2"
                          sx={{ fontSize: '0.85rem', color: 'text.secondary' }}
                        >
                          {row.gps}
                        </Typography>
                      </TableCell>

                      <TableCell sx={{ py: 2.5, px: 2, width: '20%' }}>
                        <Chip
                          label={deauthChip.label}
                          size="small"
                          variant="filled"
                          sx={{
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            bgcolor: deauthChip.bgcolor,
                            color: deauthChip.color,
                          }}
                        />
                      </TableCell>

                      <TableCell sx={{ py: 2.5, px: 2, width: '20%' }}>
                        <Chip
                          label={handshakeChip.label}
                          size="small"
                          variant="filled"
                          sx={{
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            bgcolor: handshakeChip.bgcolor,
                            color: handshakeChip.color,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
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

export default DeAuthMonitor;