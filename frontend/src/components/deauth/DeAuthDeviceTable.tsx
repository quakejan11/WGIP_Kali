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
  CircularProgress,
} from '@mui/material';

// Define the Device interface locally since it's not imported
export interface DeauthDevice {
  id: string | number;
  client_mac: string;
  ssid?: string;
  gps?: string;
  status?: string;
  notes?: string;
  deauth_count?: number;
  last_deauth_attempt?: string;
}

interface DeAuthDeviceTableProps {
  devices: DeauthDevice[];
  loading?: boolean;
  onExecuteDeauth?: (client_mac: string) => void;
  onFlagDevice?: (device: DeauthDevice) => void;
}

const DeAuthDeviceTable: React.FC<DeAuthDeviceTableProps> = ({
  devices,
  loading = false,
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

  if (!devices || devices.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="textSecondary">No devices found</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        Handshake Captured
      </Typography>
      <TableContainer>
        <Table size="medium">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>
                MAC Address
              </TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>
                SSID
              </TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>
                GPS
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {devices.map((device) => (
              <TableRow 
                key={device.id || device.client_mac} 
                hover 
                sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
              >
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Typography 
                    variant="body2" 
                    sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  >
                    {device.client_mac || 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Typography 
                    variant="body2" 
                    sx={{ fontWeight: 500, fontSize: '0.9rem' }}
                  >
                    {device.ssid || 'Unknown'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Typography 
                    variant="body2" 
                    sx={{ fontSize: '0.85rem', color: 'text.secondary' }}
                  >
                    {device.gps || 'N/A'}
                  </Typography>
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