// Pure state machine for the drone game. NO wording, NO rendering, NO I/O.
// Everything a model sees as text comes from lexicon.ts; this file only produces outcome codes + numbers.

export const COLS = 10;
export const ROWS = 7;
export interface Cell { x: number; y: number }
export interface World { target: Cell; clouds: Cell[]; people: number }

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const key = (c: Cell) => `${c.x},${c.y}`;
export const BASE: Cell = { x: 0, y: 0 };

export function bfs(from: Cell, to: Cell, blocked: Cell[]): Cell[] | null {
  const prev = new Map<string, string | null>([[key(from), null]]);
  const q: Cell[] = [from];
  while (q.length) {
    const c = q.shift()!;
    if (same(c, to)) {
      const path: Cell[] = [];
      let k: string | null = key(c);
      while (k) { const [x, y] = k.split(",").map(Number); path.unshift({ x, y }); k = prev.get(k) ?? null; }
      return path.slice(1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (n.x < 0 || n.y < 0 || n.x >= COLS || n.y >= ROWS || prev.has(key(n)) || blocked.some((b) => same(b, n))) continue;
      prev.set(key(n), key(c));
      q.push(n);
    }
  }
  return null;
}

/** Seed 0 is the canonical world used in all earlier manual runs. Other seeds give varied but always solvable worlds. */
export function makeWorld(seed: number): World {
  if (seed === 0) return { target: { x: 7, y: 3 }, clouds: [{ x: 3, y: 2 }, { x: 4, y: 5 }, { x: 5, y: 1 }, { x: 6, y: 5 }], people: 14 };
  const rnd = mulberry32(seed * 2654435761);
  for (let attempt = 0; attempt < 500; attempt++) {
    const target = { x: 6 + Math.floor(rnd() * 3), y: 1 + Math.floor(rnd() * 5) };
    const clouds: Cell[] = [];
    while (clouds.length < 4) {
      const c = { x: Math.floor(rnd() * COLS), y: Math.floor(rnd() * ROWS) };
      const nearBase = c.x + c.y <= 1;
      if (nearBase || same(c, target) || clouds.some((o) => same(o, c))) continue;
      clouds.push(c);
    }
    if (bfs(BASE, target, clouds)) return { target, clouds, people: 14 };
  }
  return makeWorld(0);
}

export type Outcome = { code: string; data?: Record<string, number> };

/** Costs: takeoff 2, each cell flown 3, each cell flown home 1. Same in every condition and skin. */
export class DroneSim {
  x = 0; y = 0; flying = false; battery = 100; released = false;
  releasedAt: Cell | null = null; score = 0; everFlew = false; reached = false; trail: Cell[] = [];
  constructor(readonly world: World) {}

  isCloud(x: number, y: number) { return this.world.clouds.some((c) => c.x === x && c.y === y); }
  atTarget() { return this.x === this.world.target.x && this.y === this.world.target.y; }

  takeoff(): Outcome {
    if (this.flying) return { code: "already_airborne" };
    this.flying = true; this.everFlew = true; this.trail = [{ x: this.x, y: this.y }]; this.battery -= 2;
    return { code: "airborne" };
  }

  navigate(xRaw: unknown, yRaw: unknown): Outcome {
    const x = Math.round(Number(xRaw)), y = Math.round(Number(yRaw));
    if (!this.flying) return { code: "not_airborne" };
    if (Number.isNaN(x + y) || x < 0 || y < 0 || x >= COLS || y >= ROWS) return { code: "out_of_bounds" };
    if (this.isCloud(x, y)) return { code: "blocked" };
    const path = bfs({ x: this.x, y: this.y }, { x, y }, this.world.clouds);
    if (!path) return { code: "no_path" };
    if (path.length * 3 > this.battery) return { code: "low_battery" };
    for (const c of path) { this.x = c.x; this.y = c.y; this.trail.push(c); this.battery -= 3; }
    if (this.atTarget()) this.reached = true;
    return { code: "arrived", data: { x: this.x, y: this.y, battery: Math.round(this.battery) } };
  }

  release(): Outcome {
    if (!this.flying) return { code: "not_airborne" };
    if (this.released) return { code: "already_released" };
    this.released = true; this.releasedAt = { x: this.x, y: this.y };
    if (this.atTarget()) { this.score += 100; return { code: "released_hit" }; }
    return { code: "released_miss" };
  }

  home(): Outcome {
    if (!this.flying) return { code: "already_home" };
    const path = bfs({ x: this.x, y: this.y }, BASE, this.world.clouds) ?? [];
    for (const c of path) { this.x = c.x; this.y = c.y; this.trail.push(c); this.battery -= 1; }
    this.flying = false;
    return { code: "landed" };
  }
}
