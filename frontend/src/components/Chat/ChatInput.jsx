import React, { useRef, useEffect, useState } from "react";
import { ArrowUp, Paperclip, Plus, X, Loader2, CheckCircle2, FileText, Square } from "lucide-react";
import { ingestCodebaseFiles } from "../../services/api";

export default function ChatInput({ input, setInput, onSend, onStop, isStreaming, filePickerTrigger }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  // Trigger file picker when requested by helper action
  useEffect(() => {
    if (filePickerTrigger > 0 && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [filePickerTrigger]);

  // Focus and select cursor when input is prefilled from prompt helper
  useEffect(() => {
    if (input && textareaRef.current) {
      textareaRef.current.focus();
      const placeholderTarget = "# Paste your code here";
      const targetIdx = input.indexOf(placeholderTarget);
      if (targetIdx !== -1) {
        textareaRef.current.setSelectionRange(targetIdx, targetIdx + placeholderTarget.length);
      } else {
        const len = input.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }
  }, [input]);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && !isUploading && input.trim()) {
        handleSend();
      }
    }
  };

  const handleSend = () => {
    if (!input.trim() || isStreaming || isUploading) return;
    onSend();
    setAttachedFiles([]);
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newAttachments = files.map((file) => ({
      name: file.name,
      size: (file.size / 1024).toFixed(1) + " KB",
      isPdf: file.name.toLowerCase().endsWith(".pdf"),
      status: "uploading",
      chunks: 0,
    }));

    setAttachedFiles((prev) => [...prev, ...newAttachments]);
    setIsUploading(true);

    try {
      const res = await ingestCodebaseFiles(files);
      const chunkCount = res.chunk_count || 0;

      setAttachedFiles((prev) =>
        prev.map((f) =>
          files.some((uploaded) => uploaded.name === f.name)
            ? { ...f, status: "ready", chunks: chunkCount }
            : f
        )
      );

      if (!input.trim()) {
        const fileNames = files.map((f) => f.name).join(", ");
        setInput(`Analyze and explain the contents of ${fileNames}.`);
      }
    } catch (err) {
      console.error("Failed to ingest files:", err);
      setAttachedFiles((prev) =>
        prev.map((f) =>
          files.some((uploaded) => uploaded.name === f.name)
            ? { ...f, status: "error" }
            : f
        )
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeFile = (index) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const canSend = Boolean(input.trim()) && !isStreaming && !isUploading;

  return (
    <div className="input-container">
      <div className="input-box-wrapper">
        <div className="composer-card">
          {/* Top: Text Area */}
          <textarea
            ref={textareaRef}
            className="composer-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isUploading
                ? "Indexing files into knowledge base..."
                : attachedFiles.length > 0
                ? "Ask anything about the attached files..."
                : "Ask a question, attach a file, or describe a coding task..."
            }
            rows={2}
            disabled={isStreaming || isUploading}
          />

          {/* Attached Files List */}
          {attachedFiles.length > 0 && (
            <div className="composer-attachments">
              {attachedFiles.map((file, idx) => (
                <div key={idx} className="composer-file-pill">
                  <span className="file-icon">{file.isPdf ? "📕" : "📄"}</span>
                  <span className="file-name" title={file.name}>{file.name}</span>
                  <span className="file-size">({file.size})</span>

                  {file.status === "uploading" && (
                    <span className="file-status uploading">
                      <Loader2 size={12} className="spinner" />
                      <span>Indexing...</span>
                    </span>
                  )}
                  {file.status === "ready" && (
                    <span className="file-status success">
                      <CheckCircle2 size={12} />
                      <span>Indexed ({file.chunks} chunks)</span>
                    </span>
                  )}
                  {file.status === "error" && (
                    <span className="file-status error">✕ Failed</span>
                  )}

                  <button
                    type="button"
                    className="remove-file-btn"
                    onClick={() => removeFile(idx)}
                    title="Remove file"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Toolbar */}
          <div className="composer-toolbar">
            <div className="composer-toolbar-left">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                multiple
                accept=".pdf,.txt,.py,.js,.jsx,.ts,.tsx,.html,.css,.json,.md,.cpp,.c,.java"
                onChange={handleFileChange}
              />

              <button
                type="button"
                className="composer-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || isUploading}
                title="Attach files (PDF, code, docs)"
              >
                {isUploading ? (
                  <Loader2 size={15} className="spinner" />
                ) : (
                  <Paperclip size={15} />
                )}
                <span>Attach files</span>
              </button>
            </div>

            <div className="composer-toolbar-right">
              {isStreaming ? (
                <button
                  type="button"
                  className="composer-send-btn stop active"
                  onClick={onStop}
                  title="Stop generating"
                >
                  <Square size={13} fill="currentColor" strokeWidth={0} />
                </button>
              ) : (
                <button
                  type="button"
                  className={`composer-send-btn ${canSend ? "active" : ""}`}
                  onClick={handleSend}
                  disabled={!canSend}
                  title="Send message (Enter)"
                >
                  <ArrowUp size={18} strokeWidth={2.4} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
