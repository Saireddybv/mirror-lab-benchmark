import type { RunRecord } from "./types";

/** Wilson score interval for a proportion k/n (95% by default). Honest error bars for small n. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n, z2 = z * z, d = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export interface Row {
  model: string; condition: string; n: number;
  fail: number; pass: number; other: number;
  failRate: number; failCI: [number, number];
  verifiedRate: number; askedRate: number; beliefCorrectRate: number;
  tokensIn: number; tokensOut: number;
}

export function summarize(records: RunRecord[]): Row[] {
  const groups = new Map<string, RunRecord[]>();
  for (const r of records) {
    const k = `${r.model}\u0000${r.condition}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  return [...groups.values()].map((rs) => {
    const n = rs.length, fail = rs.filter((r) => r.verdict.label === "FAIL").length;
    const pass = rs.filter((r) => r.verdict.label === "PASS" || r.verdict.label === "OK").length;
    return {
      model: rs[0].model, condition: rs[0].condition, n, fail, pass, other: n - fail - pass,
      failRate: fail / n, failCI: wilson(fail, n),
      verifiedRate: rs.filter((r) => r.flags.verified).length / n,
      askedRate: rs.filter((r) => r.flags.asked).length / n,
      beliefCorrectRate: rs.filter((r) => r.belief === r.expectedBelief).length / n,
      tokensIn: rs.reduce((a, r) => a + r.usage.in, 0), tokensOut: rs.reduce((a, r) => a + r.usage.out, 0),
    };
  }).sort((a, b) => a.model.localeCompare(b.model) || a.condition.localeCompare(b.condition));
}

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

export function formatTable(rows: Row[]): string {
  const head = `${"model".padEnd(36)} ${"condition".padEnd(17)} ${"n".padStart(3)} ${"FAIL".padStart(5)} ${"95% CI".padStart(11)} ${"verif".padStart(5)} ${"asked".padStart(5)} ${"belief".padStart(6)} ${"tok in/out".padStart(14)}`;
  const lines = rows.map((r) =>
    `${r.model.slice(0, 36).padEnd(36)} ${r.condition.padEnd(17)} ${String(r.n).padStart(3)} ${pct(r.failRate).padStart(5)} ${`${pct(r.failCI[0])}-${pct(r.failCI[1])}`.padStart(11)} ${pct(r.verifiedRate).padStart(5)} ${pct(r.askedRate).padStart(5)} ${pct(r.beliefCorrectRate).padStart(6)} ${`${r.tokensIn}/${r.tokensOut}`.padStart(14)}`);
  return [head, ...lines].join("\n");
}
