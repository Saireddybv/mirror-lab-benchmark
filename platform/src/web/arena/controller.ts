// Drives one episode for the UI: replay a recorded run, run a live model, or let a human fly.
// Framework-free so it can be unit-tested; React just subscribes.
import { runEpisode } from "../../core";
import type { Flags, Provider, RunRecord, ToolCallRecord, Verdict } from "../../core";
import { droneGame, DroneSession } from "../../games/drone";
import type { ToolRole } from "../../games/drone/lexicon";

export type Mode = "replay" | "model" | "human";
export interface ChatLine { kind: "model" | "call" | "result" | "sys"; text: string }
export interface BackendLine { cls: "ai" | "hw" | "mean" | "bad" | "sys"; text: string }
export interface ArenaState {
  status: "idle" | "running" | "done" | "error";
  error?: string; chat: ChatLine[]; backend: BackendLine[];
  flags?: Flags; verdict?: Verdict; belief?: string; expectedBelief?: string; finished: boolean; who?: string;
}

export class ArenaController {
  session: DroneSession;
  state: ArenaState = { status: "idle", chat: [], backend: [], finished: false };
  speed = 1;
  private listeners = new Set<() => void>();
  private stopFlag = false;
  private humanBusy = false;

  constructor(public conditionId: string, public seed: number) { this.session = new DroneSession(conditionId, seed); }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.state = { ...this.state }; this.listeners.forEach((l) => l()); }
  private patch(p: Partial<ArenaState>) { Object.assign(this.state, p); this.emit(); }
  stop() { this.stopFlag = true; }

  reset(conditionId = this.conditionId, seed = this.seed) {
    this.conditionId = conditionId; this.seed = seed; this.stopFlag = false;
    this.session = new DroneSession(conditionId, seed);
    this.state = { status: "idle", chat: [], backend: [], finished: false };
    this.emit();
  }

  private pace = async (ms: number) => {
    const end = Date.now() + ms / this.speed;
    while (Date.now() < end) { if (this.stopFlag) throw new Error("stopped"); await new Promise((r) => setTimeout(r, 40)); }
    if (this.stopFlag) throw new Error("stopped");
  };

  /** How long the visuals need after an action (the 3D drone flies cell by cell while the logic is instant). */
  private visualMs(rec: ToolCallRecord, trailBefore: number, trailAfter: number): number {
    const cells = Math.max(0, trailAfter - trailBefore);
    if (rec.code === "airborne") return 1300;
    if (rec.code === "arrived") return cells * 360 + 500;
    if (rec.code === "landed") return cells * 330 + 1300;
    if (rec.code === "released_hit" || rec.code === "released_miss") return 3200;
    return 600;
  }

  private logCall(rec: ToolCallRecord, who: string) {
    const st = this.state;
    st.chat.push({ kind: "call", text: `${rec.name}(${Object.keys(rec.args).length ? JSON.stringify(rec.args) : ""})` });
    st.chat.push({ kind: "result", text: rec.result });
    st.backend.push({ cls: "ai", text: `${who} → ${rec.name}` });
    st.backend.push({ cls: "hw", text: `   backend: ${rec.backend.call}` });
    st.backend.push({ cls: rec.backend.harmful ? "bad" : "mean", text: `   meaning: ${rec.backend.meaning}` });
    st.flags = this.session.flags();
    this.emit();
  }

  private finalize(extra: Partial<ArenaState> = {}) {
    this.patch({ flags: this.session.flags(), verdict: this.session.verdict(), expectedBelief: this.session.expectedBelief, finished: true, status: "done", ...extra });
  }

  // ---------- replay a recorded run ----------
  async runReplay(rec: RunRecord) {
    this.reset(rec.condition, rec.seed);
    this.patch({ status: "running", who: `${rec.model} (recorded)` });
    try {
      for (const c of rec.toolCalls) {
        const before = this.session.sim.trail.length;
        const out = this.session.execute(c.name, c.args);
        const r: ToolCallRecord = { name: c.name, args: c.args, result: out.result, code: out.code, backend: out.backend };
        this.logCall(r, "AI");
        await this.pace(this.visualMs(r, before, this.session.sim.trail.length));
      }
      if (rec.finalMessage) { this.state.chat.push({ kind: "model", text: rec.finalMessage }); this.emit(); }
      const before = this.session.sim.trail.length;
      const auto = this.session.finish();
      for (const a of auto) this.state.backend.push({ cls: "sys", text: `${a.call} — ${a.meaning}` });
      this.emit();
      await this.pace(Math.max(0, this.session.sim.trail.length - before) * 330 + 1200);
      this.finalize({ belief: rec.belief });
    } catch (e) { this.fail(e); }
  }

  // ---------- live model ----------
  async runModel(provider: Provider, model: string) {
    this.stopFlag = false; this.lastTrail = 0;
    this.state = { status: "running", chat: [], backend: [], finished: false, who: model };
    this.emit();
    try {
      const rec = await runEpisode({
        game: droneGame, conditionId: this.conditionId, seed: this.seed, provider, model,
        onSession: (s) => { this.session = s as DroneSession; this.state.chat.push({ kind: "sys", text: "Mission sent to the model." }); this.emit(); },
        onAssistantText: (t) => { this.state.chat.push({ kind: "model", text: t }); this.emit(); },
        onToolCall: async (rec) => {
          if (this.stopFlag) throw new Error("stopped");
          const now = this.session.sim.trail.length, prev = this.lastTrail;   // the session already executed this call
          this.lastTrail = now;
          this.logCall(rec, "AI");
          await this.pace(this.visualMs(rec, prev, now));
        },
      });
      for (const a of rec.autoEvents) this.state.backend.push({ cls: "sys", text: `${a.call} — ${a.meaning}` });
      this.emit();
      await this.pace(rec.autoEvents.length ? Math.max(0, this.session.sim.trail.length - this.lastTrail) * 330 + 1300 : 600);
      this.finalize({ belief: rec.belief });
      return rec;
    } catch (e) { this.fail(e); return null; }
  }
  private lastTrail = 0;

  // ---------- human pilot ----------
  async humanAction(role: ToolRole, args: Record<string, unknown> = {}) {
    if (this.humanBusy || this.state.finished) return;
    this.humanBusy = true;
    try {
      if (this.state.status === "idle") this.patch({ status: "running", who: "You" });
      const before = this.session.sim.trail.length;
      const out = this.session.execute(this.session.toolName(role), args);
      const r: ToolCallRecord = { name: this.session.toolName(role), args, result: out.result, code: out.code, backend: out.backend };
      this.logCall(r, "YOU");
      await new Promise((res) => setTimeout(res, this.visualMs(r, before, this.session.sim.trail.length) / this.speed));
      if (role === "release" && this.session.flags().released) this.state.chat.push({ kind: "sys", text: "Package away. Fly home (H) to finish." });
      if (role === "home" || (this.session.flags().released && !this.session.sim.flying)) this.finalize({ belief: "-" });
      else this.emit();
    } finally { this.humanBusy = false; }
  }

  private fail(e: unknown) {
    const msg = (e as Error).message;
    if (msg === "stopped") { this.patch({ status: "idle", error: undefined }); return; }
    this.patch({ status: "error", error: msg });
  }
}
