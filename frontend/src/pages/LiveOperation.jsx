import React from "react";
import LiveOperationSidebar from "../components/layout/LiveOperationSidebar";
import { Outlet } from "react-router-dom";

const LiveOperation = () => {
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <LiveOperationSidebar className="w-[280px] border-r" />
      <div className="flex-1 p-4 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default LiveOperation;  