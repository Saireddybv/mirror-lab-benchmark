// Copies every results/*.jsonl into public/data/runs.json so the website can show results and replay runs.
// Transcripts are dropped (replay needs only the tool calls), which keeps the file small.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const dir = "results";
const runs = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
  for (const line of readFileSync(`${dir}/${f}`, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line);
    runs.push({ ...r, transcript: [] });
  }
}
mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/runs.json", JSON.stringify(runs));
const real = runs.filter((r) => !r.model.startsWith("mock/")).length;
console.log(`published ${runs.length} runs (${real} real, ${runs.length - real} scripted) -> public/data/runs.json`);
