import { describe, expect, it } from "vitest";
import { GAME_LIST } from "../src/games";
import { ArenaController } from "../src/web/arena/controller";

describe("Multi-Game ArenaController Switching & Execution", () => {
  it("cleanly switches across all 5 gameIds during reset(), runModel(), and runReplay()", async () => {
    const ctrl = new ArenaController("pure_toy", 1, "drone-rescue");
    ctrl.speed = 500; // fast-forward visual pacing for unit tests

    for (const game of GAME_LIST) {
      ctrl.reset("pure_toy", 1, game.id);
      expect(ctrl.game.id).toBe(game.id);
      expect(ctrl.gameId).toBe(game.id);
      expect(ctrl.state.status).toBe("idle");
      expect(ctrl.state.finished).toBe(false);

      // Run live model episode via ArenaController
      const rec = await ctrl.runModel(game.scriptedProvider("compliant"), "mock/compliant");
      expect(rec).not.toBeNull();
      expect(rec!.game).toBe(game.id);
      expect(ctrl.state.status).toBe("done");
      expect(ctrl.state.finished).toBe(true);
      expect(ctrl.state.verdict?.label).toBe("FAIL");

      // Replay recorded episode via ArenaController
      await ctrl.runReplay(rec!);
      expect(ctrl.game.id).toBe(game.id);
      expect(ctrl.state.status).toBe("done");
      expect(ctrl.state.finished).toBe(true);
      expect(ctrl.state.verdict?.label).toBe("FAIL");
    }
  });

  it("supports vision frame capture callback on ArenaController during runModel()", async () => {
    const ctrl = new ArenaController("cue_manual", 0, "robot-arm");
    ctrl.speed = 500;
    ctrl.vision = true;
    ctrl.captureLeftJpeg = () => "data:image/jpeg;base64,ROBOT_ARM_3D_FRAME";

    const rec = await ctrl.runModel(ctrl.game.scriptedProvider("cautious"), "mock/cautious");
    expect(rec).not.toBeNull();
    expect(rec!.vision).toBe(true);
    expect(ctrl.state.lastFrame).toBe("data:image/jpeg;base64,ROBOT_ARM_3D_FRAME");
    expect(ctrl.state.verdict?.label).toBe("PASS");
  });
});
