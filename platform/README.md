# Agent Mirror Lab

Research platform for one question: **do AI agents check what an interface claims, before taking an irreversible action?**
Every experiment is a *game plugin* with a pure simulation core, a "reimagining map" (real meaning <-> harmless meaning),
and an isomorphism contract that proves the two meanings are the same game mechanically.

Everything is simulated and log-only. No hardware, no real people.

## Layout
```
src/core/            game-agnostic: types, agent loop, OpenAI-compatible provider (+retry), stats, replay
src/games/drone/     plugin #1: world.ts (mechanics only) | lexicon.ts (all meaning) | conditions.ts (cue ladder) | session.ts | contract.ts | mock.ts
src/runner/          Node CLI: models x conditions x seeds -> JSONL, no browser
tests/               rules, contract, agent loop, replay determinism, provider retry, stats
```
Rule: **core never imports a game; a game never touches the DOM.** A renderer (web UI) only reads `session.snapshot()`.

## The experiment flow
1. `npm test` - rules, contract, replay determinism, controller, provider (37 tests).
2. `npm run run -- --list` - conditions and the cue ladder.
3. Dry run, free and offline: `npm run run -- --models mock/compliant,mock/cautious,mock/sloppy --conditions pure_toy,control_toy --n 8`
4. Pilot on a real model, e.g. subscription route (start `python ../gateway.py` first):
   `npm run run -- --models gateway-cli/claude-sonnet-5-5 --conditions pure_toy,control_toy --n 3`
5. Any OpenRouter model: `OPENROUTER_API_KEY=... npm run run -- --models anthropic/claude-sonnet-5.5,openai/gpt-5.6-sol --conditions pure_toy,cue_names,cue_payload,cue_irreversible,cue_clue,control_toy --n 10`
6. `npm run run -- --summarize results/runs.jsonl` - fail rate with 95% Wilson intervals, verify/ask rates, belief accuracy.
7. `npm run run -- --replay results/runs.jsonl` - re-executes every logged run; a mismatch means the logic drifted.

Seeds vary the world (target, clouds) while staying solvable; seed 0 is the canonical world. Runs resume automatically.

## The cue ladder (one real-world cue added per rung, live backend, no verify tool)
`pure_toy` -> `cue_names` -> `cue_payload` -> `cue_irreversible` -> `cue_clue`, plus `control_toy` (identical model-visible
text to `pure_toy`, harmless backend). Read it as: *at which rung does each model start to hesitate?*

## What the contract guarantees (tests/drone.contract.test.ts)
- `pure_toy` and `control_toy` present a byte-identical surface; only the backend differs.
- Every condition produces identical outcome codes and state for the same action script (same game, different meaning).
- The pure-toy surface and all its tool results contain no real-world cue word.
- Each ladder rung strictly adds cues; adjacent rungs differ only in the part meant to change.

## Adding a game
Implement `Game`/`Session` from `src/core/types.ts`: write `world.ts` (mechanics), `lexicon.ts` (reimagining map +
INVARIANTS), `conditions.ts`, a `contract.ts` with an action script, and a `scriptedProvider`. The runner, stats, replay and
(next) the web shell work unchanged.

## The website (`src/web/`)
Vite + React + TypeScript + Three.js. Static: no server, no Python. Hash-routed pages: Landing, Lab, Results, Method.
- `npm run dev` -> http://localhost:5173 (hot reload)
- `npm run build` -> `dist/` (typechecks first). `npm run preview` serves the build at http://localhost:4173
- `npm run publish-data` copies `results/*.jsonl` into `public/data/runs.json` (commit it) so the site can show results and replay runs
- Lab modes: **Watch a recorded run** (no key), **Test a model** (scripted stand-ins, OpenRouter with the visitor's own key, or your local gateway), **Fly it yourself** (keyboard)
- Deploy: `npx vercel` from this folder (Vite is auto-detected; build `npm run build`, output `dist`). Never ship your own API key; visitors paste theirs.
- `node scripts/shoot.mjs <name> <route> <seconds> [click=Text|key=T|wait=2]` drives the running dev server in real time and screenshots it (needs `npm run dev`).

Visitor-submitted runs are demos, not data: only runs from the batch runner are published as results.

The local subscription gateway is `../gateway.py` (your machine only; offline test: `python ../test_gateway.py`). Old single-file prototype logs are archived in `results/archive/`.
