// src/components/SignalMap/SignalMapView.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  GpsFixed,
  LocationOn,
  Wifi,
  GppBad,
  ZoomIn,
  ZoomOut,
  RestartAlt,
  Fullscreen,
  FullscreenExit,
  PlayArrow,
  Pause,
  CenterFocusStrong,
} from '@mui/icons-material';
import {
  getSignalMeta,
  MiniSignalSparkline,
} from './SignalMeter';
import './SignalMapView.css';

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.25;

const SignalMapView = ({
  networks = [],
  bandFilter = 'Both',
  onBandFilterChange,
  gpsEnabled = false,
  onToggleGps = () => {},
  onSendToDeAuth = () => {},
}) => {
  const [selectedNetId, setSelectedNetId] = useState(networks[0]?.id || '');
  const [isRadarActive, setIsRadarActive] = useState(true);
  const [fastSweep, setFastSweep] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [sweepAngle, setSweepAngle] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const containerRef = useRef(null);
  const dragStartRef = useRef(null);

  const filteredNetworks =
    bandFilter === 'Both'
      ? networks
      : networks.filter((n) => n.band === bandFilter);

  const selectedNet =
    filteredNetworks.find((n) => n.id === selectedNetId) || filteredNetworks[0];

  // ─── Fullscreen API + Escape key handler ───
  useEffect(() => {
    const handleFullScreenChange = () => {
      if (!document.fullscreenElement && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullScreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullScreen]);

  const handleToggleFullScreen = () => {
    setIsFullScreen((prev) => {
      const next = !prev;
      if (next) {
        containerRef.current?.requestFullscreen?.().catch(() => {});
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      return next;
    });
  };

  // ─── Radar sweep animation ───
  useEffect(() => {
    if (!isRadarActive) return;
    const stepMs = 50;
    const degreesPerTick = fastSweep
      ? (360 / 2000) * stepMs
      : (360 / 4000) * stepMs;
    const timer = setInterval(() => {
      setSweepAngle((prev) => (prev + degreesPerTick) % 360);
    }, stepMs);
    return () => clearInterval(timer);
  }, [isRadarActive, fastSweep]);

  // ─── Zoom handlers ───
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(MAX_ZOOM, Number((prev + ZOOM_STEP).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(MIN_ZOOM, Number((prev - ZOOM_STEP).toFixed(2)));
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleWheelZoom = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else if (e.deltaY > 0) {
      handleZoomOut();
    }
  };

  // ─── Drag to pan ───
  const handleMouseDown = (e) => {
    if (e.target.closest('button')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panOffset.x,
      panY: panOffset.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const maxPan = Math.max(40, (zoomLevel - 0.5) * 140);
    setPanOffset({
      x: Math.max(-maxPan, Math.min(maxPan, dragStartRef.current.panX + dx)),
      y: Math.max(-maxPan, Math.min(maxPan, dragStartRef.current.panY + dy)),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleFocusSelected = () => {
    if (!selectedNet) return;
    const idx = networks.findIndex((n) => n.id === selectedNet.id);
    if (idx === -1) return;
    const { x, y } = getRadarCoords(idx, selectedNet.signal);
    const targetZoom = Math.max(zoomLevel, 1.75);
    setZoomLevel(targetZoom);
    setPanOffset({
      x: (50 - x) * 2.8,
      y: (50 - y) * 2.8,
    });
  };

  const getRadarCoords = (index, signal) => {
    const distanceRatio = Math.min(
      0.85,
      Math.max(0.18, (Math.abs(signal) - 42) / 55)
    );
    const angle = (index * 137.5 + 35) * (Math.PI / 180);
    const x = 50 + Math.cos(angle) * (distanceRatio * 42);
    const y = 50 + Math.sin(angle) * (distanceRatio * 42);
    return { x, y };
  };

  const isNodePingedByBeam = (nodeAngleDeg) => {
    if (!isRadarActive) return false;
    const nodeCompass = (nodeAngleDeg + 90) % 360;
    const diff = (sweepAngle - nodeCompass + 360) % 360;
    return diff >= 0 && diff <= 48;
  };

  return (
    <Box
      ref={containerRef}
      sx={
        isFullScreen
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              bgcolor: 'background.default',
              p: { xs: 2, md: 3 },
              overflow: 'auto',
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '3fr 1fr' },
              gap: 3,
            }
          : {
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
              gap: 3,
            }
      }
    >
      {/* ─── LEFT: Radar Canvas ─── */}
      <Paper
        sx={{
          p: 3,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: isFullScreen ? 'calc(100vh - 3rem)' : 520,
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            pb: 2,
          }}
        >
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                lineHeight: 1.2,
              }}
            >
              <Box
                component="span"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: isRadarActive ? 'primary.main' : '#cbd5e1',
                  display: 'inline-block',
                  flexShrink: 0,
                  ...(isRadarActive && { animation: 'active-dot-pulse 1.5s infinite' }),
                }}
              />
              Geospatial Signal Topology
              {isFullScreen && (
                <Chip
                  label="FULL SCREEN"
                  size="small"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    height: 22,
                    bgcolor: 'primary.light',
                    color: 'primary.main',
                    ml: 0.5,
                  }}
                />
              )}
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.5, display: 'block' }}
            >
              Relative RSSI strength around monitoring station. Distance from
              center = signal strength.
            </Typography>
          </Box>

          {/* Controls */}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {onBandFilterChange && (
              <Box
                sx={{
                  display: 'inline-flex',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                {['Both', '2.4 GHz', '5 GHz'].map((band) => (
                  <Box
                    key={band}
                    component="button"
                    onClick={() => onBandFilterChange(band)}
                    sx={{
                      px: 1.5,
                      py: 0.75,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      borderRight: '1px solid',
                      borderColor: 'divider',
                      bgcolor: bandFilter === band ? 'primary.light' : 'transparent',
                      color: bandFilter === band ? 'primary.main' : 'text.secondary',
                      '&:last-child': { borderRight: 'none' },
                      '&:hover': { bgcolor: bandFilter === band ? 'primary.light' : '#f8fafc' },
                    }}
                  >
                    {band}
                  </Box>
                ))}
              </Box>
            )}

            <Button
              onClick={() => setIsRadarActive((p) => !p)}
              startIcon={isRadarActive ? <Pause /> : <PlayArrow />}
              sx={{
                fontSize: '0.72rem',
                bgcolor: isRadarActive ? 'primary.main' : '#f1f5f9',
                color: isRadarActive ? '#fff' : 'text.primary',
                '&:hover': {
                  bgcolor: isRadarActive ? 'primary.dark' : '#e2e8f0',
                },
              }}
            >
              {isRadarActive ? 'Radar Scanning' : 'Resume Radar'}
            </Button>

            <Button
              onClick={() => setFastSweep((p) => !p)}
              disabled={!isRadarActive}
              sx={{
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                bgcolor: fastSweep ? '#fef3c7' : 'transparent',
                color: fastSweep ? '#92400e' : 'text.primary',
                border: '1px solid',
                borderColor: fastSweep ? '#fcd34d' : 'divider',
              }}
            >
              {fastSweep ? '2x Sweep' : '1x Sweep'}
            </Button>

            <Button
              onClick={onToggleGps}
              startIcon={<GpsFixed />}
              sx={{
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                bgcolor: gpsEnabled ? 'primary.light' : '#fef2f2',
                color: gpsEnabled ? 'primary.main' : '#dc2626',
                border: '1px solid',
                borderColor: gpsEnabled ? 'primary.main' : '#fca5a5',
                '&:hover': {
                  bgcolor: gpsEnabled ? '#d1fae5' : '#fee2e2',
                },
              }}
            >
              {gpsEnabled ? 'GNSS Locked' : 'No GPS'}
            </Button>

            <Button
              onClick={handleToggleFullScreen}
              startIcon={isFullScreen ? <FullscreenExit /> : <Fullscreen />}
              sx={{
                fontSize: '0.72rem',
                bgcolor: isFullScreen ? '#0f172a' : 'transparent',
                color: isFullScreen ? '#fff' : 'text.primary',
                border: '1px solid',
                borderColor: isFullScreen ? '#0f172a' : 'divider',
                '&:hover': {
                  bgcolor: isFullScreen ? '#1e293b' : '#f8fafc',
                },
              }}
            >
              {isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
            </Button>
          </Stack>
        </Box>

        {/* Radar Canvas */}
        <Box
          onWheel={handleWheelZoom}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          sx={{
            position: 'relative',
            my: 2,
            flex: 1,
            bgcolor: '#f4f9f6',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: isFullScreen ? 540 : 420,
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          {/* Legend */}
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              position: 'absolute',
              top: 12,
              right: 14,
              zIndex: 30,
              bgcolor: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(4px)',
              px: 1.5,
              py: 0.75,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              pointerEvents: 'none',
            }}
          >
            {[
              { label: 'Strong', color: '#10b981' },
              { label: 'Mid', color: '#f59e0b' },
              { label: 'Weak', color: '#ef4444' },
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'flex', alignItems: 'center' }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: item.color,
                    flexShrink: 0,
                    mr: '3px',
                  }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: '0.7rem', lineHeight: 1, letterSpacing: 0 }}
                >
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Stack>

          {/* Transformable Radar Stage */}
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              maxWidth: isFullScreen ? 620 : 420,
              aspectRatio: '1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transition: isDragging
                ? 'none'
                : 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <Box
              component="svg"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              sx={{ width: '100%', height: '100%' }}
            >
              <defs>
                <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="25%">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.38" />
                  <stop offset="55%" stopColor="#10B981" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                </linearGradient>
                <radialGradient id="radarBgGlow" cx="50%" cy="50%" r="45%">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.09" />
                  <stop offset="70%" stopColor="#10B981" stopOpacity="0.03" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                </radialGradient>
              </defs>

              <circle cx="50" cy="50" r="42" fill="url(#radarBgGlow)" />

              {isRadarActive && (
                <>
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#10B981" strokeWidth="0.45" className="animate-radar-ring" />
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#059669" strokeWidth="0.35" className="animate-radar-ring-delayed" />
                </>
              )}

              <circle cx="50" cy="50" r="14" fill="none" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="0.35" strokeDasharray="1 1" />
              <circle cx="50" cy="50" r="28" fill="none" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="0.35" strokeDasharray="1 1" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="#64748b" strokeOpacity="0.6" strokeWidth="0.45" />

              <line x1="50" y1="6" x2="50" y2="94" stroke="#cbd5e1" strokeWidth="0.3" />
              <line x1="6" y1="50" x2="94" y2="50" stroke="#cbd5e1" strokeWidth="0.3" />

              <text x="51.2" y="36.8" fill="#64748b" fontSize="1.9" fontFamily="monospace">-60dBm</text>
              <text x="51.2" y="22.8" fill="#64748b" fontSize="1.9" fontFamily="monospace">-75dBm</text>
              <text x="51.2" y="9.5" fill="#64748b" fontSize="1.9" fontFamily="monospace">-90dBm</text>

              {selectedNet &&
                (() => {
                  const idx = networks.findIndex((n) => n.id === selectedNet.id);
                  if (idx === -1) return null;
                  const { x, y } = getRadarCoords(idx, selectedNet.signal);
                  return (
                    <line x1="50" y1="50" x2={x} y2={y} stroke="#059669" strokeWidth="0.4" strokeDasharray="1.2 0.8" />
                  );
                })()}

              {isRadarActive && (
                <g className={fastSweep ? 'animate-radar-sweep-fast' : 'animate-radar-sweep'}>
                  <path d="M 50 50 L 12.0 32.2 A 42 42 0 0 1 50 8 Z" fill="url(#sweepGrad)" />
                  <line x1="50" y1="50" x2="50" y2="8" stroke="#059669" strokeWidth="0.65" strokeLinecap="round" />
                </g>
              )}

              <circle cx="50" cy="50" r="2.8" fill="#10B981" fillOpacity="0.22" />
              <circle cx="50" cy="50" r="1.6" fill="#059669" stroke="#fff" strokeWidth="0.4" />
            </Box>

            {/* Emitter dots */}
            {filteredNetworks.map((net, idx) => {
              const origIdx = Math.max(0, networks.findIndex((item) => item.id === net.id));
              const coords = getRadarCoords(origIdx, net.signal);
              const angleDeg = (origIdx * 137.5 + 35) % 360;
              const isSelected = selectedNet?.id === net.id;
              const isPinged = isNodePingedByBeam(angleDeg);
              const meta = getSignalMeta(net.signal);
              const inverseMarkerScale = Math.max(0.65, Math.min(1.2, 1 / Math.sqrt(zoomLevel)));

              const labelBelow = idx % 2 === 0;

              return (
                <Box
                  key={net.id}
                  component="button"
                  onClick={() => setSelectedNetId(net.id)}
                  sx={{
                    position: 'absolute',
                    left: `${coords.x}%`,
                    top: `${coords.y}%`,
                    transform: `translate(-50%, -50%) scale(${
                      isSelected ? inverseMarkerScale * 1.06 : inverseMarkerScale
                    })`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                    border: 'none',
                    bgcolor: 'transparent',
                    p: 0,
                    zIndex: isSelected ? 25 : 10,
                    transition: 'transform 0.2s ease',
                    '&:hover': {
                      transform: `translate(-50%, -50%) scale(${inverseMarkerScale * 1.05})`,
                      zIndex: 30,
                    },
                  }}
                >
                  {!labelBelow && (
                    <Box
                      sx={{
                        mb: 0.5,
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        fontSize: '0.65rem',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        border: '1px solid',
                        bgcolor: isSelected ? 'primary.light' : 'rgba(255,255,255,0.95)',
                        color: isSelected ? 'primary.main' : 'text.primary',
                        borderColor: isSelected ? 'primary.main' : 'divider',
                        fontWeight: isSelected ? 600 : 400,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      }}
                    >
                      {net.ssid} ({net.signal} dBm)
                    </Box>
                  )}

                  <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14 }}>
                    {(isPinged || isSelected) && (
                      <Box
                        className="animate-blip-ping"
                        sx={{
                          position: 'absolute',
                          inset: -8,
                          borderRadius: '50%',
                          bgcolor: 'rgba(16, 185, 129, 0.4)',
                        }}
                      />
                    )}
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: meta.barColor,
                        boxShadow: `0 0 5px 1.5px ${meta.barColor}ee`,
                        position: 'relative',
                      }}
                    />
                  </Box>

                  {labelBelow && (
                    <Box
                      sx={{
                        mt: 0.5,
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        fontSize: '0.65rem',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        border: '1px solid',
                        bgcolor: isSelected ? 'primary.light' : 'rgba(255,255,255,0.95)',
                        color: isSelected ? 'primary.main' : 'text.primary',
                        borderColor: isSelected ? 'primary.main' : 'divider',
                        fontWeight: isSelected ? 600 : 400,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      }}
                    >
                      {net.ssid} ({net.signal} dBm)
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>

          {/* Zoom + Fullscreen Controls */}
          <Stack
            direction="row"
            spacing={0.5}
            sx={{
              position: 'absolute',
              bottom: 12,
              right: 14,
              bgcolor: 'rgba(255,255,255,0.95)',
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              p: 0.5,
              alignItems: 'center',
              zIndex: 30,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Tooltip title="Zoom Out">
              <span>
                <IconButton size="small" onClick={handleZoomOut} disabled={zoomLevel <= MIN_ZOOM}>
                  <ZoomOut fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <Box
              onClick={handleResetZoom}
              sx={{
                px: 1.5,
                display: 'flex',
                alignItems: 'center',
                fontFamily: 'monospace',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'text.primary',
                minWidth: 48,
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: 1,
                '&:hover': { bgcolor: '#f1f5f9' },
              }}
            >
              {Math.round(zoomLevel * 100)}%
            </Box>

            <Tooltip title="Zoom In">
              <span>
                <IconButton size="small" onClick={handleZoomIn} disabled={zoomLevel >= MAX_ZOOM}>
                  <ZoomIn fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <Box sx={{ width: '1px', height: 20, bgcolor: 'divider', mx: 0.5 }} />

            <Tooltip title={selectedNet ? `Focus on ${selectedNet.ssid}` : 'Focus selected'}>
              <span>
                <IconButton size="small" onClick={handleFocusSelected} disabled={!selectedNet}>
                  <CenterFocusStrong fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            {(zoomLevel !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
              <Tooltip title="Reset Zoom & Pan">
                <IconButton
                  size="small"
                  onClick={handleResetZoom}
                  sx={{ color: 'primary.main', bgcolor: 'primary.light' }}
                >
                  <RestartAlt fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            <Box sx={{ width: '1px', height: 20, bgcolor: 'divider', mx: 0.5 }} />

            <Tooltip title={isFullScreen ? 'Exit Full Screen (Esc)' : 'Enter Full Screen'}>
              <IconButton
                size="small"
                onClick={handleToggleFullScreen}
                sx={{
                  bgcolor: isFullScreen ? '#0f172a' : 'transparent',
                  color: isFullScreen ? '#fff' : 'text.primary',
                  '&:hover': {
                    bgcolor: isFullScreen ? '#1e293b' : 'primary.light',
                    color: isFullScreen ? '#fff' : 'primary.main',
                  },
                }}
              >
                {isFullScreen ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Stack>

          <Box
            sx={{
              position: 'absolute',
              bottom: 12,
              left: 14,
              fontFamily: 'monospace',
              fontSize: '0.65rem',
              color: 'text.secondary',
              bgcolor: 'rgba(255,255,255,0.85)',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              display: { xs: 'none', sm: 'block' },
              pointerEvents: 'none',
              zIndex: 30,
            }}
          >
            Scroll to zoom · Drag to pan{isFullScreen ? ' · Press Esc to exit' : ''}
          </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: 'text.secondary',
            pt: 1,
          }}
        >
          <span>
            Inner Ring: &gt; -60 dBm · Middle: -60 to -75 dBm · Outer: &lt; -75 dBm
          </span>
          <span style={{ fontFamily: 'monospace' }}>
            {filteredNetworks.length} of {networks.length} emitters plotted
          </span>
        </Box>
      </Paper>

      {/* ─── RIGHT: Selected Emitter Inspector ─── */}
      <Paper
        sx={{
          p: 3,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {selectedNet ? (
          <Box>
            {/* Header */}
            <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2.5 }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                  color: 'primary.main',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                <Wifi sx={{ fontSize: 16 }} />
                <span>Selected Emitter</span>
              </Stack>
              <Typography variant="h6" fontWeight={600} sx={{ mt: 0.75, fontSize: '1.2rem' }}>
                {selectedNet.ssid}
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontFamily: 'monospace', color: 'text.secondary', fontSize: '0.85rem' }}
              >
                {selectedNet.bssid}
              </Typography>
            </Box>

            {/* ✅ Details — walang Signal Quality row, "Mid" nasa RSSI row, hindi bold */}
            <Box sx={{ mt: 2.5 }}>
              {[
                { label: 'Manufacturer', value: selectedNet.manufacturer },
                { label: 'Channel & Band', value: `CH ${selectedNet.channel} · ${selectedNet.band}`, mono: true },
                { label: 'Encryption', value: selectedNet.encryption, mono: true },
                {
                  label: 'RSSI Signal (10s)',
                  value: (
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: 400,
                          fontSize: '0.92rem',
                          color: getSignalMeta(selectedNet.signal).color,
                        }}
                      >
                        {selectedNet.signal} dBm · {getSignalMeta(selectedNet.signal).label}
                      </Typography>
                      <MiniSignalSparkline
                        history={selectedNet.signalHistory}
                        signal={selectedNet.signal}
                      />
                    </Stack>
                  ),
                },
                {
                  label: 'Coordinates',
                  value: (
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                      <LocationOn sx={{ fontSize: 18, color: 'primary.main' }} />
                      <span style={{ fontFamily: 'monospace' }}>{selectedNet.location}</span>
                    </Stack>
                  ),
                },
              ].map((row, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 1.5,
                    borderBottom: '1px solid #f1f5f9',
                    minHeight: 44,
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: '0.88rem', fontWeight: 400 }}
                  >
                    {row.label}
                  </Typography>
                  <Box
                    sx={{
                      color: 'text.primary',
                      fontWeight: 400,
                      fontFamily: row.mono ? 'monospace' : 'inherit',
                      fontSize: '0.92rem',
                      textAlign: 'right',
                    }}
                  >
                    {row.value}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Select an emitter node on the radar map.
          </Typography>
        )}

        {selectedNet && (
          <Button
            fullWidth
            onClick={() => onSendToDeAuth(selectedNet)}
            startIcon={<GppBad sx={{ fontSize: 18 }} />}
            sx={{
              mt: 3,
              bgcolor: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              py: 1.2,
              fontSize: '0.85rem',
              fontWeight: 600,
              '&:hover': { bgcolor: '#fee2e2' },
            }}
          >
            Queue in DeAuth Monitor
          </Button>
        )}
      </Paper>
    </Box>
  );
};

export default SignalMapView;