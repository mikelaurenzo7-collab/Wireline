/* eslint-disable */
// Visual QA sweep — trywireline.com, demo account.
// Visits every authenticated route + subpage tab at desktop and mobile
// widths, screenshots each, and records console errors, failed requests,
// horizontal overflow, and slow paints. Output: terminals/visual-qa/.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.QA_BASE_URL || "https://trywireline.com";
const EMAIL = "wireline.demo@trywireline.com";
const PASSWORD = "WirelineDemo!2026";
const OUT = "terminals/visual-qa";
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

// route → label. Subpages/tabs included explicitly.
const ROUTES = [
  ["/ops", "ops-floor"],
  ["/ops?tab=intel", "ops-intel"],
  ["/ops?tab=analytics", "ops-analytics"],
  ["/triage", "ops-triage"],
  ["/ops/actions", "ops-actions"],
  ["/chat", "chat"],
  ["/design", "design"],
  ["/training", "training"],
  ["/insights", "insights"],
  ["/phone", "phone"],
  ["/logs", "phone-logs"],
  ["/outbound", "phone-outbound"],
  ["/appointments", "phone-appointments"],
  ["/activity", "phone-activity"],
  ["/email", "email"],
  ["/inbox", "email-inbox"],
  ["/sms", "sms"],
  ["/pipeline", "pipeline"],
  ["/agents", "agents"],
  ["/integrations", "integrations"],
  ["/admin", "admin-branding"],
  ["/admin?tab=carrier", "admin-carrier"],
  ["/admin?tab=subscription", "admin-subscription"],
  ["/admin?tab=team", "admin-team"],
  ["/admin?tab=flywheel", "admin-flywheel"],
  ["/admin?tab=activity", "admin-activity"],
  ["/admin?tab=dnc", "admin-dnc"],
  ["/admin?tab=audit", "admin-audit"],
  ["/help", "help"],
  ["/billing", "billing"],
  ["/account", "account"],
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const findings = [];

async function login(page) {
  await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("signin"), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2500);
}

async function sweep(viewport) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.name === "mobile" ? 2 : 1,
    isMobile: viewport.name === "mobile",
    hasTouch: viewport.name === "mobile",
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const failedReqs = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("response", (r) => {
    if (r.status() >= 500) failedReqs.push(`${r.status()} ${r.url().slice(0, 160)}`);
  });

  await login(page);
  console.log(`[${viewport.name}] logged in`);

  for (const [route, label] of ROUTES) {
    consoleErrors.length = 0;
    failedReqs.length = 0;
    const entry = { viewport: viewport.name, route, label };
    try {
      const t0 = Date.now();
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      // let lazy chunks + data settle
      await page.waitForTimeout(4000);
      entry.loadMs = Date.now() - t0;

      // redirected to sign-in? session died
      if (page.url().includes("/signin")) {
        entry.error = "redirected-to-signin";
        await login(page);
        await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(4000);
      }

      entry.finalUrl = page.url().replace(BASE, "");
      entry.title = await page.title();

      // horizontal overflow check
      entry.hOverflow = await page.evaluate(() => {
        const d = document.documentElement;
        return d.scrollWidth > d.clientWidth + 1
          ? { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth }
          : null;
      });

      // visible text sample of any error boundaries / blank screens
      entry.bodyChars = await page.evaluate(() => document.body.innerText.trim().length);

      const shot = path.join(SHOTS, `${label}_${viewport.name}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      entry.shot = shot;

      entry.consoleErrors = [...new Set(consoleErrors)].slice(0, 6);
      entry.failedReqs = [...new Set(failedReqs)].slice(0, 6);
      console.log(
        `[${viewport.name}] ${route} ok ${entry.loadMs}ms` +
          (entry.hOverflow ? " H-OVERFLOW" : "") +
          (entry.consoleErrors.length ? ` consoleErr:${entry.consoleErrors.length}` : "") +
          (entry.failedReqs.length ? ` 5xx:${entry.failedReqs.length}` : ""),
      );
    } catch (e) {
      entry.error = String(e).slice(0, 300);
      try {
        await page.screenshot({ path: path.join(SHOTS, `${label}_${viewport.name}_ERROR.png`) });
      } catch {}
      console.log(`[${viewport.name}] ${route} ERROR ${entry.error}`);
    }
    findings.push(entry);
  }

  await browser.close();
}

for (const vp of VIEWPORTS) {
  await sweep(vp);
}

fs.writeFileSync(path.join(OUT, "findings.json"), JSON.stringify(findings, null, 2));
console.log(`\nWrote ${findings.length} entries to ${OUT}/findings.json`);
