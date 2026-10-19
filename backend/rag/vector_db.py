from langchain_ollama import OllamaEmbeddings
from langchain_postgres import PGVector
import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)
DB_URI = os.getenv("DATABASE_URL").replace("postgresql://", "postgresql+psycopg://", 1)

# Embedding model
embeddings = OllamaEmbeddings(
    model="qwen3-embedding:4b"
)


# PostgreSQL + pgvector (Codebase RAG)
vector_db = PGVector(
    embeddings=embeddings,
    collection_name="codebase",
    connection=DB_URI,
    use_jsonb=True
)

# PostgreSQL + pgvector (Semantic LTM Memory)
memory_vector_db = PGVector(
    embeddings=embeddings,
    collection_name="user_memories",
    connection=DB_URI,
    use_jsonb=True
)


def save_semantic_memory(key: str, value: str, user_id: str = "1"):
    """
    Save or update a memory in pgvector so it can be semantically retrieved.
    """
    from langchain_core.documents import Document
    try:
        doc = Document(
            page_content=f"{key}: {value}",
            metadata={"key": key, "user_id": user_id}
        )
        memory_vector_db.add_documents([doc])
    except Exception as e:
        print(f"Error saving to semantic memory vector store: {e}")

















#         Step-by-Step Breakdown (Upar se Neeche tak):
# text
# 1. DATABASE KA NAAM:       postgres (Aapka PostgreSQL database)
#       │
#       ▼
# 2. VECTOR TABLES:          Sirf 2 Tables hain:
#                            ├── A. langchain_pg_collection  (Folder List)
#                            └── B. langchain_pg_embedding   (Actual Vectors)
#       │
#       ▼
# 3. COLLECTION KYA HAI?     Yeh Table nahi hai, yeh bas "FOLDER KA NAAM" hai!
#                            ├── Folder 1: "codebase"      (RAG ke liye)
#                            └── Folder 2: "user_memories" (LTM ke liye)
# Ab Dono Tables ko bilkul aasan bhasha mein dekhiye:
# Pehli Table: langchain_pg_collection (Iska kaam sirf Folders ke naam rakhna hai)
# Is table mein sirf 2 columns hain:

# name (Column): Folder ka naam ("codebase" ya "user_memories")
# uuid (Column): Us folder ka Roll Number (ID-1, ID-2)
# Is table ke andar bas yeh 2 rows hain:

# name (Column)	uuid (Column)
# codebase	7e7eef10...
# user_memories	7e203baf...
# Doosri Table: langchain_pg_embedding (Asli Data aur Vectors yahan hain)
# Aapka sara code, PDF, aur user memories is EK HI TABLE mein aate hain.

# Is table ke 3 main columns dekhiye:

# collection_id (Column): Yeh batata hai ki yeh row kis folder ki hai (ID-1 ki ya ID-2 ki).
# document (Column): Asli text.
# embedding (Column): Numbers wala vector.
# Is table ke andar data aese dikhta hai:

# collection_id (Column)	document (Column)	embedding (Column)
# 7e7eef10... (codebase)	"def read_file(): ..."	[-0.002, 0.05, ...]
# 7e7eef10... (codebase)	"ANPR Chapter 1 PDF ..."	[0.012, -0.03, ...]
# 7e203baf... (user_memories)	"city: dwarka"	[0.045, 0.08, ...]
# 7e203baf... (user_memories)	"morning_food: poha"	[-0.015, 0.02, ...]
# Seedhi aur Saaf Baat:
# Database: postgres
# Asli Table jisme vector save hota hai: langchain_pg_embedding
# Kaise pehchanta hai ki yeh RAG hai ya Memory?
# Usi table ke andar collection_id naam ka ek COLUMN hai!
# Agar us column mein codebase ka ID hai $\rightarrow$ RAG (Code/PDF).
# Agar us column mein user_memories ka ID hai $\rightarrow$ LTM (User Memory).
















# Haan! Aapne bilkul 100% sahi flow pakda hai! 🎯

# Aapke sentence ko poora karke dono flows ka crystal clear summary dekhiye:

# Flow 1: Jab aap File / PDF daalte hain (📎 Button)
# Frontend ne call kiya: POST /ingest/files (in 

# backend/routers/chat.py
# ).
# Backend ne PDF/Code ko padha, chunks (tukde) banaye.
# Usne call kiya: vector_db.add_documents(chunks).
# Kyunki vector_db ke andar collection_name="codebase" hai: 👉 Data seedha langchain_pg_embedding ke "codebase" folder mein chala gaya!
# (Aur jo ingest.py script hai, woh terminal se yahi kaam poore project folder ke liye ek sath karne ke liye hai).

# Flow 2: Jab aap Key-Value daalte hain (Sidebar ya AI Chat se)
# Call hota hai: POST /memory (ya agent ka save_memory tool).
# Yeh 2 kaam karta hai:
# Pehla kaam: store.put() call karke data ko store table mein daal deta hai (Fast Key-Value).
# Doosra kaam: save_semantic_memory() call karta hai, jo andar se memory_vector_db.add_documents([doc]) chalata hai.
# Kyunki memory_vector_db ke andar collection_name="user_memories" hai: 👉 Data seedha langchain_pg_embedding ke "user_memories" folder mein chala gaya!