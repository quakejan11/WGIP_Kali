// src/components/SignalMap/SignalMeter.jsx
import React from 'react';
import { Box } from '@mui/material';

export const getSignalMeta = (signal) => {
  if (signal >= -60) {
    return {
      label: 'Strong',
      color: '#059669',
      bgColor: '#ecfdf5',
      barColor: '#10b981',
    };
  }
  if (signal >= -75) {
    return {
      label: 'Mid',
      color: '#d97706',
      bgColor: '#fffbeb',
      barColor: '#f59e0b',
    };
  }
  return {
    label: 'Weak',
    color: '#dc2626',
    bgColor: '#fef2f2',
    barColor: '#ef4444',
  };
};

export const MiniSignalSparkline = ({ history = [], signal, width = 48, height = 14 }) => {
  const points = history.length > 0
    ? history
    : Array.from({ length: 10 }, (_, i) => signal + Math.sin(i) * 2);

  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const pathD = points
    .map((val, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const meta = getSignalMeta(signal);

  return (
    <Box component="svg" width={width} height={height} sx={{ display: 'block', flexShrink: 0 }}>
      <path
        d={pathD}
        fill="none"
        stroke={meta.barColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Box>
  );
};

export const computeSignalStats = (networks = []) => {
  if (networks.length === 0) {
    return { count: 0, avg: 0, strongest: 0, weakest: 0 };
  }
  const signals = networks.map((n) => n.signal);
  const sum = signals.reduce((a, b) => a + b, 0);
  return {
    count: networks.length,
    avg: Math.round(sum / signals.length),
    strongest: Math.max(...signals),
    weakest: Math.min(...signals),
  };
};

export default { getSignalMeta, MiniSignalSparkline, computeSignalStats };