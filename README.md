# 🤖 AI Coding Agent

An AI-powered coding assistant built with **FastAPI**, **LangGraph**, and **Ollama**. Features persistent conversation memory via PostgreSQL, RAG-based codebase understanding via pgvector, and a stateful graph-based agent architecture.

---

## ✨ Features

- **💬 Chat with AI** — Conversational coding assistant powered by `qwen2.5-coder:7b` via Ollama
- **🧠 Persistent Memory** — Conversation history & custom memories stored in PostgreSQL (survives restarts)
- **🧵 Thread Management** — Multiple independent conversations via `thread_id`
- **📚 RAG Pipeline** — Ingest your codebase into pgvector for context-aware code retrieval
- **⚡ FastAPI Backend** — High-performance async API with automatic docs

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                   FastAPI App                    │
│                                                  │
│  /chat ──► LangGraph ──► Ollama (qwen2.5-coder) │
│              │                                   │
│              ├── Checkpointer (PostgresSaver)     │
│              │     └── Saves conversation state   │
│              │                                   │
│              └── Store (PostgresStore)            │
│                    └── Saves custom memories      │
│                                                  │
│  /memory ──► PostgresStore (key-value memories)  │
│                                                  │
│  RAG Pipeline:                                   │
│    ingest.py ──► Text Splitter ──► pgvector      │
│    retriever.py ──► Similarity Search            │
└──────────────────────┬──────────────────────────┘
                       │
              ┌────────▼────────┐
              │  PostgreSQL 16  │
              │   (Docker)      │
              │                 │
              │  • Checkpoints  │
              │  • Memory Store │
              │  • pgvector     │
              └─────────────────┘
```

---

## 📁 Project Structure

```
coading-agent/
├── .env                    # Environment variables
├── README.md               # This file
├── backend/
│   ├── main.py             # FastAPI app + LangGraph agent
│   └── rag/
│       ├── vector_db.py    # pgvector database setup
│       ├── ingest.py       # Codebase ingestion script
│       └── retriever.py    # Similarity search retriever
├── frontend/               # Frontend (coming soon)
└── venv/                   # Python virtual environment
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.10+**
- **Docker** (for PostgreSQL)
- **Ollama** (for local LLM inference)

### 1. Clone & Setup Virtual Environment

```bash
git clone <your-repo-url>
cd coading-agent

python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install fastapi uvicorn langgraph langchain-ollama langchain-postgres psycopg[binary] python-dotenv langchain-text-splitters pgvector
```

### 2. Start PostgreSQL via Docker

```bash
docker run --name agent-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=MyNewPassword123 \
  -e POSTGRES_DB=postgres \
  -p 5433:5432 \
  -d postgres:16
```

> **Note:** The container maps port `5433` on your host to `5432` inside the container.

### 3. Pull Ollama Models

