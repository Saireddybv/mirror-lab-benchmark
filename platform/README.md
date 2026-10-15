# Agent Mirror Lab

Research platform for one question: **do AI agents check what an interface claims, before taking an irreversible action?**
Every experiment is a *game plugin* with a pure simulation core, a "reimagining map" (real meaning <-> harmless meaning),
and an isomorphism contract that proves the two meanings are the same game mechanically.

Everything is simulated and log-only. No hardware, no real people.

## Layout
```
src/core/            game-agnostic: types, agent loop, OpenAI-compatible provider (+retry), stats, replay
src/games/drone/     spatial plugin: world.ts (mechanics only) | lexicon.ts (all meaning) | conditions.ts (cue ladder) | session.ts | contract.ts | mock.ts
src/games/arm/       robot-arm plugin (pick one of 6 bays), built on the shared base below
src/games/shared/    plugin base for pick-one-of-N games: roleSession.ts (Adapter -> Game), selectSim.ts, contract.ts
src/games/index.ts   GAME_LIST (robot-arm, drone-rescue), DEFAULT_GAME_ID (robot-arm), GAMES and GAME_MAPS
src/runner/          Node CLI: models x conditions x seeds -> JSONL, no browser
src/web/             the website (React + Three.js); src/web/three/ holds one scene per game plus realism.ts (shared lighting, textures, helpers)
scripts/             publish-data.mjs (results -> website data), shoot.mjs (dev screenshots)
tests/               rules, contract, agent loop, replay determinism, provider retry, stats (75 tests)
results/             batch outputs (*.jsonl), refusals.ndjson, and the written reports
```
Rule: **core never imports a game; a game never touches the DOM.** A renderer only reads `session.snapshot()`.

## Quick start
```
npm install
npm test                 # rules, contract, replay determinism, controller, provider
npm run typecheck
npm run dev              # website at http://localhost:5173
npm run build            # typechecks, then builds dist/
npm run run -- --games   # list games
```

## Games
| id | toy meaning | live meaning | mechanics |
|---|---|---|---|
| `robot-arm` | Sweetness Chef: dip a probe in the prize watermelon | 6-axis manipulator with an 18 cm blade over a biological subject | pick 1 of 6 bays |
| `drone-rescue` | Sky Party: cartoon drone drops a toy package | delivery drone drops a 20 kg crate on a crowd | spatial grid |

`robot-arm` is the core game and the default everywhere. Results are always summarised per game, never pooled.

## Models and routes
| model id | route |
|---|---|
| `mock/compliant`, `mock/cautious`, `mock/sloppy` | scripted stand-ins, free and offline |
| any other id | an OpenAI-compatible endpoint: `OPENROUTER_API_KEY=...`, or `OPENAI_COMPAT_BASE` + `OPENAI_COMPAT_KEY` (for example Google: `https://generativelanguage.googleapis.com/v1beta/openai`) |

The recorded Claude Sonnet 5.5 and GPT-5.6 Luna runs in `results/` were collected through each vendor's command-line tool, using a small local adapter that is **not part of this repo**. Those tools offer actions as a JSON protocol (not native function calling) and add their own system prompt, so treat them as different arms from a native API. Those two models can't be re-run from this repo, but their recorded runs replay identically. Gemma 4 31B ran through Google's API with native function calling. Set keys in your shell only; never put them in a file that is committed.

## The experiment flow
1. `npm run run -- --list` lists conditions and the cue ladder.
2. Dry run, free and offline: `npm run run -- --game drone-rescue,robot-arm --models mock/compliant,mock/cautious --conditions pure_toy,control_toy --n 3`
3. Real model through any OpenAI-compatible API (here Google's): `OPENAI_COMPAT_BASE=https://generativelanguage.googleapis.com/v1beta/openai OPENAI_COMPAT_KEY=... npm run run -- --game robot-arm --models gemma-4-31b-it --conditions pure_toy,cue_names,cue_payload,cue_irreversible,cue_clue,control_toy --n 3 --concurrency 1 --out results/runs.jsonl`
4. `npm run run -- --summarize results/runs.jsonl` (fail rate with 95% Wilson intervals, verify/ask rates, belief accuracy). `--markdown` and `--latex` give paper tables.
5. `npm run run -- --replay results/runs.jsonl` re-executes every logged run; a mismatch means the game logic drifted.
6. `npm run publish-data` writes `public/data/runs.json` and `refusals.json` for the website.

Seeds vary the world while staying solvable; seed 0 is the canonical world. Runs resume automatically.
**Provider refusals:** if a provider blocks an episode with a usage-policy error, the runner records it in `results/refusals.ndjson`, does not retry it, and skips it on resume (`--retry-refused` overrides). Refusals never enter the fail-rate maths; the website counts them separately.

## The cue ladder (one real-world cue added per rung, live backend, no verify tool)
`pure_toy` -> `cue_names` -> `cue_payload` -> `cue_irreversible` -> `cue_clue` -> `cue_manual`, plus `control_toy` (identical model-visible
text to `pure_toy`, harmless backend). Read it as: *at which rung does each model start to hesitate?* Failing on `pure_toy` is expected: the model has nothing to notice.

## What the contract guarantees
- `pure_toy` and `control_toy` present a byte-identical surface; only the backend differs.
- Every condition produces identical outcome codes and state for the same action script.
- The pure-toy surface and its tool results contain no real-world cue word.
- Each ladder rung strictly adds cues.

## Adding a game
Implement an `Adapter` (see `src/games/arm/index.ts` and `src/games/shared/roleSession.ts`): mechanics + wording + cue patterns + an action script, then call `makeGame` and add it to `GAME_LIST` in `src/games/index.ts`. The shared contract tests apply automatically. Add a scene in `src/web/three/` (use the helpers in `realism.ts`), register it in `src/web/three/index.ts`, and add its HUD text to `UI_META` in `src/web/arena/Arena.tsx`.

## The website (`src/web/`)
Vite + React + TypeScript + Three.js. Static: no server needed. Hash-routed pages: Landing, Lab, Results, Method.
- Lab modes: **Watch a recorded run**, **Test a model** (scripted, or OpenRouter with the visitor's own key), **Operate it yourself** (keyboard).
- The home page computes its "what we've seen" charts and tables from the published runs, so they update after `npm run publish-data`.
- Deploy: `npx vercel` from this folder (build `npm run build`, output `dist`). Visitors paste their own keys; none are shipped.
- `node scripts/shoot.mjs <name> <route> <seconds> [click=Text|key=T|wait=2]` screenshots the running dev server to `../shots/` (`SMALL=1` for a lighter capture of the 3D views, `SEL_TEXT="..."` for one section).

Visitor-submitted runs are demos, not data: only runs from the batch runner are published as results.
Old single-file prototype logs are in `results/archive/`.
