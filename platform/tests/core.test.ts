import { describe, expect, it } from "vitest";
import {
  formatLatex,
  formatMarkdown,
  replayRecord,
  runEpisode,
  summarize,
  wilson,
  type RunRecord,
} from "../src/core";
import { GAME_LIST } from "../src/games";

describe("Replay & Stats Determinism Across All 5 Games", () => {
  const kinds = ["compliant", "cautious", "sloppy"] as const;
  const conditions = ["pure_toy", "cue_clue", "cue_manual", "control_toy", "misleading"] as const;

  for (const game of GAME_LIST) {
    describe(`Episode & Replay: ${game.id}`, () => {
      for (const kind of kinds) {
        for (const cond of conditions) {
          it(`runs and replays deterministically for mock/${kind} on ${cond}`, async () => {
            const rec = await runEpisode({
              game,
              conditionId: cond,
              seed: 1,
              provider: game.scriptedProvider(kind),
              model: `mock/${kind}`,
            });
            const rep = replayRecord(game, rec);
            expect(rep.ok, rep.diffs.join("; ")).toBe(true);
            expect(rep.diffs).toEqual([]);
          });
        }
      }
    });
  }

  it("captures Left-Pane 3D JPEG frames when vision mode is enabled", async () => {
    const g = GAME_LIST[0]; // robot-arm
    let frames = 0;
    const rec = await runEpisode({
      game: g,
      conditionId: "pure_toy",
      seed: 0,
      provider: g.scriptedProvider("compliant"),
      model: "mock/compliant",
      vision: true,
      captureFrame: () => `data:image/jpeg;base64,FRAME_${++frames}`,
    });
    expect(rec.vision).toBe(true);
    expect(rec.transcript[1].role).toBe("user");
    expect((rec.transcript[1] as { image?: string }).image).toBe("data:image/jpeg;base64,FRAME_1");
    expect(rec.toolCalls.length).toBeGreaterThan(0);
    expect(rec.toolCalls[0].image).toBe("data:image/jpeg;base64,FRAME_2");
  });

  it("never pools different games together in summarize() and computes accurate 95% Wilson CIs", async () => {
    const records: RunRecord[] = [];
    for (const game of GAME_LIST) {
      records.push(
        await runEpisode({
          game,
          conditionId: "pure_toy",
          seed: 0,
          provider: game.scriptedProvider("compliant"),
          model: "mock/compliant",
        }),
      );
      records.push(
        await runEpisode({
          game,
          conditionId: "pure_toy",
          seed: 1,
          provider: game.scriptedProvider("cautious"),
          model: "mock/compliant",
        }),
      );
    }

    const rows = summarize(records);
    // 5 distinct games x 1 model x 1 condition = 5 separate summary rows (never pooled)
    expect(rows.length).toBe(GAME_LIST.length);
    for (const r of rows) {
      expect(r.n).toBe(2);
      expect(r.fail).toBe(1);
      expect(r.pass).toBe(1);
      expect(r.failRate).toBeCloseTo(0.5, 5);
      const [lo, hi] = wilson(1, 2);
      expect(r.failCI[0]).toBeCloseTo(lo, 6);
      expect(r.failCI[1]).toBeCloseTo(hi, 6);
    }

    const [w0Lo, w0Hi] = wilson(0, 10);
    expect(w0Lo).toBeCloseTo(0, 5);
    expect(w0Hi).toBeGreaterThan(0.2);
    expect(w0Hi).toBeLessThan(0.35);

    const tex = formatLatex(rows);
    expect(tex).toContain("\\toprule");
    expect(tex).toContain("\\midrule");
    expect(tex).toContain("\\bottomrule");

    const md = formatMarkdown(rows);
    expect(md).toContain("| Game | Model | Condition |");
    expect(md).toContain("`robot-arm`");
    expect(md).toContain("`drone-rescue`");
  });
});
