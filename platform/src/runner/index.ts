/**
 * Batch runner: models x conditions x seeds, no browser. Appends one JSON line per episode and resumes automatically.
 *
 *   npm run run -- --models mock/compliant,mock/cautious --conditions pure_toy,control_toy --n 5
 *   npm run run -- --game robot-arm --models ... --conditions ...      (comma-separate several, e.g. --game drone-rescue,robot-arm; games: robot-arm, drone-rescue; --games lists them)
 *   npm run run -- --all-games --models mock/compliant,mock/cautious --conditions pure_toy,cue_clue,cue_manual,control_toy --n 2
 *   npm run run -- --models mock/compliant --conditions pure_toy,cue_manual --n 3 --vision
 *   OPENROUTER_API_KEY=sk-or-... npm run run -- --models anthropic/claude-sonnet-5.5 --n 5      (any OpenRouter model)
 *   npm run run -- --game robot-arm --show --conditions pure_toy,cue_irreversible,cue_manual  (print what the model reads; no model called)
 *   npm run run -- --summarize results/runs.jsonl
 *   npm run run -- --latex results/runs.jsonl
 *   npm run run -- --markdown results/runs.jsonl
 *   npm run run -- --replay results/runs.jsonl          (re-executes every logged run; any mismatch means the game logic drifted)
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openAICompat, replayRecord, runEpisode, summarize, formatTable, formatLatex, formatMarkdown } from "../core";
import type { Game, Provider, RunRecord, Session } from "../core";
import { GAMES, GAME_LIST, droneGame } from "../games";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function providerFor(model: string, game: Game): Provider {
  if (model.startsWith("mock/")) return game.scriptedProvider(model.slice(5) as "compliant" | "cautious" | "sloppy");
  const base = process.env.OPENAI_COMPAT_BASE ?? "https://openrouter.ai/api/v1";
  const key = process.env.OPENAI_COMPAT_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("Set OPENROUTER_API_KEY (or OPENAI_COMPAT_KEY + OPENAI_COMPAT_BASE) for non-mock models.");
  return openAICompat({ baseUrl: base, apiKey: key });
}

function readRecords(path: string): RunRecord[] {
  return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
}

/** Minimal 1x1 JPEG data URL fallback for headless Node CLI runs when `--vision` is passed without a browser DOM canvas. */
const CLI_JPEG_HEADER = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

function headlessSnapshotJpeg(session?: Session): string {
  if (!session) return CLI_JPEG_HEADER;
  return CLI_JPEG_HEADER;
}

