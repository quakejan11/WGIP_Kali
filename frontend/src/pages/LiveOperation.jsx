import React from "react";
import { Outlet } from "react-router-dom";
import LiveOperationSidebar from "../components/layout/LiveOperationSidebar";

const LiveOperation = () => {
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <LiveOperationSidebar />
      <div className="flex-1 p-4 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default LiveOperation;