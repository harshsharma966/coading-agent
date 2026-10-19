const API_BASE_URL = "http://127.0.0.1:8000";

/**
 * Check backend health status
 */
export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/`, { method: "GET" });
    return res.ok;
  } catch (err) {
    return false;
  }
}

/**
 * Fetch all saved conversation threads from PostgreSQL checkpointer
 */
export async function fetchSavedThreads() {
  try {
    const res = await fetch(`${API_BASE_URL}/chat/threads`);
    if (res.ok) {
      const data = await res.json();
      return data.threads || ["default"];
    }
  } catch (err) {
    console.warn("Could not fetch saved threads:", err);
  }
  return ["default"];
}

/**
 * Fetch chat history for a specific thread
 */
export async function fetchThreadHistory(threadId) {
  try {
    const res = await fetch(`${API_BASE_URL}/chat/history/${encodeURIComponent(threadId)}`);
    if (res.ok) {
      const data = await res.json();
      return data?.[0]?.messages || [];
    }
  } catch (err) {
    console.warn("Could not fetch thread history:", err);
  }
  return [];
}

/**
 * Stream chat response token-by-token via Server-Sent Events (SSE)
 */
export async function streamChatMessage(
  message, 
  threadId, 
  onChunk, 
  onDone, 
  onError, 
  signal, 
  onThought,
  onApprovalRequired,
  resumeDecision = null
) {
  try {
    let url = `${API_BASE_URL}/chat/stream?thread_id=${encodeURIComponent(threadId)}`;
    
    if (resumeDecision) {
      url += `&resume_approved=${encodeURIComponent(resumeDecision.approved)}`;
      if (resumeDecision.feedback) {
        url += `&resume_feedback=${encodeURIComponent(resumeDecision.feedback)}`;
      }
    } else if (message) {
      url += `&message=${encodeURIComponent(message)}`;
    }

    const response = await fetch(url, { method: "POST", signal });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.replace("data: ", ""));
            
            // 🛑 Human approval required event
            if (data.type === "approval_required" && onApprovalRequired) {
              onApprovalRequired(data.data);
              return; // Pause processing until user acts
            }

            if (data.type === "thought" && onThought) {
              onThought(data);
            } else if (data.content) {
              accumulated += data.content;
              onChunk(accumulated);
            }
          } catch {
            // Ignore incomplete JSON chunks
          }
        }
      }
    }

    onDone(accumulated);
  } catch (err) {
    if (err.name === "AbortError") {
      console.log("Chat stream aborted by user.");
      return;
    }
    console.error("Stream error:", err);
    onError(err);
  }
}

/**
 * Save custom memory into PostgreSQL Store + pgvector
 */
export async function saveCustomMemory(key, value) {
  const url = `${API_BASE_URL}/memory?key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    throw new Error("Failed to save memory");
  }
  return res.json();
}

/**
 * Ingest files into pgvector vector DB
 */
export async function ingestCodebaseFiles(fileList) {
  const formData = new FormData();
  for (let i = 0; i < fileList.length; i++) {
    formData.append("files", fileList[i]);
  }

  const res = await fetch(`${API_BASE_URL}/ingest/files`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error("Ingestion request failed");
  }
  return res.json();
}


/**
 * Search the RAG codebase vector DB with a query
 */
export async function searchRAG(query, k = 5) {
  try {
    const url = `${API_BASE_URL}/rag/search?query=${encodeURIComponent(query)}&k=${k}`;
    const res = await fetch(url, { method: "POST" });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("RAG search error:", err);
  }
  return { query, results: [], count: 0 };
}


/**
 * Fetch RAG vector DB stats (total chunks indexed)
 */
export async function fetchRAGStats() {
  try {
    const res = await fetch(`${API_BASE_URL}/rag/stats`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("RAG stats error:", err);
  }
  return { collection: "codebase", total_chunks: 0 };
}


/**
 * Fetch all saved long-term memories
 */
export async function fetchAllMemories() {
  try {
    const res = await fetch(`${API_BASE_URL}/memory/list`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Fetch memories error:", err);
  }
  return { memories: [], count: 0 };
}


/**
 * Delete a specific memory by key
 */
export async function deleteMemory(key) {
  const res = await fetch(`${API_BASE_URL}/memory/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error("Failed to delete memory");
  }
  return res.json();
}

/**
 * Generate a smart ChatGPT-style title for a chat thread
 */
export async function generateChatTitle(message) {
  try {
    const res = await fetch(`${API_BASE_URL}/chat/title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.title;
    }
  } catch (err) {
    console.warn("Title generation error:", err);
  }
  // Client-side quick fallback
  const words = message.replace(/\n/g, " ").trim().split(/\s+/).slice(0, 4).join(" ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "New Chat";
}

