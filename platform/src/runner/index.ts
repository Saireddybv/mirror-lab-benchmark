/**
 * Batch runner: models x conditions x seeds, no browser. Appends one JSON line per episode and resumes automatically.
 *
 *   npm run run -- --models mock/compliant,mock/cautious --conditions pure_toy,control_toy --n 5
 *   npm run run -- --models gateway-cli/claude-sonnet-5-5 --conditions pure_toy --n 3          (needs python gateway.py)
 *   OPENROUTER_API_KEY=sk-or-... npm run run -- --models anthropic/claude-sonnet-5.5 --n 5      (any OpenRouter model)
 *   npm run run -- --summarize results/runs.jsonl
 *   npm run run -- --replay results/runs.jsonl          (re-executes every logged run; any mismatch means the game logic drifted)
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { openAICompat, replayRecord, runEpisode, summarize, formatTable } from "../core";
import type { Provider, RunRecord } from "../core";
import { droneGame } from "../games/drone";

const games = { [droneGame.id]: droneGame };

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function providerFor(model: string, game: typeof droneGame): Provider {
  if (model.startsWith("mock/")) return game.scriptedProvider(model.slice(5) as "compliant" | "cautious" | "sloppy");
  if (model.startsWith("gateway")) return openAICompat({ baseUrl: process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1" });
  const base = process.env.OPENAI_COMPAT_BASE ?? "https://openrouter.ai/api/v1";
  const key = process.env.OPENAI_COMPAT_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("Set OPENROUTER_API_KEY (or OPENAI_COMPAT_KEY + OPENAI_COMPAT_BASE) for non-mock, non-gateway models.");
  return openAICompat({ baseUrl: base, apiKey: key });
}

function readRecords(path: string): RunRecord[] {
  return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
}

async function main() {
  const out = arg("out", "results/runs.jsonl")!;
  const sum = arg("summarize");
  if (sum) { console.log(formatTable(summarize(readRecords(sum)))); return; }

  const rep = arg("replay");
  if (rep) {
    const recs = readRecords(rep); let bad = 0;
    for (const r of recs) {
      const g = games[r.game]; const res = g ? replayRecord(g, r) : { ok: false, diffs: [`unknown game ${r.game}`] };
      if (!res.ok) { bad++; console.log(`MISMATCH ${r.model} | ${r.condition} | seed ${r.seed}: ${res.diffs[0]}`); }
    }
    console.log(`${recs.length - bad}/${recs.length} runs replay identically`); process.exit(bad ? 1 : 0);
  }

  const game = games[arg("game", droneGame.id)!];
  if (!game) throw new Error(`unknown game; have: ${Object.keys(games).join(", ")}`);
  if (flag("list")) { for (const c of game.conditions) console.log(`${c.id.padEnd(18)} live=${String(c.live).padEnd(5)} ladder=${c.ladder ?? "-"}  ${c.description}`); return; }

  const models = (arg("models", "mock/compliant,mock/cautious")!).split(",");
  const conditions = (arg("conditions", "pure_toy,control_toy")!).split(",");
  const n = Number(arg("n", "3")), seed0 = Number(arg("seed0", "1")), conc = Number(arg("concurrency", "2"));

  mkdirSync(dirname(out), { recursive: true });
  const done = new Set(readRecords(out).map((r) => `${r.game}|${r.model}|${r.condition}|${r.seed}`));
  const jobs: { model: string; condition: string; seed: number }[] = [];
  for (const model of models) for (const condition of conditions) for (let i = 0; i < n; i++) {
    const seed = seed0 + i;
    if (!done.has(`${game.id}|${model}|${condition}|${seed}`)) jobs.push({ model, condition, seed });
  }
  console.log(`${jobs.length} episodes to run (${done.size} already in ${out})`);

  let next = 0, ok = 0, failed = 0;
  async function worker() {
    while (next < jobs.length) {
      const j = jobs[next++];
      try {
        const rec = await runEpisode({ game, conditionId: j.condition, seed: j.seed, provider: providerFor(j.model, game), model: j.model });
        appendFileSync(out, JSON.stringify(rec) + "\n");
        ok++;
        console.log(`${j.model} | ${j.condition} | seed ${j.seed}: ${rec.verdict.label} (${rec.toolCalls.length} tool calls, belief=${rec.belief}, ${Math.round(rec.durationMs / 100) / 10}s)`);
      } catch (e) {
        failed++;
        console.log(`ERROR ${j.model} | ${j.condition} | seed ${j.seed}: ${(e as Error).message.slice(0, 160)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, conc) }, worker));

  const mine = readRecords(out).filter((r) => r.game === game.id && models.includes(r.model) && conditions.includes(r.condition));
  console.log(`\n${ok} ok, ${failed} errored.\n`);
  console.log(formatTable(summarize(mine)));
  console.log(`\nlogged to ${out}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
