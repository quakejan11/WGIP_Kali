// src/components/deauth/DeAuthAPTable.tsx
import React, { useState, useEffect } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  CircularProgress,
  Button,
  Stack,
  Tooltip,
  Snackbar,
  Alert,
  IconButton,
} from '@mui/material';
import { Block, Delete, Stop, ContentCopy, Check } from '@mui/icons-material';
import targetService from '../../services/targetService';

interface Target {
  id: number;
  bssid: string;
  ssid?: string;
  channel: number;
  signal?: number;
  handshake?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  capture_file?: string;         // ⬅️ NEW
  capture_log?: string;          // ⬅️ NEW
  capture_started_at?: string;
  capture_stopped_at?: string;
}

interface DeAuthAPTableProps {
  onDeauthAP: (bssid: string, ssid: string, channel: number) => void;
  onStopDeauth?: (bssid: string) => void;
}

const getDeAuthStatusColor = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'success': return 'success';
    case 'failed': return 'error';
    default: return 'default';
  }
};

const getHandshakeStatusColor = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'captured': return 'success';
    case 'success': return 'success';
    case 'failed': return 'error';
    case 'capturing': return 'info';
    case 'pending': return 'warning';
    default: return 'default';
  }
};

const getHandshakeChipStyles = (status?: string) => {
  const s = status?.toLowerCase();
  if (s === 'captured' || s === 'success') {
    return { bgcolor: '#22c55e', color: '#fff' };
  }
  if (s === 'failed') {
    return { bgcolor: '#dc2626', color: '#fff' };
  }
  if (s === 'capturing') {
    return { bgcolor: '#3b82f6', color: '#fff' };
  }
  if (s === 'pending') {
    return { bgcolor: '#eab308', color: '#fff' };
  }
  return { bgcolor: '#e5e7eb', color: '#374151' };
};

