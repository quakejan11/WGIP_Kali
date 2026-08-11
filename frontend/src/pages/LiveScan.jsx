import React, { useState, useEffect } from "react";
import { useLiveData } from "../hooks/useLiveData";
import { ConnectionStatus } from "../components/live/ConnectionStatus";
import { TempDBControls } from "../components/live/TempDBControls";

const LiveScan = () => {
  const { data, isLoading, error, isFallbackMode, pcapStatus } = useLiveData();
  const [selectedAdapter, setSelectedAdapter] = useState("");

  useEffect(() => {
    // Fetch available interfaces on mount
    fetchInterfaces();
  }, []);

  const fetchInterfaces = async () => {
    try {
      const response = await fetch("/api/interfaces");
      if (response.ok) {
        const interfaces = await response.json();
        // Set first available adapter as default
        if (interfaces.length > 0 && !selectedAdapter) {
          setSelectedAdapter(interfaces[0].name);
        }
      }
    } catch (err) {
      console.error("Failed to fetch interfaces:", err);
    }
  };

  const handleStartKismet = async () => {
    if (!selectedAdapter) return;
    try {
      await fetch("/api/interfaces/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interface: selectedAdapter })
      });
      
      await fetch("/api/kismet/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interface: selectedAdapter })
      });
    } catch (err) {
      console.error("Failed to start Kismet:", err);
    }
  };

  const handleStopKismet = async () => {
    try {
      await fetch("/api/kismet/stop", { method: "POST" });
    } catch (err) {
      console.error("Failed to stop Kismet:", err);
    }
  };

  if (isLoading) return <div className="text-center py-10">Loading...</div>;
  if (error) return <div className="text-center text-red-500 py-10">Error: {error.message}</div>;

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <ConnectionStatus 
        isConnected={pcapStatus.connected} 
        isFallbackMode={isFallbackMode}
        packetCount={data.length}
      />
      
      {/* Adapter Selection & Controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="w-full md:w-auto">
            <label className="block text-sm font-medium mb-1">WiFi Adapter:</label>
            <select
              value={selectedAdapter}
              onChange={(e) => setSelectedAdapter(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Adapter</option>
              {/* Options will be populated dynamically */}
            </select>
          </div>
          
          <div className="flex-1 flex flex-col md:items-end md:flex-row md:gap-2">
            <button
              onClick={handleStartKismet}
              disabled={!selectedAdapter || pcapStatus.connected}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
            >
              � ▶ Start
            </button>
            <button
              onClick={handleStopKismet}
              disabled={!pcapStatus.connected}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400"
            >
              �� ⏹ Stop
            </button>
            <button
              onClick={fetchInterfaces}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              �� 🔄 Refresh
            </button>
          </div>
        </div>
        
        {/* Temp DB Controls */}
        <TempDBControls />
      </div>
      
      {/* Live Data Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">BSSID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ESSID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CH</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Signal</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Security</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clients</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Packets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.length === 0 ? (
                <tr>
                  <td className="px-6 py-4 text-center text-gray-500" colSpan="7">
                    No networks detected
                  </td>
                </tr>
              ) : (
                data.map((network, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {network.bssid || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {network.essid || "Hidden"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {network.channel || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <span className={`${getSignalClass(network.signal)}`}>
                        {network.signal !== null ? `${network.signal}dBm` : "N/A"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {network.security || "Unknown"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {network.client_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {network.packet_count || 0}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const getSignalClass = (signal) => {
  if (signal === null) return "text-gray-400";
  if (signal >= -50) return "text-green-600";
  if (signal >= -70) return "text-yellow-600";
  return "text-red-600";
};

export default LiveScan;