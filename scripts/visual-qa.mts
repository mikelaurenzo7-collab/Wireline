/**
 * Visual QA — capture screenshots of every public Wireline page at
 * mobile / tablet / desktop. Pure observation: no clicks, no form
 * submissions, no console-error suppression. If a page renders with
 * runtime JS errors, those land in the per-page log too.
 *
 * Run:
 *   npx tsx scripts/visual-qa.mts
 *
 * Outputs:
 *   /tmp/qa/<viewport>/<page>.png   (one PNG per page+viewport)
 *   /tmp/qa/console-errors.json     (any per-page console errors)
 */

import { chromium, type Browser, type Page, type ConsoleMessage } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const APEX = "https://trywireline.com";
const OUT = "/tmp/qa";

const PAGES = [
  { slug: "landing", path: "/" },
  { slug: "pricing", path: "/pricing" },
  { slug: "compare", path: "/compare" },
  { slug: "about", path: "/about" },
  { slug: "signin", path: "/signin" },
  { slug: "signup", path: "/signup" },
  { slug: "forgot-password", path: "/forgot-password" },
  { slug: "for-medical", path: "/for/medical" },
  { slug: "for-legal", path: "/for/legal" },
  { slug: "for-real-estate", path: "/for/real-estate" },
  { slug: "for-insurance", path: "/for/insurance" },
  { slug: "for-agencies", path: "/for/agencies" },
  { slug: "for-home-services", path: "/for/home-services" },
];

const VIEWPORTS = [
  { name: "mobile", width: 393, height: 852, deviceScaleFactor: 2 }, // iPhone 14 Pro
  { name: "tablet", width: 768, height: 1024, deviceScaleFactor: 2 }, // iPad portrait
  { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 }, // MBP-class
];

type PageReport = {
  slug: string;
  path: string;
  viewport: string;
  ok: boolean;
  bytes: number;
  consoleErrors: string[];
  pageErrors: string[];
  duration_ms: number;
};

async function capturePage(browser: Browser, vp: typeof VIEWPORTS[number], p: typeof PAGES[number]): Promise<PageReport> {
  const t0 = Date.now();
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    // Container egress proxy uses its own HTTPS cert that chromium's
    // bundled trust store doesn't recognize. Curl works because it
    // uses the system trust store. We trust the apex here.
    ignoreHTTPSErrors: true,
    userAgent: vp.name === "mobile"
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  const page: Page = await ctx.newPage();

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e: Error) => {
    pageErrors.push((e.message || String(e)).slice(0, 200));
  });

  let ok = true;
  let bytes = 0;
  try {
    await page.goto(`${APEX}${p.path}`, { waitUntil: "networkidle", timeout: 25_000 });
    // Give framer-motion / IntersectionObserver one beat to settle.
    await page.waitForTimeout(800);
    const outPath = join(OUT, vp.name, `${p.slug}.png`);
    mkdirSync(join(OUT, vp.name), { recursive: true });
    await page.screenshot({ path: outPath, fullPage: true });
    const stat = await import("node:fs").then((f) => f.statSync(outPath));
    bytes = stat.size;
  } catch (e: any) {
    ok = false;
    pageErrors.push(`navigation: ${e?.message ?? String(e)}`.slice(0, 200));
  } finally {
    await ctx.close();
  }

  return {
    slug: p.slug,
    path: p.path,
    viewport: vp.name,
    ok,
    bytes,
    consoleErrors,
    pageErrors,
    duration_ms: Date.now() - t0,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  console.log(`Visual QA — ${PAGES.length} pages × ${VIEWPORTS.length} viewports = ${PAGES.length * VIEWPORTS.length} shots`);
  console.log(`Apex: ${APEX}`);
  console.log(`Output: ${OUT}/<viewport>/<slug>.png\n`);

  const browser = await chromium.launch({ headless: true });
  const reports: PageReport[] = [];

  for (const vp of VIEWPORTS) {
    console.log(`── ${vp.name.toUpperCase()} (${vp.width}x${vp.height}) ──`);
    for (const p of PAGES) {
      const r = await capturePage(browser, vp, p);
      reports.push(r);
      const status = r.ok ? "✓" : "✗";
      const errs = r.consoleErrors.length + r.pageErrors.length;
      const errStr = errs > 0 ? `  ${errs} err` : "";
      console.log(`  ${status} ${r.slug.padEnd(18)} ${(r.bytes/1024).toFixed(0).padStart(4)}KB  ${r.duration_ms}ms${errStr}`);
    }
  }

  await browser.close();

  // Emit a structured report so we can see all errors at a glance.
  writeFileSync(
    join(OUT, "report.json"),
    JSON.stringify(reports, null, 2),
  );

  // Summary
  const total = reports.length;
  const okCount = reports.filter(r => r.ok).length;
  const failed = reports.filter(r => !r.ok);
  const withErrs = reports.filter(r => r.consoleErrors.length + r.pageErrors.length > 0);

  console.log(`\n══ SUMMARY ══`);
  console.log(`Shots taken: ${okCount}/${total}`);
  console.log(`Pages with JS errors: ${withErrs.length}`);
  if (failed.length) {
    console.log(`Failed pages:`);
    for (const f of failed) console.log(`  · ${f.slug} (${f.viewport}): ${f.pageErrors.join("; ")}`);
  }
  if (withErrs.length) {
    console.log(`Pages with console/page errors:`);
    for (const f of withErrs.slice(0, 10)) {
      const all = [...f.consoleErrors, ...f.pageErrors];
      console.log(`  · ${f.slug} (${f.viewport}): ${all[0]?.slice(0,140)}`);
    }
  }
}

main().catch((e) => {
  console.error("QA crashed:", e);
  process.exit(1);
});
