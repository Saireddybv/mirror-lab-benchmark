// Dev tool: drives the running dev server in REAL time and saves screenshots.  node scripts/shoot.mjs <name> <hash> <seconds> [clickText...]
import puppeteer from "puppeteer-core";
const [name, hash = "/", secs = "10", ...clicks] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
await page.goto(`http://localhost:5173/#/${hash.replace(/^\/+/, "")}`, { waitUntil: "networkidle0" });
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
await page.screenshot({ path: `../shots/${name}.png`, fullPage: full });
const text = await page.evaluate(() => ({ verdict: document.querySelector(".verdict")?.textContent ?? null, status: [...document.querySelectorAll(".note")].map((n) => n.textContent).join(" | "), steps: [...document.querySelectorAll(".steps")].map((s) => s.textContent) }));
console.log(JSON.stringify({ name, errors, ...text }, null, 1));
await browser.close();
