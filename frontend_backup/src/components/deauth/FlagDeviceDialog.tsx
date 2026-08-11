// src/components/deauth/FlagDeviceDialog.tsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material';

interface FlagDeviceDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (client_mac: string, reason: string, operator: string) => void;
  initialMac?: string;
  loading?: boolean;
}

const FlagDeviceDialog: React.FC<FlagDeviceDialogProps> = ({
  open,
  onClose,
  onConfirm,
  initialMac = '',
  loading = false,
}) => {
  const [clientMac, setClientMac] = useState(initialMac);
  const [reason, setReason] = useState('');
  const [operator, setOperator] = useState('Admin');

  const handleConfirm = () => {
    if (clientMac && reason) {
      onConfirm(clientMac, reason, operator);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setClientMac(initialMac);
      setReason('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Flag Device for Deauthentication</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="MAC Address"
          value={clientMac}
          onChange={(e) => setClientMac(e.target.value)}
          placeholder="e.g., AA:BB:CC:DD:EE:FF"
          sx={{ mt: 2 }}
          disabled={loading}
        />
        <TextField
          fullWidth
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          multiline
          rows={3}
          placeholder="Why is this device being flagged?"
          sx={{ mt: 2 }}
          disabled={loading}
        />
        <TextField
          fullWidth
          label="Operator"
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          sx={{ mt: 2 }}
          disabled={loading}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleConfirm}
          disabled={!clientMac || !reason || loading}
        >
          {loading ? 'Processing...' : 'Flag Device'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlagDeviceDialog;