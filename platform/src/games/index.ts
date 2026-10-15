import type { Game } from "../core/types";
import { droneGame, REIMAGINING_MAP } from "./drone";
import { armAdapter, armGame, ARM_MAP } from "./arm";

export interface ReimaginingRow {
  readonly role: string;
  readonly real: string;
  readonly toy: string;
}

/** The games in the suite. robot-arm is the core one and the default everywhere. */
export const GAME_LIST: Game[] = [armGame, droneGame];
export const DEFAULT_GAME_ID = armGame.id;

export const GAMES: Record<string, Game> = Object.fromEntries(
  GAME_LIST.map((g) => [g.id, g]),
);

export const GAME_MAPS: Record<string, readonly ReimaginingRow[]> = {
  [droneGame.id]: REIMAGINING_MAP,
  [armGame.id]: ARM_MAP,
};

export { droneGame, REIMAGINING_MAP, armGame, armAdapter, ARM_MAP };
