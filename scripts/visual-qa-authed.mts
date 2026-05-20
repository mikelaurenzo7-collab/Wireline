/**
 * Auth'd visual QA — same engine as visual-qa.mts but signs in
 * first, injects the wireline_session into localStorage, then
 * captures every product-side route. Targets the 20 in-app pages
 * registered in src/routes/AppRoutes.tsx.
 *
 * Run:
 *   QA_EMAIL=foo@x.com QA_PASS=bar npx tsx scripts/visual-qa-authed.mts
 *   (or read from /tmp/qa-email + /tmp/qa-pass like the script does)
 */

import { chromium, type Browser, type ConsoleMessage } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APEX = "https://trywireline.com";
const OUT = "/tmp/qa-authed";

const EMAIL = process.env.QA_EMAIL || readFileSync("/tmp/qa-email", "utf8").trim();
const PASS  = process.env.QA_PASS  || readFileSync("/tmp/qa-pass",  "utf8").trim();

// The 20 routes mounted in AppRoutes.tsx. Pages with required
// dynamic params (/contact/:number) get a sensible placeholder so
// the route still resolves; if the page errors gracefully that's
// caught + reported in the screenshot + console log.
const PAGES = [
  { slug: "00-console-home",   path: "/" },
  { slug: "01-live-monitor",   path: "/live" },
  { slug: "02-triage",         path: "/triage" },
  { slug: "03-insights",       path: "/insights" },
  { slug: "04-call-logs",      path: "/logs" },
  { slug: "05-inbox",          path: "/inbox" },
  { slug: "06-sms",            path: "/sms" },
  { slug: "07-cockpit",        path: "/cockpit" },
  { slug: "08-outbound",       path: "/outbound" },
  { slug: "09-appointments",   path: "/appointments" },
  { slug: "10-pipeline",       path: "/pipeline" },
  { slug: "11-train",          path: "/train" },
  { slug: "12-knowledge",      path: "/knowledge" },
  { slug: "13-agents",         path: "/agents" },
  { slug: "14-integrations",   path: "/integrations" },
  { slug: "15-admin",          path: "/admin" },
  { slug: "16-dnc",            path: "/dnc" },
  { slug: "17-audit",          path: "/audit" },
  { slug: "18-help",           path: "/help" },
  { slug: "19-contact-profile", path: "/contact/+15555550100" },
];

const VIEWPORTS = [
  { name: "mobile",  width: 393,  height: 852,  scale: 2 },
  { name: "desktop", width: 1440, height: 900,  scale: 1 },
];

type Report = {
  slug: string; path: string; viewport: string;
  ok: boolean; bytes: number;
  consoleErrors: string[]; pageErrors: string[];
  duration_ms: number;
};

