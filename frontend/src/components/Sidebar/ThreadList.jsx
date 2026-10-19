import React from "react";
import { MessageSquare } from "lucide-react";

export default function ThreadList({ threads, activeThreadId, onSelectThread }) {
  return (
    <div className="sidebar-section">
      <div className="section-title">Threads & History ({threads.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
        {threads.map((tid) => (
          <div
            key={tid}
            className={`thread-item ${tid === activeThreadId ? "active" : ""}`}
            onClick={() => onSelectThread(tid)}
            title={tid}
          >
            <div className="thread-item-content">
              <MessageSquare size={14} style={{ flexShrink: 0 }} />
              <span>{tid}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
