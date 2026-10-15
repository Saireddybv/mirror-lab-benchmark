// Drives one episode for the UI: replay a recorded run, run a live model, or let a human operate any of the 5 games.
// Framework-free so it can be unit-tested; React just subscribes.
import { runEpisode } from "../../core";
import type { Flags, Game, Provider, RunRecord, Session, ToolCallRecord, Verdict } from "../../core";
import { DEFAULT_GAME_ID, GAMES, droneGame } from "../../games";
import type { ToolRole } from "../../games/drone/lexicon";
import { modelLabel } from "../lib";

export type Mode = "replay" | "model" | "human";
export interface ChatLine { kind: "model" | "call" | "result" | "sys"; text: string }
export interface BackendLine { cls: "ai" | "hw" | "mean" | "bad" | "sys"; text: string }
export interface ArenaState {
  status: "idle" | "running" | "done" | "error";
  error?: string;
  chat: ChatLine[];
  backend: BackendLine[];
  flags?: Flags;
  verdict?: Verdict;
  belief?: string;
  expectedBelief?: string;
  finished: boolean;
  who?: string;
  lastFrame?: string;
}

export type RoleAwareSession = Session & {
  toolName?: (role: ToolRole) => string;
  hasRole?: (role: ToolRole) => boolean;
  sim?: any;
};

export class ArenaController {
  game: Game;
  session: RoleAwareSession;
  state: ArenaState = { status: "idle", chat: [], backend: [], finished: false };
  speed = 1;
  vision = false;
  /** Registered by Arena.tsx so vision-enabled episodes can capture actual 3D Left-Pane JPEG frames. */
  captureLeftJpeg?: () => string;
  private listeners = new Set<() => void>();
  private stopFlag = false;
  private humanBusy = false;
  private lastTrail = 0;

  constructor(public conditionId: string, public seed: number, gameId: string = DEFAULT_GAME_ID) {
    this.game = GAMES[gameId] ?? droneGame;
    this.session = this.game.createSession(conditionId, seed) as RoleAwareSession;
  }

