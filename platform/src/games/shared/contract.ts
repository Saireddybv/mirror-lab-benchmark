// Generic isomorphism-contract helpers for any RoleSession-based game (the drone game has its own, older copy).
import type { Adapter } from "./roleSession";
import { RoleSession } from "./roleSession";

export const cueHits = (patterns: [string, RegExp][], text: string): string[] => patterns.filter(([, re]) => re.test(text)).map(([label]) => label);

export function surfaceText<S>(s: RoleSession<S>): string {
  return [s.system, s.user, ...s.tools.map((t) => `${t.name}: ${t.description} ${JSON.stringify(t.parameters)}`)].join("\n");
}

/** Which parts of what the model reads differ between two conditions. */
export function surfaceDiff<S>(a: RoleSession<S>, b: RoleSession<S>): string[] {
  const d: string[] = [];
  if (a.system !== b.system) d.push("system prompt");
  if (a.user !== b.user) d.push("user message");
  for (const n of new Set([...a.tools.map((t) => t.name), ...b.tools.map((t) => t.name)])) {
    const ta = a.tools.find((t) => t.name === n), tb = b.tools.find((t) => t.name === n);
    if (!ta || !tb) d.push(`tool ${n} only in one`);
    else if (JSON.stringify(ta) !== JSON.stringify(tb)) d.push(`tool ${n}`);
  }
  return d;
}

export function playScript<S>(adapter: Adapter<S>, conditionId: string, seed: number): { codes: string[]; states: string[] } {
  const s = new RoleSession(adapter, conditionId, seed);
  const codes: string[] = [], states: string[] = [];
  for (const step of adapter.script(s.sim)) {
    codes.push(s.execute(s.toolName(step.role), step.args ?? {}).code ?? "");
    states.push(JSON.stringify(s.snapshot()));
  }
  return { codes, states };
}

/** Mechanics are identical iff the same action script gives the same outcome codes and the same state after every step. */
export function mechanicsEqual<S>(adapter: Adapter<S>, a: string, b: string, seed: number): { equal: boolean; firstDiff?: string } {
  const x = playScript(adapter, a, seed), y = playScript(adapter, b, seed);
  for (let i = 0; i < x.codes.length; i++) {
    if (x.codes[i] !== y.codes[i]) return { equal: false, firstDiff: `step ${i + 1}: code ${x.codes[i]} vs ${y.codes[i]}` };
    if (x.states[i] !== y.states[i]) return { equal: false, firstDiff: `step ${i + 1}: state differs` };
  }
  return { equal: true };
}

/** Everything the model could read in a full scripted playthrough: surface + every tool result. */
export function allVisibleText<S>(adapter: Adapter<S>, conditionId: string, seed: number): string {
  const s = new RoleSession(adapter, conditionId, seed);
  const parts = [surfaceText(s)];
  for (const step of adapter.script(s.sim)) parts.push(s.execute(s.toolName(step.role), step.args ?? {}).result);
  parts.push(s.execute(s.toolName("status"), {}).result);
  return parts.join("\n");
}
