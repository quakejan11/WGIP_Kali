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
import { Block, Delete, Stop, Download } from '@mui/icons-material';
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
  capture_file?: string;
  capture_log?: string;
  capture_started_at?: string;
  capture_stopped_at?: string;
  capture_pid?: number | null;
  deauth_pid?: number | null;
  has_capture?: boolean;
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

const parseFilenameFromHeader = (header?: string | null): string | null => {
  if (!header) return null;
  const starMatch = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (starMatch?.[1]) {
    try {
      return decodeURIComponent(starMatch[1].trim().replace(/^["']|["']$/g, ''));
    } catch {
      /* fall through */
    }
  }
  const plainMatch = /filename=([^;]+)/i.exec(header);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
};

const DeAuthAPTable: React.FC<DeAuthAPTableProps> = ({ onDeauthAP, onStopDeauth }) => {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [attackingBssids, setAttackingBssids] = useState<Set<string>>(new Set());

  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });

  useEffect(() => {
    fetchTargets();
    const interval = setInterval(fetchTargets, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setAttackingBssids((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      targets.forEach((t) => {
        const h = (t.handshake || '').toLowerCase();
        const stillCapturing =
          h === 'capturing' ||
          (typeof t.capture_pid === 'number' &&
            t.capture_pid > 0 &&
            h !== 'captured' &&
            h !== 'failed');
        if (!stillCapturing && next.has(t.bssid)) {
          next.delete(t.bssid);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [targets]);

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

  const isAttacking = (t: Target) => {
    const h = (t.handshake || '').toLowerCase();
    const s = (t.status || '').toLowerCase();

    if (h === 'capturing') return true;
    if (['captured', 'success', 'failed', 'error'].includes(h)) return false;
    if (typeof t.capture_pid === 'number' && t.capture_pid > 0) return true;
    if (['active', 'running', 'attacking', 'capturing'].includes(s)) return true;
    return attackingBssids.has(t.bssid);
  };

  const handleAttackClick = (t: Target) => {
    setAttackingBssids((prev) => {
      const next = new Set(prev);
      next.add(t.bssid);
      return next;
    });
    onDeauthAP(t.bssid, t.ssid || 'Unknown', t.channel);
  };

  const handleStopAttack = (t: Target) => {
    setAttackingBssids((prev) => {
      const next = new Set(prev);
      next.delete(t.bssid);
      return next;
    });
    if (onStopDeauth) {
      onStopDeauth(t.bssid);
    } else {
      console.warn('onStopDeauth handler not provided');
    }
  };

  const handleDownloadCapture = async (t: Target) => {
    if (!t.has_capture) {
      setSnackbar({
        open: true,
        message: 'No capture file available yet',
        severity: 'error',
      });
      return;
    }

    setDownloadingId(t.id);
    try {
      const response: any = await targetService.downloadCapture(t.id);

      const blob: Blob =
        response instanceof Blob
          ? response
          : response?.data instanceof Blob
          ? response.data
          : new Blob([response], { type: 'application/octet-stream' });

      const headerFilename = parseFilenameFromHeader(
        response?.headers?.['content-disposition'],
      );
      const fallbackFilename =
        (t.capture_file && t.capture_file.split('/').pop()) || `capture_${t.id}.cap`;
      const serverFilename = headerFilename || fallbackFilename;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = serverFilename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 0);

      setSnackbar({
        open: true,
        message: `Downloaded: ${serverFilename}`,
        severity: 'success',
      });
    } catch (err: any) {
      console.error('Download failed:', err);

      let detail = err?.message || 'unknown error';
      const maybeBlob = err?.response?.data;
      if (maybeBlob instanceof Blob) {
        try {
          const text = await maybeBlob.text();
          const parsed = JSON.parse(text);
          if (parsed?.detail) detail = parsed.detail;
        } catch {
          /* ignore */
        }
      } else if (maybeBlob?.detail) {
        detail = maybeBlob.detail;
      }

      setSnackbar({
        open: true,
        message: `Download failed: ${detail}`,
        severity: 'error',
      });
    } finally {
      setDownloadingId(null);
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
            {targets.map((t) => {
              const active = isAttacking(t);
              const downloading = downloadingId === t.id;
              return (
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
                      <Tooltip
                        title={
                          active
                            ? 'Attack already running — stop it first'
                            : `Attack ${t.ssid || t.bssid} + capture handshake`
                        }
                      >
                        <span>
                          <Button
                            size="small"
                            variant="contained"
                            color="error"
                            startIcon={<Block sx={{ fontSize: '15px !important' }} />}
                            onClick={() => handleAttackClick(t)}
                            disabled={active}
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
                              '&:disabled': {
                                bgcolor: '#e5e7eb',
                                color: '#9ca3af',
                              },
                            }}
                          >
                            Attack
                          </Button>
                        </span>
                      </Tooltip>

                      {/* Stop Attack */}
                      <Tooltip
                        title={
                          active
                            ? `Stop attack on ${t.ssid || t.bssid}`
                            : 'No attack running'
                        }
                      >
                        <span>
                          <Button
                            size="small"
                            variant="contained"
                            color="warning"
                            startIcon={<Stop sx={{ fontSize: '15px !important' }} />}
                            onClick={() => handleStopAttack(t)}
                            disabled={!active}
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
                              '&:disabled': {
                                bgcolor: '#e5e7eb',
                                color: '#9ca3af',
                              },
                            }}
                          >
                            Stop
                          </Button>
                        </span>
                      </Tooltip>

                      {/* Download Capture */}
                      <Tooltip
                        title={
                          t.has_capture
                            ? `Download capture file:\n${t.capture_file}`
                            : 'No capture file available yet'
                        }
                      >
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleDownloadCapture(t)}
                            disabled={!t.has_capture || downloading}
                            sx={{
                              width: 28,
                              height: 28,
                              border: '1px solid #e0e7ef',
                              color: downloading ? '#22c55e' : '#64748b',
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
                            {downloading ? (
                              <CircularProgress size={14} sx={{ color: '#22c55e' }} />
                            ) : (
                              <Download sx={{ fontSize: 16 }} />
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
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

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