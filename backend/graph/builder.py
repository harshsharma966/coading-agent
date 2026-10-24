from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode

from db.connection import checkpointer, store
from graph.state import MyState
from graph.nodes import planner, coder, reviewer, memory_extractor, extract_tool_calls
from graph.tools import ALL_TOOLS


def coder_router(state: MyState):
    """
    Decide next step after Coder node:
    - If Coder requested tools -> 'tools'
    - If Coder completed turn and plan is active -> 'reviewer'
    - Otherwise (casual chat / simple reply) -> 'memory_extractor'
    """
    if not state.messages:
        return "memory_extractor"

    last_msg = state.messages[-1]
    tool_calls = getattr(last_msg, "tool_calls", None) or extract_tool_calls(last_msg)
    if tool_calls:
        return "tools"

    # If there is an active multi-step plan, route to Reviewer
    if state.plan:
        return "reviewer"

    return "memory_extractor"


def reviewer_router(state: MyState):
    """
    Decide next step after Reviewer node:
    - If Reviewer rejected code -> loop back to 'coder' with feedback
    - If more plan steps remain -> continue to 'coder'
    - If all steps passed -> 'memory_extractor' -> END
    """
    if state.review_status == "rejected":
        print(f"[GRAPH] Reviewer rejected: looping back to Coder to fix bug", flush=True)
        return "coder"

    if state.plan and state.current_step < len(state.plan):
        print(f"[GRAPH] Reviewer passed step: continuing to Coder for Step {state.current_step + 1}", flush=True)
        return "coder"

    return "memory_extractor"


def build_graph():
    """
    Build and compile the Multi-Agent LangGraph workflow:
        START → planner → coder ──► (tool call?) ──► tools ──► coder (loop)
                            │
                       (code ready?)
                            │
                            ▼
                         reviewer ──► (rejected?) ──► coder (fix loop)
                            │
                       (approved?)
                            │
                            ▼
                    memory_extractor → END
    """
    tool_node = ToolNode(ALL_TOOLS)
    builder = StateGraph(MyState)

    # ── Nodes ──
    builder.add_node("planner", planner)
    builder.add_node("coder", coder)
    builder.add_node("tools", tool_node)
    builder.add_node("reviewer", reviewer)
    builder.add_node("memory_extractor", memory_extractor)

    # ── Edges ──
    builder.add_edge(START, "planner")
    builder.add_edge("planner", "coder")
    builder.add_edge("tools", "coder")  # Tools always report back to Coder

    # Coder conditional edge
    builder.add_conditional_edges(
        "coder",
        coder_router,
        {
            "tools": "tools",
            "reviewer": "reviewer",
            "memory_extractor": "memory_extractor"
        }
    )

    # Reviewer conditional edge
    builder.add_conditional_edges(
        "reviewer",
        reviewer_router,
        {
            "coder": "coder",
            "memory_extractor": "memory_extractor"
        }
    )

    # Memory extractor to END
    builder.add_edge("memory_extractor", END)

    return builder.compile(checkpointer=checkpointer, store=store)


# Compiled graph instance — imported by routers
graph = build_graph()



# ==============================================================================
#                 MULTI-AGENT WORKFLOW ARCHITECTURE (Saarthi AI)
# ==============================================================================
#
#                              [ USER REQUEST ]
#                                     │
#                                     ▼
#                                 [ START ]
#                                     │
#                                     ▼
#                          ┌─────────────────────┐
#                          │   1. PLANNER NODE   │ ◄── (Architect: 2-4 Step Plan)
#                          └──────────┬──────────┘
#                                     │
#                                     ▼
#                          ┌─────────────────────┐
#                     ┌──► │    2. CODER NODE    │ ◄── (Software Engineer)
#                     │    └──────────┬──────────┘
#                     │               │
#                     │         Tool call needed?
#                     │        ┌──────┴──────┐
#                     │      (Yes)          (No)
#                     │        │              │
#                     │        ▼              │
#   Tool results /    │   ┌─────────┐         │
#   User Approvals ───┼── │  TOOLS  │         │
#                     │   └─────────┘         │
#                     │   (HITL Pause/Resume) │
#                     │                       ▼
#                     │            ┌─────────────────────┐
#                     │            │  4. REVIEWER NODE   │ ◄── (QA Tester: Verifies Execution)
#                     │            └──────────┬──────────┘
#                     │                       │
#               Bug found? /             All steps
#             More plan steps?           approved?
#                     │                       │
#                     └───────────────────────┤
#                                             ▼
#                                  ┌─────────────────────┐
#                                  │ 5. MEMORY EXTRACTOR │ ◄── (Auto-extracts facts to PostgreSQL)
#                                  └──────────┬──────────┘
#                                             │
#                                             ▼
#                                          [ END ]
# ==============================================================================
