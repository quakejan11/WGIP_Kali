// src/components/deauth/DeAuthDeviceTable.tsx

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
  MenuItem,
  Alert,
} from '@mui/material';
import { PlayArrow, Flag, CheckCircle, Error, Warning, Info, Block, Delete } from '@mui/icons-material';
import { DeauthDevice, UpdateStatusRequest } from '../../services/deauthService';

interface DeAuthDeviceTableProps {
  devices: DeauthDevice[];
  loading?: boolean;
  onExecuteDeauth: (clientMac: string, reason: string, count?: number) => Promise<void>;
  onFlagDevice: (device: DeauthDevice) => void;
  onUpdateStatus: (clientMac: string, data: UpdateStatusRequest) => Promise<void>;
  onUnflagDevice?: (clientMac: string) => Promise<void>;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'success';
    case 'flagged': return 'warning';
    case 'pending': return 'info';
    case 'deauthenticated': return 'default';
    case 'blocked': return 'error';
    default: return 'default';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'active': return <CheckCircle fontSize="small" />;
    case 'flagged': return <Flag fontSize="small" />;
    case 'pending': return <Info fontSize="small" />;
    case 'deauthenticated': return <CheckCircle fontSize="small" />;
    case 'blocked': return <Error fontSize="small" />;
    default: return null;
  }
};

const DeAuthDeviceTable: React.FC<DeAuthDeviceTableProps> = ({
  devices,
  loading,
  onExecuteDeauth,
  onFlagDevice,
  onUpdateStatus,
  onUnflagDevice,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeauthDevice | null>(null);
  const [reason, setReason] = useState('Security policy violation');
  const [packetCount, setPacketCount] = useState(10);
  const [executing, setExecuting] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<UpdateStatusRequest['status']>('active');
  const [statusNotes, setStatusNotes] = useState('');

  const handleExecuteClick = (device: DeauthDevice) => {
    setSelectedDevice(device);
    setDialogOpen(true);
  };

  const handleConfirmExecute = async () => {
    if (!selectedDevice) return;
    setExecuting(true);
    try {
      await onExecuteDeauth(selectedDevice.client_mac, reason, packetCount);
      setDialogOpen(false);
    } catch (error) {
      console.error('Deauth failed:', error);
    } finally {
      setExecuting(false);
    }
  };

  const handleStatusUpdate = async (clientMac: string) => {
    try {
      await onUpdateStatus(clientMac, {
        status: newStatus,
        notes: statusNotes,
      });
      setStatusDialogOpen(false);
      setStatusNotes('');
    } catch (error) {
      console.error('Status update failed:', error);
    }
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
      </Paper>
    );
  }

  if (devices.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="textSecondary">No flagged devices found</Typography>
      </Paper>
    );
  }

  return (
    <>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Flagged Devices
          <Chip label={`${devices.length} devices`} size="small" sx={{ ml: 1 }} />
        </Typography>
        
        <TableContainer>
          <Table size="medium">
            <TableHead>
              <TableRow>
                <TableCell>MAC Address</TableCell>
                <TableCell>Display Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="center">Deauth Count</TableCell>
                <TableCell>Last Attempt</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {devices.map((device) => (
                <TableRow key={device.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontSize="13px">
                      {device.client_mac}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {device.display_name || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={device.status}
                      color={getStatusColor(device.status)}
                      size="small"
                      icon={getStatusIcon(device.status)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {device.notes || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">{device.deauth_count}</TableCell>
                  <TableCell>
                    {device.last_deauth_attempt
                      ? new Date(device.last_deauth_attempt).toLocaleString()
                      : '-'}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Execute Deauth">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleExecuteClick(device)}
                      >
                        <PlayArrow fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Flag/Edit Device">
                      <IconButton
                        size="small"
                        color="warning"
                        onClick={() => onFlagDevice(device)}
                      >
                        <Flag fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Change Status">
                      <IconButton
                        size="small"
                        color="info"
                        onClick={() => {
                          setSelectedDevice(device);
                          setNewStatus(device.status);
                          setStatusNotes(device.notes || '');
                          setStatusDialogOpen(true);
                        }}
                      >
                        <Info fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {device.status === 'blocked' && onUnflagDevice && (
                      <Tooltip title="Unflag Device">
                        <IconButton
                          size="small"
                          color="default"
                          onClick={() => onUnflagDevice(device.client_mac)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Execute Deauth Dialog */}
      <Dialog open={dialogOpen} onClose={() => !executing && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Deauth Device {selectedDevice?.client_mac}
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will send deauth packets to this specific device.
          </Alert>
          <TextField
            fullWidth
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={2}
            sx={{ mt: 2 }}
            disabled={executing}
          />
          <TextField
            fullWidth
            label="Packet Count"
            type="number"
            value={packetCount}
            onChange={(e) => setPacketCount(Math.max(1, parseInt(e.target.value) || 10))}
            sx={{ mt: 2 }}
            disabled={executing}
            helperText="Number of deauth packets to send (recommended: 5-20)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={executing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmExecute}
            disabled={executing}
            startIcon={executing ? <CircularProgress size={20} /> : <PlayArrow />}
          >
            {executing ? 'Processing...' : 'Execute Deauth'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Status Update Dialog */}
      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Update Device Status</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            label="Status"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as UpdateStatusRequest['status'])}
            sx={{ mt: 2 }}
          >
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="flagged">Flagged</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="deauthenticated">Deauthenticated</MenuItem>
            <MenuItem value="blocked">Blocked</MenuItem>
          </TextField>
          <TextField
            fullWidth
            label="Notes"
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
            multiline
            rows={3}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => selectedDevice && handleStatusUpdate(selectedDevice.client_mac)}
          >
            Update Status
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DeAuthDeviceTable;