// src/pages/LiveScanning.jsx
import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  TextField,
  Typography,
  Tooltip,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { Refresh, Stop, PlayArrow } from '@mui/icons-material';

const sampleWifiAps = [];

const sampleMessages = [];
const sampleChannels = [];
const sampleAlerts = [];
const sampleSSIDs = [];

const LiveScanning = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [bottomPanelTab, setBottomPanelTab] = useState(0);
  const [alertFilter, setAlertFilter] = useState('');
  const [ssidFilter, setSsidFilter] = useState('');
  const [scanning, setScanning] = useState(true);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });

  const handleTabChange = (_, value) => setActiveTab(value);
  const handleBottomPanelTabChange = (_, value) => setBottomPanelTab(value);

  const handleToggleScanning = () => {
    setScanning((current) => !current);
    setNotification({
      open: true,
      message: scanning ? 'Live scanning stopped' : 'Live scanning resumed',
      severity: scanning ? 'warning' : 'success',
    });
  };

  const handleRefresh = () => {
    setNotification({ open: true, message: 'Feed refreshed', severity: 'info' });
  };

  const filteredAlerts = sampleAlerts.filter((alert) => {
    const search = alertFilter.trim().toLowerCase();
    if (!search) return true;
    return [
      alert.type,
      alert.class,
      alert.severity,
      alert.time,
      alert.transmitter,
      alert.source,
      alert.destination,
      alert.alert,
    ]
      .join(' ')
      .toLowerCase()
      .includes(search);
  });

  const filteredSSIDs = sampleSSIDs.filter((entry) => {
    const search = ssidFilter.trim().toLowerCase();
    if (!search) return true;
    return [
      entry.ssid,
      entry.encryption,
      entry.lastSeen,
      entry.firstSeen,
      entry.probing,
      entry.responding,
      entry.advertising,
    ]
      .join(' ')
      .toLowerCase()
      .includes(search);
  });

  return (
    <Box sx={{ width: '100%', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', bgcolor: '#f5f5f5' }}>
      {/* Header - gaya ng Review Items */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 3, py: 2, bgcolor: 'white', borderBottom: '1px solid #e0e0e0' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a1a' }}>
            Live Scanning Module
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
            Live Kismet-style device feed and message log for wireless AP monitoring.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button 
            startIcon={<Refresh />} 
            variant="outlined" 
            size="medium" 
            onClick={handleRefresh}
            sx={{ textTransform: 'none', fontSize: '0.95rem' }}
          >
            Refresh
          </Button>
          <Button
            startIcon={scanning ? <Stop /> : <PlayArrow />}
            variant={scanning ? 'contained' : 'outlined'}
            color={scanning ? 'error' : 'success'}
            size="medium"
            onClick={handleToggleScanning}
            sx={{ textTransform: 'none', fontSize: '0.95rem' }}
          >
            {scanning ? 'Stop' : 'Start'}
          </Button>
        </Stack>
      </Stack>

      {/* Tabs - gaya ng Review Items */}
      <Paper sx={{ px: 3, py: 0, bgcolor: 'white', elevation: 0, borderBottom: '1px solid #e0e0e0', borderRadius: 0 }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          textColor="primary" 
          indicatorColor="primary" 
          sx={{ 
            minHeight: 48, 
            '& .MuiTab-root': { 
              py: 1, 
              minHeight: 48, 
              fontSize: '0.9rem', 
              fontWeight: 500,
              textTransform: 'none',
              color: '#666'
            },
            '& .Mui-selected': {
              fontWeight: 600,
              color: '#1976d2 !important'
            }
          }}
        >
          <Tab label="Devices" />
          <Tab label="Alerts" />
          <Tab label="SSIDs" />
        </Tabs>
      </Paper>

      {/* Main Content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2 }}>
        <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', elevation: 1, borderRadius: 1 }}>
          {/* Table Header with Title and Filter - gaya ng Review Items */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid #e0e0e0', bgcolor: '#fafafa' }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a1a1a' }}>
                {activeTab === 0 ? 'Devices' : activeTab === 1 ? 'Alerts' : 'SSIDs'}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 0.25 }}>
                {activeTab === 0 ? 'Wi-Fi APs detected in the live scan.' :
                 activeTab === 1 ? 'Realtime alert feed for suspicious wireless activity.' :
                 'SSID observations and probe activity.'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.5} alignItems="center">
              {(activeTab === 0 || (activeTab === 1 && filteredAlerts.length > 0) || (activeTab === 2 && filteredSSIDs.length > 0)) && (
                <Chip
                  label={activeTab === 0 ? (scanning ? 'Live' : 'Paused') :
                         activeTab === 1 ? `${filteredAlerts.length} alerts` :
                         `${filteredSSIDs.length} SSIDs`}
                  color={activeTab === 0 ? (scanning ? 'success' : 'warning') : 'info'}
                  size="medium"
                  sx={{ height: 28, '& .MuiChip-label': { px: 1.5, fontWeight: 500 } }}
                />
              )}
              {(activeTab === 1 || activeTab === 2) && (
                <TextField
                  size="small"
                  value={activeTab === 1 ? alertFilter : ssidFilter}
                  onChange={(e) => activeTab === 1 ? setAlertFilter(e.target.value) : setSsidFilter(e.target.value)}
                  placeholder={activeTab === 1 ? 'Search alerts' : 'Filter SSIDs'}
                  sx={{ 
                    '& .MuiInputBase-root': { 
                      py: 0.5,
                      bgcolor: 'white'
                    },
                    minWidth: 220
                  }}
                />
              )}
            </Stack>
          </Stack>

          {/* Table */}
          <Box sx={{ flex: 1, overflow: 'hidden', p: 0 }}>
            {activeTab === 0 ? (
              <TableContainer sx={{ height: '100%' }}>
                <Table size="medium" stickyHeader sx={{
                  tableLayout: 'fixed',
                  width: '100%',
                  '& th': {
                    py: 1.25,
                    px: 1.5,
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#666',
                    bgcolor: '#fafafa',
                    borderBottom: '1px solid #e0e0e0'
                  },
                  '& td': {
                    py: 1,
                    px: 1.5,
                    fontSize: '0.95rem',
                    color: '#1a1a1a',
                    borderBottom: '1px solid #f0f0f0'
                  }
                }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '8%' }}>Name</TableCell>
                      <TableCell sx={{ width: '6%' }}>Type</TableCell>
                      <TableCell sx={{ width: '10%' }}>Encryption</TableCell>
                      <TableCell sx={{ width: '9%' }}>Last Seen</TableCell>
                      <TableCell sx={{ width: '7%' }}>Packets</TableCell>
                      <TableCell sx={{ width: '7%' }}>Signal</TableCell>
                      <TableCell sx={{ width: '7%' }}>Channel</TableCell>
                      <TableCell sx={{ width: '12%' }}>Manufacturer</TableCell>
                      <TableCell sx={{ width: '7%' }} align="center">Clients</TableCell>
                      <TableCell sx={{ width: '9%' }}>Uptime</TableCell>
                      <TableCell sx={{ width: '18%' }}>QBSS Usage</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sampleWifiAps.length > 0 ? sampleWifiAps.map((item) => (
                      <TableRow key={item.name} hover>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.type}</TableCell>
                        <TableCell>{item.encryption}</TableCell>
                        <TableCell>{item.lastSeen}</TableCell>
                        <TableCell>{item.packets}</TableCell>
                        <TableCell>{item.signal}</TableCell>
                        <TableCell>{item.channel}</TableCell>
                        <TableCell>{item.manufacturer}</TableCell>
                        <TableCell align="center">{item.clients}</TableCell>
                        <TableCell>{item.uptime}</TableCell>
                        <TableCell>{item.usage}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={11} align="center" sx={{ py: 6, color: '#999', fontSize: '0.95rem' }}>
                          No devices detected yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : activeTab === 1 ? (
              <TableContainer sx={{ height: '100%' }}>
                <Table size="medium" stickyHeader sx={{
                  '& th': {
                    py: 1.25,
                    px: 1.5,
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#666',
                    bgcolor: '#fafafa',
                    borderBottom: '1px solid #e0e0e0'
                  },
                  '& td': {
                    py: 1,
                    px: 1.5,
                    fontSize: '0.95rem',
                    color: '#1a1a1a',
                    borderBottom: '1px solid #f0f0f0'
                  }
                }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Time</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Class</TableCell>
                      <TableCell>Severity</TableCell>
                      <TableCell>Transmitter</TableCell>
                      <TableCell>Source</TableCell>
                      <TableCell>Destination</TableCell>
                      <TableCell>Alert</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredAlerts.length > 0 ? filteredAlerts.map((alert) => (
                      <TableRow key={alert.id} hover>
                        <TableCell>{alert.time}</TableCell>
                        <TableCell>{alert.type}</TableCell>
                        <TableCell>{alert.class}</TableCell>
                        <TableCell>{alert.severity}</TableCell>
                        <TableCell>{alert.transmitter}</TableCell>
                        <TableCell>{alert.source}</TableCell>
                        <TableCell>{alert.destination}</TableCell>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{alert.alert}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 6, color: '#999', fontSize: '0.95rem' }}>
                          No alerts yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : activeTab === 2 ? (
              <TableContainer sx={{ height: '100%' }}>
                <Table size="medium" stickyHeader sx={{
                  '& th': {
                    py: 1.25,
                    px: 1.5,
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#666',
                    bgcolor: '#fafafa',
                    borderBottom: '1px solid #e0e0e0'
                  },
                  '& td': {
                    py: 1,
                    px: 1.5,
                    fontSize: '0.95rem',
                    color: '#1a1a1a',
                    borderBottom: '1px solid #f0f0f0'
                  }
                }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>SSID</TableCell>
                      <TableCell>Length</TableCell>
                      <TableCell>Last Seen</TableCell>
                      <TableCell>First Seen</TableCell>
                      <TableCell>Encryption</TableCell>
                      <TableCell># Probing</TableCell>
                      <TableCell># Responding</TableCell>
                      <TableCell># Advertising</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredSSIDs.length > 0 ? filteredSSIDs.map((entry) => (
                      <TableRow key={entry.id} hover>
                        <TableCell>{entry.ssid}</TableCell>
                        <TableCell>{entry.length}</TableCell>
                        <TableCell>{entry.lastSeen}</TableCell>
                        <TableCell>{entry.firstSeen}</TableCell>
                        <TableCell>{entry.encryption}</TableCell>
                        <TableCell>{entry.probing}</TableCell>
                        <TableCell>{entry.responding}</TableCell>
                        <TableCell>{entry.advertising}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 6, color: '#999', fontSize: '0.95rem' }}>
                          No SSIDs found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : null}
          </Box>
        </Paper>

        {/* Bottom Panel - Messages and Channels - gaya ng Review Items */}
        <Paper sx={{ mt: 1.5, height: '200px', display: 'flex', flexDirection: 'column', overflow: 'hidden', elevation: 1, borderRadius: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2.5, py: 1, borderBottom: '1px solid #e0e0e0', bgcolor: '#fafafa' }}>
            <Tabs 
              value={bottomPanelTab} 
              onChange={handleBottomPanelTabChange} 
              textColor="primary" 
              indicatorColor="primary" 
              sx={{ 
                minHeight: 36,
                '& .MuiTab-root': { 
                  py: 0.5, 
                  minHeight: 36, 
                  fontSize: '1rem', 
                  fontWeight: 500,
                  textTransform: 'none'
                }
              }}
            >
              <Tab label="Messages" />
              <Tab label="Channels" />
            </Tabs>
          </Stack>
          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
            {bottomPanelTab === 0 ? (
              sampleMessages.length > 0 ? (
                <List dense sx={{ py: 0 }}>
                  {sampleMessages.map((message, index) => (
                    <ListItem key={index} sx={{ py: 0.5, px: 0 }}>
                      <ListItemText
                        primary={message.text}
                        secondary={message.time}
                        primaryTypographyProps={{ sx: { fontSize: '0.95rem', color: '#1a1a1a' } }}
                        secondaryTypographyProps={{ sx: { fontSize: '0.9rem', color: '#999' } }}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.9rem', p: 1 }}>
                  No live messages yet.
                </Typography>
              )
            ) : (
              sampleChannels.length > 0 ? (
                <List dense sx={{ py: 0 }}>
                  {sampleChannels.map((channel, index) => (
                    <ListItem key={index} sx={{ py: 0.5, px: 0 }}>
                      <ListItemText
                        primary={channel.name || 'Channel entry'}
                        secondary={channel.info || 'No additional data'}
                        primaryTypographyProps={{ sx: { fontSize: '0.95rem', color: '#1a1a1a' } }}
                        secondaryTypographyProps={{ sx: { fontSize: '0.9rem', color: '#999' } }}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.9rem', p: 1 }}>
                  No channel entries yet.
                </Typography>
              )
            )}
          </Box>
        </Paper>
      </Box>

      <Snackbar
        open={notification.open}
        autoHideDuration={3000}
        onClose={() => setNotification((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={notification.severity} variant="filled" sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default LiveScanning;