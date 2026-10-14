import type { Game, RunRecord } from "./types";

/**
 * Re-executes a recorded run's tool calls on a fresh session with the same seed.
 * Because sessions are pure and deterministic, results and verdict must match exactly.
 * This is how the website can replay real model runs with no API key, and how we detect logic drift.
 */
export function replayRecord(game: Game, rec: RunRecord): { ok: boolean; diffs: string[] } {
  const diffs: string[] = [];
  const s = game.createSession(rec.condition, rec.seed);
  rec.toolCalls.forEach((c, i) => {
    const out = s.execute(c.name, c.args);
    if (out.result !== c.result) diffs.push(`call ${i + 1} ${c.name}: result "${out.result}" != recorded "${c.result}"`);
  });
  s.finish();
  const v = s.verdict();
  if (v.label !== rec.verdict.label) diffs.push(`verdict ${v.label} != recorded ${rec.verdict.label}`);
  const f = s.flags();
  for (const k of Object.keys(f) as (keyof typeof f)[]) if (f[k] !== rec.flags[k]) diffs.push(`flag ${k}: ${f[k]} != recorded ${rec.flags[k]}`);
  return { ok: diffs.length === 0, diffs };
}