  get gameId(): string { return this.game.id; }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.state = { ...this.state }; this.listeners.forEach((l) => l()); }
  private patch(p: Partial<ArenaState>) { Object.assign(this.state, p); this.emit(); }
  stop() { this.stopFlag = true; }

  reset(conditionId = this.conditionId, seed = this.seed, gameId = this.game.id) {
    this.conditionId = conditionId;
    this.seed = seed;
    this.game = GAMES[gameId] ?? droneGame;
    this.stopFlag = false;
    this.session = this.game.createSession(conditionId, seed) as RoleAwareSession;
    this.state = { status: "idle", chat: [], backend: [], finished: false };
    this.emit();
  }

  private trailLen(): number {
    const t = this.session.sim?.trail;
    return Array.isArray(t) ? t.length : 0;
  }

  private isSessionActive(): boolean {
    const sim = this.session.sim;
    if (!sim) return false;
    if (typeof sim.flying === "boolean") return sim.flying;
    if (typeof sim.open === "boolean") return sim.open;
    return false;
  }

  private pace = async (ms: number) => {
    const end = Date.now() + ms / this.speed;
    while (Date.now() < end) {
      if (this.stopFlag) throw new Error("stopped");
      await new Promise((r) => setTimeout(r, 40));
    }
    if (this.stopFlag) throw new Error("stopped");
  };

  /** How long the 3D scene needs to animate an action before the next tool step proceeds. */
  private visualMs(rec: ToolCallRecord, trailBefore: number, trailAfter: number): number {
    const cells = Math.max(0, trailAfter - trailBefore);
    if (rec.code === "airborne" || rec.code === "opened") return 1200;
    if (rec.code === "arrived") return cells * 360 + 500;
    if (rec.code === "selected") return 1100;
    if (rec.code === "landed") return cells * 330 + 1300;
    if (rec.code === "closed") return 1000;
    if (rec.code === "released_hit" || rec.code === "released_miss") return 2800;
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
    this.patch({
      flags: this.session.flags(),
      verdict: this.session.verdict(),
      expectedBelief: this.session.expectedBelief,
      finished: true,
      status: "done",
      ...extra,
    });
  }

  // ---------- replay a recorded run ----------
  async runReplay(rec: RunRecord) {
    this.reset(rec.condition, rec.seed, rec.game || this.game.id);
    this.patch({ status: "running", who: `${modelLabel(rec.model)} (recorded)` });
    try {
      for (const c of rec.toolCalls) {
        const before = this.trailLen();
        const out = this.session.execute(c.name, c.args);
        const r: ToolCallRecord = { name: c.name, args: c.args, result: out.result, code: out.code, backend: out.backend };
        this.logCall(r, "AI");
        await this.pace(this.visualMs(r, before, this.trailLen()));
      }
      if (rec.finalMessage) {
        this.state.chat.push({ kind: "model", text: rec.finalMessage });
        this.emit();
      }
      const before = this.trailLen();
      const auto = this.session.finish();
      for (const a of auto) this.state.backend.push({ cls: "sys", text: `${a.call} — ${a.meaning}` });
      this.emit();
      await this.pace(Math.max(0, this.trailLen() - before) * 330 + 1200);
      this.finalize({ belief: rec.belief });
    } catch (e) {
      this.fail(e);
    }
  }

  // ---------- live model ----------
  async runModel(provider: Provider, model: string) {
    this.stopFlag = false;
    this.lastTrail = 0;
    this.state = { status: "running", chat: [], backend: [], finished: false, who: model };
    this.emit();
    try {
      const rec = await runEpisode({
        game: this.game,
        conditionId: this.conditionId,
        seed: this.seed,
        provider,
        model,
        vision: this.vision,
        captureFrame: () => {
          const jpg = this.captureLeftJpeg?.();
          if (jpg) this.patch({ lastFrame: jpg });
          return jpg;
        },
        onSession: (s) => {
          this.session = s as RoleAwareSession;
          this.state.chat.push({
            kind: "sys",
            text: this.vision ? "Mission + 3D Left-Pane vision frame sent to the model." : "Mission sent to the model.",
          });
          this.emit();
        },
        onAssistantText: (t) => {
          this.state.chat.push({ kind: "model", text: t });
          this.emit();
        },
        onToolCall: async (rec) => {
          if (this.stopFlag) throw new Error("stopped");
          const now = this.trailLen(), prev = this.lastTrail;
          this.lastTrail = now;
          this.logCall(rec, "AI");
          await this.pace(this.visualMs(rec, prev, now));
        },
      });
      for (const a of rec.autoEvents) this.state.backend.push({ cls: "sys", text: `${a.call} — ${a.meaning}` });
      this.emit();
      await this.pace(rec.autoEvents.length ? Math.max(0, this.trailLen() - this.lastTrail) * 330 + 1300 : 600);
      this.finalize({ belief: rec.belief });
      return rec;
    } catch (e) {
      this.fail(e);
      return null;
    }
  }

  // ---------- human pilot / operator ----------
  async humanAction(role: ToolRole, args: Record<string, unknown> = {}) {
    if (this.humanBusy || this.state.finished) return;
    this.humanBusy = true;
    try {
      if (this.state.status === "idle") this.patch({ status: "running", who: "You" });
      const before = this.trailLen();
      const toolName = this.session.toolName ? this.session.toolName(role) : role;
      const out = this.session.execute(toolName, args);
      const r: ToolCallRecord = { name: toolName, args, result: out.result, code: out.code, backend: out.backend };
      this.logCall(r, "YOU");
      await new Promise((res) => setTimeout(res, this.visualMs(r, before, this.trailLen()) / this.speed));
      if (role === "release" && this.session.flags().released) {
        this.state.chat.push({ kind: "sys", text: "Action committed. Press H to finish/park." });
      }
      if (role === "home" || (this.session.flags().released && !this.isSessionActive())) {
        this.finalize({ belief: "-" });
      } else {
        this.emit();
      }
    } finally {
      this.humanBusy = false;
    }
  }

  private fail(e: unknown) {
    const msg = (e as Error).message;
    if (msg === "stopped") {
      this.patch({ status: "idle", error: undefined });
      return;
    }
    this.patch({ status: "error", error: msg });
  }
}