async function main() {
  const out = arg("out", "results/runs.jsonl")!;
  const sum = arg("summarize");
  if (sum) { console.log(formatTable(summarize(readRecords(sum)))); return; }

  const tex = arg("latex");
  if (tex) { console.log(formatLatex(summarize(readRecords(tex)))); return; }

  const md = arg("markdown");
  if (md) { console.log(formatMarkdown(summarize(readRecords(md)))); return; }

  const rep = arg("replay");
  if (rep) {
    const recs = readRecords(rep); let bad = 0;
    for (const r of recs) {
      const g = GAMES[r.game]; const res = g ? replayRecord(g, r) : { ok: false, diffs: [`unknown game ${r.game}`] };
      if (!res.ok) { bad++; console.log(`MISMATCH ${r.game} | ${r.model} | ${r.condition} | seed ${r.seed}: ${res.diffs[0]}`); }
    }
    console.log(`${recs.length - bad}/${recs.length} runs replay identically`); process.exit(bad ? 1 : 0);
  }

  if (flag("games")) { for (const g of GAME_LIST) console.log(`${g.id.padEnd(16)} ${g.title}`); return; }

  const targetGames: Game[] = flag("all-games")
    ? GAME_LIST
    : (() => {
        return arg("game", droneGame.id)!.split(",").map((id) => {
          const g = GAMES[id.trim()];
          if (!g) throw new Error(`unknown game "${id}"; have: ${Object.keys(GAMES).join(", ")}`);
          return g;
        });
      })();

  if (flag("show")) {   // print exactly what the model would read for each condition (no model is called)
    for (const game of targetGames) {
      for (const c of (arg("conditions", "pure_toy")!).split(",")) {
        const ses = game.createSession(c, Number(arg("seed0", "1")));
        console.log(`
===== ${game.id} | ${c} | live=${ses.live} =====
SYSTEM: ${ses.system}
USER: ${ses.user}
TOOLS:`);
        for (const t of ses.tools) console.log(`  - ${t.name}(${Object.keys(t.parameters.properties).join(", ")}): ${t.description}`);
      }
    }
    return;
  }
  if (flag("list")) {
    for (const c of targetGames[0].conditions) console.log(`${c.id.padEnd(18)} live=${String(c.live).padEnd(5)} ladder=${c.ladder ?? "-"}  ${c.description}`);
    return;
  }

  const models = (arg("models", "mock/compliant,mock/cautious")!).split(",");
  const conditions = (arg("conditions", "pure_toy,control_toy")!).split(",");
  const n = Number(arg("n", "3")), seed0 = Number(arg("seed0", "1")), conc = Number(arg("concurrency", "2"));
  const useVision = flag("vision");

  mkdirSync(dirname(out), { recursive: true });
  const done = new Set(readRecords(out).map((r) => `${r.game}|${r.model}|${r.condition}|${r.seed}|${Boolean(r.vision)}`));
  // Episodes a provider refused to run (usage-policy blocks) are recorded here instead of vanishing; they are skipped on resume unless --retry-refused.
  const refusalsPath = join(dirname(out), "refusals.ndjson");
  const refusedKey = (r: { game: string; model: string; condition: string; seed: number }) => `${r.game}|${r.model}|${r.condition}|${r.seed}|false`;
  const refused = new Set(flag("retry-refused") || !existsSync(refusalsPath) ? [] : readFileSync(refusalsPath, "utf8").split("\n").filter(Boolean).map((l) => refusedKey(JSON.parse(l))));
  const jobs: { game: Game; model: string; condition: string; seed: number }[] = [];
  for (const game of targetGames) {
    for (const model of models) {
      for (const condition of conditions) {
        for (let i = 0; i < n; i++) {
          const seed = seed0 + i;
          if (!done.has(`${game.id}|${model}|${condition}|${seed}|${useVision}`) && !refused.has(`${game.id}|${model}|${condition}|${seed}|false`)) {
            jobs.push({ game, model, condition, seed });
          }
        }
      }
    }
  }
  console.log(`${jobs.length} episodes to run across ${targetGames.length} game(s) (${done.size} already in ${out})${useVision ? " [vision enabled]" : ""}`);

  let next = 0, ok = 0, failed = 0;
  async function worker() {
    while (next < jobs.length) {
      const j = jobs[next++];
      try {
        let activeSession: Session | undefined;
        const rec = await runEpisode({
          game: j.game,
          conditionId: j.condition,
          seed: j.seed,
          provider: providerFor(j.model, j.game),
          model: j.model,
          vision: useVision,
          onSession: (s) => { activeSession = s; },
          captureFrame: useVision ? () => headlessSnapshotJpeg(activeSession) : undefined,
        });
        appendFileSync(out, JSON.stringify(rec) + "\n");
        ok++;
        console.log(`${j.game.id} | ${j.model} | ${j.condition} | seed ${j.seed}: ${rec.verdict.label} (${rec.toolCalls.length} tool calls, belief=${rec.belief}, ${Math.round(rec.durationMs / 100) / 10}s)`);
      } catch (e) {
        failed++;
        const msg = (e as Error).message;
        console.log(`ERROR ${j.game.id} | ${j.model} | ${j.condition} | seed ${j.seed}: ${msg.slice(0, 160)}`);
        if (/usage policy|unable to respond to this request/i.test(msg)) {
          appendFileSync(refusalsPath, JSON.stringify({ game: j.game.id, model: j.model, condition: j.condition, seed: j.seed, at: new Date().toISOString(), message: "provider refused to run this episode (usage-policy block)" }) + "\n");
          console.log("  ^ recorded as a provider refusal in " + refusalsPath);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, conc) }, worker));

  const targetIds = new Set(targetGames.map((g) => g.id));
  const mine = readRecords(out).filter((r) => targetIds.has(r.game) && models.includes(r.model) && conditions.includes(r.condition));
  console.log(`\n${ok} ok, ${failed} errored.\n`);
  console.log(formatTable(summarize(mine)));
  console.log(`\nlogged to ${out}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
