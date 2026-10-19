import os
import sys
import io
import re
import contextlib
import traceback
import difflib
from langchain_core.tools import tool
from langgraph.types import interrupt

# Add RAG folder to path
RAG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "rag")
if RAG_DIR not in sys.path:
    sys.path.insert(0, RAG_DIR)

try:
    from retriever import retrieve_code
except ImportError:
    retrieve_code = None

from db.connection import store
from rag.vector_db import save_semantic_memory

USER_NAMESPACE = ("user", "1")
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@tool
def search_codebase(query: str) -> str:
    """
    Search the project codebase and uploaded documents/PDFs using vector similarity search (pgvector RAG).
    Use this tool when you need to answer questions about uploaded PDF files, summarize documents,
    find code, or get context about functions and files in the project.
    This searches files and PDFs that have been ingested into the vector database.
    
    Args:
        query: Search prompt or question about the documents or codebase.
    """
    if not retrieve_code:
        return "RAG retriever module not available."
    
    try:
        results = retrieve_code(query, k=5)
        if not results:
            return "No matching code chunks found."
        
        output = []
        for chunk in results:
            file_path = chunk.metadata.get("file_path", "unknown")
            output.append(f"--- File: {file_path} ---\n{chunk.page_content}\n")
        return "\n".join(output)
    except Exception as e:
        return f"Error searching codebase: {str(e)}"


@tool
def read_file(file_path: str) -> str:
    """
    Read the contents of a local file.
    
    Args:
        file_path: Absolute path (e.g. 'C:/Users/Admin/Downloads/3.py') or relative path from project root (e.g. 'backend/main.py').
    """
    # Resolve path
    if os.path.isabs(file_path):
        target_path = os.path.normpath(file_path)
    else:
        target_path = os.path.normpath(os.path.join(PROJECT_ROOT, file_path))

    if not os.path.exists(target_path):
        return f"Error: File '{file_path}' does not exist at '{target_path}'."
    
    if os.path.isdir(target_path):
        return f"Error: '{file_path}' is a directory, not a file."

    try:
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                content = f.read()
        except UnicodeDecodeError:
            with open(target_path, "r", encoding="latin-1", errors="replace") as f:
                content = f.read()
        return f"--- File: {target_path} ---\n{content}"
    except Exception as e:
        return f"Error reading file '{file_path}': {str(e)}"


@tool
def list_directory(directory_path: str = ".") -> str:
    """
    List files and directories in the specified directory.
    
    Args:
        directory_path: Absolute directory path or relative path from project root ('.' for project root).
    """
    if os.path.isabs(directory_path):
        target_path = os.path.normpath(directory_path)
    else:
        target_path = os.path.normpath(os.path.join(PROJECT_ROOT, directory_path))

    if not os.path.exists(target_path):
        return f"Error: Directory '{directory_path}' does not exist at '{target_path}'."
    
    if not os.path.isdir(target_path):
        return f"Error: '{directory_path}' is a file, not a directory."

    try:
        items = os.listdir(target_path)
        ignored = {".git", "__pycache__", "venv", "node_modules", ".env"}
        filtered = [item for item in items if item not in ignored]
        
        result = []
        for item in sorted(filtered):
            full_item_path = os.path.join(target_path, item)
            is_dir = os.path.isdir(full_item_path)
            item_type = "[DIR]" if is_dir else "[FILE]"
            result.append(f"{item_type} {item}")
            
        return f"Contents of directory '{target_path}':\n" + "\n".join(result)
    except Exception as e:
        return f"Error listing directory '{directory_path}': {str(e)}"



