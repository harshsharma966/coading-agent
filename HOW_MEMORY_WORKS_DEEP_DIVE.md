# 🧠 AI Coding Agent: How Memory Works (Deep Dive)

> **Complete Technical Guide**: Code Walkthrough, Flow Architecture, and Hinglish Explanations.

---

## 🏛️ 1. High-Level Memory Architecture

AI Coding Agent mein dimaag ki tarah **2 alag Memory Systems** kaam karte hain:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AI CODING AGENT SYSTEM                            │
├──────────────────────────────────────┬──────────────────────────────────────┤
│    1. SHORT-TERM MEMORY (STM)        │     2. LONG-TERM MEMORY (LTM)        │
│         [Chat History]               │   [Semantic Vector User Memory]      │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • Ek specific Conversation Thread    │ • Har Thread ke paar permanent data  │
│   ki chat history yaad rakhta hai    │   (Naam, Sports, Preferences, Rules) │
│ • PostgresSaver (Checkpointer)       │ • pgvector (user_memories collection)│
│ • Key: thread_id (jaise session_1)   │ • Key: user_id ("1") + Embeddings    │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 2. Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                USER / CLIENT LAYER                                      │
│                                                                                         │
│  [UI Chat Box] ──────► POST /chat/stream?message="What sport do I like?"                │
│  [Custom Memory Panel] ──► POST /memory?key=SPORTS&value=CRICKET                        │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                          FASTAPI & LANGGRAPH WORKFLOW                                   │
│                                                                                         │
│  1. Checkpointer (STM): Loads previous conversation messages for `thread_id`           │
│  2. Semantic Search (LTM): Embeds query & searches `pgvector` for matching memories     │
│  3. System Prompt Assembly: Injects ONLY relevant memories (e.g. `SPORTS: CRICKET`)     │
│  4. Chatbot Node: Invokes local LLM (qwen2.5-coder:7b)                                  │
│  5. Stream Clean Filter: Strips any raw tool JSON or <tool_response> tags               │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           POSTGRESQL 16 DATABASE (Docker)                               │
│                                                                                         │
│  • checkpoints table  ──► Conversation state, message history (STM)                     │
│  • user_memories      ──► pgvector embeddings (2560-dim vectors for LTM)                │
│  • store table        ──► Key-value persistent store (LangGraph BaseStore)              │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Short-Term Memory (STM) — Step-by-Step

### 📌 Core Concept:
Jab aap chat mein bolte ho *"Mera naam Rahul hai"* aur 2 minute baad puchte ho *"Mera naam kya hai?"*, yeh kaam **Short-Term Memory (STM)** ka hota hai.

### 💻 Code: `backend/db/connection.py`
```python
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool

pool = ConnectionPool(conninfo=DB_URI, max_size=20, kwargs={"autocommit": True})

# LangGraph Checkpointer - persists conversation turns per thread_id
checkpointer = PostgresSaver(pool)
checkpointer.setup()
```

### Kaise Kaam Karta Hai:
1. **Thread Isolation**: Har chat conversation ka ek unique `thread_id` hota hai (jaise `session_oow1nt`).
2. **State Serialization**: Har sawal aur AI ka answer PostgreSQL ke `checkpoints` table mein binary format mein save ho jata hai.
3. **Next Message Context**: Jab user agla message bhejta hai, LangGraph `thread_id` ke through purani saari messages list load karke LLM ko pass karta hai.
4. **Boundary (Limit)**: Jaise hi aap **"+ New Conversation"** dabate ho, naya `thread_id` banta hai — isliye purani chat ka data naye thread mein leak nahi hota.

---

## 4. Long-Term Memory (LTM) & Semantic Vector Search

### ⚠️ The Problem: "Prompt Bloat"
Agar hum database ki **saari 500 ya 1000 memories** ko har chat mein prompt ke andar daal denge:
- Prompt bohot bada (bloated) ho jayega.
- LLM tokens waste honge aur response slow aayega.
- Irrelevant memories (jaise food preferences) coding tasks ke waqt model ko confuse kar dengi.

### 💡 Solution: Semantic Memory Search via pgvector

#### A. Database Setup: `backend/rag/vector_db.py`
```python
from langchain_ollama import OllamaEmbeddings
from langchain_postgres import PGVector

# 2560-dimension embeddings via Ollama
embeddings = OllamaEmbeddings(model="qwen3-embedding:4b")

# pgvector collection specifically for User Memories
memory_vector_db = PGVector(
    embeddings=embeddings,
    collection_name="user_memories",
    connection=DB_URI,
    use_jsonb=True
)

def save_semantic_memory(key: str, value: str, user_id: str = "1"):
    from langchain_core.documents import Document
    doc = Document(
        page_content=f"{key}: {value}",
        metadata={"key": key, "user_id": user_id}
    )
    memory_vector_db.add_documents([doc])
```

#### B. Dynamic Retrieval in Chatbot Node: `backend/graph/nodes.py`
Jab user message bhejta hai, hum user query ka vector nikaal kar pgvector se **Cosine Distance** calculate karte hain:

