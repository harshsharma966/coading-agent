import React, { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "./components/Sidebar/Sidebar";
import RightPanel from "./components/RightPanel/RightPanel";
import ChatHeader from "./components/Chat/ChatHeader";
import MessagesContainer from "./components/Chat/MessagesContainer";
import ChatInput from "./components/Chat/ChatInput";
import {
  checkBackendHealth,
  fetchSavedThreads,
  fetchThreadHistory,
  streamChatMessage,
  fetchAllMemories,
  generateChatTitle,
} from "./services/api";

export default function App() {
  const [activeThreadId, setActiveThreadId] = useState(() => {
    return localStorage.getItem("saarthi-active-thread") || "default";
  });
  const [threads, setThreads] = useState(["default"]);
  const [threadTitles, setThreadTitles] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("saarthi-thread-titles") || "{}");
    } catch {
      return {};
    }
  });

  // Sync active thread ID to localStorage
  useEffect(() => {
    if (activeThreadId) {
      localStorage.setItem("saarthi-active-thread", activeThreadId);
    }
  }, [activeThreadId]);
  // Per-thread state storage (ChatGPT style)
  const [threadMessages, setThreadMessages] = useState({});
  const [streamingContentByThread, setStreamingContentByThread] = useState({});
  const [isStreamingByThread, setIsStreamingByThread] = useState({});
  const [thoughtsByThread, setThoughtsByThread] = useState({});
  const [approvalByThread, setApprovalByThread] = useState({});
  const abortControllersRef = useRef({});

  // Active thread projections for child components
  const messages = threadMessages[activeThreadId] || [];
  const isStreaming = Boolean(isStreamingByThread[activeThreadId]);
  const streamingContent = streamingContentByThread[activeThreadId] || "";
  const activeThoughts = thoughtsByThread[activeThreadId] || [];
  const activeApproval = approvalByThread[activeThreadId] || null;

  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [savedMemories, setSavedMemories] = useState([]);
  const [userName, setUserName] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("saarthi-theme") || "light");

  // Save thread titles to localStorage
  const updateThreadTitle = useCallback((tid, title) => {
    setThreadTitles((prev) => {
      const updated = { ...prev, [tid]: title };
      try {
        localStorage.setItem("saarthi-thread-titles", JSON.stringify(updated));
      } catch (e) {
        console.warn("Could not save thread title:", e);
      }
      return updated;
    });
  }, []);

  // Sync theme attribute to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("saarthi-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  // Poll backend health
  const checkHealth = useCallback(async () => {
    const alive = await checkBackendHealth();
    setIsConnected(alive);
  }, []);

  // Load memories and extract user name
  const loadMemories = useCallback(async () => {
    try {
      const data = await fetchAllMemories();
      if (data && data.memories) {
        setSavedMemories(data.memories);
        const nameEntry = data.memories.find(
          (m) => m.key.toLowerCase() === "name" || m.key.toLowerCase() === "user_name"
        );
        if (nameEntry) setUserName(String(nameEntry.value));
      }
    } catch (err) {
      console.warn("Failed to load memories:", err);
    }
  }, []);

  // Load threads on mount
  useEffect(() => {
    checkHealth();
    loadMemories();
    const interval = setInterval(checkHealth, 10000);
    const memInterval = setInterval(loadMemories, 15000);

    const initThreads = async () => {
      const saved = await fetchSavedThreads();
      if (saved && saved.length > 0) {
        setThreads(saved);
        const storedActive = localStorage.getItem("saarthi-active-thread");
        if (storedActive && saved.includes(storedActive)) {
          setActiveThreadId(storedActive);
        } else {
          setActiveThreadId(saved[0]);
        }

        // Auto-assign titles to any old threads missing one
        try {
          const currentTitles = JSON.parse(localStorage.getItem("saarthi-thread-titles") || "{}");
          for (const tid of saved) {
            if (!currentTitles[tid] || currentTitles[tid].startsWith("session_")) {
              fetchThreadHistory(tid).then((history) => {
                if (history && history.length > 0) {
                  const firstUser = history.find((m) => m.type === "human");
                  if (firstUser && firstUser.content) {
                    const words = firstUser.content.replace(/\n/g, " ").trim().split(/\s+/).slice(0, 4).join(" ");
                    const clean = words ? words.charAt(0).toUpperCase() + words.slice(1) : "Conversation";
                    updateThreadTitle(tid, clean);
                  }
                }
              });
            }
          }
        } catch {
          // ignore parsing error
        }
      }
    };
    initThreads();

    return () => {
      clearInterval(interval);
      clearInterval(memInterval);
    };
  }, [checkHealth, loadMemories, updateThreadTitle]);

  const threadMessagesRef = useRef(threadMessages);
  const thoughtsRef = useRef(thoughtsByThread);
  useEffect(() => {
    threadMessagesRef.current = threadMessages;
  }, [threadMessages]);
  useEffect(() => {
    thoughtsRef.current = thoughtsByThread;
  }, [thoughtsByThread]);

  // Load history whenever activeThreadId changes (if not already loaded in memory)
  useEffect(() => {
    const loadHistory = async () => {
      // If thread already has active messages in memory, don't wipe it
      if (threadMessagesRef.current[activeThreadId]?.length > 0) {
        return;
      }

      const history = await fetchThreadHistory(activeThreadId);
      if (history && history.length > 0) {
        const formatted = history.map((msg, i) => ({
          id: `hist_${activeThreadId}_${i}`,
          sender: msg.type === "human" ? "user" : "assistant",
          content: msg.content,
        }));
        setThreadMessages((prev) => {
          if (prev[activeThreadId]?.length > 0) return prev;
          return {
            ...prev,
            [activeThreadId]: formatted,
          };
        });
      }
    };

    loadHistory();
  }, [activeThreadId]);

  // Stop generating for active thread only
  const handleStopGenerating = useCallback(() => {
    const currentTid = activeThreadId;
    if (abortControllersRef.current[currentTid]) {
      abortControllersRef.current[currentTid].abort();
      delete abortControllersRef.current[currentTid];
    }
    setIsStreamingByThread((prev) => ({ ...prev, [currentTid]: false }));

    // Commit any partial content received so far
    setStreamingContentByThread((prevStreams) => {
      const partial = prevStreams[currentTid];
      if (partial && partial.trim()) {
        setThreadMessages((prev) => ({
          ...prev,
          [currentTid]: [
            ...(prev[currentTid] || []),
            {
              id: `ai_${Date.now()}`,
              sender: "assistant",
              content: partial,
            },
          ],
        }));
      }
      return { ...prevStreams, [currentTid]: "" };
    });
  }, [activeThreadId]);

  // Handle switching threads - completely non-blocking and NON-DESTRUCTIVE!
  const handleSelectThread = (threadId) => {
    if (threadId === activeThreadId) return;
    // We do NOT abort! Background streams continue working!
    setActiveThreadId(threadId);
  };

  // Start new conversation thread - non-destructive!
  const handleNewChat = () => {
    const newThreadId = "session_" + Math.random().toString(36).substring(2, 8);
    setThreads((prev) => (prev.includes(newThreadId) ? prev : [newThreadId, ...prev]));
    setActiveThreadId(newThreadId);
    updateThreadTitle(newThreadId, "New Chat");
  };

  // Handle sending a message
  const handleSend = async (customPrompt) => {
    const textToSend = (customPrompt || input).trim();
    const currentTid = activeThreadId;
    if (!textToSend || isStreamingByThread[currentTid]) return;

    // Ensure thread is in list
    setThreads((prev) => (prev.includes(currentTid) ? prev : [currentTid, ...prev]));

    // Generate ChatGPT-style title if thread has no custom title or is "New Chat"
    const currentTitle = threadTitles[currentTid];
    if (!currentTitle || currentTitle === "New Chat" || currentTitle.startsWith("session_") || currentTitle === "default") {
      // 1. Instant fallback title
      const words = textToSend.replace(/\n/g, " ").trim().split(/\s+/).slice(0, 4).join(" ");
      const quickTitle = words ? words.charAt(0).toUpperCase() + words.slice(1) : "New Chat";
      updateThreadTitle(currentTid, quickTitle);

      // 2. Asynchronously call backend AI to get refined 3-word title
      generateChatTitle(textToSend).then((smartTitle) => {
        if (smartTitle) {
          updateThreadTitle(currentTid, smartTitle);
        }
      });
    }

    // Append user message immediately to this specific thread
    const userMsg = {
      id: `user_${Date.now()}`,
      sender: "user",
      content: textToSend,
    };
    setThreadMessages((prev) => ({
      ...prev,
      [currentTid]: [...(prev[currentTid] || []), userMsg],
    }));

    setInput("");
    setIsStreamingByThread((prev) => ({ ...prev, [currentTid]: true }));
    setStreamingContentByThread((prev) => ({ ...prev, [currentTid]: "" }));
    setThoughtsByThread((prev) => ({ ...prev, [currentTid]: [] }));

    const controller = new AbortController();
    abortControllersRef.current[currentTid] = controller;

    await streamChatMessage(
      textToSend,
      currentTid,
      (chunk) => {
        // Stream chunk strictly into this thread's streaming buffer
        setStreamingContentByThread((prev) => ({ ...prev, [currentTid]: chunk }));
      },
      (finalText) => {
        setIsStreamingByThread((prev) => ({ ...prev, [currentTid]: false }));
        delete abortControllersRef.current[currentTid];

        const finalThoughts = thoughtsRef.current[currentTid] || [];
        const textToSave = finalText || "No response received.";

        setThreadMessages((prev) => {
          const list = prev[currentTid] || [];
          const last = list[list.length - 1];
          // Prevent duplicate messages if already appended
          if (last && last.sender === "assistant" && last.content === textToSave) {
            return prev;
          }
          return {
            ...prev,
            [currentTid]: [
              ...list,
              {
                id: `ai_${Date.now()}`,
                sender: "assistant",
                content: textToSave,
                thoughts: finalThoughts,
              },
            ],
          };
        });

        setThoughtsByThread((prev) => ({ ...prev, [currentTid]: [] }));
        setStreamingContentByThread((prev) => ({ ...prev, [currentTid]: "" }));
        checkHealth();
        // Reload memories after response (auto-memory may have saved new facts)
        setTimeout(() => loadMemories(), 3000);
      },
      (err) => {
        setIsStreamingByThread((prev) => ({ ...prev, [currentTid]: false }));
        delete abortControllersRef.current[currentTid];
        setThreadMessages((prev) => ({
          ...prev,
          [currentTid]: [
            ...(prev[currentTid] || []),
            {
              id: `err_${Date.now()}`,
              sender: "assistant",
              content: "⚠️ Failed to communicate with backend. Please make sure FastAPI and Ollama are running.",
            },
          ],
        }));
        setStreamingContentByThread((prev) => ({ ...prev, [currentTid]: "" }));
        setThoughtsByThread((prev) => ({ ...prev, [currentTid]: [] }));
        checkHealth();
      },
      controller.signal,
      (thought) => {
        setThoughtsByThread((prev) => {
          const list = prev[currentTid] || [];
          const idx = list.findIndex((t) => t.id === thought.id);
          if (idx !== -1) {
            const updated = [...list];
            updated[idx] = { ...updated[idx], ...thought };
            return { ...prev, [currentTid]: updated };
          } else {
            return { ...prev, [currentTid]: [...list, thought] };
          }
        });
      },
      (approvalData) => {
        // 🛑 Agent requested user permission for sensitive action (write_file or run_terminal_command)
        setIsStreamingByThread((prev) => ({ ...prev, [currentTid]: false }));
        delete abortControllersRef.current[currentTid];
        setApprovalByThread((prev) => ({ ...prev, [currentTid]: approvalData }));
      }
    );
  };

  // Handle user decision on sensitive tool execution (write_file / run_terminal_command)
  const handleApprovalDecision = async (decision) => {
    const currentTid = activeThreadId;
    const approvalData = approvalByThread[currentTid];
    if (!approvalData) return;

    // Clear approval card and set streaming status
    setApprovalByThread((prev) => ({ ...prev, [currentTid]: null }));
    setIsStreamingByThread((prev) => ({ ...prev, [currentTid]: true }));
    setStreamingContentByThread((prev) => ({ ...prev, [currentTid]: "" }));

    const controller = new AbortController();
    abortControllersRef.current[currentTid] = controller;

    await streamChatMessage(
      null, // Resuming paused graph execution
      currentTid,
      (chunk) => {
        setStreamingContentByThread((prev) => ({ ...prev, [currentTid]: chunk }));
      },
      (finalText) => {
        setIsStreamingByThread((prev) => ({ ...prev, [currentTid]: false }));
        delete abortControllersRef.current[currentTid];

        const finalThoughts = thoughtsRef.current[currentTid] || [];
        const fallbackText = decision.approved
          ? "Action was approved and completed."
          : "Action was rejected by user.";
        const textToSave = finalText || fallbackText;

        setThreadMessages((prev) => {
          const list = prev[currentTid] || [];
          const last = list[list.length - 1];
          if (last && last.sender === "assistant" && last.content === textToSave) {
            return prev;
          }
          return {
            ...prev,
            [currentTid]: [
              ...list,
              {
                id: `ai_${Date.now()}`,
                sender: "assistant",
                content: textToSave,
                thoughts: finalThoughts,
              },
            ],
          };
        });

        setThoughtsByThread((prev) => ({ ...prev, [currentTid]: [] }));
        setStreamingContentByThread((prev) => ({ ...prev, [currentTid]: "" }));
        checkHealth();
        setTimeout(() => loadMemories(), 3000);
      },
      (err) => {
        setIsStreamingByThread((prev) => ({ ...prev, [currentTid]: false }));
        delete abortControllersRef.current[currentTid];
        setThreadMessages((prev) => ({
          ...prev,
          [currentTid]: [
            ...(prev[currentTid] || []),
            {
              id: `err_${Date.now()}`,
              sender: "assistant",
              content: "⚠️ Failed to resume action with backend.",
            },
          ],
        }));
        setStreamingContentByThread((prev) => ({ ...prev, [currentTid]: "" }));
        setThoughtsByThread((prev) => ({ ...prev, [currentTid]: [] }));
        checkHealth();
      },
      controller.signal,
      (thought) => {
        setThoughtsByThread((prev) => {
          const list = prev[currentTid] || [];
          const idx = list.findIndex((t) => t.id === thought.id);
          if (idx !== -1) {
            const updated = [...list];
            updated[idx] = { ...updated[idx], ...thought };
            return { ...prev, [currentTid]: updated };
          } else {
            return { ...prev, [currentTid]: [...list, thought] };
          }
        });
      },
      (nextApprovalData) => {
        // Handle chained approval requests if any
        setIsStreamingByThread((prev) => ({ ...prev, [currentTid]: false }));
        delete abortControllersRef.current[currentTid];
        setApprovalByThread((prev) => ({ ...prev, [currentTid]: nextApprovalData }));
      },
      decision
    );
  };

  const [filePickerTrigger, setFilePickerTrigger] = useState(0);

  // Quick prompt helper actions
  const handleSelectPrompt = (actionId) => {
    if (actionId === "pdf") {
      setFilePickerTrigger((prev) => prev + 1);
      setInput("Please analyze this document and summarize its key findings.");
    } else if (actionId === "explain") {
      setInput("Explain how this code works:\n\n```python\n# Paste your code here\n\n```");
    } else if (actionId === "search") {
      setInput("Search codebase for: ");
    } else {
      setInput(actionId);
    }
  };

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="app-layout">
      <Sidebar
        threads={threads}
        threadTitles={threadTitles}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        isConnected={isConnected}
        savedMemories={savedMemories}
        onMemoriesChanged={loadMemories}
      />

      <main className="main-container">
        <ChatHeader
          activeThreadId={activeThreadId}
          threadTitle={threadTitles[activeThreadId]}
          isConnected={isConnected}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <MessagesContainer
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          activeThoughts={activeThoughts}
          activeApproval={activeApproval}
          onApprovalDecision={handleApprovalDecision}
          onSelectPrompt={handleSelectPrompt}
          userName={userName}
          greeting={getGreeting()}
        />

        <ChatInput
          input={input}
          setInput={setInput}
          onSend={() => handleSend()}
          onStop={handleStopGenerating}
          isStreaming={isStreaming}
          filePickerTrigger={filePickerTrigger}
        />
      </main>

      <RightPanel isConnected={isConnected} />
    </div>
  );
}
