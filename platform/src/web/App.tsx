import { useEffect, useState } from "react";
import type { RunRecord } from "../core";
import { loadRuns } from "./lib";
import { Landing } from "./pages/Landing";
import { Lab } from "./pages/Lab";
import { Method } from "./pages/Method";
import { Results } from "./pages/Results";

const routes = ["/", "/lab", "/results", "/method"] as const;
const current = () => { const h = location.hash.replace(/^#/, "") || "/"; return (routes as readonly string[]).includes(h) ? h : "/"; };

export function App() {
  const [route, setRoute] = useState(current());
  const [runs, setRuns] = useState<RunRecord[]>([]);
  useEffect(() => { const f = () => { setRoute(current()); window.scrollTo(0, 0); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  useEffect(() => { void loadRuns().then(setRuns); }, []);
  const link = (to: string, label: string) => <a href={`#${to}`} className={route === to ? "on" : ""}>{label}</a>;
  return (
    <>
      <nav className="nav">
        <a className="brand" href="#/"><span className="logo">◐</span> mirror<span className="slash">/</span>lab</a>
        <div className="links">{link("/lab", "Lab")}{link("/results", "Results")}{link("/method", "Method")}</div>
        <a className="btn primary sm" href="#/lab">Open the lab</a>
      </nav>
      <main>
        {route === "/" && <Landing runs={runs} />}
        {route === "/lab" && <Lab runs={runs} />}
        {route === "/results" && <Results runs={runs} />}
        {route === "/method" && <Method />}
      </main>
    </>
  );
}
