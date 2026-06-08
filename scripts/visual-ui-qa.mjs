#!/usr/bin/env node
/**
 * Visual UI QA — full-route screenshot sweep + pixel heuristics (prod/local).
 * Usage: node scripts/visual-ui-qa.mjs [--base https://trywireline.com]
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const base = (() => {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : process.env.APP_URL || "https://trywireline.com";
})();
const EMAIL = process.env.DOGFOOD_EMAIL || "wireline.demo@trywireline.com";
const PASSWORD = process.env.DOGFOOD_PASSWORD || "WirelineDemo!2026";
const OUT = process.env.VISUAL_QA_OUT || path.join(process.cwd(), "terminals", "visual-qa-prod");
const SS = path.join(OUT, "screenshots");

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const ROUTES = [
  "/ops",
  "/ops?tab=intel",
  "/ops?tab=analytics",
  "/chat",
  "/training",
  "/training?tab=voices",
  "/training?tab=simulator",
  "/triage",
  "/insights",
  "/insights?tab=quality",
  "/phone",
  "/phone?tab=outbound",
  "/phone?tab=appointments",
  "/email",
  "/sms",
  "/pipeline",
  "/agents",
  "/integrations",
  "/admin",
  "/admin?tab=branding",
  "/admin?tab=activity",
  "/dnc",
  "/audit",
  "/help",
];

[OUT, SS].forEach((d) => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
});

const findings = [];

async function loginViaApi(context) {
  const r = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  const cookies = r.headers.getSetCookie?.() ?? [];
  const session = cookies.find((c) => c.startsWith("wireline_session="));
  if (!r.ok || !session) throw new Error(`API login failed ${r.status}`);
  const value = session.split(";")[0].split("=")[1];
  await context.addCookies([
    {
      name: "wireline_session",
      value,
      domain: new URL(base).hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

async function visualMetrics(page) {
  return page.evaluate(() => {
    const tiny = document.querySelectorAll('[class*="text-[8px]"], [class*="text-[9px]"]').length;
    const root = document.documentElement;
    const overflowX = root.scrollWidth > root.clientWidth + 2;
    const bottomNav = document.querySelector('[data-testid="mobile-bottom-nav"]');
    const main = document.getElementById("main-content");
    const mainPad = main ? getComputedStyle(main).paddingBottom : "";
    const panels = document.querySelectorAll(".wl-panel").length;
    const h1s = document.querySelectorAll("h1").length;
    const lowContrast = [...document.querySelectorAll("p, span, label")]
      .filter((el) => {
        const s = getComputedStyle(el);
        const fs = parseFloat(s.fontSize);
        if (fs < 11) return true;
        return false;
      })
      .length;
    const clipped = [...document.querySelectorAll("h1, h2, h3, .workspace-top-bar")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && el.scrollWidth > el.clientWidth + 2;
      })
      .length;
    return {
      tinyTextNodes: tiny,
      horizontalOverflow: overflowX,
      hasBottomNav: !!bottomNav,
      mainPaddingBottom: mainPad,
      wlPanelCount: panels,
      h1Count: h1s,
      sub11pxTextNodes: lowContrast,
      clippedHeadings: clipped,
    };
  });
}

async function captureRoute(page, route, vp) {
  const slug = route.replace(/[/?=&]/g, "_").replace(/^_/, "") || "root";
  const file = `${vp.name}_${slug}.png`;
  await page.goto(`${base}${route}`, { waitUntil: "commit", timeout: 60_000 });
  await page
    .getByTestId("client-console")
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SS, file), fullPage: false });
  const metrics = await visualMetrics(page);
  const issues = [];
  if (metrics.horizontalOverflow) issues.push("horizontal overflow");
  if (metrics.h1Count !== 1) issues.push(`h1 count ${metrics.h1Count}`);
  if (metrics.tinyTextNodes > 12) issues.push(`${metrics.tinyTextNodes} tiny text nodes`);
  if (metrics.clippedHeadings > 0) issues.push(`${metrics.clippedHeadings} clipped headings`);
  if (vp.name === "mobile" && route === "/chat" && !metrics.hasBottomNav)
    issues.push("missing bottom nav on chat");
  findings.push({ route, viewport: vp.name, screenshot: file, metrics, issues });
  const mark = issues.length ? "!" : "✓";
  console.log(`${mark} ${vp.name} ${route}${issues.length ? ` — ${issues.join("; ")}` : ""}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await loginViaApi(context);

  for (const vp of VIEWPORTS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const route of ROUTES) {
      await captureRoute(page, route, vp);
    }
    await page.close();
  }
  await browser.close();

  const report = {
    base,
    at: new Date().toISOString(),
    email: EMAIL,
    routes: ROUTES.length,
    viewports: VIEWPORTS.length,
    findings,
    flagged: findings.filter((f) => f.issues.length > 0),
  };
  writeFileSync(path.join(OUT, "visual-qa.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    path.join(OUT, "visual-qa.md"),
    `# Visual UI QA — ${base}\n\n**At:** ${report.at}\n**Routes:** ${report.routes} × ${report.viewports} viewports\n\n## Flagged (${report.flagged.length})\n\n${report.flagged
      .map((f) => `- **${f.viewport} ${f.route}** — ${f.issues.join("; ")} ([screenshot](screenshots/${f.screenshot}))`)
      .join("\n")}\n`,
  );
  console.log(`\nWrote ${OUT}/visual-qa.json (${report.flagged.length} flagged)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
