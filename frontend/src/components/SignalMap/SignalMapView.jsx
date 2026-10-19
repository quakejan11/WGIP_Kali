// src/components/SignalMap/SignalMapView.jsx
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
} from 'react';
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
  Lock,
} from '@mui/icons-material';
import {
  getSignalMeta,
  MiniSignalSparkline,
} from './SignalMeter';
import './SignalMapView.css';

// ─── Zoom constants ───
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.25;

// ─── Timing ───
const HISTORY_WINDOW_MS = 10000;
const POLL_DEVICES_MS = 3000;
const POLL_GPS_MS = 3000;
const POLL_STATUS_MS = 5000;

// ─── Performance caps ───
const MAX_EMITTERS = 150;         // only render top-N strongest
const MAX_HISTORY_ENTRIES = 400;  // hard cap on tracked BSSIDs

// ─── Cache ───
const CACHE_KEYS = {
  DEVICES: 'signal_map_devices',
  GPS: 'signal_map_gps',
  LAST_FETCH: 'signal_map_last_fetch',
};
const CACHE_TTL_MS = 30000;

// ─── Safe localStorage helpers ───
const readCache = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeCache = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('cache write failed', e);
  }
};
const isCacheFresh = () => {
  const last = parseInt(readCache(CACHE_KEYS.LAST_FETCH, 0), 10);
  return Date.now() - last < CACHE_TTL_MS;
};

// ─── Helpers ───
const getBand = (channel) => {
  const ch = Number(channel);
  if (!ch || Number.isNaN(ch)) return 'Unknown';
  if (ch >= 1 && ch <= 14) return '2.4 GHz';
  if (ch >= 32 && ch <= 177) return '5 GHz';
  if (ch >= 178 && ch <= 233) return '6 GHz';
  return 'Unknown';
};

const isDeauthEligible = (channel) => {
  const ch = Number(channel);
  if (!ch || Number.isNaN(ch)) return false;
  return ch >= 1 && ch <= 14;
};

const formatGps = (lat, lon) => {
  if (lat == null || lon == null) return 'N/A';
  return `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`;
};

