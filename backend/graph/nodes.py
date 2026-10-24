import os
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
    Robustly extract tool calls from AIMessage even if model returns JSON string content,
    embedded JSON, XML tags, or python triple-quoted strings instead of populating response.tool_calls.
    """
    # 1. Native tool calls if already populated by LLM API
    if hasattr(response, "tool_calls") and response.tool_calls:
        valid = []
        for tc in response.tool_calls:
            name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
            if name:
                args = tc.get("args") or tc.get("arguments") if isinstance(tc, dict) else getattr(tc, "args", {})
                valid.append({
                    "name": str(name),
                    "args": args if isinstance(args, dict) else {},
                    "id": tc.get("id") if isinstance(tc, dict) else getattr(tc, "id", f"call_{uuid.uuid4().hex[:8]}"),
                    "type": "tool_call"
                })
        if valid:
            return valid

    content = getattr(response, "content", "")
    if not isinstance(content, str):
        return []

    text = content.strip()
    if not text:
        return []

    tool_calls = []
    known_tool_names = {t.name for t in ALL_TOOLS}

    # 2. Check XML-style <tool_call> tags
    xml_matches = re.findall(r'<tool_call>([\s\S]*?)</tool_call>', text, flags=re.IGNORECASE)
    for xm in xml_matches:
        try:
            d = json.loads(xm.strip())
            name = d.get("name") or d.get("tool") or d.get("function")
            if name:
                tool_calls.append({
                    "name": str(name),
                    "args": d.get("arguments") or d.get("parameters") or d.get("input") or {},
                    "id": f"call_{uuid.uuid4().hex[:8]}",
                    "type": "tool_call"
                })
        except Exception:
            pass
    if tool_calls:
        return tool_calls

    # 3. Check markdown blocks ```json or ```
    code_blocks = re.findall(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    for cb in code_blocks:
        cb_str = cb.strip()
        if (cb_str.startswith("{") and cb_str.endswith("}")) or (cb_str.startswith("[") and cb_str.endswith("]")):
            try:
                parsed = json.loads(cb_str)
                items = parsed if isinstance(parsed, list) else [parsed]
                for d in items:
                    if isinstance(d, dict):
                        name = d.get("name") or d.get("tool") or d.get("function")
                        if name:
                            tool_calls.append({
                                "name": str(name),
                                "args": d.get("arguments") or d.get("parameters") or d.get("input") or {},
                                "id": f"call_{uuid.uuid4().hex[:8]}",
                                "type": "tool_call"
                            })
            except Exception:
                pass
    if tool_calls:
        return tool_calls

    # 4. Direct JSON parse on whole text
    if (text.startswith("{") and text.endswith("}")) or (text.startswith("[") and text.endswith("]")):
        try:
            parsed = json.loads(text)
            items = parsed if isinstance(parsed, list) else [parsed]
            for d in items:
                if isinstance(d, dict):
                    name = d.get("name") or d.get("tool") or d.get("function")
                    if name:
                        tool_calls.append({
                            "name": str(name),
                            "args": d.get("arguments") or d.get("parameters") or d.get("input") or {},
                            "id": f"call_{uuid.uuid4().hex[:8]}",
                            "type": "tool_call"
                        })
            if tool_calls:
                return tool_calls
        except Exception:
            pass

    # 5. Search for embedded JSON object with known tool name anywhere in the string
    tool_regex = r'\{\s*"(?:name|tool|function)"\s*:\s*"(' + '|'.join(known_tool_names) + r')"[\s\S]*'
    match = re.search(tool_regex, text)
    if match:
        tool_name = match.group(1)
        raw_part = text[match.start():].strip()

        # Try to extract balanced json block
        brace_count = 0
        end_idx = -1
        in_string = False
        escape = False
        for i, char in enumerate(raw_part):
            if char == '"' and not escape:
                in_string = not in_string
            elif not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i + 1
                        break
            if char == '\\' and not escape:
                escape = True
            else:
                escape = False

        candidate = raw_part[:end_idx] if end_idx != -1 else raw_part

        try:
            d = json.loads(candidate)
            return [{
                "name": tool_name,
                "args": d.get("arguments") or d.get("parameters") or d.get("input") or {},
                "id": f"call_{uuid.uuid4().hex[:8]}",
                "type": "tool_call"
            }]
        except Exception:
            pass

        # 6. Fallback extraction for when Ollama used Python triple quotes, raw docstrings, etc.
        args = {}
        if tool_name == "write_file":
            fp_m = re.search(r'"file_path"\s*:\s*["\']([^"\'\\]*(?:\\.[^"\'\\]*)*)["\']', raw_part)
            if fp_m:
                args["file_path"] = fp_m.group(1).replace("\\\\", "\\")
            c_m = re.search(r'"content"\s*:\s*(?:"""|"""|\"\"\"|"|\'|\s*)*([\s\S]*?)(?:\"\"\"|"""|\'\'\'|"|\')?\s*\}*\s*$', raw_part)
            if c_m:
                raw_c = c_m.group(1).strip()
                raw_c = re.sub(r'\\*"""\s*\}*\s*$', '', raw_c)
                raw_c = re.sub(r'"""\s*\}*\s*$', '', raw_c)
                raw_c = re.sub(r'"\s*\}*\s*$', '', raw_c)
                raw_c = raw_c.replace('\\"', '"').replace('\\\\', '\\')
                args["content"] = raw_c

        elif tool_name == "edit_file":
            fp_m = re.search(r'"file_path"\s*:\s*["\']([^"\'\\]*(?:\\.[^"\'\\]*)*)["\']', raw_part)
            if fp_m:
                args["file_path"] = fp_m.group(1).replace("\\\\", "\\")
            t_m = re.search(r'"target_content"\s*:\s*(?:"""|\"\"\"|"|\')([\s\S]*?)(?:"""|\"\"\"|"|\')\s*,\s*"replacement_content"', raw_part)
            if t_m:
                args["target_content"] = t_m.group(1).replace('\\"', '"').replace('\\\\', '\\')
            r_m = re.search(r'"replacement_content"\s*:\s*(?:"""|\"\"\"|"|\')([\s\S]*?)(?:"""|\"\"\"|"|\')?\s*\}*\s*$', raw_part)
            if r_m:
                raw_r = re.sub(r'\\*"""\s*\}*\s*$', '', r_m.group(1).strip())
                args["replacement_content"] = raw_r.replace('\\"', '"').replace('\\\\', '\\')

        elif tool_name == "read_file":
            fp_m = re.search(r'"file_path"\s*:\s*["\']([^"\'\\]*(?:\\.[^"\'\\]*)*)["\']', raw_part)
            if fp_m:
                args["file_path"] = fp_m.group(1).replace("\\\\", "\\")

        elif tool_name == "run_terminal_command":
            cmd_m = re.search(r'"command"\s*:\s*["\']([^"\'\\]*(?:\\.[^"\'\\]*)*)["\']', raw_part)
            if cmd_m:
                args["command"] = cmd_m.group(1).replace('\\"', '"')
            wd_m = re.search(r'"working_dir"\s*:\s*["\']([^"\'\\]*(?:\\.[^"\'\\]*)*)["\']', raw_part)
            if wd_m:
                args["working_dir"] = wd_m.group(1)

        elif tool_name == "list_directory":
            dp_m = re.search(r'"directory_path"\s*:\s*["\']([^"\'\\]*(?:\\.[^"\'\\]*)*)["\']', raw_part)
            if dp_m:
                args["directory_path"] = dp_m.group(1)

        elif tool_name == "execute_python_code":
            code_m = re.search(r'"code"\s*:\s*(?:"""|\"\"\"|"|\')([\s\S]*?)(?:"""|\"\"\"|"|\')?\s*\}*\s*$', raw_part)
            if code_m:
                raw_code = re.sub(r'\\*"""\s*\}*\s*$', '', code_m.group(1).strip())
                args["code"] = raw_code.replace('\\"', '"').replace('\\\\', '\\')

        elif tool_name == "search_codebase":
            q_m = re.search(r'"query"\s*:\s*["\']([^"\'\\]*(?:\\.[^"\'\\]*)*)["\']', raw_part)
            if q_m:
                args["query"] = q_m.group(1).replace('\\"', '"')

        elif tool_name in ("get_memory", "save_memory"):
            k_m = re.search(r'"key"\s*:\s*["\']([^"\'\\]*(?:\\.[^"\'\\]*)*)["\']', raw_part)
            if k_m:
                args["key"] = k_m.group(1)
            v_m = re.search(r'"value"\s*:\s*["\']([^"\'\\]*(?:\\.[^"\'\\]*)*)["\']', raw_part)
            if v_m:
                args["value"] = v_m.group(1)

        if args:
            tool_calls.append({
                "name": tool_name,
                "args": args,
                "id": f"call_{uuid.uuid4().hex[:8]}",
                "type": "tool_call"
            })

    return tool_calls


