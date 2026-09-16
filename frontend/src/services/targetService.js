// src/services/targetService.js
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============ API Functions ============

export const targetService = {
  // Save (upsert) a target — if BSSID exists, updates it
  saveTarget: (data) => api.post('/api/targets', data),

  // Get all targets
  getTargets: (params) => api.get('/api/targets', { params }),

  // Get a single target by ID
  getTarget: (id) => api.get(`/api/targets/${id}`),

  // Update target (status, handshake, etc.)
  updateTarget: (id, data) => api.patch(`/api/targets/${id}`, data),

  // Delete a single target
  deleteTarget: (id) => api.delete(`/api/targets/${id}`),

  // Clear all targets
  clearAllTargets: () => api.delete('/api/targets'),
};

export default targetService;