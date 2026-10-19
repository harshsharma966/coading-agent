import React from "react";

export default function BackendStatus({ isConnected }) {
  return (
    <div className="sidebar-footer">
      <span>Backend Status</span>
      <div className={`status-badge ${isConnected ? "connected" : "disconnected"}`}>
        <div className="status-dot"></div>
        <span>{isConnected ? "Connected" : "Disconnected"}</span>
      </div>
    </div>
  );
}
