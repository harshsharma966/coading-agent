import React, { useState, useRef } from "react";
import {
  FolderOpen,
  Search,
  Terminal,
  FileText,
  Brain,
  Gauge,
  ChevronRight,
  Upload,
  Loader2,
  CheckCircle2,
  X,
} from "lucide-react";
import { ingestCodebaseFiles, searchRAG, fetchAllMemories } from "../../services/api";

export default function RightPanel({ isConnected }) {
  const [activePanel, setActivePanel] = useState(null); // which tool panel is open
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState([]);
  const [ragLoading, setRagLoading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [memories, setMemories] = useState([]);
  const [memLoading, setMemLoading] = useState(false);
  const fileInputRef = useRef(null);

  const tools = [
    {
      id: "open_file",
      icon: <FolderOpen size={18} />,
      title: "Open File",
      desc: "Read and analyze files",
      color: "#f97316",
    },
    {
      id: "search",
      icon: <Search size={18} />,
      title: "Search Codebase",
      desc: "Find code and documentation",
      color: "#3b82f6",
    },
    {
      id: "execute",
      icon: <Terminal size={18} />,
      title: "Execute Code",
      desc: "Run Python code safely",
      color: "#10b981",
    },
    {
      id: "rag",
      icon: <FileText size={18} />,
      title: "RAG / PDF",
      desc: "Upload & search documents",
      color: "#8b5cf6",
    },
    {
      id: "memory",
      icon: <Brain size={18} />,
      title: "LTM Memory",
      desc: "Long-term memory storage",
      color: "#06b6d4",
    },
  ];

  // ── RAG Search Handler ──
  const handleRagSearch = async () => {
    if (!ragQuery.trim()) return;
    setRagLoading(true);
    setRagResults([]);
    try {
      const data = await searchRAG(ragQuery, 3);
      setRagResults(data.results || []);
    } catch (err) {
      console.error("RAG search error:", err);
    } finally {
      setRagLoading(false);
    }
  };

  // ── File Upload Handler ──
  const handleFileUpload = async () => {
    if (uploadFiles.length === 0) return;
    setIsUploading(true);
    setUploadStatus(null);
    try {
      const res = await ingestCodebaseFiles(uploadFiles);
      setUploadStatus({ type: "success", msg: `Indexed ${res.chunk_count || 0} chunks!` });
      setUploadFiles([]);
    } catch (err) {
      setUploadStatus({ type: "error", msg: "Upload failed" });
    } finally {
      setIsUploading(false);
    }
  };

  // ── Load Memories ──
  const handleLoadMemories = async () => {
    setMemLoading(true);
    try {
      const data = await fetchAllMemories();
      setMemories(data.memories || []);
    } catch (err) {
      console.error(err);
    } finally {
      setMemLoading(false);
    }
  };

  const togglePanel = (id) => {
    if (activePanel === id) {
      setActivePanel(null);
    } else {
      setActivePanel(id);
      if (id === "memory") handleLoadMemories();
    }
  };

  return (
    <aside className="right-panel">
      {/* Tools Section */}
      <div className="rp-section">
        <div className="rp-section-title">Tools</div>
        <div className="rp-tools-list">
          {tools.map((tool) => (
            <div key={tool.id}>
              <button
                className={`rp-tool-btn ${activePanel === tool.id ? "active" : ""}`}
                onClick={() => togglePanel(tool.id)}
              >
                <div className="rp-tool-icon" style={{ color: tool.color, background: `${tool.color}18` }}>
                  {tool.icon}
                </div>
                <div className="rp-tool-info">
                  <div className="rp-tool-name">{tool.title}</div>
                  <div className="rp-tool-desc">{tool.desc}</div>
                </div>
                <ChevronRight
                  size={14}
                  className={`rp-tool-arrow ${activePanel === tool.id ? "rotated" : ""}`}
                />
              </button>

              {/* ── RAG Panel ── */}
              {activePanel === "rag" && tool.id === "rag" && (
                <div className="rp-expand-panel">
                  {/* Upload Section */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    multiple
                    accept=".pdf,.txt,.py,.js,.ts,.html,.css,.json,.md,.cpp,.c,.java"
                    onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                  />
                  <button className="rp-mini-btn upload" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={13} />
                    <span>{uploadFiles.length > 0 ? `${uploadFiles.length} file(s)` : "Upload Files"}</span>
                  </button>
                  {uploadFiles.length > 0 && (
                    <button
                      className="rp-mini-btn action"
                      onClick={handleFileUpload}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 size={12} className="spinner" /> : <CheckCircle2 size={12} />}
                      <span>{isUploading ? "Indexing..." : "Index to RAG"}</span>
                    </button>
                  )}
                  {uploadStatus && (
                    <div className={`rp-status ${uploadStatus.type}`}>{uploadStatus.msg}</div>
                  )}

                  {/* Search Section */}
                  <div className="rp-search-box">
                    <input
                      type="text"
                      placeholder="Search documents..."
                      value={ragQuery}
                      onChange={(e) => setRagQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRagSearch()}
                    />
                    <button onClick={handleRagSearch} disabled={ragLoading}>
                      {ragLoading ? <Loader2 size={13} className="spinner" /> : <Search size={13} />}
                    </button>
                  </div>
                  {ragResults.length > 0 && (
                    <div className="rp-results">
                      {ragResults.map((r, i) => (
                        <div key={i} className="rp-result-item">
                          <div className="rp-result-file">{r.metadata?.file_path || "document"}</div>
                          <div className="rp-result-text">{r.content?.substring(0, 100)}...</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Memory Panel ── */}
              {activePanel === "memory" && tool.id === "memory" && (
                <div className="rp-expand-panel">
                  {memLoading ? (
                    <div className="rp-loading"><Loader2 size={14} className="spinner" /> Loading...</div>
                  ) : memories.length === 0 ? (
                    <div className="rp-empty">No memories saved yet</div>
                  ) : (
                    <div className="rp-mem-list">
                      {memories.map((m, i) => (
                        <div key={i} className="rp-mem-item">
                          <span className="rp-mem-key">{m.key}:</span> {String(m.value)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Info panels for other tools ── */}
              {activePanel === "open_file" && tool.id === "open_file" && (
                <div className="rp-expand-panel">
                  <div className="rp-info-text">Ask the AI to read any file by path — it will use the <strong>read_file</strong> tool automatically.</div>
                </div>
              )}
              {activePanel === "search" && tool.id === "search" && (
                <div className="rp-expand-panel">
                  <div className="rp-info-text">Ask the AI to search your codebase — it uses <strong>search_codebase</strong> with pgvector RAG.</div>
                </div>
              )}
              {activePanel === "execute" && tool.id === "execute" && (
                <div className="rp-expand-panel">
                  <div className="rp-info-text">Ask the AI to run Python code — it uses <strong>execute_python_code</strong> in a sandboxed environment.</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Info — only status */}
      <div className="rp-section">
        <div className="rp-section-title">Status</div>
        <div className="rp-status-card">
          <Gauge size={15} />
          <span>Backend</span>
          <div className={`rp-status-indicator ${isConnected ? "online" : "offline"}`}>
            <span className="rp-status-dot"></span>
            {isConnected ? "Online" : "Offline"}
          </div>
        </div>
      </div>
    </aside>
  );
}
