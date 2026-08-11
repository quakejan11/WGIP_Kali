// src/components/deauth/DeAuthButtons.tsx
import React from 'react';
import { Button, Box } from '@mui/material';
import { Refresh, Flag } from '@mui/icons-material';

interface DeAuthButtonsProps {
  onRefresh: () => void;
  onFlagDevice: () => void;
  loading?: boolean;
}

const DeAuthButtons: React.FC<DeAuthButtonsProps> = ({
  onRefresh,
  onFlagDevice,
  loading = false,
}) => {
  return (
    <Box>
      <Button
        variant="outlined"
        startIcon={<Refresh />}
        onClick={onRefresh}
        disabled={loading}
        sx={{ mr: 1 }}
      >
        Refresh
      </Button>
      <Button
        variant="contained"
        startIcon={<Flag />}
        onClick={onFlagDevice}
        disabled={loading}
      >
        Flag Device
      </Button>
    </Box>
  );
};

export default DeAuthButtons;