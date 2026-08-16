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

import LiveOperation from "../pages/LiveOperation";
import LiveScan from "../pages/LiveScan";
import DeAuthMonitor from "../pages/DeAuthMonitor";
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
          <Route path="/monitor" element={<MonitorPage />} />
          
          {/* Live Operation Routes - FIXED */}
          <Route path="/live-operation" element={<LiveOperation />}>
            <Route index element={<LiveScan />} />
            {/* ✅ Removed leading slashes from child routes */}
            <Route path="scan" element={<LiveScan />} />
            <Route path="deauth" element={<DeAuthMonitor />} />
            <Route path="map" element={<SignalMap />} />
          </Route>
          
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}