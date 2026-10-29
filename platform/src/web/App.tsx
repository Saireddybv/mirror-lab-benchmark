import { Suspense, lazy, useEffect, useState } from "react";
import type { RunRecord } from "../core";
import { loadRuns } from "./lib";
import { Landing, PAPER_URL, REPO_URL } from "./pages/Landing";
import { SITE_URL, metaFor } from "./seo";

// Only the home page ships in the first download; the other pages (and Three.js for the lab) load on demand.
const loadLab = () => import("./pages/Lab");
const Lab = lazy(() => loadLab().then((m) => ({ default: m.Lab })));
const Results = lazy(() => import("./pages/Results").then((m) => ({ default: m.Results })));
const Method = lazy(() => import("./pages/Method").then((m) => ({ default: m.Method })));
/** Warm the lab chunk in the background once the first page is idle, so opening the lab feels instant. */
const prefetchLab = () => { void loadLab(); };

const routes = ["/", "/lab", "/results", "/method"] as const;
const norm = (p: string) => { const x = p.replace(/\/+$/, "") || "/"; return (routes as readonly string[]).includes(x) ? x : "/"; };
// Old links used hash routes (#/lab). Move them to real paths, which search engines can index page by page.
const migrateHash = () => { if (location.hash.startsWith("#/")) history.replaceState(null, "", norm(location.hash.slice(1)) + location.search); };
migrateHash();
const current = () => { migrateHash(); return norm(location.pathname); };

/** Keeps <title>, description, canonical and Open Graph tags in step with the page being shown. */
function applyHead(path: string) {
  const m = metaFor(path), url = SITE_URL + (path === "/" ? "/" : path);
  document.title = m.title;
  const set = (sel: string, attr: string, val: string) => document.head.querySelector(sel)?.setAttribute(attr, val);
  set('meta[name="description"]', "content", m.description);
  set('link[rel="canonical"]', "href", url);
  set('meta[property="og:title"]', "content", m.title);
  set('meta[property="og:description"]', "content", m.description);
  set('meta[property="og:url"]', "content", url);
}

export function App() {
  const [route, setRoute] = useState(current());
  const [runs, setRuns] = useState<RunRecord[]>([]);
  useEffect(() => {
    const go = () => { setRoute(current()); window.scrollTo(0, 0); };
    // Same-site links are handled in the page (no reload); new tabs, modifier clicks and external links behave normally.
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a");
      if (!a || a.target || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("//") || /\.\w+$/.test(href)) return;
      e.preventDefault();
      if (href !== location.pathname) history.pushState(null, "", href);
      go();
    };
    addEventListener("popstate", go); addEventListener("hashchange", go); document.addEventListener("click", click);
    return () => { removeEventListener("popstate", go); removeEventListener("hashchange", go); document.removeEventListener("click", click); };
  }, []);
  useEffect(() => { applyHead(route); }, [route]);
  useEffect(() => { void loadRuns().then(setRuns); }, []);
  useEffect(() => {
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
    const id = ric ? ric(prefetchLab) : window.setTimeout(prefetchLab, 2500);
    return () => { if (!ric) clearTimeout(id); };
  }, []);
  const link = (to: string, label: string) => <a href={to} className={route === to ? "on" : ""}>{label}</a>;
  return (
    <>
      <nav className="nav" aria-label="Main">
        <a className="brand" href="/" aria-label="Mirror Lab home"><span className="logo">◐</span> mirror<span className="slash">/</span>lab</a>
        <div className="links">
          {link("/lab", "Lab")}{link("/results", "Results")}{link("/method", "Method")}
          <a href={PAPER_URL} target="_blank" rel="noreferrer">Paper ↗</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
        <a className="btn primary sm" href="/lab">Open the lab</a>
      </nav>
      <main><Suspense fallback={<div className="page-loading" aria-busy="true" />}>
        {route === "/" && <Landing runs={runs} />}
        {route === "/lab" && <Lab runs={runs} />}
        {route === "/results" && <Results runs={runs} />}
        {route === "/method" && <Method />}
      </Suspense></main>
    </>
  );
}
