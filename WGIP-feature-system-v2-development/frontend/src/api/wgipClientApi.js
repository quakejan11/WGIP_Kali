import axios from "axios";

export const API_BASE_URL = "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

function encodePathValue(value) {
  return encodeURIComponent(value || "");
}

export async function getClientsForBssid(bssid) {
  const response = await api.get(`/client-observations/bssid/${encodePathValue(bssid)}`);
  return response.data;
}

export async function getClientTimeline(clientMac) {
  const response = await api.get(`/client-observations/client/${encodePathValue(clientMac)}/timeline`);
  return response.data;
}

export async function getBssidClientTimeline(bssid) {
  const response = await api.get(`/client-observations/bssid/${encodePathValue(bssid)}/timeline`);
  return response.data;
}

export async function getImportantSignals() {
  const response = await api.get("/signals/important");
  return response.data;
}

export function getBssidProfilePdfUrl(bssid) {
  return `${API_BASE_URL}/bssids/${encodePathValue(bssid)}/profile/pdf`;
}

export async function getScanSummary(surveyId) {
  const response = await api.get(`/scans/${surveyId}/summary`);
  return response.data;
}

export async function getScans() {
  const response = await api.get("/scans");
  return response.data;
}

export async function getDeviceProfile(clientMac) {
  const response = await api.get(`/devices/${encodePathValue(clientMac)}/profile`);
  return response.data;
}

export async function updateDeviceProfile(clientMac, payload) {
  const response = await api.put(`/devices/${encodePathValue(clientMac)}/profile`, payload);
  return response.data;
}

export async function getDeviceLinkAnalysis(clientMac) {
  const response = await api.get(`/devices/${encodePathValue(clientMac)}/link-analysis`);
  return response.data;
}

export default api;