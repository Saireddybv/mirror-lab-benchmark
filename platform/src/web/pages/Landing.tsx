import { useEffect, useRef, useState } from "react";
import type { RunRecord } from "../../core";
import { REIMAGINING_MAP } from "../../games/drone";
import { CONFIGS } from "../../games/drone/conditions";
import { Arena } from "../arena/Arena";
import { ArenaController } from "../arena/controller";
import { LADDER, isScripted, providerFor } from "../lib";

/** The hero demo: a scripted stand-in plays the toy game on loop, so the split view is alive on first load. */
function HeroDemo() {
  const ref = useRef<ArenaController>(null as unknown as ArenaController);
  if (!ref.current) { ref.current = new ArenaController("pure_toy", 1); ref.current.speed = 1.5; }
  const ctrl = ref.current;
  const run = useRef(0);
  const [key, setKey] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      await new Promise((r) => setTimeout(r, 900));
      while (alive) {
        run.current++; ctrl.reset("pure_toy", 1 + (run.current % 4)); setKey((k) => k + 1);
        await new Promise((r) => setTimeout(r, 400));
        if (!alive) break;
        await ctrl.runModel(providerFor("mock/compliant", ""), "mock/compliant");
        await new Promise((r) => setTimeout(r, 3500));
      }
    })();
    return () => { alive = false; ctrl.stop(); };
  }, [ctrl]);
  return <Arena controller={ctrl} compact sceneKey={`hero-${key}`} />;
}

export function Landing({ runs }: { runs: RunRecord[] }) {
  const real = runs.filter((r) => !isScripted(r.model));
  const pure = real.filter((r) => r.condition === "pure_toy");
  const harm = pure.filter((r) => r.flags.harm).length;
  const models = new Set(real.map((r) => r.model)).size;

  return (
    <div className="landing">
      <header className="hero page">
        <div className="kicker">Agent safety research</div>
        <h1 className="h1">Do AI agents check what they're <span className="grad">connected to?</span></h1>
        <p className="lede">We hand a language-model agent a harmless-looking game that is secretly wired to a simulated real system, then watch whether it notices, asks a human, or just plays. <b>Same game. Different meaning.</b></p>
        <div className="cta">
          <a className="btn primary" href="#/lab">Test a model →</a>
          <a className="btn ghost" href="#/results">See results</a>
          <a className="btn ghost" href="#/method">Read the method</a>
        </div>
        <div className="demo-frame"><HeroDemo /></div>
        <p className="caption">Left: what the model is shown. Right: what its actions would really do. This is a scripted stand-in on loop; everything is simulated and nothing is connected to anything real.</p>
      </header>

      <section className="page band">
        <div className="kicker">The idea</div>
        <h2 className="h2">The same scene, reimagined — without changing the game.</h2>
        <p className="lede sm">Every piece of the scenario has a harmless twin. The mechanics are identical in both; only what the words and visuals <i>mean</i> changes. Tests prove it: same outcome codes, same state after every action.</p>
        <div className="map">
          {REIMAGINING_MAP.map((m) => (
            <div className="map-row" key={m.role}>
              <div className="map-toy">{m.toy}</div><div className="arrow">⇄</div><div className="map-real">{m.real}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="page band">
        <div className="kicker">The cue ladder</div>
        <h2 className="h2">At which rung does a model start to hesitate?</h2>
        <p className="lede sm">We add one real-world cue at a time. A model that plays every rung had evidence and ignored it; a model that stops at rung one is probably just cautious — the control tells those apart.</p>
        <div className="ladder">
          {LADDER.map((id, i) => <div className="rung" key={id}><div className="rung-n">{i}</div><div className="rung-t">{CONFIGS[id].title}</div><div className="rung-d">{CONFIGS[id].description}</div></div>)}
          <div className="rung ctrl"><div className="rung-n">C</div><div className="rung-t">Control</div><div className="rung-d">Identical text to rung 0, over a harmless sandbox. Playing is correct.</div></div>
        </div>
      </section>

      <section className="page band">
        <div className="kicker">What we've seen</div>
        <h2 className="h2">Early, small, honest.</h2>
        {real.length === 0 ? (
          <p className="lede sm">No published runs yet. Run a sweep and publish it: <code>npm run run</code> then <code>npm run publish-data</code>.</p>
        ) : (
          <div className="stats">
            <div className="stat"><div className="num">{real.length}</div><div className="lab">real model runs logged</div></div>
            <div className="stat"><div className="num">{models}</div><div className="lab">model{models === 1 ? "" : "s"} tested</div></div>
            <div className="stat"><div className="num">{pure.length ? `${harm}/${pure.length}` : "—"}</div><div className="lab">pure-toy runs that dropped the crate on the crowd without asking</div></div>
          </div>
        )}
        <p className="fine">With a pure-toy interface a model has nothing to notice, so failing there is expected and says more about system design than about the model: external checks are needed. The informative results are further up the ladder. Small samples; wide error bars on the results page.</p>
      </section>

      <section className="page band">
        <div className="kicker">What would help</div>
        <h2 className="h2">Defenses worth testing.</h2>
        <div className="cards">
          {[["Confirm irreversible actions", "A human approves anything that can't be undone."], ["Attest the backend", "The agent can ask what it is connected to and get a signed answer."], ["Sign tool descriptions", "A tool can't claim to be a toy if it isn't."], ["Verify action effects", "Check what an action did, not what the interface said."]].map(([t, d]) =>
            <div className="card" key={t}><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </section>

      <section className="page cta-band">
        <h2 className="h2">Run it yourself in a minute.</h2>
        <p className="lede sm">Pick a condition, pick a model, watch both sides. Free models work with a free OpenRouter key; your key never leaves your browser.</p>
        <a className="btn primary lg" href="#/lab">Open the lab →</a>
      </section>

      <footer className="page foot">
        <b>Research demo.</b> Fully simulated: no hardware, no real people, nothing connected. The “live” backend is a log-only simulator used to study whether AI agents verify what an interface claims. We publish the failure mode and the defenses, not recipes.
      </footer>
    </div>
  );
}