@tool
def execute_python_code(code: str) -> str:
    """
    Execute a snippet of Python code and return stdout/stderr output.
    Use this to run calculations, test code logic, or analyze data.
    
    Args:
        code: Python source code string to execute.
    """
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()

    global_namespace = {}
    local_namespace = {}

    try:
        with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
            exec(code, global_namespace, local_namespace)
        
        stdout_val = stdout_capture.getvalue()
        stderr_val = stderr_capture.getvalue()

        output = []
        if stdout_val:
            output.append(f"STDOUT:\n{stdout_val}")
        if stderr_val:
            output.append(f"STDERR:\n{stderr_val}")
        
        if not output:
            return "Code executed successfully with no output."
        
        return "\n".join(output)
    except Exception:
        err_msg = traceback.format_exc()
        return (
            f"[PYTHON EXECUTION FAILED]\n"
            f"Execution Error Traceback:\n{err_msg}\n"
            f"🚨 AUTONOMOUS SELF-DEBUGGING TRIGGER:\n"
            f"The Python execution failed. Analyze the traceback above to identify the root cause. "
            f"If it was code you wrote or a file you modified, inspect and fix the bug, then re-execute "
            f"to verify it passes before presenting your final answer."
        )


@tool
def write_file(file_path: str, content: str) -> str:
    """
    Write or create a file with specified text content.
    Creates parent directories automatically if they do not exist.
    
    Args:
        file_path: Absolute path or relative path from project root.
        content: Complete code or text content to write into the file.
    """
    # 🛑 1. Request Human Approval before writing to disk
    decision = interrupt({
        "action": "write_file",
        "file_path": file_path,
        "preview": content[:250] + ("..." if len(content) > 250 else ""),
        "char_count": len(content)
    })

    # 🛑 2. Check user decision and feedback
    is_approved = decision.get("approved", False) if isinstance(decision, dict) else False
    user_feedback = decision.get("feedback", "").strip() if isinstance(decision, dict) else ""

    if not is_approved:
        if user_feedback:
            return f"Action REJECTED by user with instructions: '{user_feedback}'. Please adjust your code or approach accordingly."
        return f"Action REJECTED by user: Permission to write to '{file_path}' was denied."

    # 3. If approved, proceed with writing file
    if os.path.isabs(file_path):
        target_path = os.path.normpath(file_path)
    else:
        target_path = os.path.normpath(os.path.join(PROJECT_ROOT, file_path))

    try:
        parent_dir = os.path.dirname(target_path)
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)
            
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        msg = f"Successfully wrote {len(content)} characters to '{target_path}'."
        if user_feedback:
            msg += f" (Note from user: '{user_feedback}')"
        return msg
    except Exception as e:
        return f"Error writing file '{file_path}': {str(e)}"


