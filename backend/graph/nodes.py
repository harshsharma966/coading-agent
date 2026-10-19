import json
import re
import uuid

from langchain_core.messages import SystemMessage, HumanMessage

from config.settings import SYSTEM_PROMPT, llm, MEMORY_EXTRACTION_PROMPT, PLANNER_PROMPT, REVIEWER_PROMPT
from graph.state import MyState
from graph.tools import ALL_TOOLS


# ── Bind tools to LLM ──────────────────────────────────────────────
llm_with_tools = llm.bind_tools(ALL_TOOLS)


def extract_tool_calls(response):
    """
    Robustly extract tool calls from AIMessage even if model returns JSON string content
    instead of populating response.tool_calls.
    """
    if hasattr(response, "tool_calls") and response.tool_calls:
        return response.tool_calls

    content = getattr(response, "content", "")
    if not isinstance(content, str):
        return []

    text = content.strip()
    code_block_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if code_block_match:
        text = code_block_match.group(1).strip()

    tool_calls = []
    if (text.startswith("{") and text.endswith("}")) or (text.startswith("[") and text.endswith("]")):
        try:
            data = json.loads(text)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict):
                    name = item.get("name") or item.get("tool") or item.get("function")
                    args = item.get("arguments") or item.get("parameters") or item.get("input") or {}
                    if name:
                        tool_calls.append({
                            "name": str(name),
                            "args": args if isinstance(args, dict) else {},
                            "id": f"call_{uuid.uuid4().hex[:8]}",
                            "type": "tool_call"
                        })
        except Exception:
            pass

    return tool_calls


# ── 1. PLANNER NODE (Architect Agent) ──────────────────────────────
def planner(state: MyState):
    """
    Planner Node breaks down complex user coding tasks into 2-4 actionable steps.
    If already planned or casual chat, passes through seamlessly.
    """
    # If already has an ongoing plan, don't recreate
    if state.plan and state.current_step < len(state.plan):
        print(f"[AGENT] [PLANNER] Ongoing plan in progress: Step {state.current_step + 1}/{len(state.plan)}", flush=True)
        return {"plan": state.plan, "current_step": state.current_step}

    last_user_msg = state.messages[-1].content if state.messages else ""
    if not last_user_msg or not isinstance(last_user_msg, str):
        return {"plan": [], "current_step": 0}

    print("[AGENT] [PLANNER] Analyzing task to formulate execution plan...", flush=True)
    try:
        plan_response = llm.invoke([
            SystemMessage(content=PLANNER_PROMPT),
            HumanMessage(content=last_user_msg)
        ])
        raw_text = plan_response.content.strip()
        # Clean markdown fences if any
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_text)
        clean_json = json_match.group(1).strip() if json_match else raw_text

        data = json.loads(clean_json)
        steps = data.get("steps", []) if isinstance(data, dict) else []
        if steps and isinstance(steps, list):
            print(f"[AGENT] [PLANNER] ✅ Generated {len(steps)} plan step(s): {steps}", flush=True)
            return {"plan": steps, "current_step": 0, "review_status": "pending"}
    except Exception as e:
        print(f"[AGENT] [PLANNER] Note: Direct execution (no plan needed): {e}", flush=True)

    return {"plan": [], "current_step": 0, "review_status": "pending"}


