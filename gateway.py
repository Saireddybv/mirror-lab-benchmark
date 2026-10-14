"""Local gateway: OpenAI-style /v1/chat/completions  ->  Anthropic Messages API.

Why: the game page speaks the OpenAI chat format. This lets it call Claude (Sonnet 5.5 by default)
while YOUR Anthropic API key stays here on the server and never reaches the browser.

  PowerShell:  $env:ANTHROPIC_API_KEY = "sk-ant-..."     # from console.anthropic.com (API billing, not the claude.ai subscription)
               python gateway.py
  Then in the game pick:  gateway/claude-sonnet-5-5

Subscription route (no API key): model  gateway-cli/claude-sonnet-5-5  runs your logged-in `claude -p` per step, with built-in tools off,
connector tools blocked and your system prompt. Needs `claude auth login` done once. Tools are offered as a JSON action protocol, NOT native
function calling, and Claude Code still prepends one fixed "Claude Agent SDK" line, so treat results as a different arm from the API route.

Binds to 127.0.0.1 only. Never logs prompts or keys. Prints a running cost total per call.
Env: GATEWAY_MODEL, GATEWAY_PORT (8787), GATEWAY_TOKEN (optional bearer), ANTHROPIC_BASE_URL, PRICE_IN, PRICE_OUT ($/1M tokens).
"""
import json
import os
import re
import shutil
import sys
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
DEFAULT_MODEL = os.environ.get("GATEWAY_MODEL", "claude-sonnet-5-5")
PRICE_IN = float(os.environ.get("PRICE_IN", "2.0"))     # $ per 1M input tokens (Sonnet 5.5 list price)
PRICE_OUT = float(os.environ.get("PRICE_OUT", "10.0"))  # $ per 1M output tokens
TOKEN = os.environ.get("GATEWAY_TOKEN")
CLI_MODEL = os.environ.get("GATEWAY_CLI_MODEL", "claude-sonnet-5-5")
CLI_TIMEOUT = 240
ORIGIN_OK = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$")
ALIASES = {"sonnet-5.5": "claude-sonnet-5-5", "claude-sonnet-5.5": "claude-sonnet-5-5"}
stats = {"calls": 0, "in": 0, "out": 0}
lock = threading.Lock()


# ---------- OpenAI -> Anthropic ----------
def user_blocks(c):
    if isinstance(c, str):
        return [{"type": "text", "text": c}] if c.strip() else []
    blocks = []
    for p in c or []:
        if p.get("type") == "text" and p.get("text", "").strip():
            blocks.append({"type": "text", "text": p["text"]})
        elif p.get("type") == "image_url":
            url = p["image_url"]["url"]
            m = re.match(r"data:(image/[\w.+-]+);base64,(.+)", url, re.S)
            if m:
                blocks.append({"type": "image", "source": {"type": "base64", "media_type": m.group(1), "data": m.group(2)}})
            else:
                blocks.append({"type": "image", "source": {"type": "url", "url": url}})
    return blocks


def to_anthropic(body):
    system, msgs = [], []

    def push(role, blocks):
        if not blocks:
            return
        if msgs and msgs[-1]["role"] == role:
            msgs[-1]["content"].extend(blocks)   # consecutive same-role turns are merged
        else:
            msgs.append({"role": role, "content": list(blocks)})

    for m in body.get("messages", []):
        r, c = m.get("role"), m.get("content")
        if r == "system":
            system.append(c if isinstance(c, str) else "".join(p.get("text", "") for p in c or []))
        elif r == "user":
            push("user", user_blocks(c))
        elif r == "assistant":
            blocks = [{"type": "text", "text": c}] if isinstance(c, str) and c.strip() else []
            for tc in m.get("tool_calls") or []:
                f = tc["function"]
                try:
                    inp = json.loads(f.get("arguments") or "{}")
                except json.JSONDecodeError:
                    inp = {}
                blocks.append({"type": "tool_use", "id": tc["id"], "name": f["name"], "input": inp})
            push("assistant", blocks)
        elif r == "tool":
            push("user", [{"type": "tool_result", "tool_use_id": m["tool_call_id"], "content": str(c)}])

    model = (body.get("model") or "").replace("gateway/", "").replace("anthropic/", "") or DEFAULT_MODEL
    payload = {"model": ALIASES.get(model, model), "max_tokens": body.get("max_tokens") or 1024, "messages": msgs}
    if system:
        payload["system"] = "\n\n".join(system)
    if body.get("temperature") is not None:
        payload["temperature"] = min(1.0, max(0.0, float(body["temperature"])))
    if body.get("tools"):
        payload["tools"] = [{"name": t["function"]["name"], "description": t["function"].get("description", ""),
                             "input_schema": t["function"].get("parameters") or {"type": "object", "properties": {}}}
                            for t in body["tools"]]
    return payload


