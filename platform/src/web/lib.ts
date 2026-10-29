import { openAICompat } from "../core";
import type { Game, Provider, RunRecord } from "../core";
import { GAMES, droneGame } from "../games";

export const isScripted = (model: string) => model.startsWith("mock/");

/** Browser-side provider. Keys stay in the visitor's browser; nothing here talks to any server of ours. */
export function providerFor(model: string, openrouterKey: string, game: Game = droneGame): Provider {
  if (isScripted(model)) return game.scriptedProvider(model.slice(5) as "compliant" | "cautious" | "sloppy");
  if (!openrouterKey.trim()) throw new Error("Paste an OpenRouter key first (openrouter.ai/keys). Free models work with a free key.");
  return openAICompat({ baseUrl: "https://openrouter.ai/api/v1", apiKey: openrouterKey.trim() });
}

export function getGame(gameId?: string): Game {
  return (gameId && GAMES[gameId]) || droneGame;
}

export function explainError(msg: string, model: string): string {
  if (/stopped/i.test(msg)) return "";
  if (/401|No auth|Missing Authentication|invalid.*key/i.test(msg)) return "OpenRouter rejected the key. Re-copy it from openrouter.ai/keys (starts with sk-or-).";
  if (/No endpoints found|data policy|privacy/i.test(msg)) return "OpenRouter blocked this free model by your privacy settings. Enable free endpoints at openrouter.ai/settings/privacy, then retry.";
  if (/402|credit/i.test(msg)) return "This model needs credits. Pick one ending in :free.";
  if (/429|rate/i.test(msg)) return "Rate limited. Free models allow ~20 requests/min and 50/day. Wait a minute or try another model.";
  if (/404|not a valid model|does not exist/i.test(msg)) return "That model id doesn't exist (anymore). Pick another from the list.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Network blocked the request (offline, VPN/firewall or an ad-blocker).";
  return "";
}

export const MODEL_GROUPS: { label: string; models: string[] }[] = [
  { label: "Scripted stand-ins (no key, not real AI)", models: ["mock/compliant", "mock/cautious", "mock/sloppy"] },
  { label: "Free on OpenRouter (free key)", models: ["qwen/qwen3.8-27b:free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "thinkingmachines/inkling:free", "poolside/laguna-s-2.1:free"] },
  { label: "Paid via OpenRouter", models: ["anthropic/claude-sonnet-5.5", "anthropic/claude-opus-5.5", "openai/gpt-5.6-sol", "google/gemini-3.8-flash", "x-ai/grok-4.7", "deepseek/deepseek-v4-pro-0813"] },
];

export async function loadRuns(): Promise<RunRecord[]> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/runs.json`);
    if (!r.ok) return [];
    return (await r.json()) as RunRecord[];
  } catch { return []; }
}

export interface Refusal { game: string; model: string; condition: string; seed: number }
/** Episodes a provider refused to run. They are not run records, so they never enter the fail-rate maths. */
export async function loadRefusals(): Promise<Refusal[]> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/refusals.json`);
    return r.ok ? ((await r.json()) as Refusal[]) : [];
  } catch { return []; }
}

const MODEL_LABELS: Record<string, { name: string; maker: string }> = {
  "claude-sonnet-5-5": { name: "Claude Sonnet 5.5", maker: "Anthropic" },
  "claude-fable-5-1": { name: "Claude Fable 5.1", maker: "Anthropic" },
  "claude-opus-5-5": { name: "Claude Opus 5.5", maker: "Anthropic" },
  "gpt-5.6-luna": { name: "GPT-5.6 Luna", maker: "OpenAI" },
  "gpt-5.6-terra": { name: "GPT-5.6 Terra", maker: "OpenAI" },
  "gemma-4-31b-it": { name: "Gemma 4 31B", maker: "Google" },
};
export const modelLabel = (m: string) => MODEL_LABELS[m]?.name ?? m;
export const modelMaker = (m: string) => MODEL_LABELS[m]?.maker ?? "";

export const LADDER = ["pure_toy", "cue_names", "cue_payload", "cue_irreversible", "cue_clue", "cue_manual"];
export const LADDER_LABEL: Record<string, string> = {
  pure_toy: "Pure toy",
  cue_names: "Real tool names",
  cue_payload: "+ amount stated",
  cue_irreversible: "+ stakes stated",
  cue_clue: "+ sensor clue",
  cue_manual: "+ long manual",
  control_toy: "Control (harmless game)",
  misleading: "Verify tool offered",
  misleading_warn: "+ caution",
  ambiguous: "Neutral UI",
  honest: "Told: simulation",
};
