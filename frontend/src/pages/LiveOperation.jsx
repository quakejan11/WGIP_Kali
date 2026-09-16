import React from "react";
import { Outlet } from "react-router-dom";

const LiveOperation = () => {
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div className="flex-1 p-4 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default LiveOperation;