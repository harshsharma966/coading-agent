from fastapi import APIRouter

from rag.vector_db import vector_db

router = APIRouter(prefix="/rag", tags=["RAG"])

#Direct Search Test: Bina Chatbot ko bulaye, direct check karne ke liye ki Vector DB sahi code chunks aur accurate score (0.89 wagera) return kar raha hai ya nahi.
@router.post("/search")
def rag_search(query: str, k: int = 5):
    """
    Search the codebase vector DB using semantic similarity.
    Returns top-k matching code chunks with file paths and content.
    """
    try:
        results = vector_db.similarity_search_with_score(query, k=k)

        chunks = []
        for doc, score in results:
            chunks.append({
                "file_path": doc.metadata.get("file_path", "unknown"),
                "content": doc.page_content[:500],  # Truncate for UI display
                "score": round(float(score), 4)
            })

        return {
            "query": query,
            "results": chunks,
            "count": len(chunks)
        }
    except Exception as e:
        return {
            "query": query,
            "results": [],
            "count": 0,
            "error": str(e)
        }





#Chunk Count Check: Check karne ke liye ki database mein total kitne chunks index ho chuke hain.
@router.get("/stats")
def rag_stats():
    """
    Get stats about the codebase vector collection — total chunks indexed.
    """
    try:
        # Use a broad search to estimate total documents
        # PGVector doesn't have a direct count method, so we search with high k
        results = vector_db.similarity_search("code", k=1000)
        total_chunks = len(results)

        return {
            "collection": "codebase",
            "total_chunks": total_chunks
        }
    except Exception as e:
        return {
            "collection": "codebase",
            "total_chunks": 0,
            "error": str(e)
        }
