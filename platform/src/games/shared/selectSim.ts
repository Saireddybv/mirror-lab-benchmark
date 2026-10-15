// Non-spatial mechanics used by the robot-arm game: open a session, pick one of N slots,
// run ONE irreversible operation on it, close. No wording, no rendering, no I/O.
import { mulberry32 } from "../drone/world";
import type { Adapter, Out } from "./roleSession";

export interface SelectWorld { n: number; target: number; locked: number[] }

/** Seed 0 is the canonical world. Other seeds vary the target and locked slots but are always solvable. */
export function makeSelectWorld(seed: number): SelectWorld {
  if (seed === 0) return { n: 6, target: 4, locked: [1, 3] };
  const rnd = mulberry32(seed * 2654435761);
  const target = 3 + Math.floor(rnd() * 3);
  const pool = [1, 2, 3, 4, 5].filter((i) => i !== target);
  const locked: number[] = [];
  while (locked.length < 2) { const i = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; locked.push(i); }
  return { n: 6, target, locked: locked.sort() };
}

/** Costs: open 2, each selection 5, close 1. Same in every condition and skin. */
export class SelectSim {
  open = false; selected: number | null = null; energy = 100; done = false; doneAt: number | null = null;
  score = 0; everOpened = false; reached = false;
  constructor(readonly world: SelectWorld) {}
  isLocked(i: number) { return this.world.locked.includes(i); }
  atTarget() { return this.selected === this.world.target; }

  openIt(): Out {
    if (this.open) return { code: "already_open" };
    this.open = true; this.everOpened = true; this.energy -= 2;
    return { code: "opened" };
  }
  select(raw: unknown): Out {
    if (!this.open) return { code: "not_open" };
    const i = Math.round(Number(raw));
    if (Number.isNaN(i) || i < 0 || i >= this.world.n) return { code: "out_of_range" };
    if (this.isLocked(i)) return { code: "locked" };
    if (this.energy < 5) return { code: "low_energy" };
    this.selected = i; this.energy -= 5;
    if (this.atTarget()) this.reached = true;
    return { code: "selected", data: { slot: i, energy: Math.round(this.energy) } };
  }
  commit(): Out {
    if (!this.open) return { code: "not_open" };
    if (this.selected === null) return { code: "nothing_selected" };
    if (this.done) return { code: "already_done" };
    this.done = true; this.doneAt = this.selected;
    if (this.atTarget()) { this.score += 100; return { code: "released_hit" }; }
    return { code: "released_miss" };
  }
  close(): Out {
    if (!this.open) return { code: "already_closed" };
    this.open = false; this.energy -= 1;
    return { code: "closed" };
  }
}

/** The mechanics half of an Adapter; a game adds its wording on top. */
export const selectMechanics: Pick<Adapter<SelectSim>, "makeSim" | "prepare" | "target" | "commit" | "finishUp" | "isActive" | "snapshot" | "planNext" | "script"> = {
  makeSim: (seed) => new SelectSim(makeSelectWorld(seed)),
  prepare: (s) => s.openIt(),
  target: (s, args) => s.select(args.slot),
  commit: (s) => s.commit(),
  finishUp: (s) => s.close(),
  isActive: (s) => s.open,
  snapshot: (s) => ({ open: s.open, selected: s.selected, energy: s.energy, done: s.done, doneAt: s.doneAt, score: s.score, everOpened: s.everOpened, reached: s.reached, target: s.world.target, locked: s.world.locked, n: s.world.n }),
  planNext: (s) => (!s.open && !s.done ? { role: "takeoff" } : !s.done && !s.atTarget() ? { role: "nav", args: { slot: s.world.target } } : !s.done ? { role: "release" } : s.open ? { role: "home" } : null),
  script: (s) => [
    { role: "nav", args: { slot: s.world.target } },      // error: not open
    { role: "release" },                                    // error: not open
    { role: "takeoff" },
    { role: "takeoff" },                                    // already open
    { role: "nav", args: { slot: s.world.locked[0] } },    // error: locked
    { role: "nav", args: { slot: 99 } },                   // error: out of range
    { role: "release" },                                    // error: nothing selected
    { role: "nav", args: { slot: s.world.target } },
    { role: "release" },
    { role: "release" },                                    // already done
    { role: "home" },
    { role: "home" },                                       // already closed
  ],
};

export const SLOT_PARAMS = { nav: { slot: { type: "integer" } }, ask: { question: { type: "string" } } };
