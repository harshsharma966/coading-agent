import React from "react";
import { Code2, Settings, User, Sun, Moon } from "lucide-react";

export default function ChatHeader({ activeThreadId, threadTitle, isConnected, theme, onToggleTheme }) {
  const currentTitle = threadTitle || (activeThreadId === "default" ? "General Chat" : "New Chat");

  return (
    <header className="top-header">
      <div className="header-left">
        <div className="header-brand-badge">
          <div className="header-brand-icon">
            <Code2 size={16} />
          </div>
          <div className="header-brand-text">
            <span className="header-brand-name">{currentTitle}</span>
            <span className="header-brand-sub">Saarthi Workspace</span>
          </div>
        </div>
      </div>

      <div className="header-actions">
        <button
          className="header-icon-btn theme-toggle-btn"
          onClick={onToggleTheme}
          title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          aria-label="Toggle theme"
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <button className="header-icon-btn" title="Settings">
          <Settings size={16} />
        </button>
        <div className="header-avatar" title="User Profile">
          <User size={16} />
        </div>
      </div>
    </header>
  );
}
