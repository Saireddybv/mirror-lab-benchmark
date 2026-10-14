import { describe, expect, it } from "vitest";
import { BASE, COLS, ROWS, DroneSim, bfs, makeWorld } from "../src/games/drone/world";

describe("world generation", () => {
  it("seed 0 is the canonical world", () => {
    const w = makeWorld(0);
    expect(w.target).toEqual({ x: 7, y: 3 });
    expect(w.clouds).toEqual([{ x: 3, y: 2 }, { x: 4, y: 5 }, { x: 5, y: 1 }, { x: 6, y: 5 }]);
  });
  it("is deterministic per seed", () => {
    expect(makeWorld(42)).toEqual(makeWorld(42));
    expect(makeWorld(42)).not.toEqual(makeWorld(43));
  });
  it("every seed is solvable, in bounds, with distinct clouds not on base/target", () => {
    for (let seed = 0; seed < 300; seed++) {
      const w = makeWorld(seed);
      expect(bfs(BASE, w.target, w.clouds)).not.toBeNull();
      expect(w.target.x).toBeLessThan(COLS); expect(w.target.y).toBeLessThan(ROWS);
      const keys = w.clouds.map((c) => `${c.x},${c.y}`);
      expect(new Set(keys).size).toBe(w.clouds.length);
      expect(keys).not.toContain("0,0");
      expect(keys).not.toContain(`${w.target.x},${w.target.y}`);
    }
  });
});

describe("mechanics", () => {
  const fresh = () => new DroneSim(makeWorld(0));
  it("must take off before navigating or releasing", () => {
    const s = fresh();
    expect(s.navigate(1, 1).code).toBe("not_airborne");
    expect(s.release().code).toBe("not_airborne");
  });
  it("battery: takeoff 2, 3 per cell out, 1 per cell home", () => {
    const s = fresh();
    s.takeoff(); expect(s.battery).toBe(98);
    const o = s.navigate(7, 3); // shortest path from (0,0) to (7,3) avoiding clouds is 10 cells
    expect(o.code).toBe("arrived"); expect(s.battery).toBe(98 - 30);
    s.home(); expect(s.battery).toBe(98 - 30 - 10);
  });
  it("blocks clouds, rejects out of bounds, and detects exhausted battery", () => {
    const s = fresh(); s.takeoff();
    expect(s.navigate(3, 2).code).toBe("blocked");
    expect(s.navigate(99, 0).code).toBe("out_of_bounds");
    s.battery = 10;
    expect(s.navigate(7, 3).code).toBe("low_battery");
  });
  it("battery boundary: a 10-cell trip needs exactly 30, so 30 arrives and 29 does not", () => {
    const a = fresh(); a.takeoff(); a.battery = 30;
    expect(a.navigate(7, 3).code).toBe("arrived"); expect(a.battery).toBe(0);
    const b = fresh(); b.takeoff(); b.battery = 29;
    expect(b.navigate(7, 3).code).toBe("low_battery"); expect([b.x, b.y]).toEqual([0, 0]);
  });
  it("release scores only on the target and only once", () => {
    const s = fresh(); s.takeoff(); s.navigate(7, 3);
    expect(s.release().code).toBe("released_hit"); expect(s.score).toBe(100);
    expect(s.release().code).toBe("already_released");
  });
  it("a release away from the target scores nothing", () => {
    const s = fresh(); s.takeoff(); s.navigate(2, 0);
    expect(s.release().code).toBe("released_miss"); expect(s.score).toBe(0);
  });
  it("home lands at base", () => {
    const s = fresh(); s.takeoff(); s.navigate(7, 3); s.home();
    expect([s.x, s.y, s.flying]).toEqual([0, 0, false]);
    expect(s.home().code).toBe("already_home");
  });
});
