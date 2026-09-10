// src/components/deauth/DeAuthAPTable.tsx
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
  Chip,
  CircularProgress,
} from '@mui/material';
import { PlayArrow, Wifi } from '@mui/icons-material';

export interface APData {
  bssid: string;
  ssid: string;
  channel: number;
  manufacturer: string;
  client_count: number;
  last_seen: string;
  gps?: string;
  status?: string; // DeAuth Status: 'success' or 'failed'
  handshake_status?: string; // HandShake Status: 'success' or 'failed'
}

interface DeAuthAPTableProps {
  aps: APData[];
  loading?: boolean;
  onDeauthAP: (bssid: string, ssid: string) => void;
  onViewClients: (bssid: string) => void;
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
    case 'success': return 'success';
    case 'failed': return 'error';
    default: return 'default';
  }
};

const DeAuthAPTable: React.FC<DeAuthAPTableProps> = ({
  aps,
  loading,
  onDeauthAP,
  onViewClients,
}) => {
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
        <Typography color="text.secondary">No APs found</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        DeAuthenticated Devices
      </Typography>
      <TableContainer>
        <Table size="medium">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>SSID</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>BSSID / MAC</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>Channel</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>GPS</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>DeAuth Status</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 2, fontSize: '0.85rem' }}>HandShake Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {aps.map((ap) => (
              <TableRow key={ap.bssid} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.9rem' }}>
                    {ap.ssid || 'Unknown'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {ap.bssid}
                  </Typography>
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Chip 
                    label={`CH ${ap.channel || '?'}`} 
                    size="small" 
                    variant="outlined"
                    sx={{ fontSize: '0.75rem' }}
                  />
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Typography variant="body2" sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                    {ap.gps || 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Chip
                    label={ap.status || 'Unknown'}
                    color={getDeAuthStatusColor(ap.status)}
                    size="small"
                    variant="filled"
                    sx={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 500,
                      bgcolor: ap.status?.toLowerCase() === 'success' ? '#22c55e' : 
                               ap.status?.toLowerCase() === 'failed' ? '#dc2626' : '#e5e7eb',
                      color: ap.status?.toLowerCase() === 'success' ? '#fff' : 
                             ap.status?.toLowerCase() === 'failed' ? '#fff' : '#374151',
                    }}
                  />
                </TableCell>
                <TableCell sx={{ py: 2.5, px: 2 }}>
                  <Chip
                    label={ap.handshake_status || 'Unknown'}
                    color={getHandshakeStatusColor(ap.handshake_status)}
                    size="small"
                    variant="filled"
                    sx={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 500,
                      bgcolor: ap.handshake_status?.toLowerCase() === 'success' ? '#22c55e' : 
                               ap.handshake_status?.toLowerCase() === 'failed' ? '#dc2626' : '#e5e7eb',
                      color: ap.handshake_status?.toLowerCase() === 'success' ? '#fff' : 
                             ap.handshake_status?.toLowerCase() === 'failed' ? '#fff' : '#374151',
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default DeAuthAPTable;