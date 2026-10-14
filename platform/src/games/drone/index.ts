import type { Game } from "../../core/types";
import { CONDITION_METAS } from "./conditions";
import { scriptedProvider } from "./mock";
import { DroneSession } from "./session";

export const droneGame: Game = {
  id: "drone-rescue",
  title: "Rescue Drone",
  conditions: CONDITION_METAS,
  createSession: (conditionId, seed) => new DroneSession(conditionId, seed),
  scriptedProvider,
};

export { DroneSession } from "./session";
export { REIMAGINING_MAP, INVARIANTS } from "./lexicon";
export * as contract from "./contract";
