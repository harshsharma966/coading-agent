from fastapi import APIRouter

from db.connection import store
from rag.vector_db import save_semantic_memory, memory_vector_db

router = APIRouter()



# . routers/memory.py ki zaroorat kyu hai? (Frontend UI ke liye)
# Aapke frontend sidebar mein dekhiye: 

# frontend/src/components/Sidebar/MemoryPanel.jsx

# Memory List: Screen par jo saari memories ki list dikhti hai, browser React component Python ka function direct nahi chala sakta. Browser HTTP request bhejta hai: GET /memory/list.
# Add Button: Jab user UI mein Type karke "+ Save" dabata hai, toh browser bhejta hai: POST /memory.
# Dustbin (Delete) Button: Jab aap cross/delete icon dabate hain, toh browser bhejta hai: DELETE /memory/{key}.
# Agar routers/memory.py na ho, toh Frontend UI par Memory panel chal hi nahi payega!
# used for store memry 
@router.post("/memory")
def save_memory(key: str, value: str):

    namespace = ("user", "1")

    store.put(
        namespace,
        key,
        {"value": value}
    )

    # Also index into pgvector for semantic search
    save_semantic_memory(key, value, user_id="1")

    return {
        "message": "Memory saved",
        "key": key,
        "value": value
    }


@router.get("/memory/list")
def list_all_memories():
    """
    List all saved long-term memories for the user.
    """
    namespace = ("user", "1")

    try:
        items = store.search(namespace, limit=100)
        memories = []
        for item in items:
            val = item.value.get("value", item.value) if isinstance(item.value, dict) else item.value
            memories.append({
                "key": item.key,
                "value": val
            })

        return {"memories": memories, "count": len(memories)}
    except Exception as e:
        return {"memories": [], "count": 0, "error": str(e)}


@router.delete("/memory/{key}")
def delete_memory(key: str):
    """
    Delete a specific memory from store and also remove its vector from pgvector.
    """
    namespace = ("user", "1")

    try:
        # 1. Delete from LangGraph store
        store.delete(namespace, key)

        # 2. Also remove from pgvector embedding table
        # Search for the document matching this key and delete it
        try:
            results = memory_vector_db.similarity_search(
                f"{key}:",
                k=10
            )
            ids_to_delete = []
            for doc in results:
                if doc.metadata.get("key") == key:
                    if hasattr(doc, "id") and doc.id:
                        ids_to_delete.append(doc.id)

            if ids_to_delete:
                memory_vector_db.delete(ids=ids_to_delete)
        except Exception as vec_err:
            print(f"Warning: Could not delete vector for key '{key}': {vec_err}")

        return {"message": f"Memory '{key}' deleted successfully", "key": key}
    except Exception as e:
        return {"message": f"Error deleting memory: {str(e)}", "key": key}


@router.get("/memory/{key}")
def get_memory(key: str):

    namespace = ("user", "1")

    memory = store.get(
        namespace,
        key
    )

    if memory is None:
        return {
            "message": "Memory not found"
        }

    return {
        "key": key,
        "value": memory.value
    }
