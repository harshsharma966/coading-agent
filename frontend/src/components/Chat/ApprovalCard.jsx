import React, { useState } from "react";
import { ShieldAlert, Check, X, Terminal, FileCode, MessageSquare, GitCompare } from "lucide-react";

export default function ApprovalCard({ approvalData, onDecision }) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!approvalData) return null;

  const isTerminal = approvalData.action === "run_terminal_command";
  const isWrite = approvalData.action === "write_file";
  const isEdit = approvalData.action === "edit_file";

  const handleAction = (approved) => {
    setIsSubmitting(true);
    onDecision({ approved, feedback });
  };

  return (
    <div className="approval-card">
      <div className="approval-header">
        <div className="approval-badge">
          <ShieldAlert size={16} />
        </div>
        <div className="approval-title-wrap">
          <span className="approval-title">Permission Required</span>
          <span className="approval-sub">Agent requested approval for a sensitive action</span>
        </div>
      </div>

      <div className="approval-details">
        <div className="approval-target-row">
          {isTerminal && <Terminal size={14} className="approval-type-icon terminal" />}
          {isWrite && <FileCode size={14} className="approval-type-icon file" />}
          {isEdit && <GitCompare size={14} className="approval-type-icon git" />}
          <span className="approval-action-tag">
            {isEdit ? "edit_file (patch)" : approvalData.action}
          </span>
        </div>

        {isTerminal && (
          <div className="approval-command-box">
            <code>{approvalData.command}</code>
            {approvalData.working_dir && approvalData.working_dir !== "." && (
              <span className="approval-dir-tag">dir: {approvalData.working_dir}</span>
            )}
          </div>
        )}

        {isWrite && (
          <div className="approval-file-info">
            <div className="approval-file-path">
              <span>File:</span> <code>{approvalData.file_path}</code>
            </div>
            {approvalData.preview && (
              <pre className="approval-preview-box">{approvalData.preview}</pre>
            )}
          </div>
        )}

        {isEdit && (
          <div className="approval-file-info">
            <div className="approval-file-path">
              <span>Target File:</span> <code>{approvalData.file_path}</code>
              {approvalData.char_diff !== undefined && (
                <span className={`diff-stat-badge ${approvalData.char_diff >= 0 ? "add" : "del"}`}>
                  {approvalData.char_diff >= 0 ? `+${approvalData.char_diff}` : approvalData.char_diff} chars
                </span>
              )}
            </div>

            {approvalData.diff && (
              <div className="approval-diff-container">
                <div className="diff-header-bar">
                  <span>Git-Style Diff Preview</span>
                </div>
                <div className="approval-diff-box">
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
            )}
          </div>
        )}
      </div>

      <div className="approval-input-row">
        <MessageSquare size={14} className="approval-input-icon" />
        <input
          type="text"
          placeholder="Optional instruction or feedback (e.g. 'Use port 5000 instead')..."
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

      <div className="approval-actions-row">
        <button
          type="button"
          className="approval-btn reject"
          onClick={() => handleAction(false)}
          disabled={isSubmitting}
          title="Deny permission"
        >
          <X size={14} />
          <span>Reject</span>
        </button>
        <button
          type="button"
          className="approval-btn approve"
          onClick={() => handleAction(true)}
          disabled={isSubmitting}
          title="Grant permission to execute"
        >
          <Check size={14} />
          <span>Approve & Continue</span>
        </button>
      </div>
    </div>
  );
}
