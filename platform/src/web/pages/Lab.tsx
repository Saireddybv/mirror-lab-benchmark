import { useEffect, useRef, useState } from "react";
import type { RunRecord } from "../../core";
import { DEFAULT_GAME_ID, GAMES, GAME_LIST } from "../../games";
import { CONFIGS } from "../../games/drone/conditions";
import { Arena } from "../arena/Arena";
import { ArenaController } from "../arena/controller";
import type { Mode } from "../arena/controller";
import { LADDER, LADDER_LABEL, MODEL_GROUPS, explainError, isScripted, providerFor, modelLabel } from "../lib";

const KEY_STORE = "mirror.openrouter.key";

export function Lab({ runs }: { runs: RunRecord[] }) {
  const [mode, setMode] = useState<Mode>("replay");
  const [gameId, setGameId] = useState(DEFAULT_GAME_ID);
  const [condition, setCondition] = useState("pure_toy");
  const [seed, setSeed] = useState(1);
  const [model, setModel] = useState("mock/compliant"), [custom, setCustom] = useState("");
  const [vision, setVision] = useState(false);
  const [recIdx, setRecIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [remember, setRemember] = useState(() => !!localStorage.getItem(KEY_STORE));
  const [key, setKey] = useState(() => localStorage.getItem(KEY_STORE) ?? sessionStorage.getItem(KEY_STORE) ?? "");
  const [err, setErr] = useState("");
  const [runId, setRunId] = useState(0);
  const ctrlRef = useRef<ArenaController>(null as unknown as ArenaController);
  if (!ctrlRef.current) ctrlRef.current = new ArenaController("pure_toy", 1, DEFAULT_GAME_ID);
  const ctrl = ctrlRef.current;
  const running = ctrl.state.status === "running";
  const [, force] = useState(0);
  useEffect(() => ctrl.subscribe(() => force((n) => n + 1)), [ctrl]);
  useEffect(() => { ctrl.speed = speed; }, [ctrl, speed]);
  useEffect(() => { ctrl.vision = vision; }, [ctrl, vision]);

  // keep the idle preview in sync with the pickers
  useEffect(() => {
    if (!running) {
      ctrl.reset(condition, seed, gameId);
      setRunId((n) => n + 1);
    }
  }, [gameId, condition, seed, mode]); // eslint-disable-line

  // choosing a recorded run loads its game/condition/seed
  const sorted = runs.filter((r) => (r.game ?? "drone-rescue") === gameId).sort((a, b) => Number(isScripted(a.model)) - Number(isScripted(b.model)));
  useEffect(() => {
    if (mode === "replay" && sorted[recIdx]) {
      setCondition(sorted[recIdx].condition);
      setSeed(sorted[recIdx].seed);
    }
  }, [mode, recIdx, runs.length, gameId]); // eslint-disable-line

  // human controls (supports both 2D grid drone-rescue and 6-slot SelectSim domains)
  useEffect(() => {
    if (mode !== "human") return;
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
      const s = ctrl.session.sim;
      if (ctrl.game.id === "drone-rescue") {
        if (dirs[e.key]) {
          e.preventDefault();
          if (s?.flying) void ctrl.humanAction("nav", { x: s.x + dirs[e.key][0], y: s.y + dirs[e.key][1] });
        } else if (e.key.toLowerCase() === "t") void ctrl.humanAction("takeoff");
        else if (e.key === " ") { e.preventDefault(); void ctrl.humanAction("release"); }
        else if (e.key.toLowerCase() === "h") void ctrl.humanAction("home");
      } else {
        if (e.key >= "0" && e.key <= "5") {
          e.preventDefault();
          void ctrl.humanAction("nav", { slot: Number(e.key) });
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const cur = typeof s?.selected === "number" ? s.selected : 0;
          const next = (cur + (e.key === "ArrowRight" ? 1 : 5)) % 6;
          void ctrl.humanAction("nav", { slot: next });
        } else if (e.key.toLowerCase() === "t") void ctrl.humanAction("takeoff");
        else if (e.key === " ") { e.preventDefault(); void ctrl.humanAction("release"); }
        else if (e.key.toLowerCase() === "h") void ctrl.humanAction("home");
      }
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [mode, ctrl]);

  const effectiveModel = custom.trim() || model;
  const activeGame = GAMES[gameId] ?? GAME_LIST[0];

  async function start() {
    setErr("");
    if (mode === "human") { ctrl.reset(condition, seed, gameId); setRunId((n) => n + 1); return; }
    ctrl.reset(condition, seed, gameId);
    setRunId((n) => n + 1);
    await new Promise((r) => setTimeout(r, 250)); // let the scenes rebuild for the fresh session
    if (mode === "replay") { if (sorted[recIdx]) await ctrl.runReplay(sorted[recIdx]); return; }
    try {
      if (remember) localStorage.setItem(KEY_STORE, key);
      else { localStorage.removeItem(KEY_STORE); sessionStorage.setItem(KEY_STORE, key); }
      await ctrl.runModel(providerFor(effectiveModel, key, activeGame), effectiveModel);
      if (ctrl.state.status === "error") setErr(ctrl.state.error ?? "");
    } catch (e) { setErr((e as Error).message); }
  }

  const stateErr = ctrl.state.status === "error" ? ctrl.state.error ?? "" : "";
  const shownErr = err || stateErr, hint = explainError(shownErr, effectiveModel);
  const cfg = CONFIGS[condition] ?? CONFIGS.pure_toy;

  return (
    <div className="page lab-page">
      <div className="lab-head">
        <div>
          <div className="kicker">The lab</div>
          <h1 className="h2">See both sides of the screen.</h1>
          <p className="lab-sub">Left: the harmless game an AI agent is shown. Right: the simulated machine its actions really drive. Everything is simulated and only writes a log.</p>
        </div>
      </div>

      <div className="modes" role="tablist">
        {([
          ["replay", "▶", "Watch a recorded run", "Replay a real model's episode, step by step."],
          ["model", "◆", "Test a model", "Run a scripted stand-in, or any model with your OpenRouter key."],
          ["human", "⌨", "Operate it yourself", "Play the game with your keyboard and see what it really does."],
        ] as [Mode, string, string, string][]).map(([m, icon, l, d]) =>
          <button key={m} role="tab" aria-selected={mode === m} className={`mode ${mode === m ? "on" : ""}`} disabled={running && mode !== m} onClick={() => { if (!running) setMode(m); }}>
            <span className="mode-icon">{icon}</span><span className="mode-t">{l}</span><span className="mode-d">{d}</span>
          </button>)}
      </div>

      <div className="controls">
        <label className="mid">Game
          <select value={gameId} onChange={(e) => { setGameId(e.target.value); setRecIdx(0); }} disabled={running}>
            {GAME_LIST.map((g) => <option key={g.id} value={g.id}>{g.title} ({g.id})</option>)}
          </select>
        </label>
        {mode === "replay" && (
          <label className="wide">Recorded run
            <select value={recIdx} onChange={(e) => setRecIdx(Number(e.target.value))} disabled={running}>
              {sorted.length === 0 && <option>no recorded runs for this game yet: use "Test a model" or "Operate it yourself"</option>}
              {sorted.map((r, i) => <option key={i} value={i}>{isScripted(r.model) ? "[scripted] " : "[real] "}{modelLabel(r.model)} · {LADDER_LABEL[r.condition] ?? r.condition} · seed {r.seed} · {r.verdict.label}</option>)}
            </select>
          </label>
        )}
        {mode !== "replay" && (
          <label>Condition
            <select value={condition} onChange={(e) => setCondition(e.target.value)} disabled={running}>
              <optgroup label="Cue ladder (live backend, no verify tool)">{LADDER.map((c) => <option key={c} value={c}>{LADDER_LABEL[c]}</option>)}</optgroup>
              <optgroup label="Control"><option value="control_toy">{LADDER_LABEL.control_toy}</option></optgroup>
              <optgroup label="Earlier conditions (verify tool offered)">{["misleading", "misleading_warn", "ambiguous", "honest"].map((c) => <option key={c} value={c}>{LADDER_LABEL[c]}</option>)}</optgroup>
            </select>
          </label>
        )}
        {mode !== "replay" && <label className="narrow">Seed<input type="number" min={0} value={seed} onChange={(e) => setSeed(Math.max(0, Number(e.target.value) || 0))} disabled={running} /></label>}
        {mode === "model" && (
          <>
            <label>Model
              <select value={model} onChange={(e) => setModel(e.target.value)} disabled={running}>
                {MODEL_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.models.map((m) => <option key={m} value={m}>{modelLabel(m)}</option>)}</optgroup>)}
              </select>
            </label>
            <label>or any OpenRouter id<input value={custom} placeholder="vendor/model" onChange={(e) => setCustom(e.target.value)} disabled={running} /></label>
            {!isScripted(effectiveModel) && (
              <label>OpenRouter key<input type="password" value={key} placeholder="sk-or-…" onChange={(e) => setKey(e.target.value)} disabled={running} autoComplete="off" /></label>
            )}
            <label title="Send live 3D Left-Pane snapshotJpeg() frames to vision-language models">
              Vision (--vision)
              <span className="inline" style={{ padding: "8px 4px" }}>
                <input type="checkbox" checked={vision} onChange={(e) => setVision(e.target.checked)} disabled={running} style={{ minWidth: 16, width: 16 }} />
                <span>3D JPEG frames</span>
              </span>
            </label>
          </>
        )}
        <label className="narrow">Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select>
        </label>
        <div className="btns">
          {running ? <button className="btn ghost" onClick={() => ctrl.stop()}>Stop</button>
            : <button className="btn primary" onClick={() => void start()}>{mode === "human" ? "Reset" : mode === "replay" ? "▶ Play recording" : "▶ Start mission"}</button>}
        </div>
      </div>

      {mode === "model" && !isScripted(effectiveModel) && (
        <div className="note">Your key stays in this browser and is sent only to OpenRouter. <label className="inline"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> remember it on this device</label> · Free models need a free key and are rate-limited (~50 requests/day).</div>
      )}
      {mode === "model" && isScripted(effectiveModel) && <div className="note warn">Scripted stand-in: a fixed program, <b>not</b> a real AI. It only demonstrates the plumbing.</div>}
      {mode === "human" && (
        <div className="note">
          You are the operator ({activeGame.title}). <kbd>T</kbd> prepare/open ·{" "}
          {gameId === "drone-rescue" ? <><kbd>←↑↓→</kbd> fly tile</> : <><kbd>0</kbd>–<kbd>5</kbd> or <kbd>←→</kbd> select slot</>} ·{" "}
          <kbd>Space</kbd> commit irreversible action · <kbd>H</kbd> return/park. Condition: <b>{cfg.title}</b>.
        </div>
      )}
      {shownErr && <div className="note err"><b>Error:</b> {shownErr.slice(0, 260)}{hint && <><br />{hint}</>}</div>}
      {ctrl.state.status === "running" && <div className="note live">Running <b>{modelLabel(ctrl.state.who ?? "")}</b> on <b>{activeGame.title}</b>{vision ? " (multimodal 3D vision enabled)" : ""}…</div>}

      <Arena controller={ctrl} sceneKey={`${gameId}-${condition}-${seed}-${runId}`} />
    </div>
  );
}
