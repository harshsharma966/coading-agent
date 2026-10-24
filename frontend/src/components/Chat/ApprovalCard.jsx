import React, { useState, useEffect, useRef } from "react";
import {
  ShieldAlert,
  Check,
  X,
  Terminal,
  FileCode,
  MessageSquare,
  GitCompare,
  Columns,
  FileText,
  Maximize2,
  Minimize2,
  Copy,
  CheckCheck
} from "lucide-react";

export default function ApprovalCard({ approvalData, onDecision }) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [diffViewMode, setDiffViewMode] = useState("split"); // "split" (Side-by-Side) | "unified"
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    // Scroll card completely into view starting from the top
    const scrollToCard = () => {
      if (cardRef.current) {
        cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    scrollToCard();
    const t1 = setTimeout(scrollToCard, 60);
    const t2 = setTimeout(scrollToCard, 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!approvalData) return null;

  const isTerminal = approvalData.action === "run_terminal_command";
  const isWrite = approvalData.action === "write_file";
  const isEdit = approvalData.action === "edit_file";

  const handleAction = (approved) => {
    setIsSubmitting(true);
    onDecision({ approved, feedback });
  };

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const oldLines = (approvalData.old_lines || "").split("\n");
  const newLines = (approvalData.new_lines || "").split("\n");
  const hasSplitData = Boolean(approvalData.old_lines || approvalData.new_lines);

  return (
    <div className={`approval-card ${isExpanded ? "expanded" : ""}`} ref={cardRef}>
      <div className="approval-header">
        <div className="approval-header-left">
          <div className="approval-badge">
            <ShieldAlert size={20} />
          </div>
          <div className="approval-title-wrap">
            <span className="approval-title">Permission Required</span>
            <span className="approval-sub">Review and confirm this sensitive action</span>
          </div>
        </div>

        {/* Top Quick Action Buttons */}
        <div className="approval-header-actions">
          <button
            type="button"
            className="approval-btn reject"
            onClick={() => handleAction(false)}
            disabled={isSubmitting}
            title="Deny permission"
          >
            <X size={15} />
            <span>Reject</span>
          </button>
          <button
            type="button"
            className="approval-btn approve"
            onClick={() => handleAction(true)}
            disabled={isSubmitting}
            title="Grant permission to execute"
          >
            <Check size={15} />
            <span>Approve & Continue</span>
          </button>
        </div>
      </div>

      <div className="approval-details">
        {/* Action Type Bar & View Controls */}
        <div className="approval-target-row">
          <div className="approval-target-left">
            {isTerminal && <Terminal size={15} className="approval-type-icon terminal" />}
            {isWrite && <FileCode size={15} className="approval-type-icon file" />}
            {isEdit && <GitCompare size={15} className="approval-type-icon git" />}
            <span className="approval-action-tag">
              {isEdit ? "edit_file (Code Patch)" : isWrite ? "write_file (New File)" : approvalData.action}
            </span>
          </div>

          <div className="approval-target-controls">
            {isEdit && hasSplitData && (
              <div className="diff-mode-toggle-group">
                <button
                  type="button"
                  className={`diff-toggle-btn ${diffViewMode === "split" ? "active" : ""}`}
                  onClick={() => setDiffViewMode("split")}
                  title="Side-by-Side Comparison"
                >
                  <Columns size={13} />
                  <span>Side-by-Side</span>
                </button>
                <button
                  type="button"
                  className={`diff-toggle-btn ${diffViewMode === "unified" ? "active" : ""}`}
                  onClick={() => setDiffViewMode("unified")}
                  title="Unified Git Diff"
                >
                  <FileText size={13} />
                  <span>Unified Diff</span>
                </button>
              </div>
            )}

            {(isEdit || isWrite) && (
              <button
                type="button"
                className="diff-expand-btn"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? "Collapse View" : "Expand View (Bigger Window)"}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                <span>{isExpanded ? "Compact" : "Enlarge"}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Terminal Command ── */}
        {isTerminal && (
          <div className="approval-command-box">
            <div className="approval-box-header">
              <span className="box-label">Shell Command</span>
              <button
                type="button"
                className="copy-btn-sm"
                onClick={() => handleCopy(approvalData.command)}
                title="Copy Command"
              >
                {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <code>{approvalData.command}</code>
            {approvalData.working_dir && approvalData.working_dir !== "." && (
              <span className="approval-dir-tag">Working Dir: {approvalData.working_dir}</span>
            )}
          </div>
        )}

        {/* ── Write File Preview ── */}
        {isWrite && (
          <div className="approval-file-info">
            <div className="approval-file-path">
              <span className="path-label">Destination File:</span>
              <code>{approvalData.file_path}</code>
              {approvalData.char_count && (
                <span className="diff-stat-badge add">{approvalData.char_count} chars</span>
              )}
            </div>

            {approvalData.preview && (
              <div className="approval-preview-container">
                <div className="approval-box-header">
                  <span className="box-label">File Content Preview</span>
                  <button
                    type="button"
                    className="copy-btn-sm"
                    onClick={() => handleCopy(approvalData.preview)}
                    title="Copy Content"
                  >
                    {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <div className={`approval-preview-box ${isExpanded ? "expanded" : ""}`}>
                  {approvalData.preview.split("\n").map((line, idx) => (
                    <div key={idx} className="preview-code-line">
                      <span className="preview-line-num">{idx + 1}</span>
                      <span className="preview-line-text">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Edit File Comparison ── */}
        {isEdit && (
          <div className="approval-file-info">
            <div className="approval-file-path">
              <span className="path-label">Target File:</span>
              <code>{approvalData.file_path}</code>
              {approvalData.char_diff !== undefined && (
                <span className={`diff-stat-badge ${approvalData.char_diff >= 0 ? "add" : "del"}`}>
                  {approvalData.char_diff >= 0 ? `+${approvalData.char_diff}` : approvalData.char_diff} chars
                </span>
              )}
            </div>

            {/* Side-by-Side Comparison Mode */}
            {diffViewMode === "split" && hasSplitData ? (
              <div className="approval-side-by-side-wrap">
                <div className="side-comparison-columns">
                  {/* Left Column: Original / Before */}
                  <div className="side-pane old-pane">
                    <div className="side-pane-header">
                      <span className="side-pane-title">Original (Before)</span>
                      <span className="side-pane-badge del">Removed</span>
                    </div>
                    <div className={`side-pane-content ${isExpanded ? "expanded" : ""}`}>
                      {oldLines.map((line, idx) => (
                        <div key={idx} className="side-diff-line del">
                          <span className="side-line-num">{idx + 1}</span>
                          <span className="side-line-text">{line || " "}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Column: Proposed / After */}
                  <div className="side-pane new-pane">
                    <div className="side-pane-header">
                      <span className="side-pane-title">Proposed (After)</span>
                      <span className="side-pane-badge add">Added</span>
                    </div>
                    <div className={`side-pane-content ${isExpanded ? "expanded" : ""}`}>
                      {newLines.map((line, idx) => (
                        <div key={idx} className="side-diff-line add">
                          <span className="side-line-num">{idx + 1}</span>
                          <span className="side-line-text">{line || " "}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Unified Diff Mode */
              approvalData.diff && (
                <div className="approval-diff-container">
                  <div className="diff-header-bar">
                    <span>Git-Style Unified Diff</span>
                  </div>
                  <div className={`approval-diff-box ${isExpanded ? "expanded" : ""}`}>
                    {approvalData.diff.split("\n").map((line, idx) => {
                      let lineClass = "diff-line-context";
                      if (line.startsWith("+") && !line.startsWith("+++")) lineClass = "diff-line-add";
                      else if (line.startsWith("-") && !line.startsWith("---")) lineClass = "diff-line-del";
                      else if (line.startsWith("@@")) lineClass = "diff-line-header";

                      return (
                        <div key={idx} className={`diff-line ${lineClass}`}>
                          <span className="diff-marker">{line.slice(0, 1)}</span>
                          <span className="diff-content">{line.slice(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Human Feedback Input Row */}
      <div className="approval-input-row">
        <MessageSquare size={15} className="approval-input-icon" />
        <input
          type="text"
          placeholder="Optional instructions or feedback (e.g. 'Save to Documents instead', 'Use port 5000')..."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={isSubmitting}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAction(true);
            }
          }}
        />
      </div>

      {/* Bottom Approval Action Buttons */}
      <div className="approval-actions-row">
        <button
          type="button"
          className="approval-btn reject"
          onClick={() => handleAction(false)}
          disabled={isSubmitting}
          title="Deny permission"
        >
          <X size={15} />
          <span>Reject</span>
        </button>
        <button
          type="button"
          className="approval-btn approve"
          onClick={() => handleAction(true)}
          disabled={isSubmitting}
          title="Grant permission to execute"
        >
          <Check size={15} />
          <span>Approve & Continue</span>
        </button>
      </div>
    </div>
  );
}
