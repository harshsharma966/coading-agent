import React, { useState } from "react";
import {
  Search,
  FileCode,
  PenTool,
  FolderTree,
  Terminal,
  Brain,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Cpu,
} from "lucide-react";

export default function ThoughtProcess({ thoughts = [], isLive = false }) {
  const [isExpanded, setIsExpanded] = useState(isLive);

  if (!thoughts || thoughts.length === 0) return null;

  const getToolIcon = (toolName) => {
    switch (toolName) {
      case "search_codebase":
        return <Search size={13} className="thought-icon search" />;
      case "read_file":
        return <FileCode size={13} className="thought-icon read" />;
      case "write_file":
        return <PenTool size={13} className="thought-icon write" />;
      case "list_directory":
        return <FolderTree size={13} className="thought-icon dir" />;
      case "execute_python_code":
        return <Terminal size={13} className="thought-icon exec" />;
      case "save_memory":
      case "get_memory":
      case "list_memories":
      case "memory":
        return <Brain size={13} className="thought-icon memory" />;
      default:
        return <Cpu size={13} className="thought-icon default" />;
    }
  };

  const hasRunning = thoughts.some((t) => t.status === "running");

  return (
    <div className={`thought-process-container ${isLive ? "live" : "completed"}`}>
      <button
        type="button"
        className="thought-process-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        title={isExpanded ? "Collapse thought steps" : "Expand thought steps"}
      >
        <div className="thought-header-left">
          <div className={`thought-badge ${isLive && hasRunning ? "pulsing" : ""}`}>
            {isLive && hasRunning ? (
              <Loader2 size={13} className="spinner" />
            ) : (
              <Cpu size={13} />
            )}
          </div>
          <span className="thought-header-title">
            {isLive && hasRunning
              ? `Agent Reasoning & Tools (${thoughts.length} step${thoughts.length > 1 ? "s" : ""})...`
              : `View Thought Process & Tools (${thoughts.length} step${thoughts.length > 1 ? "s" : ""})`}
          </span>
        </div>
        <div className="thought-header-right">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {isExpanded && (
        <div className="thought-steps-list">
          {thoughts.map((step, idx) => {
            const isRunning = step.status === "running";
            return (
              <div key={step.id || idx} className={`thought-step-item ${isRunning ? "running" : "done"}`}>
                <div className="thought-step-icon-wrap">{getToolIcon(step.tool)}</div>
                <div className="thought-step-content">
                  <span className="thought-step-label">{step.label}</span>
                </div>
                <div className="thought-step-status">
                  {isRunning ? (
                    <Loader2 size={12} className="spinner" />
                  ) : (
                    <CheckCircle2 size={12} className="check-icon" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