// ─── Memoized emitter dot ───
const EmitterDot = memo(function EmitterDot({
  net,
  x,
  y,
  isSelected,
  isPinged,
  zoomLevel,
  labelBelow,
  onSelect,
}) {
  const meta = getSignalMeta(net.signal);
  const baseScale = Math.max(0.65, Math.min(1.2, 1 / Math.sqrt(zoomLevel)));
  const scale = isSelected ? baseScale * 1.06 : baseScale;

  return (
    <button
      type="button"
      onClick={() => onSelect(net.id)}
      className={`emitter-dot${isSelected ? ' is-selected' : ''}${
        isPinged ? ' is-pinged' : ''
      }`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
    >
      {!labelBelow && (
        <span className="emitter-label" style={{ marginBottom: 4 }}>
          {net.ssid} ({net.signal} dBm)
        </span>
      )}

      <span className="emitter-marker-wrap">
        {(isSelected || isPinged) && <span className="emitter-ping" />}
        <span
          className="emitter-marker"
          style={{
            backgroundColor: meta.barColor,
            boxShadow: `0 0 5px 1.5px ${meta.barColor}ee`,
          }}
        />
      </span>

      {labelBelow && (
        <span className="emitter-label" style={{ marginTop: 4 }}>
          {net.ssid} ({net.signal} dBm)
        </span>
      )}
    </button>
  );
});

const SignalMapView = ({
  networks: networksProp,
  bandFilter: bandFilterProp,
  onBandFilterChange,
  gpsEnabled: gpsEnabledProp,
  onToggleGps = () => {},
  onSendToDeAuth = () => {},
}) => {
  // ─── Live state (seeded from cache) ───
  const [liveDevices, setLiveDevices] = useState(() =>
    isCacheFresh() ? readCache(CACHE_KEYS.DEVICES, []) : []
  );
  const [liveGps, setLiveGps] = useState(() =>
    readCache(CACHE_KEYS.GPS, null)
  );
  const [liveBandFilter, setLiveBandFilter] = useState('Both');
  const [kismetRunning, setKismetRunning] = useState(false);

  const historyRef = useRef({});
  const lastSignatureRef = useRef('');

  // ─── UI state ───
  const [selectedNetId, setSelectedNetId] = useState('');
  const [isRadarActive, setIsRadarActive] = useState(true);
  const [fastSweep, setFastSweep] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const containerRef = useRef(null);
  const dragStartRef = useRef(null);

  const sweepPeriod = fastSweep ? 2 : 4;

  // ─── Live fetching ───
  useEffect(() => {
    if (networksProp !== undefined) return;

    let cancelled = false;

    const clearLive = () => {
      historyRef.current = {};
      lastSignatureRef.current = '';
      if (!cancelled) {
        setLiveDevices([]);
        setSelectedNetId('');
      }
      try {
        localStorage.removeItem(CACHE_KEYS.DEVICES);
        localStorage.removeItem(CACHE_KEYS.LAST_FETCH);
      } catch {}
    };

    const fetchStatus = async () => {
      try {
        const r = await fetch('/api/kismet/status');
        const d = await r.json();
        const running = !!d.running;
        if (cancelled) return;
        setKismetRunning(running);
        if (!running) clearLive();
      } catch {
        if (!cancelled) {
          setKismetRunning(false);
          clearLive();
        }
      }
    };

    const fetchGps = async () => {
      try {
        const r = await fetch('/api/live/gps');
        if (!r.ok) {
          if (!cancelled) setLiveGps(null);
          return;
        }
        const d = await r.json();
        if (!cancelled) {
          setLiveGps(d);
          writeCache(CACHE_KEYS.GPS, d);
        }
      } catch {
        if (!cancelled) setLiveGps(null);
      }
    };

    const fetchDevices = async () => {
      try {
        const r = await fetch('/api/live/events/recent?limit=1000');
        if (!r.ok) {
          clearLive();
          return;
        }
        const data = await r.json();

        let raw = [];
        if (Array.isArray(data)) raw = data;
        else if (data.events) raw = data.events;
        else if (data.data) raw = data.data;

        if (raw.length === 0) {
          clearLive();
          return;
        }

        const now = Date.now();

        // Dedupe by BSSID, keep strongest
        const byId = {};
        raw.forEach((dev) => {
          const bssid = dev.bssid || '00:00:00:00:00:00';
          const signal = dev.signal ?? -60;
          const prev = byId[bssid];
          if (!prev || signal > prev.signal) {
            byId[bssid] = { ...dev, bssid, signal };
          }
        });

        const seenBssids = new Set();

        const mapped = Object.values(byId).map((dev) => {
          seenBssids.add(dev.bssid);

          const arr = historyRef.current[dev.bssid] || [];
          arr.push({ t: now, signal: dev.signal });
          historyRef.current[dev.bssid] = arr.filter(
            (p) => now - p.t <= HISTORY_WINDOW_MS
          );

          const lat = dev.data?.lat ?? dev.lat ?? liveGps?.lat ?? null;
          const lon = dev.data?.lon ?? dev.lon ?? liveGps?.lon ?? null;

          return {
            id: dev.bssid,
            ssid: dev.essid || dev.ssid || 'Unknown',
            bssid: dev.bssid,
            signal: dev.signal,
            band: getBand(dev.channel),
            channel: dev.channel || 1,
            encryption: dev.security || dev.data?.security || 'Unknown',
            manufacturer: dev.vendor || dev.data?.vendor || 'Unknown',
            location: formatGps(lat, lon),
            lat,
            lon,
            signalHistory: historyRef.current[dev.bssid].map((p) => p.signal),
          };
        });

        // Prune history for disappeared BSSIDs
        Object.keys(historyRef.current).forEach((bssid) => {
          if (!seenBssids.has(bssid)) delete historyRef.current[bssid];
        });

        // Hard cap on total tracked BSSIDs
        const histKeys = Object.keys(historyRef.current);
        if (histKeys.length > MAX_HISTORY_ENTRIES) {
          histKeys
            .slice(0, histKeys.length - MAX_HISTORY_ENTRIES)
            .forEach((k) => delete historyRef.current[k]);
        }

        mapped.sort((a, b) => b.signal - a.signal);
        const capped = mapped.slice(0, MAX_EMITTERS);

        // Skip setState if nothing meaningful changed
        const signature = capped.map((d) => `${d.id}|${d.signal}`).join(',');
        if (signature === lastSignatureRef.current) return;
        lastSignatureRef.current = signature;

        if (!cancelled) {
          setLiveDevices(capped);
          writeCache(CACHE_KEYS.DEVICES, capped);
          writeCache(CACHE_KEYS.LAST_FETCH, Date.now());
        }
      } catch (e) {
        console.error('SignalMapView fetch failed', e);
        clearLive();
      }
    };

    fetchStatus();
    fetchGps();
    fetchDevices();

    const statusT = setInterval(fetchStatus, POLL_STATUS_MS);
    const gpsT = setInterval(fetchGps, POLL_GPS_MS);
    const deviceT = setInterval(fetchDevices, POLL_DEVICES_MS);

    return () => {
      cancelled = true;
      clearInterval(statusT);
      clearInterval(gpsT);
      clearInterval(deviceT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networksProp]);

  // Wipe when kismet stops
  useEffect(() => {
    if (networksProp !== undefined) return;
    if (!kismetRunning) {
      historyRef.current = {};
      lastSignatureRef.current = '';
      setLiveDevices([]);
      setSelectedNetId('');
      try {
        localStorage.removeItem(CACHE_KEYS.DEVICES);
      } catch {}
    }
  }, [kismetRunning, networksProp]);

  // ─── Derived values ───
  const networks = networksProp !== undefined ? networksProp : liveDevices;
  const gpsEnabled = gpsEnabledProp ?? !!liveGps;
  const bandFilter = bandFilterProp ?? liveBandFilter;
  const handleBandFilterChange = onBandFilterChange ?? setLiveBandFilter;

  const filteredNetworks = useMemo(
    () =>
      bandFilter === 'Both'
        ? networks
        : networks.filter((n) => n.band === bandFilter),
    [networks, bandFilter]
  );

  // ─── Memoized layout map: id → { x, y, pingDelayS } ───
  const layoutMap = useMemo(() => {
    const map = new Map();
    networks.forEach((net, idx) => {
      const distanceRatio = Math.min(
        0.85,
        Math.max(0.18, (Math.abs(net.signal) - 42) / 55)
      );
      const angle = (idx * 137.5 + 35) * (Math.PI / 180);
      const x = 50 + Math.cos(angle) * (distanceRatio * 42);
      const y = 50 + Math.sin(angle) * (distanceRatio * 42);
      const angleDeg = (idx * 137.5 + 35) % 360;
      const nodeCompass = (angleDeg + 90) % 360;
      const pingDelayS = (nodeCompass / 360) * sweepPeriod;
      map.set(net.id, { x, y, pingDelayS });
    });
    return map;
  }, [networks, sweepPeriod]);

  const selectedNet = useMemo(
    () =>
      filteredNetworks.find((n) => n.id === selectedNetId) ||
      filteredNetworks[0],
    [filteredNetworks, selectedNetId]
  );

  // Selection sync
  useEffect(() => {
    if (filteredNetworks.length === 0) {
      if (selectedNetId !== '') setSelectedNetId('');
      return;
    }
    if (!filteredNetworks.some((n) => n.id === selectedNetId)) {
      setSelectedNetId(filteredNetworks[0].id);
    }
  }, [filteredNetworks, selectedNetId]);

  // ─── Fullscreen API ───
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

  const handleToggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => {
      const next = !prev;
      if (next) {
        containerRef.current?.requestFullscreen?.().catch(() => {});
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      return next;
    });
  }, []);

  // ─── Zoom handlers ───
  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) =>
      Math.min(MAX_ZOOM, Number((prev + ZOOM_STEP).toFixed(2)))
    );
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.max(MIN_ZOOM, Number((prev - ZOOM_STEP).toFixed(2)));
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleWheelZoom = useCallback(
    (e) => {
      e.preventDefault();
      if (e.deltaY < 0) handleZoomIn();
      else if (e.deltaY > 0) handleZoomOut();
    },
    [handleZoomIn, handleZoomOut]
  );

  // ─── Drag to pan ───
  const handleMouseDown = useCallback(
    (e) => {
      if (e.target.closest('button')) return;
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panOffset.x,
        panY: panOffset.y,
      };
    },
    [panOffset.x, panOffset.y]
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging || !dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const maxPan = Math.max(40, (zoomLevel - 0.5) * 140);
      setPanOffset({
        x: Math.max(-maxPan, Math.min(maxPan, dragStartRef.current.panX + dx)),
        y: Math.max(-maxPan, Math.min(maxPan, dragStartRef.current.panY + dy)),
      });
    },
    [isDragging, zoomLevel]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  // ─── Focus selected (uses memoized layout) ───
  const handleFocusSelected = useCallback(() => {
    if (!selectedNet) return;
    const pos = layoutMap.get(selectedNet.id);
    if (!pos) return;
    const targetZoom = Math.max(zoomLevel, 1.75);
    setZoomLevel(targetZoom);
    setPanOffset({
      x: (50 - pos.x) * 2.8,
      y: (50 - pos.y) * 2.8,
    });
  }, [selectedNet, layoutMap, zoomLevel]);

  // ─── Selection handler (stable) ───
  const handleSelectNet = useCallback((id) => {
    setSelectedNetId(id);
  }, []);

  // ─── Selected net line (only when relevant) ───
  const selectedLine = useMemo(() => {
    if (!selectedNet) return null;
    const pos = layoutMap.get(selectedNet.id);
    if (!pos) return null;
    return (
      <line
        x1="50"
        y1="50"
        x2={pos.x}
        y2={pos.y}
        stroke="#059669"
        strokeWidth="0.4"
        strokeDasharray="1.2 0.8"
      />
    );
  }, [selectedNet, layoutMap]);

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
                  ...(isRadarActive && {
                    animation: 'active-dot-pulse 1.5s infinite',
                  }),
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
              center = signal strength. Hover a node for details.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {handleBandFilterChange && (
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
                    onClick={() => handleBandFilterChange(band)}
                    sx={{
                      px: 1.5,
                      py: 0.75,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      borderRight: '1px solid',
                      borderColor: 'divider',
                      bgcolor:
                        bandFilter === band ? 'primary.light' : 'transparent',
                      color:
                        bandFilter === band
                          ? 'primary.main'
                          : 'text.secondary',
                      '&:last-child': { borderRight: 'none' },
                      '&:hover': {
                        bgcolor:
                          bandFilter === band ? 'primary.light' : '#f8fafc',
                      },
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
                '&:hover': { bgcolor: gpsEnabled ? '#d1fae5' : '#fee2e2' },
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
              <Box
                key={item.label}
                sx={{ display: 'flex', alignItems: 'center' }}
              >
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
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="0.45"
                    className="animate-radar-ring"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="#059669"
                    strokeWidth="0.35"
                    className="animate-radar-ring-delayed"
                  />
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

              {selectedLine}

              {isRadarActive && (
                <g className={fastSweep ? 'animate-radar-sweep-fast' : 'animate-radar-sweep'}>
                  <path d="M 50 50 L 12.0 32.2 A 42 42 0 0 1 50 8 Z" fill="url(#sweepGrad)" />
                  <line x1="50" y1="50" x2="50" y2="8" stroke="#059669" strokeWidth="0.65" strokeLinecap="round" />
                </g>
              )}

              <circle cx="50" cy="50" r="2.8" fill="#10B981" fillOpacity="0.22" />
              <circle cx="50" cy="50" r="1.6" fill="#059669" stroke="#fff" strokeWidth="0.4" />
            </Box>

            {/* Emitter dots (memoized) */}
            {filteredNetworks.map((net, idx) => {
              const pos = layoutMap.get(net.id);
              if (!pos) return null;
              const labelBelow = idx % 2 === 0;
              const isSelected = selectedNet?.id === net.id;

              return (
                <EmitterDot
                  key={net.id}
                  net={net}
                  x={pos.x}
                  y={pos.y}
                  pingDelayS={pos.pingDelayS}
                  sweepPeriod={sweepPeriod}
                  isSelected={isSelected}
                  isRadarActive={isRadarActive}
                  zoomLevel={zoomLevel}
                  labelBelow={labelBelow}
                  onSelect={handleSelectNet}
                />
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
            Scroll to zoom · Drag to pan · Hover node for name
            {isFullScreen ? ' · Press Esc to exit' : ''}
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
            {networksProp === undefined && (
              <>
                {' · '}
                {kismetRunning ? 'LIVE' : 'IDLE'}
              </>
            )}
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
            {networks.length === 0
              ? kismetRunning
                ? 'Waiting for scan data…'
                : 'Start scanning in Live Operation to see emitters.'
              : 'Select an emitter node on the radar map.'}
          </Typography>
        )}

        {selectedNet && (() => {
          const eligible = isDeauthEligible(selectedNet.channel);
          return (
            <Tooltip
              title={
                eligible
                  ? `Queue ${selectedNet.ssid} in DeAuth Monitor`
                  : `⚠️ 5 GHz not supported for deauth — only 2.4 GHz`
              }
            >
              <span>
                <Button
                  fullWidth
                  onClick={() => onSendToDeAuth(selectedNet)}
                  disabled={!eligible}
                  startIcon={
                    eligible ? (
                      <GppBad sx={{ fontSize: 18 }} />
                    ) : (
                      <Lock sx={{ fontSize: 18 }} />
                    )
                  }
                  sx={{
                    mt: 3,
                    bgcolor: '#fef2f2',
                    color: '#b91c1c',
                    border: '1px solid #fecaca',
                    py: 1.2,
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    '&:hover': { bgcolor: '#fee2e2' },
                    '&.Mui-disabled': {
                      bgcolor: '#f1f5f9',
                      color: '#94a3b8',
                      border: '1px solid #e2e8f0',
                    },
                  }}
                >
                  {eligible ? 'Queue in DeAuth Monitor' : 'Not Eligible (5 GHz)'}
                </Button>
              </span>
            </Tooltip>
          );
        })()}
      </Paper>
    </Box>
  );
};

export default SignalMapView;