@tool
def edit_file(file_path: str, target_content: str, replacement_content: str) -> str:
    """
    Selectively replace a specific snippet or block of code inside an existing file without overwriting the entire file.
    Use this tool whenever you are updating, bug-fixing, refactoring, or modifying lines in an EXISTING file.
    
    Args:
        file_path: Absolute or relative path to the existing file.
        target_content: The exact original code or text block in the file that you want to replace.
        replacement_content: The new replacement code or text block to insert in its place.
    """
    # 1. Resolve path
    if os.path.isabs(file_path):
        target_path = os.path.normpath(file_path)
    else:
        target_path = os.path.normpath(os.path.join(PROJECT_ROOT, file_path))

    if not os.path.exists(target_path):
        return f"Error: File '{file_path}' does not exist at '{target_path}'. If creating a new file, use 'write_file' instead."

    if os.path.isdir(target_path):
        return f"Error: '{file_path}' is a directory, not a file."

    # 2. Read original file
    try:
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                original = f.read()
        except UnicodeDecodeError:
            with open(target_path, "r", encoding="latin-1", errors="replace") as f:
                original = f.read()
    except Exception as e:
        return f"Error reading file '{file_path}': {str(e)}"

    # 3. Check if target_content exists
    if target_content not in original:
        norm_orig = original.replace("\r\n", "\n")
        norm_target = target_content.replace("\r\n", "\n")
        if norm_target in norm_orig:
            original = norm_orig
            target_content = norm_target
        else:
            return (
                f"Error: target_content not found in '{file_path}'. "
                f"Make sure you use `read_file` first to inspect the exact lines before patching."
            )

    # 4. Generate modified content
    modified = original.replace(target_content, replacement_content, 1)

    # 5. Generate unified diff
    diff_lines = list(difflib.unified_diff(
        original.splitlines(),
        modified.splitlines(),
        fromfile=f"a/{os.path.basename(file_path)}",
        tofile=f"b/{os.path.basename(file_path)}",
        lineterm=""
    ))
    diff_preview = "\n".join(diff_lines[:60])

    # 🛑 6. Request Human Approval with Diff Preview
    decision = interrupt({
        "action": "edit_file",
        "file_path": file_path,
        "diff": diff_preview,
        "old_lines": target_content[:300] + ("..." if len(target_content) > 300 else ""),
        "new_lines": replacement_content[:300] + ("..." if len(replacement_content) > 300 else ""),
        "char_diff": len(replacement_content) - len(target_content)
    })

    # 🛑 7. Check user approval
    is_approved = decision.get("approved", False) if isinstance(decision, dict) else False
    user_feedback = decision.get("feedback", "").strip() if isinstance(decision, dict) else ""

    if not is_approved:
        if user_feedback:
            return f"Edit REJECTED by user with instructions: '{user_feedback}'. Adjust your patch accordingly."
        return f"Edit REJECTED by user: Permission to modify '{file_path}' was denied."

    # 8. Apply patch
    try:
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(modified)
        msg = f"Successfully patched '{target_path}' (replaced {len(target_content)} chars with {len(replacement_content)} chars)."
        if user_feedback:
            msg += f" (Note from user: '{user_feedback}')"
        return msg
    except Exception as e:
        return f"Error writing patch to '{file_path}': {str(e)}"




@tool
def get_memory(key: str) -> str:
    """
    Retrieve a specific long-term memory or user preference/fact by key from persistent storage (LTM).
    Use this when the user asks about personal details, preferences, habits, food, name, or configuration.
    
    Args:
        key: Memory key name (e.g. 'morning_food', 'name', 'tech_stack', 'breakfast').
    """
    try:
        # ── Level 1: Direct Exact Key Lookup ──
        mem = store.get(USER_NAMESPACE, key)
        if mem and mem.value:
            val = mem.value.get("value", mem.value) if isinstance(mem.value, dict) else mem.value
            return f"Memory found for '{key}': {val}"
        
        # ── Level 2: Partial/Case-insensitive Key Match in Store ──
        all_items = store.search(USER_NAMESPACE, limit=50)
        matches = [m for m in all_items if key.lower() in m.key.lower() or m.key.lower() in key.lower()]
        if matches:
            results = []
            for m in matches:
                v = m.value.get("value", m.value) if isinstance(m.value, dict) else m.value
                results.append(f"- {m.key}: {v}")
            return f"Exact key '{key}' not found, but found related stored memories:\n" + "\n".join(results)
        
        # ── Level 3: Semantic Vector Search Fallback (PGVector 'user_memories') ──
        try:
            from rag.vector_db import memory_vector_db
            vec_matches = memory_vector_db.similarity_search(key, k=2)
            if vec_matches:
                vec_results = [f"- {doc.page_content}" for doc in vec_matches]
                return f"Exact key '{key}' not found, but found semantic match from Vector DB:\n" + "\n".join(vec_results)
        except Exception:
            pass

        # ── Level 4: Agar kahin na mile ──
        all_keys = [m.key for m in all_items]
        if all_keys:
            return f"Memory key '{key}' not found. Available memory keys are: {', '.join(all_keys)}"
        return f"No memory found for key '{key}'. (No custom memories currently saved)."

    except Exception as e:
        return f"Error retrieving memory: {str(e)}"



