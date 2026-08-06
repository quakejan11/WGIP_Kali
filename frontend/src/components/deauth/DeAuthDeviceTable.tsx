// src/components/deauth/DeAuthDeviceTable.tsx
import React from 'react';
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
} from '@mui/material';
import { PlayArrow, Flag, CheckCircle, Error, Warning, Info } from '@mui/icons-material';
import { DeauthDevice } from '../../services/deauthService';

interface DeAuthDeviceTableProps {
  devices: DeauthDevice[];
  loading?: boolean;
  onExecuteDeauth: (client_mac: string) => void;
  onFlagDevice: (device: DeauthDevice) => void;
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
}) => {
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
        <Typography color="textSecondary">No devices found</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Flagged Devices
      </Typography>
      <TableContainer>
        <Table size="medium">
          <TableHead>
            <TableRow>
              <TableCell>MAC Address</TableCell>
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
                      onClick={() => onExecuteDeauth(device.client_mac)}
                    >
                      <PlayArrow fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Flag Device">
                    <IconButton
                      size="small"
                      color="warning"
                      onClick={() => onFlagDevice(device)}
                    >
                      <Flag fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default DeAuthDeviceTable;