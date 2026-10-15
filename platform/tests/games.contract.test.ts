import { describe, expect, it } from "vitest";
import {
  GAME_LIST,
  armAdapter,
} from "../src/games";
import { CONFIGS, STANDARD_MANUAL_INTERLOCK } from "../src/games/drone/conditions";
import * as droneContract from "../src/games/drone/contract";
import { DroneSession } from "../src/games/drone/session";
import * as sharedContract from "../src/games/shared/contract";
import { RoleSession, type Adapter } from "../src/games/shared/roleSession";

const ADAPTER_BY_ID: Record<string, Adapter<any>> = {
  "robot-arm": armAdapter,
};

const ALL_CONDITIONS = Object.keys(CONFIGS);
const SEEDS = [0, 1, 2];

describe("Cross-Game Isomorphism & Surface Contract (Both Games)", () => {
  for (const game of GAME_LIST) {
    describe(`Game: ${game.id} (${game.title})`, () => {
      for (const seed of SEEDS) {
        it(`preserves identical mechanics across all conditions (seed=${seed})`, () => {
          for (const cond of ALL_CONDITIONS) {
            const res =
              game.id === "drone-rescue"
                ? droneContract.mechanicsEqual("pure_toy", cond, seed)
                : sharedContract.mechanicsEqual(ADAPTER_BY_ID[game.id], "pure_toy", cond, seed);
            expect(res.equal, `${game.id} seed=${seed} pure_toy vs ${cond}: ${res.firstDiff}`).toBe(true);
          }
        });

        it(`leaks zero real-world hazard cues on pure_toy surface and tool outputs (seed=${seed})`, () => {
          const hits =
            game.id === "drone-rescue"
              ? droneContract.cueHits(droneContract.allVisibleText("pure_toy", seed))
              : sharedContract.cueHits(
                  ADAPTER_BY_ID[game.id].cuePatterns,
                  sharedContract.allVisibleText(ADAPTER_BY_ID[game.id], "pure_toy", seed),
                );
          expect(hits).toEqual([]);
        });

        it(`presents a byte-identical model-visible surface between pure_toy and control_toy (seed=${seed})`, () => {
          if (game.id === "drone-rescue") {
            const a = new DroneSession("pure_toy", seed);
            const b = new DroneSession("control_toy", seed);
            expect(droneContract.surfaceDiff(a, b)).toEqual([]);
          } else {
            const ad = ADAPTER_BY_ID[game.id];
            const a = new RoleSession(ad, "pure_toy", seed);
            const b = new RoleSession(ad, "control_toy", seed);
            expect(sharedContract.surfaceDiff(a, b)).toEqual([]);
          }
        });

        it(`embeds the 32-row register table (REG_0x00..REG_0x1F) and standardized interlock in cue_manual (seed=${seed})`, () => {
          const s = game.createSession("cue_manual", seed);
          expect(s.user).toContain("REG_0x00");
          expect(s.user).toContain("REG_0x1F");
          expect(s.user).toContain("ACTIVE_TARGET");
          expect(s.user).toContain("INTERLOCK=BYPASS_ARMED");
          expect(s.user).toContain(STANDARD_MANUAL_INTERLOCK);

          const activeLines = s.user.split("\n").filter((l) => l.startsWith("REG_0x") && l.includes("ACTIVE_TARGET"));
          expect(activeLines.length).toBe(1);
          expect(activeLines[0]).toContain(STANDARD_MANUAL_INTERLOCK);
        });
      }
    });
  }
});
