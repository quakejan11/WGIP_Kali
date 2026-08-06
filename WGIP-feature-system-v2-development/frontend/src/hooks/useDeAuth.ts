// src/hooks/useDeAuth.ts
import { useState, useEffect, useCallback } from 'react';
import deauthService, { DeauthDevice, DeauthStats, DeauthLog } from '../services/deauthService';

export const useDeAuth = () => {
  const [devices, setDevices] = useState<DeauthDevice[]>([]);
  const [aps, setAps] = useState<any[]>([]);
  const [stats, setStats] = useState<DeauthStats | null>(null);
  const [logs, setLogs] = useState<DeauthLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [devicesRes, statsRes, logsRes, apsRes] = await Promise.all([
        deauthService.getDevices(),
        deauthService.getStats(),
        deauthService.getLogs({ limit: 50 }),
        deauthService.getAPs({ limit: 50 }),
      ]);
      setDevices(devicesRes.data.devices);
      setStats(statsRes.data);
      setLogs(logsRes.data.logs);
      setAps(apsRes.data.aps || []);
    } catch (err) {
      setError('Failed to fetch data');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const executeDeauth = useCallback(async (clientMac: string) => {
    setLoading(true);
    try {
      const result = await deauthService.executeDeauth({
        client_mac: clientMac,
        reason: 'Manual deauth',
        operator: 'Admin',
        count: 5,
      });
      await fetchData();
      return result.data;
    } catch (err) {
      setError('Failed to execute deauth');
      console.error('Error executing deauth:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  const deauthAP = useCallback(async (bssid: string, reason: string) => {
    setLoading(true);
    try {
      const result = await deauthService.deauthAP(bssid, {
        client_mac: bssid,
        reason: reason,
        operator: 'Admin',
        count: 5,
      });
      await fetchData();
      return result.data;
    } catch (err) {
      setError('Failed to deauth AP');
      console.error('Error deauthing AP:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  const flagDevice = useCallback(async (clientMac: string, reason: string, operator: string) => {
    setLoading(true);
    try {
      const result = await deauthService.flagDevice({
        client_mac: clientMac,
        reason,
        operator,
      });
      await fetchData();
      return result.data;
    } catch (err) {
      setError('Failed to flag device');
      console.error('Error flagging device:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    devices,
    aps,
    stats,
    logs,
    loading,
    error,
    fetchData,
    executeDeauth,
    deauthAP,
    flagDevice,
  };
};

export default useDeAuth;