# ── 2. CODER NODE (Software Engineer Agent) ─────────────────────────
def coder(state: MyState):
    """
    Coder Node implements code changes, calls tools (write_file, edit_file),
    and fixes bugs reported by Reviewer.
    """
    memory_context = ""
    try:
        from db.connection import store
        from rag.vector_db import memory_vector_db

        saved_lines = []
        for core_key in ["name", "user_name", "my project", "project"]:
            mem = store.get(("user", "1"), core_key)
            if mem and mem.value:
                val = mem.value.get("value", mem.value) if isinstance(mem.value, dict) else mem.value
                saved_lines.append(f"- {core_key}: {val}")

        last_user_msg = state.messages[-1].content if state.messages else ""
        if last_user_msg and isinstance(last_user_msg, str):
            semantic_matches = memory_vector_db.similarity_search(last_user_msg, k=3)
            for doc in semantic_matches:
                if not any(doc.page_content.startswith(f"{k}:") for k in ["name", "project"]):
                    saved_lines.append(f"- (Relevant): {doc.page_content}")

        if saved_lines:
            memory_context = "\n\n[USER CONTEXT & RELEVANT MEMORIES]:\n" + "\n".join(saved_lines)
    except Exception as e:
        print(f"[AGENT] [MEMORY] Hybrid retrieval note: {e}", flush=True)

    # Inject Planner active step & Reviewer feedback into instructions
    plan_context = ""
    if state.plan and state.current_step < len(state.plan):
        active_step = state.plan[state.current_step]
        plan_context = f"\n\n[CURRENT ASSIGNED TASK - Step {state.current_step + 1}/{len(state.plan)}]:\n{active_step}"
        if state.review_feedback and state.review_status == "rejected":
            plan_context += f"\n\n🚨 [QA REVIEWER FEEDBACK - FIX THIS BUG]:\n{state.review_feedback}"

    system_msg = SystemMessage(content=SYSTEM_PROMPT + memory_context + plan_context)
    messages_with_context = [system_msg] + list(state.messages)

    print(f"[AGENT] [CODER] Invoking Coder LLM (Step: {state.current_step + 1 if state.plan else 1})...", flush=True)
    response = llm_with_tools.invoke(messages_with_context)

    # Check and repair tool calls if Ollama returns JSON text in content
    extracted_calls = extract_tool_calls(response)
    if extracted_calls and not getattr(response, "tool_calls", None):
        response.tool_calls = extracted_calls

    if getattr(response, "tool_calls", None):
        tool_names = [call.get("name") if isinstance(call, dict) else getattr(call, "name", "") for call in response.tool_calls]
        print(f"[AGENT] [TOOL] Coder requested tools: {tool_names}", flush=True)
        response.content = ""
    else:
        print("[AGENT] [REPLY] Coder completed turn", flush=True)

    content_str = response.content if isinstance(response.content, str) else str(response.content)

    return {
        "messages": [response],
        "response": content_str
    }


# Backwards compatibility alias
chatbot = coder


# ── 3. REVIEWER NODE (QA & Tester Agent) ────────────────────────────
def reviewer(state: MyState):
    """
    Reviewer Node verifies the code written by Coder.
    Checks test results, traces, and tool outputs.
    If rejected: routes back to Coder to fix.
    If approved: proceeds to next plan step or completes.
    """
    # If no plan or casual conversation, auto-approve
    if not state.plan:
        return {"review_status": "approved", "review_feedback": ""}

    # Check last few tool messages for errors
    recent_msgs = state.messages[-4:]
    has_error = False
    error_snippet = ""

    for m in recent_msgs:
        m_content = getattr(m, "content", "")
        if isinstance(m_content, str):
            if "Traceback" in m_content or "Error" in m_content or "FAILED" in m_content or "Exit Code: 1" in m_content:
                has_error = True
                error_snippet = m_content[:300]
                break

    if has_error:
        print(f"[AGENT] [REVIEWER] ❌ Rejected: Error detected in execution: {error_snippet}", flush=True)
        return {
            "review_status": "rejected",
            "review_feedback": f"Execution error detected: {error_snippet}. Please fix the code and re-test.",
            "current_step": state.current_step
        }

    # If all good, mark approved and advance step
    completed_task = state.plan[state.current_step] if state.plan and state.current_step < len(state.plan) else f"Step {state.current_step + 1}"
    next_step = state.current_step + 1
    print(f"[AGENT] [REVIEWER] ✅ Approved: {completed_task}", flush=True)
    return {
        "review_status": "approved",
        "review_feedback": "",
        "current_step": next_step,
        "completed_task": completed_task
    }




