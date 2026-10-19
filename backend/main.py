import sys
import os

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.chat import router as chat_router
from routers.memory import router as memory_router
from routers.rag_routes import router as rag_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Include routers ────────────────────────────────────────────────
app.include_router(chat_router)
app.include_router(memory_router)
app.include_router(rag_router)


@app.get("/")
def home():
    return {
        "message": "Welcome to my AI Coding Agent with Tool-Calling capabilities!"
    }


if __name__ == "__main__":
    import uvicorn
    print("\n🚀 Starting AI Coding Agent Backend on http://127.0.0.1:8000 ...\n")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)