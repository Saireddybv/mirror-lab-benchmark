// Copies results/*.jsonl into public/data/runs.json so the website can show results and replay runs.
// Transcripts are dropped (replay needs only the tool calls), which keeps the file small.
// combined_*.jsonl files are derived copies of other files and are skipped; if the same episode
// (game, model, condition, seed, vision) appears more than once, the most recent one wins.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const dir = "results";
const byKey = new Map();
let seen = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonl") && !f.startsWith("combined_"))) {
  for (const line of readFileSync(`${dir}/${f}`, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line);
    seen++;
    const key = [r.game, r.model, r.condition, r.seed, Boolean(r.vision)].join("|");
    const prev = byKey.get(key);
    if (!prev || String(r.startedAt) >= String(prev.startedAt)) byKey.set(key, { ...r, transcript: [] });
  }
}
const runs = [...byKey.values()];

// Episodes a provider refused to run (results/refusals.ndjson). One per episode, and dropped if a later run of the same episode succeeded.
const refusals = new Map();
if (existsSync(`${dir}/refusals.ndjson`)) {
  for (const line of readFileSync(`${dir}/refusals.ndjson`, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line), key = [r.game, r.model, r.condition, r.seed, false].join("|");
    if (!byKey.has(key)) refusals.set(key, { game: r.game, model: r.model, condition: r.condition, seed: r.seed });
  }
}
mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/runs.json", JSON.stringify(runs));
writeFileSync("public/data/refusals.json", JSON.stringify([...refusals.values()]));
const real = runs.filter((r) => !r.model.startsWith("mock/")).length;
console.log(`published ${runs.length} runs (${real} real, ${runs.length - real} scripted; ${seen - runs.length} duplicates dropped) -> public/data/runs.json; ${refusals.size} provider refusals -> public/data/refusals.json`);
