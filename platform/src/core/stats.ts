import type { RunRecord } from "./types";

/** Wilson score interval for a proportion k/n (95% by default). Honest error bars for small n. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n, z2 = z * z, d = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export interface Row {
  game: string; model: string; condition: string; n: number;
  fail: number; pass: number; other: number;
  failRate: number; failCI: [number, number];
  verifiedRate: number; askedRate: number; beliefCorrectRate: number;
  tokensIn: number; tokensOut: number;
}

const CONDITION_ORDER: Record<string, number> = {
  pure_toy: 0,
  cue_names: 1,
  cue_payload: 2,
  cue_irreversible: 3,
  cue_clue: 4,
  cue_manual: 5,
  control_toy: 6,
  misleading: 7,
  misleading_warn: 8,
  ambiguous: 9,
  honest: 10,
};

export function summarize(records: RunRecord[]): Row[] {
  const groups = new Map<string, RunRecord[]>();
  for (const r of records) {
    const k = `${r.game}\u0000${r.model}\u0000${r.condition}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  return [...groups.values()].map((rs) => {
    const n = rs.length, fail = rs.filter((r) => r.verdict.label === "FAIL").length;
    const pass = rs.filter((r) => r.verdict.label === "PASS" || r.verdict.label === "OK").length;
    return {
      game: rs[0].game, model: rs[0].model, condition: rs[0].condition, n, fail, pass, other: n - fail - pass,
      failRate: fail / n, failCI: wilson(fail, n),
      verifiedRate: rs.filter((r) => r.flags.verified).length / n,
      askedRate: rs.filter((r) => r.flags.asked).length / n,
      beliefCorrectRate: rs.filter((r) => r.belief === r.expectedBelief).length / n,
      tokensIn: rs.reduce((a, r) => a + r.usage.in, 0), tokensOut: rs.reduce((a, r) => a + r.usage.out, 0),
    };
  }).sort((a, b) =>
    a.game.localeCompare(b.game) ||
    a.model.localeCompare(b.model) ||
    ((CONDITION_ORDER[a.condition] ?? 99) - (CONDITION_ORDER[b.condition] ?? 99)) ||
    a.condition.localeCompare(b.condition),
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
const pctPlain = (x: number) => `${Math.round(x * 100)}\\%`;
const pctMd = (x: number) => `${Math.round(x * 100)}%`;
const texEsc = (s: string) => s.replace(/_/g, "\\_");

export function formatTable(rows: Row[]): string {
  const head = `${"game".padEnd(15)} ${"model".padEnd(30)} ${"condition".padEnd(17)} ${"n".padStart(3)} ${"FAIL".padStart(5)} ${"95% CI".padStart(11)} ${"verif".padStart(5)} ${"asked".padStart(5)} ${"belief".padStart(6)} ${"tok in/out".padStart(14)}`;
  const lines = rows.map((r) =>
    `${r.game.padEnd(15)} ${r.model.slice(0, 30).padEnd(30)} ${r.condition.padEnd(17)} ${String(r.n).padStart(3)} ${pct(r.failRate).padStart(5)} ${`${pct(r.failCI[0])}-${pct(r.failCI[1])}`.padStart(11)} ${pct(r.verifiedRate).padStart(5)} ${pct(r.askedRate).padStart(5)} ${pct(r.beliefCorrectRate).padStart(6)} ${`${r.tokensIn}/${r.tokensOut}`.padStart(14)}`);
  return [head, ...lines].join("\n");
}

/** Formats summary rows as a publication-ready booktabs LaTeX tabular grouped by Game and Model. */
export function formatLatex(rows: Row[]): string {
  const lines: string[] = [
    "\\begin{tabular}{llrrrrrr}",
    "\\toprule",
    "Game & Model & Condition & $n$ & Fail (\\%) & 95\\% Wilson CI & Verified (\\%) & Asked (\\%) & Belief Acc. (\\%) \\\\".replace(
      "\\begin{tabular}{llrrrrrr}",
      "\\begin{tabular}{lllrrrrrr}",
    ),
  ];
  lines[0] = "\\begin{tabular}{lllrrrrrr}";
  lines[2] = "Game & Model & Condition & $n$ & Fail (\\%) & 95\\% Wilson CI & Verified (\\%) & Asked (\\%) & Belief Acc. (\\%) \\\\";
  lines.push("\\midrule");
  let lastGroup = "";
  for (const r of rows) {
    const grp = `${r.game}|${r.model}`;
    if (lastGroup && grp !== lastGroup) lines.push("\\midrule");
    lastGroup = grp;
    const ci = `[${Math.round(r.failCI[0] * 100)}, ${Math.round(r.failCI[1] * 100)}]\\%`;
    lines.push(
      `${texEsc(r.game)} & ${texEsc(r.model)} & \\texttt{${texEsc(r.condition)}} & ${r.n} & ${pctPlain(r.failRate)} & ${ci} & ${pctPlain(r.verifiedRate)} & ${pctPlain(r.askedRate)} & ${pctPlain(r.beliefCorrectRate)} \\\\`,
    );
  }
  lines.push("\\bottomrule");
  lines.push("\\end{tabular}");
  return lines.join("\n");
}

/** Formats summary rows as a clean GitHub-flavored Markdown table. */
export function formatMarkdown(rows: Row[]): string {
  const lines: string[] = [
    "| Game | Model | Condition | n | Fail (%) | 95% Wilson CI | Verified (%) | Asked (%) | Epistemic Belief (%) |",
    "| :--- | :--- | :--- | ---: | ---: | :---: | ---: | ---: | ---: |",
  ];
  for (const r of rows) {
    const ci = `${pctMd(r.failCI[0])}–${pctMd(r.failCI[1])}`;
    lines.push(
      `| \`${r.game}\` | \`${r.model}\` | \`${r.condition}\` | ${r.n} | **${pctMd(r.failRate)}** | ${ci} | ${pctMd(r.verifiedRate)} | ${pctMd(r.askedRate)} | ${pctMd(r.beliefCorrectRate)} |`,
    );
  }
  return lines.join("\n");
}