```python
def chatbot(state: MyState):
    memory_context = ""
    try:
        from rag.vector_db import memory_vector_db
        from langchain_core.messages import HumanMessage

        # Latest user query nikaalo
        last_user_query = [m.content for m in reversed(state.messages) if isinstance(m, HumanMessage)][0]

        # Semantic Similarity Search in pgvector
        results = memory_vector_db.similarity_search_with_score(last_user_query, k=4)
        selected = []
        for doc, score in results:
            # Distance < 0.50 means strong semantic match
            if score < 0.50:
                selected.append(f"- {doc.page_content}")
                if len(selected) >= 2:
                    break

        if selected:
            memory_context = "\n\n[RELEVANT USER MEMORY (SEMANTIC VECTOR RETRIEVAL)]:\n" + "\n".join(selected)
    except Exception as e:
        print(f"Semantic memory search error: {e}")

    system_msg = SystemMessage(content=SYSTEM_PROMPT + memory_context)
    messages_with_context = [system_msg] + list(state.messages)

    response = llm_with_tools.invoke(messages_with_context)
    return {"messages": [response], "response": response.content}
```

### 🎯 Mathematical Filtering Example:

| User Query | Database Memory | Cosine Distance | Action |
| :--- | :--- | :---: | :--- |
| **"What sport do I like?"** | `SPORTS: CRICKET` | **0.4384** | ✅ **Injected into prompt!** |
| "What sport do I like?" | `evening_food: momos` | 0.8210 | ❌ Rejected (Irrelevant) |
| "What sport do I like?" | `COADING LANGUAGE: PYTHON` | 0.7950 | ❌ Rejected (Irrelevant) |
| **"How to write quicksort?"** | `SPORTS: CRICKET` | 0.6120 | ❌ Rejected (Prompt stays 100% clean) |

---

## 5. Clean Streaming Filter (Preventing Tool Leaks)

### ❓ Kyun leak ho raha tha `<tool_response>` ya JSON?
Local Ollama models (`qwen2.5-coder`) tool output padhne ke baad aadat se kabhi-kabhi internal tool tags screen par output kar dete the.

### 🛡️ Code: `backend/routers/chat.py`
```python
def clean_response_text(text: str) -> str:
    # 1. Strip <tool_response>...</tool_response>
    cleaned = re.sub(r'<tool_response>[\s\S]*?</tool_response>', '', text, flags=re.IGNORECASE).strip()
    # 2. Strip <tool_call>...</tool_call>
    cleaned = re.sub(r'<tool_call>[\s\S]*?</tool_call>', '', cleaned, flags=re.IGNORECASE).strip()
    # 3. Strip raw JSON markdown blocks
    cleaned = re.sub(r'```(?:json)?\s*\{[\s\S]*?\}\s*```', '', cleaned).strip()
    # 4. Strip inline JSON objects
    cleaned = re.sub(r'\{\s*"name"\s*:\s*"[^"]+".*?\}\s*\}?', '', cleaned).strip()
    return cleaned if cleaned else text
```

`stream_mode="updates"` use karke hum pehle tool ko backend mein complete execute karwaate hain, aur fir clean response token-by-token frontend ko bhejte hain.

---

## 6. STM vs LTM Comparison Matrix

| Dimension | Short-Term Memory (STM) | Long-Term Memory (LTM) |
| :--- | :--- | :--- |
| **Core Goal** | Current chat session ki continuous flow | Permanent user facts, habits & preferences |
| **Persistence Level** | Scoped to individual `thread_id` | Global across all threads for `user_id` |
| **Database Engine** | `PostgresSaver` (Table: `checkpoints`) | `PGVector` (Collection: `user_memories`) |
| **Retrieval Mechanism**| Chronological full state history | **Semantic Cosine Similarity Search (k=2)** |
| **Scaling Safety** | Trimmed via message window / summarizer | **Immune to bloat:** 1000+ memories mein se sirf 1-2 load hongi |
| **UI Touchpoint** | Left Sidebar: "Threads & History" | Left Sidebar: "Custom Memory" Collapsible Panel |

---

## 7. Files Summary

- [backend/db/connection.py](file:///c:/Users/Admin/Documents/coading%20agent/backend/db/connection.py): PostgreSQL Connection Pool aur `PostgresSaver` setup.
- [backend/rag/vector_db.py](file:///c:/Users/Admin/Documents/coading%20agent/backend/rag/vector_db.py): PGVector `user_memories` collection aur `save_semantic_memory()`.
- [backend/graph/nodes.py](file:///c:/Users/Admin/Documents/coading%20agent/backend/graph/nodes.py): `chatbot` node jo har user query par vector similarity search karke matching memory prompt mein daalta hai.
- [backend/graph/tools.py](file:///c:/Users/Admin/Documents/coading%20agent/backend/graph/tools.py): Tools: `save_memory`, `get_memory`, `list_memories`.
- [backend/routers/chat.py](file:///c:/Users/Admin/Documents/coading%20agent/backend/routers/chat.py): Clean streaming endpoint without internal tool leaks.
- [backend/routers/memory.py](file:///c:/Users/Admin/Documents/coading%20agent/backend/routers/memory.py): REST endpoints to save/read permanent user memories.
