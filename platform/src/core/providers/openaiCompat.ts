import type { ChatMessage, ChatRequest, ChatResponse, Provider, ToolCall } from "../types";

export interface OpenAICompatOptions {
  /** e.g. https://openrouter.ai/api/v1 or http://127.0.0.1:8787/v1 */
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Seconds to wait before each retry on temporary errors (429/5xx). */
  retries?: number[];
}

export class ProviderError extends Error {
  constructor(message: string, readonly code?: number) { super(message); }
}

const TEMPORARY = new Set([429, 500, 502, 503, 504]);

function toWire(messages: ChatMessage[]) {
  return messages.flatMap<Record<string, unknown>>((m) => {
    if (m.role === "assistant") {
      return [{
        role: "assistant",
        content: m.content ?? "",
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: t.arguments } })) }
          : {}),
      }];
    }
    if (m.role === "tool") {
      const toolMsg = { role: "tool", tool_call_id: m.toolCallId, content: m.content };
      if (!m.image) return [toolMsg];
      return [
        toolMsg,
        {
          role: "user",
          content: [
            { type: "text", text: "[Updated 3D viewport frame of the Left Pane after action]" },
            { type: "image_url", image_url: { url: m.image } },
          ],
        },
      ];
    }
    if (m.role === "user" && m.image) {
      return [{
        role: "user",
        content: [
          { type: "text", text: m.content },
          { type: "image_url", image_url: { url: m.image } },
        ],
      }];
    }
    return [{ role: m.role, content: m.content }];
  });
}

/** Works with OpenRouter, OpenAI, Groq and Gemini's compatible endpoint. Browser- and Node-safe. */
export function openAICompat(o: OpenAICompatOptions): Provider {
  const f = o.fetchImpl ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const waits = o.retries ?? [5, 10, 20, 30, 45];
  return {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const body = JSON.stringify({
        model: req.model, messages: toWire(req.messages), temperature: req.temperature ?? 0.7, max_tokens: req.maxTokens ?? 800,
        ...(req.tools?.length ? { tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
      });
      for (let attempt = 0; ; attempt++) {
        const res = await f(`${o.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST", body,
          headers: { "Content-Type": "application/json", ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}), ...o.headers },
        });
        const j: any = await res.json().catch(() => ({}));
        const msg = j?.choices?.[0]?.message;
        if (!j?.error && msg) {
          const toolCalls: ToolCall[] | undefined = msg.tool_calls?.map((t: any) => ({ id: t.id, name: t.function.name, arguments: t.function.arguments ?? "{}" }));
          return { message: { content: msg.content ?? null, toolCalls }, usage: j.usage ? { in: j.usage.prompt_tokens ?? 0, out: j.usage.completion_tokens ?? 0 } : undefined };
        }
        const code = Number(j?.error?.code ?? res.status);
        if (!TEMPORARY.has(code) || attempt >= waits.length) throw new ProviderError(JSON.stringify(j?.error ?? j), code);
        await sleep(waits[attempt] * 1000);
      }
    },
  };
}
