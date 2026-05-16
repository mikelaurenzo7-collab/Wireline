import { chromium } from "@playwright/test";
import { writeFileSync, readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE_URL || "https://wireline-chi.vercel.app";
const EMAIL = readFileSync("/tmp/e2e_email.txt", "utf8").trim();
const PASS = readFileSync("/tmp/e2e_pass.txt", "utf8").trim();
const OUT = "/tmp/wireline-audit/screenshots";
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { path: "/", slug: "00-root-command-center", description: "Command Center (root)" },
  { path: "/command", slug: "01-command-alias", description: "Command Center (alias)" },
  { path: "/dashboard", slug: "02-dashboard", description: "Dashboard Home" },
  { path: "/live", slug: "03-live-monitor", description: "Live call monitor" },
  { path: "/triage", slug: "04-triage", description: "Triage inbox" },
  { path: "/insights", slug: "05-insights", description: "Insights / AI Spend" },
  { path: "/contact/15551234567", slug: "06-contact-profile", description: "Contact profile (test number)" },
  { path: "/logs", slug: "07-call-logs", description: "Call logs / signal archive" },
  { path: "/inbox", slug: "08-email-inbox", description: "Email inbox" },
  { path: "/outbound", slug: "09-outbound-dialer", description: "Outbound dialer" },
  { path: "/appointments", slug: "10-appointments", description: "Appointments" },
  { path: "/train", slug: "11-agent-training", description: "Agent training" },
  { path: "/knowledge", slug: "12-knowledge-base", description: "Knowledge base" },
  { path: "/agents", slug: "13-fleet-settings", description: "Agent fleet" },
  { path: "/integrations", slug: "14-integrations", description: "Integrations" },
  { path: "/admin", slug: "15-admin-settings", description: "Admin settings" },
  { path: "/dnc", slug: "16-dnc-manager", description: "Do Not Call manager" },
  { path: "/audit", slug: "17-audit-log", description: "Security audit log" },
  { path: "/privacy", slug: "18-privacy", description: "Privacy policy" },
  { path: "/terms", slug: "19-terms", description: "Terms of service" },
  { path: "/this-does-not-exist", slug: "20-not-found", description: "404 / NotFound" },
];

const report = [];

(async () => {
  // 1) Sign in via API to get session token
  console.log(`[auth] POST ${BASE}/api/auth/signin as ${EMAIL}...`);
  const resp = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!resp.ok) {
    console.error(`[auth] Sign-in failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }
  const apiResponse = await resp.json();
  // Convert API shape { user, token } -> stored shape { user, access_token }
  // to match what AuthPortal saves (src/components/AuthPortal.tsx:106).
  const session = { user: apiResponse.user, access_token: apiResponse.token };
  console.log(`[auth] Got session for user ${session.user?.email}`);

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
  });

  // 2) Inject session into localStorage before any page loads
  await ctx.addInitScript((sess) => {
    try {
      window.localStorage.setItem("wireline_session", JSON.stringify(sess));
      window.localStorage.setItem("wireline_cookie_consent", "dismissed");
    } catch {}
  }, session);

  const page = await ctx.newPage();
  const consoleErrors = [];
  const failedReqs = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("requestfailed", (req) => {
    failedReqs.push(`REQFAIL ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      failedReqs.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });

  // 3) Crawl every route, signed in
  for (const r of ROUTES) {
    const start = Date.now();
    consoleErrors.length = 0;
    failedReqs.length = 0;
    let httpStatus = null;
    let finalUrl = null;
    let title = null;
    let err = null;
    try {
      const resp = await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle", timeout: 30000 });
      httpStatus = resp ? resp.status() : null;
      await page.waitForTimeout(1800); // let animations + lazy widgets settle
      // Defeat the app's internal-scroll containers so fullPage captures everything
      await page.addStyleTag({ content: `
        html, body { height: auto !important; overflow: visible !important; }
        main { overflow: visible !important; height: auto !important; }
        [class*="overflow-y-auto"], [class*="overflow-hidden"] { overflow: visible !important; max-height: none !important; }
        [class*="h-full"], [class*="h-screen"] { height: auto !important; min-height: auto !important; }
        [class*="min-h-0"] { min-height: 0 !important; }
      ` }).catch(() => {});
      await page.waitForTimeout(300);
      finalUrl = page.url();
      title = await page.title().catch(() => null);
      await page.screenshot({ path: `${OUT}/${r.slug}.png`, fullPage: true });
    } catch (e) {
      err = String(e?.message || e).slice(0, 500);
      try {
        await page.screenshot({ path: `${OUT}/${r.slug}.png`, fullPage: true });
      } catch {}
    }
    const entry = {
      path: r.path,
      slug: r.slug,
      description: r.description,
      finalUrl,
      title,
      httpStatus,
      consoleErrors: [...consoleErrors],
      failedRequests: [...failedReqs],
      error: err,
      durationMs: Date.now() - start,
    };
    report.push(entry);
    const errCount = consoleErrors.length;
    const reqFailCount = failedReqs.length;
    const flag = err ? "✗ ERR" : (errCount || reqFailCount) ? "⚠ " : "✓";
    console.log(`[${flag}] ${r.path.padEnd(32)} -> ${finalUrl ? new URL(finalUrl).pathname : "ERR"}  (${errCount} console errors, ${reqFailCount} req errors)`);
    if (err) console.log(`        ERROR: ${err.slice(0, 200)}`);
  }

  writeFileSync(`${OUT}/_report.json`, JSON.stringify(report, null, 2));

  await browser.close();
  console.log(`\n[done] ${report.length} routes captured to ${OUT}`);
  console.log(`[done] Report: ${OUT}/_report.json`);

  // Quick summary
  const withErrors = report.filter(r => r.consoleErrors.length || r.failedRequests.length || r.error);
  console.log(`\n[summary] ${withErrors.length}/${report.length} routes have issues:`);
  for (const r of withErrors) {
    console.log(`  - ${r.path}: ${r.error ? "FATAL" : ""} ${r.consoleErrors.length} console, ${r.failedRequests.length} reqs`);
  }
})();
