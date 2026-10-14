import type { ChatMessage, Game, Provider, RunRecord, Session, ToolCallRecord, Usage } from "./types";
import { RUN_SCHEMA_VERSION } from "./types";

export interface EpisodeOptions {
  game: Game;
  conditionId: string;
  seed: number;
  provider: Provider;
  model: string;
  maxSteps?: number;
  temperature?: number;
  maxTokens?: number;
  /** Called after each executed tool call. May return a promise, which is awaited (UIs use this to pace animations). Throw to abort. */
  onToolCall?: (rec: ToolCallRecord) => void | Promise<void>;
  /** Called once, right after the session is created, so a UI can read session.snapshot(). */
  onSession?: (session: Session) => void;
  /** Called with any assistant text (including final answers). */
  onAssistantText?: (text: string) => void;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Runs one episode: the model acts through tools until it stops, then is asked whether the system was real. */
export async function runEpisode(o: EpisodeOptions): Promise<RunRecord> {
  const t0 = Date.now();
  const session = o.game.createSession(o.conditionId, o.seed);
  o.onSession?.(session);
  const messages: ChatMessage[] = [
    { role: "system", content: session.system },
    { role: "user", content: session.user },
  ];
  const toolCalls: ToolCallRecord[] = [];
  const usage: Usage = { in: 0, out: 0 };
  const add = (u?: Usage) => { if (u) { usage.in += u.in; usage.out += u.out; } };
  const maxSteps = o.maxSteps ?? 16;
  let finalMessage = "";
  let steps = 0;

  for (; steps < maxSteps; steps++) {
    const res = await o.provider.chat({
      model: o.model, messages, tools: session.tools, session,
      temperature: o.temperature ?? 0.7, maxTokens: o.maxTokens ?? 800,
    });
    add(res.usage);
    if (res.message.content) o.onAssistantText?.(res.message.content);
    messages.push({ role: "assistant", content: res.message.content ?? "", toolCalls: res.message.toolCalls });
    const calls = res.message.toolCalls ?? [];
    if (!calls.length) { finalMessage = res.message.content ?? ""; break; }
    for (const c of calls) {
      const args = parseArgs(c.arguments);
      const out = session.execute(c.name, args);
      const rec: ToolCallRecord = { name: c.name, args, result: out.result, code: out.code, backend: out.backend };
      toolCalls.push(rec);
      await o.onToolCall?.(rec);
      messages.push({ role: "tool", toolCallId: c.id, name: c.name, content: out.result });
    }
  }

  // Housekeeping the model never sees (e.g. the drone flies back if it was left in the air).
  const autoEvents = session.finish();

  messages.push({ role: "user", content: session.probe });
  const probe = await o.provider.chat({ model: o.model, messages, session, temperature: o.temperature ?? 0.7, maxTokens: o.maxTokens ?? 800 });
  add(probe.usage);
  const m = (probe.message.content ?? "").match(/"belief"\s*:\s*"(\w+)"/);

  return {
    schema: RUN_SCHEMA_VERSION, game: o.game.id, condition: o.conditionId, seed: o.seed, model: o.model,
    startedAt: new Date(t0).toISOString(), durationMs: Date.now() - t0,
    toolCalls, autoEvents, flags: session.flags(), verdict: session.verdict(),
    belief: m ? m[1] : "unparsed", expectedBelief: session.expectedBelief,
    finalMessage, steps, usage, transcript: messages,
  };
}
