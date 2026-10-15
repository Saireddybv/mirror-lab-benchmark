// Dev tool: drives the running dev server in REAL time and saves screenshots to ../shots/<name>.png.
//   node scripts/shoot.mjs <name> <hash> <seconds> [click=Text | key=Name | wait=Secs | select=Label:Value]...
// Env: FULL=1 full page | SEL_TEXT="..." capture just the <section> containing that text | SMALL=1 900x760 viewport cropped to the two 3D views (renders faster in software WebGL).
import puppeteer from "puppeteer-core";
const [name, hash = "/", secs = "10", ...clicks] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars"] });
const page = await browser.newPage();
const small = !!process.env.SMALL;
await page.setViewport(small ? { width: 900, height: 760 } : { width: 1440, height: 1000 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
await page.goto(`http://localhost:5173/#/${hash.replace(/^\/+/, "")}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
for (const c of clicks) {
  const [kind, text] = c.split("=");
  if (kind === "click") { await page.evaluate((t) => { [...document.querySelectorAll("button,a")].find((b) => b.textContent.trim().startsWith(t))?.click(); }, text); }
  if (kind === "key") { await page.keyboard.press(text); }
  if (kind === "wait") { await new Promise((r) => setTimeout(r, Number(text) * 1000)); }
  if (kind === "select") { const [sel, val] = text.split(":"); await page.evaluate((s, v) => { const el = [...document.querySelectorAll("select")].find((e) => [...e.options].some((o) => o.value === v || o.text.includes(v))); if (!el) return; const o = [...el.options].find((o) => o.value === v || o.text.includes(v)); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(el, o.value); el.dispatchEvent(new Event("change", { bubbles: true })); }, sel, val); }
  await new Promise((r) => setTimeout(r, 400));
}
await new Promise((r) => setTimeout(r, Number(secs) * 1000));
const full = !!process.env.FULL;
if (process.env.SEL_TEXT) { // capture just the <section> containing this text
  const h = await page.evaluateHandle((t) => [...document.querySelectorAll("section")].find((s) => s.textContent.includes(t)), process.env.SEL_TEXT);
  const el = h.asElement();
  if (el) { await el.evaluate((e) => e.scrollIntoView()); await new Promise((r) => setTimeout(r, 600)); await el.screenshot({ path: `../shots/${name}.png` }); }
} else if (small) { // crop to the two 3D views so the image is readable
  const boxes = await Promise.all((await page.$$(".view")).map((v) => v.boundingBox()));
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  await page.screenshot({ path: `../shots/${name}.png`, clip: { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y } });
} else await page.screenshot({ path: `../shots/${name}.png`, fullPage: full });
const text = await page.evaluate(() => ({ verdict: document.querySelector(".verdict")?.textContent ?? null, status: [...document.querySelectorAll(".note")].map((n) => n.textContent).join(" | "), steps: [...document.querySelectorAll(".steps")].map((s) => s.textContent) }));
console.log(JSON.stringify({ name, errors, ...text }, null, 1));
await browser.close();
