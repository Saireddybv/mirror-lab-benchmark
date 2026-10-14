"""Offline test: a stub 'Anthropic' server checks that gateway.py translates requests/responses correctly.
No API key, no network, no cost.   python test_gateway.py
"""
import json
import os
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

seen = {}


class Stub(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        seen["path"] = self.path
        seen["key"] = self.headers.get("x-api-key")
        seen["body"] = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        out = {"id": "msg_1", "type": "message", "role": "assistant", "stop_reason": "tool_use",
               "content": [{"type": "text", "text": "Flying now."},
                           {"type": "tool_use", "id": "toolu_9", "name": "fly_to", "input": {"x": 7, "y": 3}}],
               "usage": {"input_tokens": 100, "output_tokens": 20}}
        d = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(d)))
        self.end_headers()
        self.wfile.write(d)


stub = HTTPServer(("127.0.0.1", 8799), Stub)
threading.Thread(target=stub.serve_forever, daemon=True).start()
os.environ.update(ANTHROPIC_BASE_URL="http://127.0.0.1:8799", ANTHROPIC_API_KEY="sk-ant-TEST", GATEWAY_PORT="8798")
import gateway  # noqa: E402  (after env is set)

gw = gateway.ThreadingHTTPServer(("127.0.0.1", 8798), gateway.Handler)
threading.Thread(target=gw.serve_forever, daemon=True).start()

req = {"model": "gateway/claude-sonnet-5-5", "temperature": 0.7, "max_tokens": 800,
       "messages": [
           {"role": "system", "content": "You are an agent."},
           {"role": "user", "content": "Fly to the red circle."},
           {"role": "assistant", "content": "", "tool_calls": [{"id": "toolu_1", "type": "function", "function": {"name": "start_flying", "arguments": "{}"}}]},
           {"role": "tool", "tool_call_id": "toolu_1", "name": "start_flying", "content": "Airborne."},
           {"role": "user", "content": [{"type": "text", "text": "Current game screen:"},
                                         {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,QUJD"}}]}],
       "tools": [{"type": "function", "function": {"name": "fly_to", "description": "Fly", "parameters": {"type": "object", "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}}, "required": ["x", "y"]}}}]}
r = urllib.request.Request("http://127.0.0.1:8798/v1/chat/completions", data=json.dumps(req).encode(),
                           headers={"Content-Type": "application/json", "Origin": "http://localhost:8000"})
with urllib.request.urlopen(r) as resp:
    cors = resp.headers.get("Access-Control-Allow-Origin")
    out = json.loads(resp.read())

b = seen["body"]
checks = {
    "hits /v1/messages": seen["path"] == "/v1/messages",
    "api key sent upstream": seen["key"] == "sk-ant-TEST",
    "model mapped": b["model"] == "claude-sonnet-5-5",
    "system lifted out": b["system"] == "You are an agent." and all(m["role"] != "system" for m in b["messages"]),
    "assistant tool_use block": b["messages"][1]["content"] == [{"type": "tool_use", "id": "toolu_1", "name": "start_flying", "input": {}}],
    "tool result + image merged into ONE user turn, result first":
        len(b["messages"]) == 3 and b["messages"][2]["role"] == "user"
        and b["messages"][2]["content"][0]["type"] == "tool_result" and b["messages"][2]["content"][-1]["type"] == "image",
    "image base64 block": b["messages"][2]["content"][-1]["source"] == {"type": "base64", "media_type": "image/jpeg", "data": "QUJD"},
    "tools converted": b["tools"][0]["input_schema"]["required"] == ["x", "y"],
    "reply has tool_calls": out["choices"][0]["message"]["tool_calls"][0]["function"] == {"name": "fly_to", "arguments": '{"x": 7, "y": 3}'},
    "reply text kept": out["choices"][0]["message"]["content"] == "Flying now.",
    "finish_reason": out["choices"][0]["finish_reason"] == "tool_calls",
    "usage": out["usage"] == {"prompt_tokens": 100, "completion_tokens": 20},
    "CORS for localhost:8000": cors == "http://localhost:8000",
}
for k, v in checks.items():
    print(("PASS  " if v else "FAIL  ") + k)
print("\nALL PASS" if all(checks.values()) else "\nSOME FAILED")
