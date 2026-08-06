// src/services/deauthService.ts
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============ Types ============

export interface DeauthDevice {
  id: number;
  device_profile_id: number | null;
  client_mac: string;
  status: 'active' | 'flagged' | 'pending' | 'deauthenticated' | 'blocked';
  display_name: string | null;
  notes: string | null;
  last_deauth_attempt: string | null;
  deauth_count: number;
  created_at: string;
  updated_at: string;
}

export interface DeauthLog {
  id: number;
  client_mac: string;
  reason: string;
  operator: string | null;
  success: boolean;
  packets_sent: number;
  error_message: string | null;
  requested_at: string;
  executed_at: string | null;
}

export interface DeauthStats {
  total_devices: number;
  status_counts: Record<string, number>;
  total_attempts: number;
  successful_deauths: number;
  success_rate: number;
  queue_pending: number;
}

export interface APData {
  bssid: string;
  ssid: string;
  channel: number;
  manufacturer: string;
  client_count: number;
  last_seen: string;
  total_observations: number;
}

export interface APResponse {
  total: number;
  aps: APData[];
}

export interface FlagDeviceRequest {
  client_mac: string;
  reason: string;
  operator?: string;
}

export interface DeauthRequest {
  client_mac: string;
  reason: string;
  operator?: string;
  count?: number;
}

export interface BulkDeauthRequest {
  client_macs: string[];
  reason: string;
  operator?: string;
  count?: number;
}

export interface QueueDeauthRequest {
  client_mac: string;
  reason: string;
  operator?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface UpdateStatusRequest {
  status: 'active' | 'flagged' | 'pending' | 'deauthenticated' | 'blocked';
  notes?: string;
}

// ============ API Functions ============

export const deauthService = {
  // Device Management
  flagDevice: (data: FlagDeviceRequest) =>
    api.post<{ success: boolean; device_id: number; client_mac: string; status: string }>(
      '/api/deauth/flag',
      data
    ),

  getDevices: (params?: { status?: string; search?: string; limit?: number; offset?: number }) =>
    api.get<{ total: number; devices: DeauthDevice[] }>('/api/deauth/devices', { params }),

  updateDeviceStatus: (client_mac: string, data: UpdateStatusRequest) =>
    api.put<{ success: boolean; client_mac: string; status: string }>(
      `/api/deauth/device/${client_mac}/status`,
      data
    ),

  // Deauth Execution
  executeDeauth: (data: DeauthRequest) =>
    api.post<{ success: boolean; client_mac: string; packets_sent: number; log_id: number; error?: string }>(
      '/api/deauth/execute',
      data
    ),

  bulkExecuteDeauth: (data: BulkDeauthRequest) =>
    api.post<{
      total: number;
      successful: number;
      failed: number;
      results: Array<{ success: boolean; client_mac: string; packets_sent: number; error?: string }>;
    }>('/api/deauth/bulk-execute', data),

  // Queue Management
  queueDeauth: (data: QueueDeauthRequest) =>
    api.post<{ success: boolean; queue_id: number; client_mac: string; status: string }>(
      '/api/deauth/queue',
      data
    ),

  processQueue: (limit?: number) =>
    api.post<{
      processed: number;
      results: Array<{ queue_id: number; client_mac: string; status: string; success: boolean }>;
    }>('/api/deauth/queue/process', { limit }),

  // Statistics and Logs
  getStats: () =>
    api.get<DeauthStats>('/api/deauth/stats'),

  getLogs: (params?: { limit?: number; offset?: number }) =>
    api.get<{ total: number; logs: DeauthLog[] }>('/api/deauth/logs', { params }),

  // Interface Status
  getInterfaceStatus: () =>
    api.get<{ interface: string; ready: boolean; error?: string }>(
      '/api/deauth/interface/status'
    ),

  // ============ AP Management (NEW) ============
  getAPs: (params?: { search?: string; limit?: number; offset?: number }) =>
    api.get<APResponse>('/api/deauth/aps', { params }),

  getAPClients: (bssid: string) =>
    api.get<{ clients: Array<{ client_mac: string; last_seen: string; observations: number }> }>(
      `/api/deauth/aps/${bssid}/clients`
    ),

  deauthAP: (bssid: string, data: DeauthRequest) =>
    api.post<{
      success: boolean;
      bssid: string;
      total_clients: number;
      successful_deauths: number;
      failed_deauths: number;
      results: Array<{ success: boolean; client_mac: string; packets_sent: number; error?: string }>;
    }>(`/api/deauth/aps/${bssid}/deauth`, data),
};

export default deauthService;