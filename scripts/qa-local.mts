/**
 * Local visual QA — screenshots every public + authed page against the
 * local dev server (localhost:3000) at 3 viewports. Authed pages get a
 * locally-minted session JWT injected into localStorage so the product
 * UI renders. Captures console + page errors per shot.
 *
 * Run: npx tsx scripts/qa-local.mts
 * Out: /tmp/qa-local/<viewport>/<slug>.png + report.json
 */
import { chromium, type Browser, type ConsoleMessage } from "playwright";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const OUT = "/tmp/qa-local";

const PUBLIC_PAGES = [
  { slug: "pub-00-authportal", path: "/" },
  { slug: "pub-01-pricing", path: "/pricing" },
  { slug: "pub-02-security", path: "/security" },
  { slug: "pub-03-legal", path: "/legal" },
  { slug: "pub-04-support", path: "/support" },
  { slug: "pub-05-changelog", path: "/changelog" },
  { slug: "pub-06-for-home-services", path: "/for/home-services" },
  { slug: "pub-07-for-medical", path: "/for/medical" },
  { slug: "pub-08-for-legal", path: "/for/legal" },
  { slug: "pub-09-for-real-estate", path: "/for/real-estate" },
  { slug: "pub-10-for-personal", path: "/for/personal" },
  { slug: "pub-11-for-insurance", path: "/for/insurance" },
  { slug: "pub-12-for-restaurants", path: "/for/restaurants" },
  { slug: "pub-13-for-sales", path: "/for/sales" },
  { slug: "pub-14-reset-password", path: "/reset-password" },
  { slug: "pub-15-privacy", path: "/privacy" },
  { slug: "pub-16-terms", path: "/terms" },
];

const AUTH_PAGES = [
  { slug: "app-00-home", path: "/" },
  { slug: "app-01-agents", path: "/agents" },
  { slug: "app-02-train", path: "/train" },
  { slug: "app-03-logs", path: "/logs" },
  { slug: "app-04-pipeline", path: "/pipeline" },
  { slug: "app-05-integrations", path: "/integrations" },
  { slug: "app-06-admin", path: "/admin" },
  { slug: "app-07-help", path: "/help" },
  { slug: "app-08-founder", path: "/founder" },
];

const VIEWPORTS = [
  { name: "laptop", width: 1280, height: 800, scale: 1 },
  { name: "desktop", width: 1440, height: 900, scale: 1 },
  { name: "mobile", width: 393, height: 852, scale: 2 },
];

type Report = {
  slug: string; path: string; viewport: string; authed: boolean;
  ok: boolean; bytes: number; scrollW: number; clientW: number; overflow: boolean;
  consoleErrors: string[]; pageErrors: string[];
};

const QA_SESSION = {
  access_token: "qa-local-injected",
  user: { id: "00000000-0000-4000-8000-000000000001", email: "qa@trywireline.com", full_name: "QA Tester", is_owner: false },
};

async function capture(
  browser: Browser, vp: typeof VIEWPORTS[number],
  p: { slug: string; path: string }, authed: boolean,
): Promise<Report> {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    userAgent: vp.name === "mobile"
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  await ctx.addInitScript(({ session, authed }) => {
    try {
      window.localStorage.setItem(
        "wireline_cookie_consent",
        JSON.stringify({ accepted: true, ts: Date.now() }),
      );
      if (authed) {
        window.localStorage.setItem("wireline_session", JSON.stringify(session));
        window.localStorage.setItem("wireline_tour_completed", "true");
        window.localStorage.setItem("wireline_onboarding_completed", "true");
      }
    } catch {}
  }, { session: QA_SESSION, authed });

  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 240));
  });
  page.on("pageerror", (e: Error) => pageErrors.push((e.message || String(e)).slice(0, 240)));

  let ok = true, bytes = 0, scrollW = 0, clientW = 0;
  try {
    // domcontentloaded (not networkidle): several pages fire API calls
    // that hang when the sandbox DB is unreachable — networkidle would
    // never settle. We still give motion + data a 2.6s settle window.
    await page.goto(`${BASE}${p.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2600);
    const dims = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    scrollW = dims.scrollW; clientW = dims.clientW;
    const outPath = join(OUT, vp.name, `${p.slug}.png`);
    mkdirSync(join(OUT, vp.name), { recursive: true });
    await page.screenshot({ path: outPath, fullPage: true });
    bytes = statSync(outPath).size;
  } catch (e: any) {
    ok = false;
    pageErrors.push(`navigation: ${e?.message ?? String(e)}`.slice(0, 240));
  } finally {
    await ctx.close();
  }
  return {
    slug: p.slug, path: p.path, viewport: vp.name, authed,
    ok, bytes, scrollW, clientW, overflow: scrollW > clientW + 1,
    consoleErrors, pageErrors,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const reports: Report[] = [];
  for (const vp of VIEWPORTS) {
    console.log(`\n== ${vp.name.toUpperCase()} (${vp.width}x${vp.height}) ==`);
    for (const p of PUBLIC_PAGES) {
      const r = await capture(browser, vp, p, false);
      reports.push(r);
      console.log(`  ${r.ok ? "OK" : "XX"} ${r.slug.padEnd(26)} ${(r.bytes/1024).toFixed(0).padStart(5)}KB${r.overflow ? `  OVERFLOW ${r.scrollW}>${r.clientW}` : ""}${r.consoleErrors.length+r.pageErrors.length ? `  ${r.consoleErrors.length+r.pageErrors.length}err` : ""}`);
    }
    for (const p of AUTH_PAGES) {
      const r = await capture(browser, vp, p, true);
      reports.push(r);
      console.log(`  ${r.ok ? "OK" : "XX"} ${r.slug.padEnd(26)} ${(r.bytes/1024).toFixed(0).padStart(5)}KB${r.overflow ? `  OVERFLOW ${r.scrollW}>${r.clientW}` : ""}${r.consoleErrors.length+r.pageErrors.length ? `  ${r.consoleErrors.length+r.pageErrors.length}err` : ""}`);
    }
  }
  await browser.close();
  writeFileSync(join(OUT, "report.json"), JSON.stringify(reports, null, 2));

  console.log(`\n== OVERFLOW ==`);
  for (const r of reports.filter(r => r.overflow)) console.log(`  ${r.viewport} ${r.slug}: ${r.scrollW} > ${r.clientW}`);
  console.log(`== ERRORS ==`);
  const seen = new Set<string>();
  for (const r of reports.filter(r => r.consoleErrors.length + r.pageErrors.length)) {
    for (const e of [...r.consoleErrors, ...r.pageErrors]) {
      const key = e.replace(/[0-9]/g, "#").slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  [${r.slug}/${r.viewport}] ${e.slice(0, 160)}`);
    }
  }
}
main().catch((e) => { console.error("QA crashed:", e); process.exit(1); });
