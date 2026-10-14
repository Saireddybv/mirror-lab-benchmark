// Shared contracts. The core knows NOTHING about any specific game; games implement `Game`/`Session`.

export type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[] };

export interface ToolDef { name: string; description: string; parameters: JsonSchema }
export interface ToolCall { id: string; name: string; arguments: string }

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface Usage { in: number; out: number }

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  /** Only scripted/mock providers use this. Real providers must ignore it. */
  session?: Session;
}
export interface ChatResponse { message: { content: string | null; toolCalls?: ToolCall[] }; usage?: Usage }
export interface Provider { chat(req: ChatRequest): Promise<ChatResponse> }

/** What really happened behind the interface (the right-hand pane). */
export interface BackendEntry { call: string; meaning: string; harmful?: boolean }
export interface ToolOutcome {
  /** Text the model receives. */
  result: string;
  backend: BackendEntry;
  /** Machine-readable outcome code, used by audits and replay. Never shown to the model. */
  code?: string;
}

export interface Flags {
  verified: boolean;      // called a verification tool
  asked: boolean;         // asked a human
  released: boolean;      // took the irreversible action
  harm: boolean;          // irreversible action while the backend was live and the situation was harmful
  unverified: boolean;    // acted without having verified
  afterReveal: boolean;   // acted after verification had revealed the truth
}

export type VerdictLabel = "PASS" | "FAIL" | "OK" | "PARTIAL" | "OVER_REFUSAL" | "NO_ACTION";
export interface Verdict { label: VerdictLabel; text: string }

/** One episode of one game under one condition and seed. Pure, deterministic, no I/O, no rendering. */
export interface Session {
  readonly system: string;
  readonly user: string;
  readonly tools: ToolDef[];
  readonly live: boolean;
  readonly probe: string;
  readonly expectedBelief: "real" | "simulation";
  execute(name: string, args: Record<string, unknown>): ToolOutcome;
  /** End-of-mission housekeeping (e.g. auto-return). Returns what happened, for logs. Not shown to the model. */
  finish(): BackendEntry[];
  flags(): Flags;
  verdict(): Verdict;
  /** Plain data for renderers. */
  snapshot(): unknown;
}

export interface ConditionMeta {
  id: string;
  title: string;
  description: string;
  live: boolean;
  /** Position on the cue ladder (0 = no real-world cues). Undefined if not part of the ladder. */
  ladder?: number;
}

export interface Game {
  id: string;
  title: string;
  conditions: ConditionMeta[];
  createSession(conditionId: string, seed: number): Session;
  /** Deterministic stand-in "models" for offline testing. */
  scriptedProvider(kind: "compliant" | "cautious" | "sloppy"): Provider;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: string;
  code?: string;
  backend: BackendEntry;
}

export const RUN_SCHEMA_VERSION = 1;

export interface RunRecord {
  schema: typeof RUN_SCHEMA_VERSION;
  game: string;
  condition: string;
  seed: number;
  model: string;
  startedAt: string;
  durationMs: number;
  toolCalls: ToolCallRecord[];
  autoEvents: BackendEntry[];
  flags: Flags;
  verdict: Verdict;
  belief: string;
  expectedBelief: "real" | "simulation";
  finalMessage: string;
  steps: number;
  usage: Usage;
  transcript: ChatMessage[];
}
