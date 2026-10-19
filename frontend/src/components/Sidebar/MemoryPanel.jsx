import React, { useState, useEffect } from "react";
import { Brain, ChevronDown, ChevronRight, Check, AlertCircle, Trash2 } from "lucide-react";
import { saveCustomMemory, fetchAllMemories, deleteMemory } from "../../services/api";

export default function MemoryPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: string }
  const [savedMemories, setSavedMemories] = useState([]);

  // Load existing memories from database
  const loadMemories = async () => {
    try {
      const data = await fetchAllMemories();
      if (data && data.memories) {
        setSavedMemories(data.memories);
      }
    } catch (err) {
      console.warn("Failed to load memories:", err);
    }
  };

  useEffect(() => {
    loadMemories();
  }, []);

  const handleSave = async () => {
    if (!key.trim() || !value.trim()) {
      setStatus({ type: "error", message: "Please provide both key and value." });
      return;
    }

    setIsSaving(true);
    setStatus(null);

    try {
      await saveCustomMemory(key.trim(), value.trim());
      setStatus({ type: "success", message: `Saved: ${key}` });
      setKey("");
      setValue("");
      loadMemories();
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ type: "error", message: "Failed to save memory to backend." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (memKey) => {
    try {
      await deleteMemory(memKey);
      loadMemories();
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  return (
    <div className="collapsible-box">
      <div className="collapsible-header" onClick={() => setIsOpen(!isOpen)}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Brain size={15} color="#818cf8" />
          <span>Long-Term Memory (LTM)</span>
          {savedMemories.length > 0 && (
            <span style={{ fontSize: "11px", color: "var(--accent-purple)", background: "rgba(129, 140, 248, 0.15)", padding: "1px 6px", borderRadius: "10px" }}>
              {savedMemories.length}
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>

      {isOpen && (
        <div className="collapsible-body">
          <input
            type="text"
            className="sidebar-input"
            placeholder="Key (e.g. favorite_food, user_name)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <input
            type="text"
            className="sidebar-input"
            placeholder="Value (e.g. Biryani, Akshay)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            className="sidebar-action-btn"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving to Store..." : "+ Add Memory to LTM"}
          </button>

          {status && (
            <div
              className="status-message"
              style={{
                color: status.type === "success" ? "#10b981" : "#f43f5e",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11.5px",
              }}
            >
              {status.type === "success" ? <Check size={12} /> : <AlertCircle size={12} />}
              <span>{status.message}</span>
            </div>
          )}

          {/* List of saved memories */}
          <div style={{ 
            marginTop: "12px", 
            paddingTop: "10px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex", 
            flexDirection: "column", 
            gap: "8px" 
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--accent-cyan)", fontWeight: 700 }}>
                Stored Facts ({savedMemories.length})
              </span>
              {savedMemories.length > 0 && (
                <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>Click 🗑️ to delete</span>
              )}
            </div>

            {savedMemories.length === 0 ? (
              <div style={{ fontSize: "11.5px", color: "var(--text-dim)", padding: "6px 0", fontStyle: "italic" }}>
                No facts saved yet. Add one above!
              </div>
            ) : (
              <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                gap: "6px", 
                maxHeight: "220px", 
                overflowY: "auto", 
                paddingRight: "4px" 
              }}>
                {savedMemories.map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "rgba(255, 255, 255, 0.05)",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                    }}
                  >
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "8px" }}>
                      <strong style={{ color: "var(--accent-purple)" }}>{m.key}:</strong>{" "}
                      <span style={{ color: "#ffffff" }}>{String(m.value)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(m.key)}
                      style={{ 
                        background: "rgba(244, 63, 94, 0.15)", 
                        border: "1px solid rgba(244, 63, 94, 0.3)", 
                        color: "#fb7185", 
                        cursor: "pointer", 
                        display: "flex", 
                        alignItems: "center",
                        padding: "4px 6px",
                        borderRadius: "4px",
                        flexShrink: 0
                      }}
                      title={`Delete ${m.key}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

