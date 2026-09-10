// src/components/deauth/DeAuthButtons.tsx
import React from 'react';
import { Button, Box } from '@mui/material';
import { Refresh } from '@mui/icons-material';

interface DeAuthButtonsProps {
  onRefresh: () => void;
  onFlagDevice?: () => void;
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
      >
        Refresh
      </Button>
    </Box>
  );
};

export default DeAuthButtons;