async function signIn(): Promise<{ token: string; user: any }> {
  console.log(`Signing in as ${EMAIL} ...`);
  const res = await fetch(`${APEX}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const json = await res.json() as { token?: string; user?: any; error?: string };
  if (!json.token) throw new Error(`signin failed: ${json.error ?? JSON.stringify(json)}`);
  console.log(`  OK · user ${json.user?.id ?? "?"}`);

  // Pre-dismiss every blocking onboarding gate so the product UI
  // is visible from the first screenshot:
  //   · tour_completed       — ProductTour.tsx welcome walkthrough
  //   · onboarding_completed — PersonaWizard.tsx persona picker
  //   · persona              — keeps PersonaWizard dormant on re-renders
  await fetch(`${APEX}/api/user-preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${json.token}`,
    },
    body: JSON.stringify({
      tour_completed: true,
      onboarding_completed: true,
      persona: "solo_operator",
    }),
  }).then((r) => console.log(`  onboarding gates dismissed: ${r.ok}`)).catch(() => {});

  return { token: json.token, user: json.user };
}

async function capturePage(
  browser: Browser,
  vp: typeof VIEWPORTS[number],
  p: typeof PAGES[number],
  session: { token: string; user: any },
): Promise<Report> {
  const t0 = Date.now();
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    ignoreHTTPSErrors: true,
    userAgent: vp.name === "mobile"
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });

  // Inject session + dismiss cookie banner on every page in this
  // context. AuthContext expects { access_token, user } shape (see
  // src/contexts/AuthContext.tsx:52). The cookie-consent key is from
  // src/components/CookieConsent.tsx:6.
  await ctx.addInitScript(({ token, user }) => {
    try {
      window.localStorage.setItem(
        "wireline_session",
        JSON.stringify({ access_token: token, user }),
      );
      window.localStorage.setItem(
        "wireline_cookie_consent",
        JSON.stringify({ accepted: true, ts: Date.now() }),
      );
    } catch {}
  }, { token: session.token, user: session.user });

  const page = await ctx.newPage();

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 240));
  });
  page.on("pageerror", (e: Error) => {
    pageErrors.push((e.message || String(e)).slice(0, 240));
  });

  let ok = true;
  let bytes = 0;
  try {
    await page.goto(`${APEX}${p.path}`, { waitUntil: "networkidle", timeout: 30_000 });
    // Settle: motion + data fetch + IntersectionObserver
    await page.waitForTimeout(1200);
    const outPath = join(OUT, vp.name, `${p.slug}.png`);
    mkdirSync(join(OUT, vp.name), { recursive: true });
    await page.screenshot({ path: outPath, fullPage: true });
    const { statSync } = await import("node:fs");
    bytes = statSync(outPath).size;
  } catch (e: any) {
    ok = false;
    pageErrors.push(`navigation: ${e?.message ?? String(e)}`.slice(0, 240));
  } finally {
    await ctx.close();
  }

  return {
    slug: p.slug, path: p.path, viewport: vp.name,
    ok, bytes, consoleErrors, pageErrors,
    duration_ms: Date.now() - t0,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const session = await signIn();

  console.log(`\nAuth'd Visual QA — ${PAGES.length} pages × ${VIEWPORTS.length} viewports = ${PAGES.length * VIEWPORTS.length} shots`);
  console.log(`Apex: ${APEX}`);
  console.log(`Output: ${OUT}/<viewport>/<slug>.png\n`);

  const browser = await chromium.launch({ headless: true });
  const reports: Report[] = [];

  for (const vp of VIEWPORTS) {
    console.log(`── ${vp.name.toUpperCase()} (${vp.width}x${vp.height}) ──`);
    for (const p of PAGES) {
      const r = await capturePage(browser, vp, p, session);
      reports.push(r);
      const status = r.ok ? "✓" : "✗";
      const errs = r.consoleErrors.length + r.pageErrors.length;
      const tail = errs > 0 ? `  ${errs} err` : "";
      console.log(`  ${status} ${r.slug.padEnd(22)} ${(r.bytes/1024).toFixed(0).padStart(4)}KB  ${r.duration_ms}ms${tail}`);
    }
  }

  await browser.close();
  writeFileSync(join(OUT, "report.json"), JSON.stringify(reports, null, 2));

  const total = reports.length;
  const ok = reports.filter(r => r.ok).length;
  const failed = reports.filter(r => !r.ok);
  const withErrs = reports.filter(r => r.consoleErrors.length + r.pageErrors.length > 0);

  console.log(`\n══ SUMMARY ══`);
  console.log(`Captured: ${ok}/${total}`);
  console.log(`Pages with errors: ${withErrs.length}`);
  for (const f of failed) {
    console.log(`  FAILED ${f.slug} (${f.viewport}): ${f.pageErrors.join("; ")}`);
  }
  for (const f of withErrs.slice(0, 20)) {
    const all = [...f.consoleErrors, ...f.pageErrors];
    console.log(`  · ${f.slug} (${f.viewport}): ${all[0]?.slice(0,180)}`);
  }
}

main().catch((e) => {
  console.error("auth QA crashed:", e);
  process.exit(1);
});
