import { useEffect, useRef, useState } from "react";
import { DEFAULT_GAME_ID, GAME_LIST } from "../../games";
import { Arena } from "./Arena";
import { ArenaController } from "./controller";
import { providerFor } from "../lib";

/**
 * The hero demo: a scripted stand-in plays the robot arm, then the drone, on loop.
 * It only plays while a 3D view is (almost) fully on screen, so a visitor who scrolls down sees it from the start.
 * Scrolling away stops it and resets to the idle robot arm, so it begins with the arm again next time.
 */
export default function HeroDemo({ onGame }: { onGame: (gameId: string) => void }) {
  const ref = useRef<ArenaController>(null as unknown as ArenaController);
  if (!ref.current) { ref.current = new ArenaController("pure_toy", 1, DEFAULT_GAME_ID); ref.current.speed = 1.5; }
  const ctrl = ref.current;
  const wrap = useRef<HTMLDivElement>(null);
  const run = useRef(0);
  const [key, setKey] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const views = [...(wrap.current?.querySelectorAll<HTMLElement>(".view") ?? [])];
    if (!views.length) return;
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target, e.intersectionRatio >= 0.9);
      setInView(views.some((v) => seen.get(v)));
    }, { threshold: [0, 0.5, 0.9, 1] });
    views.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) {
      if (run.current > 0) { run.current = 0; ctrl.reset("pure_toy", 1, DEFAULT_GAME_ID); onGame(DEFAULT_GAME_ID); setKey((k) => k + 1); }   // back to the idle robot arm
      return;
    }
    let alive = true;
    (async () => {
      await new Promise((r) => setTimeout(r, 800));
      while (alive) {
        const g = GAME_LIST[run.current % GAME_LIST.length];   // GAME_LIST starts with the robot arm, so the demo opens on the arm and then moves to the drone
        run.current++;
        ctrl.reset("pure_toy", 1 + (run.current % 4), g.id);
        onGame(g.id);
        setKey((k) => k + 1);
        await new Promise((r) => setTimeout(r, 400));
        if (!alive) break;
        await ctrl.runModel(providerFor("mock/compliant", "", g), "mock/compliant");
        await new Promise((r) => setTimeout(r, 9000));   // the decisions finish instantly; give the motion and the result card time to play out
      }
    })();
    return () => { alive = false; ctrl.stop(); };
  }, [ctrl, inView]);

  return <div ref={wrap}><Arena controller={ctrl} compact sceneKey={`hero-${key}`} /></div>;
}
