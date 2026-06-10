import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const OUT = process.env.OUT || "/tmp/qa/run1";
const ROUTES = JSON.parse(process.env.ROUTES || "[]");
const VPS = [{n:"mobile",w:390,h:844},{n:"laptop",w:1366,h:820},{n:"desktop",w:1920,h:1080}];
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
const consoleErrors = [];
p.on("console", m => { if (m.type()==="error") consoleErrors.push(m.text().slice(0,160)); });
await p.goto(`${BASE}/login`,{waitUntil:"domcontentloaded"});
await p.getByPlaceholder("you@company.com").fill("wireline.demo@trywireline.com");
await p.locator('input[type="password"]').fill("WirelineDemo!2026");
await Promise.all([p.waitForResponse(r=>r.url().includes("/api/auth/signin")), p.locator('form').getByRole("button",{name:/^sign in/i}).click()]);
await p.waitForTimeout(1500);
const report = [];
for (const [name, route] of ROUTES) {
  for (const v of VPS) {
    const errStart = consoleErrors.length;
    await p.setViewportSize({ width: v.w, height: v.h });
    try { await p.goto(`${BASE}${route}`,{waitUntil:"domcontentloaded"}); } catch {}
    await p.waitForTimeout(2200);
    const overflow = await p.evaluate(() => {
      const de = document.documentElement;
      return { x: de.scrollWidth - de.clientWidth, vw: window.innerWidth };
    }).catch(()=>({x:-1,vw:v.w}));
    const url = p.url();
    const redirected = !url.includes(route.split("?")[0]);
    await p.screenshot({ path: `${OUT}/${name}-${v.n}.png` });
    report.push({ name, route, vp: v.n, url, redirected, overflowPx: overflow.x, newErrors: consoleErrors.length-errStart });
  }
}
await b.close();
console.log(JSON.stringify(report,null,1));
