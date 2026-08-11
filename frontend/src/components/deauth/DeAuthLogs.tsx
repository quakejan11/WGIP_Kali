// src/components/deauth/DeAuthLogs.tsx
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
import { DeauthLog } from '../../services/deauthService';

interface DeAuthLogsProps {
  logs: DeauthLog[];
  loading?: boolean;
}

const DeAuthLogs: React.FC<DeAuthLogsProps> = ({ logs, loading }) => {
  if (loading) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
      </Paper>
    );
  }

  if (logs.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="textSecondary">No logs found</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Recent Deauth Logs
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>MAC Address</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Operator</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="center">Packets</TableCell>
              <TableCell>Time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id} hover>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  {log.client_mac}
                </TableCell>
                <TableCell>{log.reason}</TableCell>
                <TableCell>{log.operator || '-'}</TableCell>
                <TableCell>
                  <Chip
                    label={log.success ? 'Success' : 'Failed'}
                    color={log.success ? 'success' : 'error'}
                    size="small"
                  />
                </TableCell>
                <TableCell align="center">{log.packets_sent}</TableCell>
                <TableCell>
                  {log.executed_at
                    ? new Date(log.executed_at).toLocaleString()
                    : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default DeAuthLogs;