```bash
# Chat model
ollama pull qwen2.5-coder:7b

# Embedding model (for RAG)
ollama pull qwen3-embedding:4b
```

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://postgres:MyNewPassword123@localhost:5433/postgres
OLLAMA_MODEL=qwen2.5-coder:7b
```

### 5. Run the Server

```bash
uvicorn backend.main:app --reload
```

Server starts at: **http://localhost:8000**

---

## 📡 API Reference

### `GET /`

Health check / welcome endpoint.

**Response:**
```json
{
  "message": "Welcome to my AI Coding Agent"
}
```

---

### `POST /chat`

Send a message to the AI agent.

| Parameter   | Type   | Default     | Description                        |
|-------------|--------|-------------|------------------------------------|
| `message`   | string | *(required)* | Your message to the AI            |
| `thread_id` | string | `"default"` | Conversation thread identifier     |

**Example:**
```bash
curl -X POST "http://localhost:8000/chat?message=How do I write a Python decorator?&thread_id=session1"
```

**Response:**
```json
{
  "thread_id": "session1",
  "response": "A decorator in Python is a function that..."
}
```

---

### `GET /chat/history/{thread_id}`

Retrieve the full conversation history for a thread.

**Example:**
```bash
curl http://localhost:8000/chat/history/session1
```

---

### `POST /memory`

Save a custom key-value memory.

| Parameter | Type   | Description          |
|-----------|--------|----------------------|
| `key`     | string | Memory identifier    |
| `value`   | string | Memory content       |

**Example:**
```bash
curl -X POST "http://localhost:8000/memory?key=preference&value=I prefer dark mode"
```

---

### `GET /memory/{key}`

Retrieve a saved memory by key.

**Example:**
```bash
curl http://localhost:8000/memory/preference
```

**Response:**
```json
{
  "key": "preference",
  "value": { "value": "I prefer dark mode" }
}
```

---

## 📚 RAG Pipeline (Codebase Ingestion)

The RAG module lets the agent understand your codebase by ingesting code files into a vector database.

### How It Works

```
Your Code Files (.py, .js, .ts, .java, .cpp, .c)
        ↓
  RecursiveCharacterTextSplitter (chunk_size=1000)
        ↓
  OllamaEmbeddings (qwen3-embedding:4b)
        ↓
  PGVector (PostgreSQL + pgvector extension)
        ↓
  Similarity Search via retriever.py
```

### Ingest Your Codebase

```bash
cd backend/rag
python ingest.py
```

### Test Retrieval

```bash
cd backend/rag
python retriever.py
```

---

## 🧠 How Memory Works

### Conversation Memory (Checkpointer)

```
Checkpointer (PostgresSaver)
    ↓
PostgreSQL
    ↓
config → thread_id
    ↓
"Which conversation's state to save/retrieve?"
```

- Each `thread_id` maintains its own independent conversation history
- History is **persistent** — survives server restarts (unlike `InMemorySaver`)
- Powered by LangGraph's `PostgresSaver`

### Custom Memory (Store)

```
store.put(namespace, key, value)
```

| Concept     | Description                                           |
|-------------|-------------------------------------------------------|
| `namespace` | Categorizes the memory (e.g., `("user", "1")`)       |
| `key`       | Unique name for the memory                            |
| `value`     | The actual data to store                              |

---

## 🐳 Docker Quick Reference

```bash
# Start the database
docker run --name agent-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=MyNewPassword123 \
  -e POSTGRES_DB=postgres \
  -p 5433:5432 \
  -d postgres:16

# Check if container is running
docker ps

# Stop the database
docker stop agent-db

# Start it again
docker start agent-db

