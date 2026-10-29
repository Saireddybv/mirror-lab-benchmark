import type { Row } from "../core/stats";
import { LADDER, LADDER_LABEL, modelLabel } from "./lib";

const COLORS = ["#ff6a1a", "#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#facc15"];
const TICKS: [string, string][] = [
  ["Pure", "toy"],
  ["Real tool", "names"],
  ["+ amount", "stated"],
  ["+ stakes", "stated"],
  ["+ sensor", "clue"],
  ["+ long", "manual"],
];
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Fail rate per cue rung, one line per model, with 95% Wilson bars. Shared by the home and results pages. */
export function LadderChart({ rows }: { rows: Row[] }) {
  const models = [...new Set(rows.map((r) => r.model))];
  const W = 720, H = 300, L = 46, R = 34, T = 16, B = 70, iw = W - L - R - 12, ih = H - T - B;
  const present = LADDER.filter((id) => rows.some((r) => r.condition === id)), rungs = present.length ? present : LADDER;   // only plot rungs that have data
  const xs = (i: number) => L + 12 + (iw * i) / Math.max(1, rungs.length - 1), ys = (v: number) => T + ih * (1 - v);
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fail rate by cue rung and model" className="chart">
        <rect x={L} y={ys(0.5)} width={W - R - L} height={ys(0) - ys(0.5)} className="safe-zone" />
        {[0, 0.25, 0.5, 0.75, 1].map((g) => <g key={g}><line x1={L} x2={W - R} y1={ys(g)} y2={ys(g)} className={g === 0.5 ? "grid mid" : "grid"} /><text x={L - 8} y={ys(g) + 4} className="tick" textAnchor="end">{pct(g)}</text></g>)}
        <text x={L + 8} y={ys(0.5) + 14} className="zone-label">below the dashed line = hesitates</text>
        {rungs.map((id, i) => { const [a, b] = TICKS[LADDER.indexOf(id)] ?? [id, ""]; return <text key={id} x={xs(i)} y={H - B + 18} className="tick" textAnchor="middle">{a}<tspan x={xs(i)} dy="13">{b}</tspan></text>; })}
        {models.map((m, mi) => {
          const color = COLORS[mi % COLORS.length], pts = rungs.map((id, i) => ({ i, r: rows.find((r) => r.model === m && r.condition === id) })).filter((p) => p.r);
          return (
            <g key={m}>
              <polyline fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" points={pts.map((p) => `${xs(p.i)},${ys(p.r!.failRate)}`).join(" ")} />
              {pts.map((p) => <g key={p.i}><line x1={xs(p.i)} x2={xs(p.i)} y1={ys(p.r!.failCI[0])} y2={ys(p.r!.failCI[1])} stroke={color} strokeOpacity={0.28} strokeWidth={7} strokeLinecap="round" /><circle cx={xs(p.i)} cy={ys(p.r!.failRate)} r={5} fill={color} stroke="var(--panel)" strokeWidth={2}><title>{`${modelLabel(m)} · ${LADDER_LABEL[rungs[p.i]]}: ${pct(p.r!.failRate)} (n=${p.r!.n})`}</title></circle></g>)}
            </g>
          );
        })}
      </svg>
      <div className="legend">{models.map((m, i) => <span key={m}><i style={{ background: COLORS[i % COLORS.length] }} />{modelLabel(m)}</span>)}<span className="legend-note">bar = 95% range · lower is safer</span></div>
    </div>
  );
}

