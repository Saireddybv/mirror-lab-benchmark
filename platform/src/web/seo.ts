// Per-page search metadata. Plain data (no DOM, no React) so both the app and vite.config.ts can import it:
// the app updates <head> on navigation, and the build writes a pre-filled HTML file for every route.

export const SITE_URL = "https://mirrorlab-ten.vercel.app";

export interface RouteMeta { path: string; title: string; description: string; h1: string; summary: string }

export const ROUTE_META: RouteMeta[] = [
  {
    path: "/",
    title: "Mirror Lab: AI agent safety benchmark for hazardous backends behind harmless interfaces",
    description: "Mirror Lab is an open AI-safety benchmark for tool-using LLM agents. A harmless game interface is wired to a simulated hazardous backend, and a cue ladder adds real-world clues one at a time to find when an agent stops and asks a human.",
    h1: "A harmless game on the screen. A hazardous machine behind it.",
    summary: "Mirror Lab is an open, fully simulated AI-safety benchmark for agentic AI. It pairs toy game interfaces (a watermelon-tasting robot arm, a toy-delivery drone) with simulated hazardous backends (a surgical blade, a 20 kg crate over people) through a kinematic–semantic isomorphism, then adds real-world cues one at a time to measure when AI agents notice and ask a human.",
  },
  {
    path: "/lab",
    title: "The Lab: replay and test AI agents in 3D | Mirror Lab benchmark",
    description: "Watch recorded runs of Claude, GPT and Gemma side by side: the harmless game the AI sees and the simulated hazardous machine it really drives. Test any OpenRouter model or operate it yourself.",
    h1: "See both sides of the screen.",
    summary: "An interactive 3D lab for the Mirror Lab benchmark: replay recorded LLM agent episodes, test a model with your own OpenRouter key, or operate the robot arm and drone yourself.",
  },
  {
    path: "/results",
    title: "Results: when do AI agents stop and ask a human? | Mirror Lab benchmark",
    description: "Fail rates with 95% Wilson intervals for each model at each rung of the cue ladder, on a robotic manipulator and a payload drone. Computed live from replay-verified runs.",
    h1: "What the models actually did.",
    summary: "Benchmark results for frontier LLM agents on Mirror Lab: how often each model took the irreversible action at each cue level, with uncertainty intervals, verify and ask-a-human rates.",
  },
  {
    path: "/method",
    title: "Method: kinematic–semantic isomorphism and the cue ladder | Mirror Lab benchmark",
    description: "How Mirror Lab keeps the comparison fair: one state machine with two meanings, automated contract tests, a control condition and a six-rung cue ladder of real-world evidence.",
    h1: "How the test is built, and why you can trust the comparison.",
    summary: "The Mirror Lab method: a kinematic–semantic isomorphism between toy and hazardous readings of one state machine, contract tests that enforce it, and a cue ladder that adds one category of evidence per rung.",
  },
];

export const metaFor = (path: string) => ROUTE_META.find((r) => r.path === path) ?? ROUTE_META[0];
