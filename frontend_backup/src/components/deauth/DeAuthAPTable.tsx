// src/components/deauth/DeAuthAPTable.tsx

import React, { useState } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Chip,
  CircularProgress,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
} from '@mui/material';
import { PlayArrow, Wifi, Search, Refresh } from '@mui/icons-material';
import { APData } from '../../services/deauthService';

interface DeAuthAPTableProps {
  aps: APData[];
  loading?: boolean;
  onDeauthAP: (bssid: string, ssid: string, reason: string, count?: number) => Promise<void>;
  onViewClients: (bssid: string) => void;
  onRefresh?: () => void;
}

const DeAuthAPTable: React.FC<DeAuthAPTableProps> = ({
  aps,
  loading,
  onDeauthAP,
  onViewClients,
  onRefresh,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAP, setSelectedAP] = useState<APData | null>(null);
  const [reason, setReason] = useState('Security policy violation');
  const [packetCount, setPacketCount] = useState(10);
  const [deauthLoading, setDeauthLoading] = useState(false);

  const handleDeauthClick = (ap: APData) => {
    if (ap.client_count === 0) return;
    setSelectedAP(ap);
    setDialogOpen(true);
  };

  const handleConfirmDeauth = async () => {
    if (!selectedAP) return;
    setDeauthLoading(true);
    try {
      await onDeauthAP(selectedAP.bssid, selectedAP.ssid, reason, packetCount);
      setDialogOpen(false);
    } catch (error) {
      console.error('Deauth failed:', error);
    } finally {
      setDeauthLoading(false);
    }
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
      </Paper>
    );
  }

  if (aps.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="textSecondary">No APs found. Please refresh or check interface.</Typography>
        {onRefresh && (
          <Button
            startIcon={<Refresh />}
            onClick={onRefresh}
            sx={{ mt: 2 }}
          >
            Refresh
          </Button>
        )}
      </Paper>
    );
  }

  return (
    <>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          Wi-Fi Networks (APs)
          <Chip label={`${aps.length} networks`} size="small" />
        </Typography>
        
        <TableContainer>
          <Table size="medium">
            <TableHead>
              <TableRow>
                <TableCell>SSID</TableCell>
                <TableCell>BSSID / MAC</TableCell>
                <TableCell>Channel</TableCell>
                <TableCell>Manufacturer</TableCell>
                <TableCell align="center">Clients</TableCell>
                <TableCell>Last Seen</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {aps.map((ap) => (
                <TableRow key={ap.bssid} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {ap.ssid || 'Hidden Network'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontSize="13px">
                      {ap.bssid}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={`CH ${ap.channel || '?'}`} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="textSecondary" fontSize="12px">
                      {ap.manufacturer || 'Unknown'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={ap.client_count || 0}
                      size="small"
                      color={ap.client_count > 0 ? 'primary' : 'default'}
                      variant={ap.client_count > 0 ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontSize="12px">
                      {ap.last_seen ? new Date(ap.last_seen).toLocaleTimeString() : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={`View clients connected to ${ap.ssid}`}>
                      <IconButton
                        size="small"
                        color="info"
                        onClick={() => onViewClients(ap.bssid)}
                      >
                        <Wifi fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={`Deauth ALL clients on ${ap.ssid}`}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeauthClick(ap)}
                        disabled={ap.client_count === 0}
                      >
                        <PlayArrow fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Deauth Dialog */}
      <Dialog open={dialogOpen} onClose={() => !deauthLoading && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Deauth Clients on {selectedAP?.ssid || 'Network'}
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will send deauth packets to all {selectedAP?.client_count || 0} clients connected to this AP.
          </Alert>
          <TextField
            fullWidth
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={2}
            sx={{ mt: 2 }}
            disabled={deauthLoading}
          />
          <TextField
            fullWidth
            label="Packet Count"
            type="number"
            value={packetCount}
            onChange={(e) => setPacketCount(Math.max(1, parseInt(e.target.value) || 10))}
            sx={{ mt: 2 }}
            disabled={deauthLoading}
            helperText="Number of deauth packets to send (recommended: 5-20)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={deauthLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDeauth}
            disabled={deauthLoading}
            startIcon={deauthLoading ? <CircularProgress size={20} /> : <PlayArrow />}
          >
            {deauthLoading ? 'Processing...' : 'Execute Deauth'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DeAuthAPTable;