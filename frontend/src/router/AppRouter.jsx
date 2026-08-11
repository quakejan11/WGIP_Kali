import { BrowserRouter, Route, Routes } from "react-router-dom";

import MainLayout from "../components/layout/MainLayout";

import Dashboard from "../pages/Dashboard";
import Import from "../pages/Import";
import KismetImportDetails from "../pages/KismetImportDetails";
import ScanHistory from "../pages/ScanHistory";
import Map from "../pages/Map";
import ImportantSignals from "../pages/ImportantSignals";
import Observations from "../pages/Observations";
import BssidHistory from "../pages/BssidHistory";
import BSSIDProfile from "../pages/BSSIDProfile";
import ClientDeviceTimeline from "../pages/ClientDeviceTimeline";
import DeviceLinkAnalysis from "../pages/DeviceLinkAnalysis";
import Alerts from "../pages/Alerts";
import Settings from "../pages/Settings";
import MonitorPage from "../pages/MonitorPage";
import TrackedDevices from "../pages/TrackedDevices";

// Import LiveScanning
import LiveScanning from "../pages/LiveScanning";
import DeAuth from "../pages/DeAuth";
import SignalMap from "../pages/SignalMap";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/import" element={<Import />} />
          <Route path="/imports/:importBatchId" element={<KismetImportDetails />} />

          <Route path="/scans" element={<ScanHistory />} />
          <Route path="/scans/:importBatchId" element={<KismetImportDetails />} />
          <Route path="/scan-results/:importBatchId" element={<KismetImportDetails />} />

          <Route path="/map" element={<Map />} />

          <Route path="/signals" element={<ImportantSignals />} />

          <Route path="/observations" element={<Observations />} />

          <Route path="/bssid-history" element={<BssidHistory />} />
          <Route path="/bssids/:bssid" element={<BSSIDProfile />} />

          <Route path="/clients/:mac/timeline" element={<ClientDeviceTimeline />} />
          <Route
            path="/clients/:clientMac/timeline"
            element={<ClientDeviceTimeline />}
          />

          <Route path="/devices" element={<TrackedDevices />} />
          <Route path="/devices/:mac/link-analysis" element={<DeviceLinkAnalysis />} />
          <Route
            path="/devices/:clientMac/link-analysis"
            element={<DeviceLinkAnalysis />}
          />

          <Route path="/alerts" element={<Alerts />} />
          <Route path="/deauth" element={<DeAuth />} />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/signal-map" element={<SignalMap />} />
         
          {/* Live Scanning Route */}
          <Route path="/live-scanning" element={<LiveScanning />} />
          
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}