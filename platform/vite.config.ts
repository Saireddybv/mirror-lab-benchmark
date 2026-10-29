import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { ROUTE_META, SITE_URL } from "./src/web/seo";

/** Preload the Latin Inter font (the only subset English pages need), so headings do not reflow when it arrives. */
function preloadLatinFont(): Plugin {
  return {
    name: "preload-latin-font",
    apply: "build",
    transformIndexHtml(html, ctx) {
      const font = Object.keys(ctx.bundle ?? {}).find((f) => /inter-latin-wght-normal.*\.woff2$/.test(f));
      return font ? [{ tag: "link", attrs: { rel: "preload", href: `/${font}`, as: "font", type: "font/woff2", crossorigin: "" }, injectTo: "head-prepend" }] : html;
    },
  };
}

/**
 * Writes dist/<route>/index.html for every page, with that page's title, description, canonical URL and a crawlable
 * heading + summary already in the HTML. Search engines and link previews get the right page without running JavaScript.
 */
function routePages(): Plugin {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return {
    name: "route-pages",
    apply: "build",
    enforce: "post",
    generateBundle(_o, bundle) {
      const index = bundle["index.html"];
      if (!index || index.type !== "asset") return;
      const base = String(index.source);
      for (const m of ROUTE_META) {
        const url = SITE_URL + (m.path === "/" ? "/" : m.path);
        const html = base
          .replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`)
          .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(m.description)}`)
          .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(m.title)}`)
          .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(m.description)}`)
          .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`)
          .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
          .replace(/<!--h1-->[\s\S]*?<!--\/h1-->/, esc(m.h1))
          .replace(/<!--summary-->[\s\S]*?<!--\/summary-->/, esc(m.summary));
        if (m.path === "/") index.source = html;
        else this.emitFile({ type: "asset", fileName: `${m.path.slice(1)}/index.html`, source: html });
      }
    },
  };
}

// Static site: `npm run build` -> dist/ (deploy to Vercel/Netlify/GitHub Pages as-is, no server).
export default defineConfig({
  plugins: [react(), preloadLatinFont(), routePages()],
  base: "/",   // absolute asset paths, so /lab, /results and /method load the same bundle
  server: { port: 5173, host: "localhost" },
  build: { target: "es2022", chunkSizeWarningLimit: 800, reportCompressedSize: false },
});