def detect_save_intent_fallback(last_user_msg: str, response, messages: list):
    """
    Safety net: If user asked to save code/file, but local LLM outputted conversational
    text or mentioned write_file instead of calling the tool, automatically convert to write_file tool call.
    """
    if getattr(response, "tool_calls", None):
        return None  # Already has structured tool calls

    lower_user = (last_user_msg or "").lower().strip()
    save_triggers = ["save", "save this", "save it", "save code", "save in", "save to", "save at", "save by name", "save as"]
    if not any(t in lower_user for t in save_triggers):
        return None

    content = getattr(response, "content", "")
    content_str = content if isinstance(content, str) else str(content)

    # 1. Search for code block in response or previous assistant messages
    code_match = re.search(r"```(?:python|py)?\s*([\s\S]*?)\s*```", content_str)
    code_content = code_match.group(1).strip() if code_match else ""

    if not code_content:
        # Check previous messages for the most recent python code block
        for m in reversed(messages):
            m_text = getattr(m, "content", "")
            if isinstance(m_text, str) and "```" in m_text:
                prev_code_match = re.search(r"```(?:python|py)?\s*([\s\S]*?)\s*```", m_text)
                if prev_code_match:
                    code_content = prev_code_match.group(1).strip()
                    break

    if not code_content:
        return None

    # 2. Determine target folder
    from config.settings import get_dynamic_user_folder
    if "desktop" in lower_user:
        target_dir = get_dynamic_user_folder("desktop")
    elif "document" in lower_user:
        target_dir = get_dynamic_user_folder("documents")
    else:
        target_dir = get_dynamic_user_folder("downloads")

    # 3. Determine filename
    filename = ""
    name_match = re.search(r"(?:named?|namer|as|with name)\s+([a-zA-Z0-9_\-\.\s]+?)(?:\s+(?:at|in|on|to|\.py)|$|\n)", lower_user)
    if name_match:
        raw_name = name_match.group(1).strip()
        raw_name = re.sub(r"\s+(?:at|in|on|to)$", "", raw_name).strip()
        filename = raw_name.replace(" ", "_")
        if filename.endswith(".pdf"):
            filename = re.sub(r"\.pdf$", ".py", filename)
        if not filename.endswith((".py", ".txt", ".md", ".html", ".js", ".json")):
            filename += ".py"

    if not filename:
        fn_match = re.search(r"def\s+([a-zA-Z0-9_]+)\s*\(", code_content)
        if fn_match:
            filename = f"{fn_match.group(1)}.py"
        else:
            filename = "solution.py"

    if filename.endswith(".pdf"):
        filename = "solution.py"

    full_path = os.path.normpath(os.path.join(target_dir, filename)).replace("\\", "/")

    print(f"[AGENT] [TOOL FALLBACK] Auto-converting save text to write_file for '{full_path}'", flush=True)
    return [{
        "name": "write_file",
        "args": {
            "file_path": full_path,
            "content": code_content
        },
        "id": f"call_{uuid.uuid4().hex[:8]}",
        "type": "tool_call"
    }]


