/* eslint-disable */
// Visual QA sweep — trywireline.com.
// Pass A: marketing/public routes (no auth). Pass B: authenticated routes,
// subpages, and tabs. ThinkPad-class 1366×768 is the primary viewport;
// mobile 390 covers regressions. Records console errors, failed requests,
// horizontal overflow, thin pages. Output: terminals/visual-qa/.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.QA_BASE_URL || "https://trywireline.com";
const EMAIL = "wireline.demo@trywireline.com";
const PASSWORD = "WirelineDemo!2026";
const OUT = "terminals/visual-qa";
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const MARKETING_ROUTES = [
  ["/", "mkt-landing"],
  ["/pricing", "mkt-pricing"],
  ["/compare", "mkt-compare"],
  ["/about", "mkt-about"],
  ["/showcase", "mkt-showcase"],
  ["/developers", "mkt-developers"],
  ["/blog", "mkt-blog"],
  ["/status", "mkt-status"],
  ["/changelog", "mkt-changelog"],
  ["/security", "mkt-security"],
  ["/support", "mkt-support"],
  ["/contact", "mkt-contact"],
  ["/signin", "mkt-signin"],
  ["/signup", "mkt-signup"],
  ["/for/home-services", "mkt-vertical-home"],
  ["/for/medical", "mkt-vertical-medical"],
  ["/privacy", "mkt-privacy"],
  ["/terms", "mkt-terms"],
];

const APP_ROUTES = [
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

// ThinkPad-class laptop is the primary lens this pass.
const VIEWPORTS = [
  { name: "thinkpad", width: 1366, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

const findings = [];

async function login(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector('input[type="email"]', { timeout: 20000 });
      await page.fill('input[type="email"]', EMAIL, { timeout: 15000 });
      await page.fill('input[type="password"]', PASSWORD, { timeout: 15000 });
      await Promise.all([
        page.waitForURL((u) => !u.pathname.includes("signin"), { timeout: 30000 }),
        page.click('button[type="submit"]'),
      ]);
      await page.waitForTimeout(2000);
      return;
    } catch (e) {
      console.log(`login attempt ${attempt} failed: ${String(e).split("\n")[0]}`);
      if (attempt === 3) throw e;
      await page.waitForTimeout(2000);
    }
  }
}

async function visit(page, viewport, route, label, scope) {
  const consoleErrors = [];
  const failedReqs = [];
  const onConsole = (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  };
  const onResponse = (r) => {
    if (r.status() >= 500) failedReqs.push(`${r.status()} ${r.url().slice(0, 160)}`);
  };
  page.on("console", onConsole);
  page.on("response", onResponse);

  const entry = { scope, viewport: viewport.name, route, label };
  try {
    const t0 = Date.now();
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);
    entry.loadMs = Date.now() - t0;
    entry.finalUrl = page.url().replace(BASE, "");
    entry.hOverflow = await page.evaluate(() => {
      const d = document.documentElement;
      return d.scrollWidth > d.clientWidth + 1
        ? { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth }
        : null;
    });
    entry.bodyChars = await page.evaluate(() => document.body.innerText.trim().length);
    const shot = path.join(SHOTS, `${label}_${viewport.name}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    entry.shot = shot;
    entry.consoleErrors = [...new Set(consoleErrors)].slice(0, 6);
    entry.failedReqs = [...new Set(failedReqs)].slice(0, 6);
    console.log(
      `[${viewport.name}/${scope}] ${route} ok ${entry.loadMs}ms` +
        (entry.hOverflow ? " H-OVERFLOW" : "") +
        (entry.consoleErrors.length ? ` consoleErr:${entry.consoleErrors.length}` : "") +
        (entry.failedReqs.length ? ` 5xx:${entry.failedReqs.length}` : ""),
    );
  } catch (e) {
    entry.error = String(e).slice(0, 300);
    try {
      await page.screenshot({ path: path.join(SHOTS, `${label}_${viewport.name}_ERROR.png`) });
    } catch {}
    console.log(`[${viewport.name}/${scope}] ${route} ERROR ${entry.error.split("\n")[0]}`);
  }
  try {
    page.off("console", onConsole);
    page.off("response", onResponse);
  } catch {}
  findings.push(entry);
  return entry;
}

// Low-memory codespace: GPU off, /dev/shm off. No JS heap cap — heavy pages
// (Painter iframes) legitimately need room; we keep memory in check by
// recycling the whole browser between batches instead.
const LAUNCH_ARGS = ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-extensions"];

function contextOptions(vp) {
  return {
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.name === "mobile",
    hasTouch: vp.name === "mobile",
  };
}

// Runs a route list with crash recovery. On a low-memory codespace the
// headless shell dies if its heap grows across many SPA navigations, so we
// proactively recycle the browser every RECYCLE_EVERY routes too.
const RECYCLE_EVERY = 6;

async function runScope(vp, routes, scope, needsLogin) {
  let browser = null;
  let page = null;
  let relaunches = 0;
  let sinceBoot = 0;
  const boot = async () => {
    browser = await chromium.launch({ args: LAUNCH_ARGS });
    const ctx = await browser.newContext(contextOptions(vp));
    page = await ctx.newPage();
    sinceBoot = 0;
    if (needsLogin) {
      await login(page);
      console.log(`[${vp.name}/${scope}] logged in`);
    }
  };
  const recycle = async () => {
    try {
      await browser?.close();
    } catch {}
    await new Promise((r) => setTimeout(r, 2500));
    await boot();
  };
  await boot();
  for (const [route, label] of routes) {
    if (sinceBoot >= RECYCLE_EVERY) {
      console.log(`[${vp.name}/${scope}] recycling browser (proactive)`);
      await recycle();
    }
    const entry = await visit(page, vp, route, label, scope);
    sinceBoot++;
    if (entry.error && /crashed|closed/i.test(entry.error)) {
      if (++relaunches > 8) {
        console.log(`[${vp.name}/${scope}] too many relaunches — aborting scope`);
        break;
      }
      console.log(`[${vp.name}/${scope}] browser died — relaunching`);
      await recycle();
      // Retry the crashed route once on the fresh browser.
      await visit(page, vp, route, `${label}-retry`, scope);
      sinceBoot++;
    }
  }
  try {
    await browser?.close();
  } catch {}
}

// CLI: node visual-qa-sweep.mjs [thinkpad|mobile] [mkt|app]
// No args = everything. Batching keeps peak memory low on small machines.
const vpFilter = process.argv[2];
const scopeFilter = process.argv[3];
const OUT_SUFFIX = [vpFilter, scopeFilter].filter(Boolean).join("-");

for (const vp of VIEWPORTS) {
  if (vpFilter && vp.name !== vpFilter) continue;
  if (!scopeFilter || scopeFilter === "mkt") await runScope(vp, MARKETING_ROUTES, "mkt", false);
  if (!scopeFilter || scopeFilter === "app") await runScope(vp, APP_ROUTES, "app", true);
}

const outFile = path.join(OUT, OUT_SUFFIX ? `findings-${OUT_SUFFIX}.json` : "findings.json");
fs.writeFileSync(outFile, JSON.stringify(findings, null, 2));
console.log(`\nWrote ${findings.length} entries to ${outFile}`);
