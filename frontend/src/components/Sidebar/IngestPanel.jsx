import React, { useState } from "react";
import { FileUp, Upload, ChevronDown, ChevronRight, Check, AlertCircle, FileText } from "lucide-react";
import { ingestCodebaseFiles } from "../../services/api";

export default function IngestPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [status, setStatus] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
      setStatus(null);
    }
  };

  const handleIngest = async () => {
    if (selectedFiles.length === 0) {
      setStatus({ type: "error", message: "Please select files to ingest." });
      return;
    }

    setIsIngesting(true);
    setStatus(null);

    try {
      const res = await ingestCodebaseFiles(selectedFiles);
      setStatus({
        type: "success",
        message: `Indexed ${res.chunk_count || 0} chunk(s) into RAG Vector DB!`,
      });
      setSelectedFiles([]);
    } catch (err) {
      setStatus({ type: "error", message: "Error ingesting files to backend." });
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="collapsible-box">
      <div className="collapsible-header" onClick={() => setIsOpen(!isOpen)}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FileUp size={15} color="#00f2fe" />
          <span>Upload PDF & Codebase</span>
        </div>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>

      {isOpen && (
        <div className="collapsible-body">
          <input
            type="file"
            id="reactFileInput"
            multiple
            accept=".pdf,.txt,.py,.js,.ts,.html,.css,.json,.md,.cpp,.c,.java"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <label htmlFor="reactFileInput" className="file-picker-label">
            {selectedFiles.length > 0 ? (
              <>
                <FileText size={13} color="#00f2fe" />
                <span>{selectedFiles.length} file(s) selected</span>
              </>
            ) : (
              <>
                <Upload size={13} />
                <span>Choose PDF or code files</span>
              </>
            )}
          </label>

          {selectedFiles.length > 0 && (
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", wordBreak: "break-all" }}>
              {selectedFiles.map((f, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                  <span>{f.name.endsWith(".pdf") ? "📕" : "📄"}</span>
                  <span>{f.name} ({(f.size / 1024).toFixed(1)} KB)</span>
                </div>
              ))}
            </div>
          )}

          <button
            className="sidebar-action-btn"
            onClick={handleIngest}
            disabled={isIngesting || selectedFiles.length === 0}
          >
            {isIngesting ? "Indexing Chunks..." : "Index into RAG Vector DB"}
          </button>

          {status && (
            <div
              className="status-message"
              style={{
                color: status.type === "success" ? "#10b981" : "#f43f5e",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              {status.type === "success" ? <Check size={12} /> : <AlertCircle size={12} />}
              <span>{status.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