const DeAuthAPTable: React.FC<DeAuthAPTableProps> = ({ onDeauthAP, onStopDeauth }) => {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ⬇️ Copy feedback
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });

  // Initial fetch + auto-poll every 5s
  useEffect(() => {
    fetchTargets();

    const interval = setInterval(fetchTargets, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchTargets = async () => {
    try {
      const response = await targetService.getTargets();
      const data = response.data;

      if (Array.isArray(data)) setTargets(data);
      else if (data?.targets) setTargets(data.targets);
      else if (data?.data) setTargets(data.data);
      else setTargets([]);

      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch targets:', err);
      if (targets.length === 0) {
        setError(err.response?.data?.detail || err.message || 'Failed to fetch targets');
      }
    } finally {
      setLoading(false);
    }
  };

  // ⬇️ NEW: Copy full path to clipboard
  const handleCopyPath = async (text: string, id: number) => {
    if (!text) {
      setSnackbar({
        open: true,
        message: 'No handshake file available yet',
        severity: 'error',
      });
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure context
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopiedId(id);
      setSnackbar({
        open: true,
        message: `Path copied: ${text.split('/').pop()}`,
        severity: 'success',
      });

      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      setSnackbar({
        open: true,
        message: 'Failed to copy — check console',
        severity: 'error',
      });
    }
  };

  const handleRemove = async (id: number) => {
    if (!window.confirm('Remove this target?')) return;

    try {
      await targetService.deleteTarget(id);
      setTargets((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Failed to remove target:', err);
      alert('Failed to remove target');
    }
  };

  const handleStopAttack = (target: Target) => {
    if (onStopDeauth) {
      onStopDeauth(target.bssid);
    } else {
      console.warn('onStopDeauth handler not provided');
    }
  };

  if (loading && targets.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
      </Paper>
    );
  }

  if (error && targets.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error">{error}</Typography>
        <Button onClick={fetchTargets} sx={{ mt: 2 }} variant="outlined">
          Retry
        </Button>
      </Paper>
    );
  }

  if (targets.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          No targets yet — go to Live Scan and click "Select Target"
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        Selected Targets
      </Typography>
      <TableContainer>
        <Table size="medium">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>SSID</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>BSSID / MAC</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>Channel</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>Signal</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>DeAuth Status</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>HandShake Status</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem', textAlign: 'center' }}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {targets.map((t) => (
              <TableRow key={t.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.9rem' }}>
                    {t.ssid || 'Unknown'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {t.bssid}
                  </Typography>
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Chip
                    label={`CH ${t.channel || '?'}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.75rem' }}
                  />
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.85rem',
                      color:
                        t.signal >= -50 ? '#22c55e' :
                        t.signal >= -60 ? '#eab308' :
                        t.signal >= -70 ? '#eab308' :
                        '#ef4444',
                    }}
                  >
                    {t.signal ? `${t.signal} dBm` : 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Chip
                    label={t.status || 'pending'}
                    color={getDeAuthStatusColor(t.status)}
                    size="small"
                    variant="filled"
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      bgcolor:
                        t.status?.toLowerCase() === 'success' ? '#22c55e' :
                        t.status?.toLowerCase() === 'failed' ? '#dc2626' :
                        '#e5e7eb',
                      color:
                        t.status?.toLowerCase() === 'success' ? '#fff' :
                        t.status?.toLowerCase() === 'failed' ? '#fff' :
                        '#374151',
                    }}
                  />
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Chip
                    label={t.handshake || 'pending'}
                    color={getHandshakeStatusColor(t.handshake)}
                    size="small"
                    variant="filled"
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      ...getHandshakeChipStyles(t.handshake),
                    }}
                  />
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2, textAlign: 'center' }}>
                  <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                    {/* Attack */}
                    <Tooltip title={`Attack ${t.ssid || t.bssid} + capture handshake`}>
                      <Button
                        size="small"
                        variant="contained"
                        color="error"
                        startIcon={<Block sx={{ fontSize: '15px !important' }} />}
                        onClick={() => onDeauthAP(t.bssid, t.ssid || 'Unknown', t.channel)}
                        sx={{
                          minWidth: 75,
                          height: 28,
                          px: 1,
                          borderRadius: 1.25,
                          bgcolor: '#dc2626',
                          color: '#fff',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          textTransform: 'none',
                          boxShadow: 'none',
                          '&:hover': {
                            bgcolor: '#b91c1c',
                            boxShadow: 'none',
                          },
                        }}
                      >
                        Attack
                      </Button>
                    </Tooltip>

                    {/* Stop Attack */}
                    <Tooltip title={`Stop attack on ${t.ssid || t.bssid}`}>
                      <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        startIcon={<Stop sx={{ fontSize: '15px !important' }} />}
                        onClick={() => handleStopAttack(t)}
                        sx={{
                          minWidth: 65,
                          height: 28,
                          px: 1,
                          borderRadius: 1.25,
                          bgcolor: '#eab308',
                          color: '#fff',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          textTransform: 'none',
                          boxShadow: 'none',
                          '&:hover': {
                            bgcolor: '#ca8a04',
                            boxShadow: 'none',
                          },
                        }}
                      >
                        Stop
                      </Button>
                    </Tooltip>

                    {/* ⬇️ NEW: Copy Path button */}
                    <Tooltip
                      title={
                        t.capture_file
                          ? `Click to copy full path:\n${t.capture_file}`
                          : 'No handshake file available yet'
                      }
                    >
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => handleCopyPath(t.capture_file || '', t.id)}
                          disabled={!t.capture_file}
                          sx={{
                            width: 28,
                            height: 28,
                            border: '1px solid #e0e7ef',
                            color: copiedId === t.id ? '#22c55e' : '#64748b',
                            bgcolor: '#fff',
                            '&:hover': {
                              borderColor: '#065f46',
                              color: '#065f46',
                              bgcolor: '#f0fdf4',
                            },
                            '&:disabled': {
                              opacity: 0.4,
                              cursor: 'not-allowed',
                            },
                          }}
                        >
                          {copiedId === t.id ? (
                            <Check sx={{ fontSize: 16 }} />
                          ) : (
                            <ContentCopy sx={{ fontSize: 14 }} />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>

                    {/* Remove */}
                    <Tooltip title="Remove target">
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<Delete sx={{ fontSize: '15px !important' }} />}
                        onClick={() => handleRemove(t.id)}
                        sx={{
                          minWidth: 55,
                          height: 28,
                          px: 0.75,
                          borderRadius: 1.25,
                          fontSize: '0.68rem',
                          textTransform: 'none',
                          borderColor: '#e0e7ef',
                          color: '#64748b',
                          '&:hover': {
                            borderColor: '#dc2626',
                            color: '#dc2626',
                            bgcolor: '#fef2f2',
                          },
                        }}
                      >
                        Remove
                      </Button>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ⬇️ Copy feedback snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={2500}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Paper>
  );
};

export default DeAuthAPTable;