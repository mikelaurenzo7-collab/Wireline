import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL || "https://wireline-chi.vercel.app";
const OUT = "/tmp/wireline-audit/public";
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { path: "/", slug: "auth-portal" },
  { path: "/pricing", slug: "pricing" },
  { path: "/privacy", slug: "privacy" },
  { path: "/terms", slug: "terms" },
  { path: "/does-not-exist", slug: "404" },
];

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900, devType: null },
  { name: "laptop-1280", width: 1280, height: 800, devType: null },
  { name: "tablet", width: 768, height: 1024, devType: null },
  { name: "mobile-iphone", width: 390, height: 844, devType: devices["iPhone 13"] },
];

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
      userAgent: vp.devType?.userAgent,
    });
    const page = await ctx.newPage();
    for (const r of ROUTES) {
      try {
        await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(1200);
        // Defeat any cookie banner
        const dismiss = page.locator('[aria-label="Dismiss cookie notice"]').first();
        if (await dismiss.isVisible().catch(() => false)) {
          await dismiss.click();
          await page.waitForTimeout(200);
        }
        // Defeat internal scroll for fullPage capture
        await page.addStyleTag({ content: `
          html, body { height: auto !important; overflow: visible !important; max-height: none !important; }
          * { max-height: none !important; }
          main, [role="main"] { overflow: visible !important; height: auto !important; }
          [class*="overflow-y-auto"], [class*="overflow-hidden"], [class*="overflow-y-scroll"] {
            overflow: visible !important; max-height: none !important; height: auto !important;
          }
          [class*="h-full"], [class*="h-screen"], [class*="min-h-screen"] {
            height: auto !important; min-height: 0 !important;
          }
        `}).catch(() => {});
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${OUT}/${vp.name}__${r.slug}.png`, fullPage: true });
        console.log(`  [✓] ${vp.name.padEnd(16)} ${r.path}`);
      } catch (e) {
        console.log(`  [✗] ${vp.name.padEnd(16)} ${r.path}: ${String(e?.message || e).slice(0, 100)}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
})();
