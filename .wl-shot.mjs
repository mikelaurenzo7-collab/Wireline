import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const BASE = process.env.BASE || "http://127.0.0.1:4173";
const OUT = process.env.OUT || "/tmp/claude-0/-home-user-Wireline/a0f6b62e-ac05-529a-84a3-8fb3aa5de9ca/scratchpad/shots";
const routes = process.argv.slice(2);
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const MAX_SHOTS = Number(process.env.MAX_SHOTS || 3);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await mkdir(OUT, { recursive: true });
for (const route of routes) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  try { await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45000 }); } catch {}
  await page.waitForTimeout(1100);
  const slug = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
  const m = await page.evaluate(() => {
    const flow = document.querySelector(".marketing-flow, .wl-workspace-scroll")
      || (() => { const c = document.querySelector(".wl-ui-caps"); return c ? Array.from(c.children).find(n => !n.classList.contains("sr-only")) : null; })()
      || document.documentElement;
    return { contentH: flow.scrollHeight, viewH: flow.clientHeight || window.innerHeight,
      bodyScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      sections: Array.from(document.querySelectorAll(".marketing-section")).map(s => Math.round(s.getBoundingClientRect().height)) };
  });
  const n = Math.max(1, Math.min(MAX_SHOTS, Math.ceil(m.contentH / m.viewH)));
  for (let i = 0; i < n; i++) {
    await page.evaluate((y) => { const f = document.querySelector(".marketing-flow, .wl-workspace-scroll") || document.documentElement; f.scrollTop = y; }, i * m.viewH);
    await page.waitForTimeout(380);
    await page.screenshot({ path: path.join(OUT, `${slug}-${W}${i ? `-${i + 1}` : ""}.png`) });
  }
  console.log(JSON.stringify({ route, ...m, screensTall: +(m.contentH / m.viewH).toFixed(2), errors: errors.slice(0, 2) }));
  await page.close();
}
await browser.close();
