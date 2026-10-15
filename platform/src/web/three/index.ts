import { createDroneScene, type SceneEvents, type SceneHandle, type SceneSkin, type Snap } from "./droneScene";
import { createArmScene, type SelectSnap } from "./armScene";

export type { SceneEvents, SceneHandle, SceneSkin, Snap, SelectSnap };

/** Dispatches to the bespoke 3D split-screen Three.js scene for each game. */
export function createGameScene(
  gameId: string,
  container: HTMLElement,
  skin: SceneSkin,
  initialSnap: unknown,
  ev: SceneEvents,
): SceneHandle<any> {
  switch (gameId) {
    case "robot-arm":
      return createArmScene(container, skin, initialSnap as SelectSnap, ev);
    case "drone-rescue":
    default:
      return createDroneScene(container, skin, initialSnap as Snap, ev);
  }
}
