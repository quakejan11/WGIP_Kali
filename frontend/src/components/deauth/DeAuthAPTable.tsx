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
  IconButton,
  Chip,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import { PlayArrow, Wifi } from '@mui/icons-material';

export interface APData {
  bssid: string;
  ssid: string;
  channel: number;
  manufacturer: string;
  client_count: number;
  last_seen: string;
}

interface DeAuthAPTableProps {
  aps: APData[];
  loading?: boolean;
  onDeauthAP: (bssid: string, ssid: string) => void;
  onViewClients: (bssid: string) => void;
}

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
        <Typography color="textSecondary">No APs found</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Wi-Fi Networks (APs)
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
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {aps.map((ap) => (
              <TableRow key={ap.bssid} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {ap.ssid || 'Unknown'}
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
                      onClick={() => onDeauthAP(ap.bssid, ap.ssid || ap.bssid)}
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
  );
};

export default DeAuthAPTable;