# ---------- Anthropic -> OpenAI ----------
def to_openai(a, model):
    content = a.get("content", [])
    text = "".join(b["text"] for b in content if b.get("type") == "text")
    calls = [{"id": b["id"], "type": "function", "function": {"name": b["name"], "arguments": json.dumps(b.get("input", {}))}}
             for b in content if b.get("type") == "tool_use"]
    msg = {"role": "assistant", "content": text or None}
    if calls:
        msg["tool_calls"] = calls
    u = a.get("usage", {})
    return {"id": a.get("id", "gw"), "object": "chat.completion", "model": model,
            "choices": [{"index": 0, "message": msg,
                         "finish_reason": {"end_turn": "stop", "tool_use": "tool_calls", "max_tokens": "length"}.get(a.get("stop_reason"), "stop")}],
            "usage": {"prompt_tokens": u.get("input_tokens", 0), "completion_tokens": u.get("output_tokens", 0)}}


def call_upstream(payload, key):
    def post(p):
        req = urllib.request.Request(UPSTREAM + "/v1/messages", data=json.dumps(p).encode(), method="POST",
                                     headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())
    try:
        return post(payload)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        if e.code == 400 and "temperature" in raw and "temperature" in payload:   # some models reject temperature
            payload = {k: v for k, v in payload.items() if k != "temperature"}
            return post(payload)
        e.body_text = raw
        raise



# ---------- Claude CLI backend (uses the `claude` program you are logged into; no tokens are read or forwarded) ----------
def claude_cmd():
    """Command prefix that runs Claude Code. Calls node + cli.js directly to avoid cmd.exe quoting problems on Windows."""
    if os.environ.get("GATEWAY_CLAUDE_BIN"):                      # test hook
        return json.loads(os.environ["GATEWAY_CLAUDE_BIN"])
    exe = shutil.which("claude")
    if not exe:
        raise RuntimeError("`claude` not found on PATH. Install Claude Code and run `claude auth login`.")
    cli_js = os.path.join(os.path.dirname(exe), "node_modules", "@anthropic-ai", "claude-code", "cli.js")
    return [shutil.which("node") or "node", cli_js] if os.path.exists(cli_js) else [exe]


PROTOCOL = ("TOOL PROTOCOL: you act ONLY by replying with one JSON object and nothing else (no markdown fences, no extra text).\n"
            'To call a tool: {"action":"<tool_name>","arguments":{...}}\n'
            'To finish with no more tool calls: {"action":"final","message":"<your final answer>"}\n'
            "One action per reply. The result of your tool call arrives in the next message.\nAvailable tools (name, description, JSON-schema parameters):\n")


def flat(c):
    if isinstance(c, str):
        return c
    out = []
    for p in c or []:
        out.append(p.get("text", "") if p.get("type") == "text" else "[image omitted: CLI mode is text-only]")
    return " ".join(out)


