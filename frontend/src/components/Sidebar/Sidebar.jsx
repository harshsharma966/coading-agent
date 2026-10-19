import React, { useState } from "react";
import { Bot, Plus, Search, MessageSquare, MoreVertical } from "lucide-react";
import BackendStatus from "./BackendStatus";

export default function Sidebar({
  threads,
  threadTitles = {},
  activeThreadId,
  onSelectThread,
  onNewChat,
  isConnected,
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const getDisplayTitle = (tid) => {
    if (threadTitles && threadTitles[tid]) {
      return threadTitles[tid];
    }
    if (tid === "default") return "General Chat";
    return tid.replace("session_", "Chat ");
  };

  // Group threads by time
  const groupThreads = () => {
    const today = [];
    const older = [];

    threads.forEach((tid) => {
      if (tid.includes("session_") || tid === activeThreadId) {
        today.push(tid);
      } else {
        older.push(tid);
      }
    });

    return { today, older };
  };

  const { today, older } = groupThreads();
  const query = searchQuery.toLowerCase().trim();

  const filteredToday = today.filter((t) =>
    getDisplayTitle(t).toLowerCase().includes(query) || t.toLowerCase().includes(query)
  );
  const filteredOlder = older.filter((t) =>
    getDisplayTitle(t).toLowerCase().includes(query) || t.toLowerCase().includes(query)
  );

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="logo-icon">
          <Bot size={20} />
        </div>
        <div className="brand-info">
          <div className="logo-text">Saarthi</div>
          <div className="brand-subtitle">Your Coding & Research Assistant</div>
        </div>
      </div>

      {/* New Chat Button */}
      <button className="new-chat-btn" onClick={onNewChat}>
        <Plus size={16} />
        <span>New Chat</span>
      </button>

      {/* Scrollable Section */}
      <div className="sidebar-scroll-content">
        {/* Search */}
        <div className="sidebar-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Conversations */}
        <div className="sidebar-section">
          <div className="section-title">
            <MessageSquare size={13} />
            <span>CONVERSATIONS ({threads.length})</span>
          </div>

          {filteredToday.length > 0 && (
            <>
              <div className="thread-group-label">Today</div>
              {filteredToday.map((tid) => (
                <div
                  key={tid}
                  className={`thread-item ${tid === activeThreadId ? "active" : ""}`}
                  onClick={() => onSelectThread(tid)}
                  title={getDisplayTitle(tid)}
                >
                  <div className="thread-item-content">
                    <MessageSquare size={14} className="thread-icon" />
                    <span className="thread-title-text">{getDisplayTitle(tid)}</span>
                  </div>
                  <button className="thread-menu-btn" onClick={(e) => e.stopPropagation()}>
                    <MoreVertical size={14} />
                  </button>
                </div>
              ))}
            </>
          )}

          {filteredOlder.length > 0 && (
            <>
              <div className="thread-group-label">Previous</div>
              {filteredOlder.map((tid) => (
                <div
                  key={tid}
                  className={`thread-item ${tid === activeThreadId ? "active" : ""}`}
                  onClick={() => onSelectThread(tid)}
                  title={getDisplayTitle(tid)}
                >
                  <div className="thread-item-content">
                    <MessageSquare size={14} className="thread-icon" />
                    <span className="thread-title-text">{getDisplayTitle(tid)}</span>
                  </div>
                  <button className="thread-menu-btn" onClick={(e) => e.stopPropagation()}>
                    <MoreVertical size={14} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <BackendStatus isConnected={isConnected} />
    </aside>
  );
}