# View logs
docker logs agent-db
```

---

## 🛠️ Tech Stack

| Component       | Technology                          |
|-----------------|-------------------------------------|
| **Backend**     | FastAPI + Uvicorn                   |
| **Agent**       | LangGraph (StateGraph)              |
| **LLM**        | Ollama — `qwen2.5-coder:7b`        |
| **Embeddings**  | Ollama — `qwen3-embedding:4b`      |
| **Database**    | PostgreSQL 16 (Docker)              |
| **Vector Store**| pgvector via `langchain-postgres`   |
| **Checkpointer**| LangGraph `PostgresSaver`          |
| **Memory Store**| LangGraph `PostgresStore`          |

---
\



## 📝 License

This project is for learning and personal use.






Bilkul! Har ek table ko alag-alag (Table-wise) samjhiye ki us table ka kya naam hai, usme columns kya hain, aur uske andar kaisa data store ho raha hai:

📋 TABLE 1: store
Kiske liye hai? Direct Key-Value Long-Term Memory (Bina kisi embedding ya vector ke).

Module: langgraph.store.postgres.PostgresStore
Isme Chunks hote hain? ❌ Nahi.
Isme Vectors hote hain? ❌ Nahi.
Table Structure & Actual Data:
prefix (Namespace)	key	value (JSONB)
user.1	name	{"value": "akshay sharma"}
user.1	morning_food	{"value": "poha"}
user.1	evening_food	{"value": "momos"}
user.1	SPORTS	{"value": "CRICKET"}
user.1	COADING LANGUAGE	{"value": "PYTHON"}
Kaam: Jab Agent ko exact pata ho ki user ka naam ya food dekhna hai, toh ye bina AI model chalaaye $O(1)$ fast lookup karta hai.

📋 TABLE 2: langchain_pg_collection
Kiske liye hai? Vector Database ke andar categories/collections register karne ke liye.

Module: langchain_postgres.PGVector
Table Structure & Actual Data:
uuid (Primary Key)	name	cmetadata
7e203baf-fe0a-4a77-9f7f-7609c56dce41	user_memories	null
7e7eef10-4b22-4d26-aa91-2bb87274bb5c	codebase	null
Kaam: Ye registry table hai jo bataati hai ki vector table ke andar 2 alag-alag groups hain — ek User Memory ka group, doosra Codebase Files ka group.

📋 TABLE 3: langchain_pg_embedding
Kiske liye hai? Saari AI Embeddings / Vectors yahi aate hain (Dono User Memory aur Code Chunks).

Module: langchain_postgres.PGVector
Isme Chunks hote hain? ✅ Haan, codebase ke liye chunks bante hain.
Isme Vectors hote hain? ✅ Haan, 2560 float numbers ka array (qwen3-embedding:4b).
Table Structure & Actual Data:
id	collection_id (FK)	document (Text Content)	cmetadata (JSON)	embedding (2560-dim Vector)
1	7e203baf... (user_memories)	"morning_food: poha"	{"key": "morning_food", "user_id": "1"}	[0.014, -0.052, 0.089, ...]
2	7e203baf... (user_memories)	"SPORTS: CRICKET"	{"key": "SPORTS", "user_id": "1"}	[-0.021, 0.043, 0.011, ...]
3	7e203baf... (user_memories)	"name: akshay"	{"key": "name", "user_id": "1"}	[0.056, -0.012, 0.034, ...]
...	...	...	...	...
13	7e7eef10... (codebase)	"import cv2\nimport torch..."	{"file_path": "fight_detection_v5_fast (2).py"}	[-0.031, 0.104, -0.015, ...]
14	7e7eef10... (codebase)	"def detect_action(frame):..."	{"file_path": "fight_detection_v5_fast (2).py"}	[0.082, -0.012, 0.047, ...]
15	7e7eef10... (codebase)	"return generated if __name__..."	{"file_path": "TTS (1).PY"}	[-0.019, 0.063, 0.022, ...]
Kaam: Jab user query puchta hai, toh Cosine Distance calculate karke top matching memories ya code chunks laana.

📋 TABLE 4: checkpoints
Kiske liye hai? Short-Term Memory (Chat History & State).

Module: langgraph.checkpoint.postgres.PostgresSaver
Table Structure & Actual Data:
thread_id	checkpoint_ns	checkpoint_id	type	checkpoint (JSON/Binary State)
session_9tvl3a	""	1ef...	MyState	Current chat turns, tool status
session_oow1nt	""	1ef...	MyState	Purani chat session ka state
Kaam: Har thread (chat session) ki history ko save rakhna taaki page refresh ya restart ke baad bhi chat yaad rahe.

📋 TABLE 5: checkpoint_blobs
Kiske liye hai? checkpoints ke messages ka actual binary / serialized raw data.

Module: langgraph.checkpoint.postgres.PostgresSaver
Data: HumanMessages aur AIMessages ka pickled/serialized blob.
📋 TABLE 6: checkpoint_writes
Kiske liye hai? Ek single step ke dauran hone wale temporary writes (e.g., jab LLM tool call karta hai aur beech mein rukta hai).

Module: langgraph.checkpoint.postgres.PostgresSaver
💡 Ek Line Mein Summary:
Plain memory value dekhni ho $\rightarrow$ store table
Memory ya Code ka vector similarity search karna ho $\rightarrow$ langchain_pg_embedding table
Chat history yaad rakhni ho $\rightarrow$ checkpoints table