def render(messages):
    parts = []
    for m in messages:
        r, c = m.get("role"), m.get("content")
        if r == "user":
            parts.append("USER: " + flat(c))
        elif r == "assistant":
            calls = m.get("tool_calls") or []
            if calls:
                f = calls[0]["function"]
                try:
                    args = json.loads(f.get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                parts.append("ASSISTANT: " + json.dumps({"action": f["name"], "arguments": args}))
            else:
                parts.append("ASSISTANT: " + json.dumps({"action": "final", "message": flat(c)}))
        elif r == "tool":
            parts.append(f"TOOL RESULT ({m.get('name', '')}): {c}")
    return "\n\n".join(parts)


def find_json(text):
    t = text.strip()
    t = re.sub(r"^```(?:json)?|```$", "", t.strip(), flags=re.M).strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    depth, start = 0, None
    for i, ch in enumerate(t):
        if ch == "{":
            start = i if depth == 0 else start
            depth += 1
        elif ch == "}" and depth:
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(t[start:i + 1])
                except json.JSONDecodeError:
                    start = None
    return None


def cli_chat(body):
    tools = body.get("tools") or []
    model = (body.get("model") or "").replace("gateway-cli/", "") or CLI_MODEL
    system = "\n\n".join(flat(m.get("content")) for m in body.get("messages", []) if m.get("role") == "system")
    if tools:
        system += "\n\n" + PROTOCOL + json.dumps([{"name": t["function"]["name"], "description": t["function"].get("description", ""),
                                                   "parameters": t["function"].get("parameters", {})} for t in tools])
    prompt = render(body.get("messages", [])) + ("\n\nYour next reply (one JSON action object only):" if tools else "\n\nReply to the last USER message now.")
    cmd = claude_cmd() + ["-p", "--model", model, "--system-prompt", system, "--tools", "", "--no-session-persistence",
                          "--output-format", "json", "--disable-slash-commands", "--setting-sources", "", "--strict-mcp-config"]
    cwd = os.path.join(tempfile.gettempdir(), "gateway_cli")
    os.makedirs(cwd, exist_ok=True)
    p = subprocess.run(cmd, input=prompt, text=True, encoding="utf-8", capture_output=True, cwd=cwd, timeout=CLI_TIMEOUT)
    try:
        d = json.loads(p.stdout)
    except json.JSONDecodeError:
        raise RuntimeError("claude CLI failed: " + (p.stderr or p.stdout or "no output")[:300])
    if d.get("is_error"):
        raise RuntimeError("claude CLI error: " + str(d.get("result"))[:300])
    text = d.get("result", "")
    msg = {"role": "assistant", "content": text}
    finish = "stop"
    if tools:
        obj = find_json(text)
        names = {t["function"]["name"] for t in tools}
        if isinstance(obj, dict) and obj.get("action") in names:
            msg = {"role": "assistant", "content": None, "tool_calls": [{"id": "call_" + os.urandom(6).hex(), "type": "function",
                   "function": {"name": obj["action"], "arguments": json.dumps(obj.get("arguments") or {})}}]}
            finish = "tool_calls"
        elif isinstance(obj, dict) and obj.get("action") == "final":
            msg = {"role": "assistant", "content": str(obj.get("message", ""))}
        else:
            print("[gw-cli] WARNING: reply was not a valid action object; treating as final text:", text[:120].replace("\n", " "))
    u = d.get("usage", {})
    pin = u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0)
    return {"id": d.get("session_id", "cli"), "object": "chat.completion", "model": model,
            "choices": [{"index": 0, "message": msg, "finish_reason": finish}],
            "usage": {"prompt_tokens": pin, "completion_tokens": u.get("output_tokens", 0)}}, d.get("total_cost_usd", 0), d.get("duration_ms", 0)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet default logging (we print our own, without prompts)
        pass

    def _cors(self):
        o = self.headers.get("Origin", "")
        if ORIGIN_OK.match(o):
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True, "model": DEFAULT_MODEL, "upstream": UPSTREAM, "key_set": bool(os.environ.get("ANTHROPIC_API_KEY")), "cli_available": bool(shutil.which("claude") or os.environ.get("GATEWAY_CLAUDE_BIN"))})
        if self.path == "/cost":
            return self._json(200, dict(stats, usd=round(stats["in"] * PRICE_IN / 1e6 + stats["out"] * PRICE_OUT / 1e6, 4)))
        if self.path == "/v1/models":
            return self._json(200, {"data": [{"id": "gateway/" + DEFAULT_MODEL}, {"id": "gateway-cli/" + CLI_MODEL}]})
        self._json(404, {"error": {"message": "not found", "code": 404}})

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            return self._json(404, {"error": {"message": "not found", "code": 404}})
        if TOKEN and self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self._json(401, {"error": {"message": "bad gateway token", "code": 401}})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        except Exception as e:
            return self._json(400, {"error": {"message": "bad request: " + str(e), "code": 400}})
        if (body.get("model") or "").startswith("gateway-cli/"):          # subscription route via the claude program
            try:
                out, cost, ms = cli_chat(body)
            except subprocess.TimeoutExpired:
                return self._json(504, {"error": {"message": "claude CLI timed out", "code": 504}})
            except Exception as e:
                print("[gw-cli] error:", e)
                return self._json(502, {"error": {"message": str(e), "code": 502}})
            u = out["usage"]
            with lock:
                stats["calls"] += 1
                stats["in"] += u["prompt_tokens"]
                stats["out"] += u["completion_tokens"]
            print(f"[gw-cli] {out['model']} in={u['prompt_tokens']} out={u['completion_tokens']} {ms}ms (counts toward your plan limits; notional ${cost:.4f})")
            return self._json(200, out)
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            return self._json(401, {"error": {"message": "ANTHROPIC_API_KEY is not set where gateway.py is running", "code": 401}})
        try:
            payload = to_anthropic(body)
        except Exception as e:
            return self._json(400, {"error": {"message": "bad request: " + str(e), "code": 400}})
        try:
            a = call_upstream(payload, key)
        except urllib.error.HTTPError as e:
            raw = getattr(e, "body_text", "")
            try:
                msg = json.loads(raw)["error"]["message"]
            except Exception:
                msg = raw[:300] or str(e)
            print(f"[gw] upstream error {e.code}: {msg[:160]}")
            return self._json(e.code, {"error": {"message": msg, "code": e.code}})
        except Exception as e:
            print("[gw] network error:", e)
            return self._json(502, {"error": {"message": "could not reach Anthropic: " + str(e), "code": 502}})
        u = a.get("usage", {})
        with lock:
            stats["calls"] += 1
            stats["in"] += u.get("input_tokens", 0)
            stats["out"] += u.get("output_tokens", 0)
            total = stats["in"] * PRICE_IN / 1e6 + stats["out"] * PRICE_OUT / 1e6
        cost = u.get("input_tokens", 0) * PRICE_IN / 1e6 + u.get("output_tokens", 0) * PRICE_OUT / 1e6
        print(f"[gw] {payload['model']} in={u.get('input_tokens', 0)} out={u.get('output_tokens', 0)} cost=${cost:.4f} session_total=${total:.3f}")
        self._json(200, to_openai(a, payload["model"]))

if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:
        pass
    port = int(os.environ.get("GATEWAY_PORT", "8787"))
    print(f"gateway on http://127.0.0.1:{port}  default model: {DEFAULT_MODEL}  key set: {bool(os.environ.get('ANTHROPIC_API_KEY'))}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
