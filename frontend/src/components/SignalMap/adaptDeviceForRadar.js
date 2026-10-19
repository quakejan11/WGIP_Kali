// src/components/SignalMap/adaptDeviceForRadar.js
import { getBand, formatGps } from "../../hooks/useLiveOperation";

/**
 * Convert a LiveOperation device object into the shape
 * SignalMapView expects.
 */
export const adaptDeviceForRadar = (device) => ({
  id: device.bssid,
  ssid: device.ssid,
  bssid: device.bssid,
  signal: device.signal,
  band: getBand(device.channel),
  channel: device.channel,
  encryption: device.encryption,
  manufacturer: device.manufacturer || "Unknown",
  location: formatGps(device),
  signalHistory: device.signalHistory || [],
  // keep raw for any downstream needs
  _raw: device,
});

export const adaptDevicesForRadar = (devices = []) =>
  devices.map(adaptDeviceForRadar);