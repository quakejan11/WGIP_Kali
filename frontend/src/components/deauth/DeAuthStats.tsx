// src/components/deauth/DeAuthStats.tsx
import React from 'react';
import { Grid, Card, CardContent, Typography, LinearProgress } from '@mui/material';
import { DeauthStats } from '../../services/deauthService';

interface DeAuthStatsProps {
  stats: DeauthStats | null;
  loading?: boolean;
}

const DeAuthStats: React.FC<DeAuthStatsProps> = ({ stats, loading }) => {
  if (loading) {
    return (
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {[1, 2, 3, 4].map((i) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>Loading...</Typography>
                <Typography variant="h4">-</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <Card>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Devices
            </Typography>
            <Typography variant="h4">
              {stats?.total_devices || 0}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <Card>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Flagged
            </Typography>
            <Typography variant="h4" color="warning.main">
              {stats?.status_counts?.flagged || 0}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <Card>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Deauthenticated
            </Typography>
            <Typography variant="h4" color="success.main">
              {stats?.status_counts?.deauthenticated || 0}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <Card>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Success Rate
            </Typography>
            <Typography variant="h4">
              {stats?.success_rate?.toFixed(1) || 0}%
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={stats?.success_rate || 0} 
              color={stats?.success_rate && stats.success_rate > 80 ? 'success' : 'warning'}
              sx={{ mt: 1 }}
            />
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default DeAuthStats;