# ── 1. PLANNER NODE (Architect Agent) ──────────────────────────────
def planner(state: MyState):
    """
    Planner Node breaks down complex user coding tasks into 2-3 actionable steps.
    If direct action (saving a file, reading, executing, casual chat), passes through seamlessly without extra steps.
    """
    last_user_msg = ""
    for m in reversed(state.messages):
        if getattr(m, "type", "") == "human" or type(m).__name__ == "HumanMessage":
            last_user_msg = getattr(m, "content", "")
            break

    if not last_user_msg or not isinstance(last_user_msg, str):
        return {"plan": [], "current_step": 0}

    lower_user = last_user_msg.lower().strip()

    # ── Fast path: Direct saving or single-action commands NEVER need a multi-step plan ──
    save_keywords = ["save", "download", "desktop", "document", "write_file", "save by name", "save as", "save this"]
    if any(k in lower_user for k in save_keywords):
        print(f"[AGENT] [PLANNER] Direct save intent detected ('{last_user_msg[:60]}'). Bypassing plan.", flush=True)
        return {"plan": [], "current_step": 0, "review_status": "approved"}

    # If already has an ongoing plan, don't recreate unless it's a new standalone intent
    if state.plan and state.current_step < len(state.plan):
        print(f"[AGENT] [PLANNER] Ongoing plan in progress: Step {state.current_step + 1}/{len(state.plan)}", flush=True)
        return {"plan": state.plan, "current_step": state.current_step}

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
            print(f"[AGENT] [PLANNER] [OK] Generated {len(steps)} plan step(s): {steps}", flush=True)
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
            plan_context += f"\n\n[QA REVIEWER FEEDBACK - FIX THIS BUG]:\n{state.review_feedback}"

    system_msg = SystemMessage(content=SYSTEM_PROMPT + memory_context + plan_context)
    messages_with_context = [system_msg] + list(state.messages)

    print(f"[AGENT] [CODER] Invoking Coder LLM (Step: {state.current_step + 1 if state.plan else 1})...", flush=True)
    response = llm_with_tools.invoke(messages_with_context)

    # Check and repair tool calls if Ollama returns JSON text in content
    extracted_calls = extract_tool_calls(response)
    if extracted_calls and not getattr(response, "tool_calls", None):
        response.tool_calls = extracted_calls

    # Safety fallback: Check if user wanted to save file but LLM only outputted explanation/code
    # CRITICAL: Only run fallback on the initial human turn. If the last message was a ToolMessage,
    # that means a tool ALREADY executed and we must NOT trigger fallback again in an infinite loop!
    last_msg = state.messages[-1] if state.messages else None
    is_after_tool = getattr(last_msg, "type", "") == "tool" or type(last_msg).__name__ == "ToolMessage"

    last_user_text = ""
    for m in reversed(state.messages):
        if getattr(m, "type", "") == "human" or type(m).__name__ == "HumanMessage":
            last_user_text = getattr(m, "content", "")
            break

    if not is_after_tool and not getattr(response, "tool_calls", None):
        fallback_calls = detect_save_intent_fallback(last_user_text, response, state.messages)
        if fallback_calls:
            response.tool_calls = fallback_calls

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
        print(f"[AGENT] [REVIEWER] [REJECTED] Error detected in execution: {error_snippet}", flush=True)
        return {
            "review_status": "rejected",
            "review_feedback": f"Execution error detected: {error_snippet}. Please fix the code and re-test.",
            "current_step": state.current_step
        }

    # If all good, mark approved and advance step
    completed_task = state.plan[state.current_step] if state.plan and state.current_step < len(state.plan) else f"Step {state.current_step + 1}"
    next_step = state.current_step + 1
    print(f"[AGENT] [REVIEWER] [APPROVED] {completed_task}", flush=True)
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


