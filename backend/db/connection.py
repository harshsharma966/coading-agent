from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.store.postgres import PostgresStore

from config.settings import DB_URI

# ── Connection Pool ─────────────────────────────────────────────────
pool = ConnectionPool(
    conninfo=DB_URI,
    max_size=20,
    kwargs={"autocommit": True, "row_factory": dict_row}
)

# ── LangGraph Checkpointer (chat history persistence) ──────────────
checkpointer = PostgresSaver(pool)
checkpointer.setup()

# ── LangGraph Store (memory key-value storage) ─────────────────────
store = PostgresStore(pool)
store.setup()
