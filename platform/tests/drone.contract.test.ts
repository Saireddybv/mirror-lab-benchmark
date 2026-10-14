import { describe, expect, it } from "vitest";
import { DroneSession } from "../src/games/drone/session";
import { CONFIGS } from "../src/games/drone/conditions";
import { allVisibleText, cueHits, mechanicsEqual, surfaceDiff, surfaceText } from "../src/games/drone/contract";

const seeds = [0, 1, 2, 7, 99];
const ladder = ["pure_toy", "cue_names", "cue_payload", "cue_irreversible", "cue_clue"];

describe("isomorphism contract: skins change meaning, never mechanics", () => {
  it("pure_toy and control_toy show the model a byte-identical surface (only the backend differs)", () => {
    for (const seed of seeds) {
      const a = new DroneSession("pure_toy", seed), b = new DroneSession("control_toy", seed);
      expect(surfaceDiff(a, b)).toEqual([]);
      expect(a.live).toBe(true); expect(b.live).toBe(false);
    }
  });

  it("every condition runs the same mechanics (same outcome codes and state after every scripted step)", () => {
    const ids = Object.keys(CONFIGS);
    for (const seed of seeds) for (const id of ids) {
      const r = mechanicsEqual("pure_toy", id, seed);
      expect(r.equal, `pure_toy vs ${id} seed ${seed}: ${r.firstDiff}`).toBe(true);
    }
  });

  it("the pure-toy surface and every tool result contain NO real-world cue", () => {
    for (const seed of seeds) for (const id of ["pure_toy", "control_toy"]) {
      expect(cueHits(allVisibleText(id, seed)), `${id} seed ${seed}`).toEqual([]);
    }
  });

  it("the cue ladder adds cues monotonically: each rung strictly increases real-world cues", () => {
    const counts = ladder.map((id) => cueHits(surfaceText(new DroneSession(id, 0))).length);
    for (let i = 1; i < counts.length; i++) expect(counts[i], `${ladder[i]} (${counts}) `).toBeGreaterThan(counts[i - 1]);
    expect(counts[0]).toBe(0);
  });

  it("adjacent ladder rungs differ only in the tool descriptions / status they are meant to change", () => {
    const d = (a: string, b: string) => surfaceDiff(new DroneSession(a, 0), new DroneSession(b, 0));
    expect(d("cue_payload", "cue_irreversible")).toEqual(["tool payload_release"]);   // only the release description changes
    expect(d("cue_irreversible", "cue_clue")).toEqual(["user message"]);               // only the status text changes
  });

  it("no ladder rung or control offers a verification tool (the only exits are asking a human or noticing)", () => {
    for (const id of [...ladder, "control_toy"]) expect(new DroneSession(id, 0).hasRole("verify")).toBe(false);
  });

  it("tool argument schemas are identical across vocabularies", () => {
    const params = (id: string) => new DroneSession(id, 0).tools.map((t) => JSON.stringify(t.parameters));
    expect(params("pure_toy")).toEqual(params("cue_names"));
  });
});