@tool
def list_memories() -> str:
    """
    List all long-term memories (LTM) and saved facts for the user.
    Use this when the user asks what you remember about them, asks personal questions,
    or asks about preferences, habits, food, what they eat, their name, etc.
    """
    try:
        items = store.search(USER_NAMESPACE, limit=50)
        if not items:
            return "No long-term memories currently saved for the user."
        
        output = ["Saved Long-Term Memories:"]
        for m in items:
            val = m.value.get("value", m.value) if isinstance(m.value, dict) else m.value
            output.append(f"- {m.key}: {val}")
        return "\n".join(output)
    except Exception as e:
        return f"Error listing memories: {str(e)}"





import subprocess

@tool
def run_terminal_command(command: str, working_dir: str = ".") -> str:
    """
    Execute a shell/terminal command on the host system (e.g. git status, npm test, pip list, pytest, dir).
    Use this tool to test code, check git status, install packages, or verify build status.
    
    Args:
        command: The terminal command string to run (e.g., 'git status', 'pytest', 'npm run build').
        working_dir: Relative path from project root (e.g. '.' or 'frontend' or 'backend').
    """
    # 🛑 1. Request Human Approval before running command
    decision = interrupt({
        "action": "run_terminal_command",
        "command": command,
        "working_dir": working_dir
    })

    # 🛑 2. Check user decision and feedback
    is_approved = decision.get("approved", False) if isinstance(decision, dict) else False
    user_feedback = decision.get("feedback", "").strip() if isinstance(decision, dict) else ""

    if not is_approved:
        if user_feedback:
            return f"Command REJECTED by user with instructions: '{user_feedback}'. Please run a different command or change your plan."
        return f"Command REJECTED by user: Execution of '{command}' was cancelled."

    # 3. If approved, execute terminal command
    target_dir = os.path.normpath(os.path.join(PROJECT_ROOT, working_dir))
    if not os.path.exists(target_dir):
        return f"Error: Working directory '{working_dir}' does not exist."

    # Block dangerous destructive commands
    dangerous = ["rmdir /s /q c:\\", "format c:", "del /f /s /q c:\\windows"]
    if any(d in command.lower() for d in dangerous):
        return f"Error: Command '{command}' is blocked for safety."

    try:
        # Execute with 30s timeout
        result = subprocess.run(
            command,
            shell=True,
            cwd=target_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace"
        )
        
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()
        exit_code = result.returncode

        output = [f"Exit Code: {exit_code}"]
        if user_feedback:
            output.append(f"[Note from User: '{user_feedback}']")
        if stdout:
            output.append(f"STDOUT:\n{stdout[:3000]}") # Truncate if too long
        if stderr:
            output.append(f"STDERR:\n{stderr[:1500]}")
        
        if exit_code != 0:
            output.append(
                f"\n🚨 AUTONOMOUS SELF-DEBUGGING TRIGGER:\n"
                f"The command exited with non-zero exit code ({exit_code}). "
                f"Carefully analyze the STDERR and STDOUT above. Locate the file or syntax issue causing the failure. "
                f"Use `read_file` to inspect the code, `write_file` to fix the bug, and re-run the command to verify it succeeds."
            )

        return "\n\n".join(output)

    except subprocess.TimeoutExpired:
        return f"Error: Command '{command}' timed out after 30 seconds."
    except Exception as e:
        return f"Error executing terminal command: {str(e)}"

@tool
def save_memory(key: str, value: str) -> str:
    """
    Save a new piece of long-term memory (LTM), preference, or fact about the user to persistent storage.
    Use this when the user tells you to remember something, update personal information,
    or save a preference for future conversations.
    
    Args:
        key: The memory key name (e.g. 'morning_food', 'preferred_language', 'name').
        value: The information or value to store permanently.
    """
    try:
        store.put(USER_NAMESPACE, key, {"value": value})
        save_semantic_memory(key, value, user_id="1")
        return f"Successfully saved to long-term memory: '{key}' = '{value}'"
    except Exception as e:
        return f"Error saving memory: {str(e)}"


ALL_TOOLS = [
    search_codebase,
    read_file,
    write_file,
    edit_file,
    list_directory,
    execute_python_code,
    get_memory,
    list_memories,
    run_terminal_command,
    save_memory
]


#
#
#