# ── Auto Memory Extractor (ChatGPT-style) ──────────────────────────
def memory_extractor(state: MyState):
    """
    ChatGPT-style automatic memory extraction node.
    Runs AFTER the chatbot's final answer (not on tool calls).
    Analyzes the last few messages to detect new personal facts,
    preferences, or corrections — and auto-saves them.
    """
    try:
        from db.connection import store
        from rag.vector_db import save_semantic_memory

        # ── 1. Gather last few messages for context ──
        recent_msgs = state.messages[-4:] if len(state.messages) >= 4 else state.messages
        conversation_text = ""
        user_text_only = ""
        for msg in recent_msgs:
            role = getattr(msg, "type", "unknown")
            content = getattr(msg, "content", "")
            if content and isinstance(content, str) and content.strip():
                conversation_text += f"{role.upper()}: {content}\n"
                if role == "human":
                    user_text_only += content.lower() + " "

        if not conversation_text.strip():
            print("[AGENT] [AUTO-MEMORY] No conversation content to analyze, skipping.", flush=True)
            return {"messages": [], "response": state.response, "memory_updated": False, "saved_count": 0}

        # ── 1.5 QUICK PRE-FILTER (Skip LLM call if no personal info signals) ──
        # Ye check karta hai ki user ne kuch personal bola bhi hai ya nahi.
        # Agar sirf technical question hai toh LLM call skip — fast!
        personal_signals = [
            "my name", "i am", "i'm", "mera naam", "i live", "i work",
            "i like", "i love", "i hate", "i prefer", "i use", "i eat",
            "my project", "my age", "my city", "my job", "my hobby",
            "remember", "yaad", "save this", "note this", "mujhe",
            "mai", "main", "i study", "i'm from", "born in",
            "favorite", "favourite", "i drink", "i play", "i watch",
            "call me", "my friend", "my team", "my stack", "i code in",
            "actually", "correction", "not anymore", "changed to",
        ]
        has_personal = any(signal in user_text_only for signal in personal_signals)

        if not has_personal:
            print("[AGENT] [AUTO-MEMORY] No personal signals in conversation, skipping LLM extraction.", flush=True)
            return {"messages": [], "response": state.response, "memory_updated": False, "saved_count": 0}

        # ── 2. Get existing memories for deduplication ──
        existing_keys = {}
        try:
            all_items = store.search(("user", "1"), limit=50)
            for m in all_items:
                val = m.value.get("value", m.value) if isinstance(m.value, dict) else m.value
                existing_keys[m.key.lower()] = str(val).lower()
        except Exception:
            pass

        existing_summary = ""
        if existing_keys:
            existing_summary = "\n\nALREADY SAVED MEMORIES (DO NOT re-save duplicates):\n"
            for k, v in existing_keys.items():
                existing_summary += f"- {k}: {v}\n"

        # ── 3. Ask LLM to extract facts ──
        extraction_prompt = MEMORY_EXTRACTION_PROMPT + existing_summary + "\n\nCONVERSATION:\n" + conversation_text
        print("[AGENT] [AUTO-MEMORY] Analyzing conversation for new facts...", flush=True)

        extraction_response = llm.invoke([HumanMessage(content=extraction_prompt)])
        raw_output = extraction_response.content.strip() if isinstance(extraction_response.content, str) else str(extraction_response.content).strip()

        # ── 4. Parse JSON output from LLM ──
        facts = []
        # Try to extract JSON from code blocks first
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', raw_output)
        json_text = json_match.group(1).strip() if json_match else raw_output.strip()

        # Try direct JSON parse
        try:
            parsed = json.loads(json_text)
            if isinstance(parsed, list):
                facts = parsed
            elif isinstance(parsed, dict) and "facts" in parsed:
                facts = parsed["facts"]
            elif isinstance(parsed, dict) and "key" in parsed:
                facts = [parsed]
        except json.JSONDecodeError:
            # Try to find JSON array in the text
            array_match = re.search(r'\[[\s\S]*?\]', raw_output)
            if array_match:
                try:
                    facts = json.loads(array_match.group(0))
                except Exception:
                    pass

        if not facts:
            print("[AGENT] [AUTO-MEMORY] No new facts detected in conversation.", flush=True)
            return {"messages": [], "response": state.response}

        # ── 5. Smart merge: save only new/updated facts ──
        saved_count = 0
        for fact in facts:
            if not isinstance(fact, dict):
                continue

            key = str(fact.get("key", "")).strip().lower().replace(" ", "_")
            value = str(fact.get("value", "")).strip()

            if not key or not value or len(key) < 2 or len(value) < 2:
                continue

            # Skip if exact duplicate exists
            if key in existing_keys and existing_keys[key] == value.lower():
                print(f"[AGENT] [AUTO-MEMORY] Skipped duplicate: {key}={value}", flush=True)
                continue

            # Save to store (key-value) + pgvector (semantic)
            try:
                store.put(("user", "1"), key, {"value": value})
                save_semantic_memory(key, value, user_id="1")
                saved_count += 1
                action = "UPDATED" if key in existing_keys else "NEW"
                print(f"[AGENT] [AUTO-MEMORY] [{action}] {key} = {value}", flush=True)
            except Exception as save_err:
                print(f"[AGENT] [AUTO-MEMORY] Save error for '{key}': {save_err}", flush=True)

        if saved_count > 0:
            print(f"[AGENT] [AUTO-MEMORY] ✅ Auto-saved {saved_count} fact(s) from conversation!", flush=True)
            return {"messages": [], "response": state.response, "memory_updated": True, "saved_count": saved_count}
        else:
            print("[AGENT] [AUTO-MEMORY] No new unique facts to save.", flush=True)
            return {"messages": [], "response": state.response, "memory_updated": False, "saved_count": 0}

    except Exception as e:
        print(f"[AGENT] [AUTO-MEMORY] Extraction error (non-fatal): {e}", flush=True)

    # Pass through — don't modify messages or response
    return {"messages": [], "response": state.response, "memory_updated": False, "saved_count": 0}


