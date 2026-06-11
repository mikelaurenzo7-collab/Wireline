#!/usr/bin/env node
/**
 * Deep visual UI audit — multi-viewport, full + half-crop screenshots,
 * every public + authenticated route. Output lives in terminals/visual-qa-deep/.
 *
 * Usage:
 *   node scripts/visual-qa-deep.mjs [--base https://trywireline.com]
 *   VIEWPORTS=mobile,desktop node scripts/visual-qa-deep.mjs
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync, statSync } from "fs";
import path from "path";

const base = (() => {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : process.env.APP_URL || "https://trywireline.com";
})();
const EMAIL = process.env.DOGFOOD_EMAIL || "wireline.demo@trywireline.com";
const PASSWORD = process.env.DOGFOOD_PASSWORD || "WirelineDemo!2026";
const OUT = process.env.VISUAL_QA_OUT || path.join(process.cwd(), "terminals", "visual-qa-deep");

const ALL_VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
  ultrawide: { width: 1680, height: 1050 },
};
const requested = (process.env.VIEWPORTS || "mobile,desktop").split(",").map((s) => s.trim());
const VIEWPORTS = requested
  .filter((n) => ALL_VIEWPORTS[n])
  .map((n) => ({ name: n, ...ALL_VIEWPORTS[n] }));

// Public marketing surfaces (no auth required)
const PUBLIC_ROUTES = [
  { id: "home", path: "/" },
  { id: "pricing", path: "/pricing" },
  { id: "compare", path: "/compare" },
  { id: "showcase", path: "/showcase" },
  { id: "about", path: "/about" },
  { id: "developers", path: "/developers" },
  { id: "blog", path: "/blog" },
  { id: "support", path: "/support" },
  { id: "status", path: "/status" },
  { id: "changelog", path: "/changelog" },
  { id: "security", path: "/security" },
  { id: "privacy", path: "/privacy" },
  { id: "terms", path: "/terms" },
  { id: "for-home-services", path: "/for/home-services" },
  { id: "for-medical", path: "/for/medical" },
  { id: "for-legal", path: "/for/legal" },
  { id: "for-real-estate", path: "/for/real-estate" },
];

const AUTH_ROUTES_PUBLIC = [
  { id: "signin", path: "/signin" },
  { id: "signup", path: "/signup" },
];

// Authenticated app surfaces (require demo login)
const AUTH_ROUTES = [
  { id: "ops", path: "/ops" },
  { id: "ops-intel", path: "/ops?tab=intel" },
  { id: "ops-triage", path: "/ops?tab=triage" },
  { id: "ops-analytics", path: "/ops?tab=analytics" },
  { id: "chat", path: "/chat" },
  { id: "training", path: "/training" },
  { id: "training-voices", path: "/training?tab=voices" },
  { id: "training-simulator", path: "/training?tab=simulator" },
  { id: "training-flows", path: "/training?tab=flows" },
  { id: "training-database", path: "/training?tab=database" },
  { id: "design", path: "/design" },
  { id: "insights", path: "/insights" },
  { id: "insights-quality", path: "/insights?tab=quality" },
  { id: "phone", path: "/phone" },
  { id: "phone-outbound", path: "/phone?tab=outbound" },
  { id: "phone-appointments", path: "/phone?tab=appointments" },
  { id: "email", path: "/email" },
  { id: "sms", path: "/sms" },
  { id: "pipeline", path: "/pipeline" },
  { id: "agents", path: "/agents" },
  { id: "integrations", path: "/integrations" },
  { id: "admin", path: "/admin" },
  { id: "admin-branding", path: "/admin?tab=branding" },
  { id: "admin-billing", path: "/admin?tab=subscription" },
  { id: "dnc", path: "/dnc" },
  { id: "audit", path: "/audit" },
  { id: "help", path: "/help" },
  { id: "founder", path: "/founder" },
];

const SS = path.join(OUT, "screenshots");
const PUBLIC_DIR = path.join(SS, "public");
const AUTH_DIR = path.join(SS, "auth");

[OUT, SS, PUBLIC_DIR, AUTH_DIR].forEach((d) => {
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
  if (!r.ok || !session) throw new Error(`API login failed ${r.status}: ${r.statusText}`);
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
    const sub10px = [...document.querySelectorAll("p, span, label, button, a, th, td, li, dt, dd")]
      .filter((el) => {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        return fs > 0 && fs < 10;
      }).length;
    const clipped = [...document.querySelectorAll("h1, h2, h3, h4, [class*='wl-workspace-title']")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && el.scrollWidth > el.clientWidth + 2;
      }).length;
    return {
      tinyTextNodes: tiny,
      sub10pxTextNodes: sub10px,
      horizontalOverflow: overflowX,
      hasBottomNav: !!bottomNav,
      mainPaddingBottom: mainPad,
      wlPanelCount: panels,
      h1Count: h1s,
      clippedHeadings: clipped,
    };
  });
}

async function captureRoute(page, route, vp, dir) {
  const url = `${base}${route.path}`;
  const slug = route.id;
  const fullFile = path.join(dir, `${vp.name}_${slug}_full.png`);
  const topFile = path.join(dir, `${vp.name}_${slug}_top.png`);
  const bottomFile = path.join(dir, `${vp.name}_${slug}_bottom.png`);

  try {
    await page.goto(url, { waitUntil: "commit", timeout: 60_000 });
    // Wait for either main-content (public) or client-console (auth) to mount
    await Promise.race([
      page.getByTestId("client-console").waitFor({ state: "visible", timeout: 30_000 }).catch(() => {}),
      page.locator("main#main-content").waitFor({ state: "visible", timeout: 30_000 }).catch(() => {}),
    ]);
    await page.waitForTimeout(1800);
  } catch (e) {
    const msg = e.message.split("\n")[0];
    findings.push({ route: route.path, viewport: vp.name, error: msg });
    console.log(`✗ ${vp.name.padEnd(7)} ${route.path.padEnd(36)} ERROR — ${msg}`);
    throw e; // bubble so the sweep can recreate the page
  }

  // Screenshots are best-effort — one slow page (e.g. infinite animation
  // blocking fonts/raf) must never kill the whole sweep.
  const shoot = async (file, opts) => {
    try {
      await page.screenshot({ path: file, timeout: 20_000, animations: "disabled", ...opts });
      return true;
    } catch (e) {
      findings.push({ route: route.path, viewport: vp.name, error: `screenshot ${path.basename(file)}: ${e.message.split("\n")[0]}` });
      return false;
    }
  };

  // Full page (cap at 8000px to avoid renderer OOM on very long pages)
  const okFull = await shoot(fullFile, { fullPage: true });
  if (!okFull) {
    // Salvage at least the viewport shot before giving up on this route.
    await shoot(topFile, { fullPage: false });
    return;
  }
  // Viewport top
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await shoot(topFile, { fullPage: false });
  // Scroll to ~60% for the bottom-half crop
  await page
    .evaluate(() => {
      const h = document.documentElement.scrollHeight;
      window.scrollTo(0, Math.max(0, h * 0.55));
    })
    .catch(() => {});
  await page.waitForTimeout(400);
  await shoot(bottomFile, { fullPage: false });
  // Reset scroll
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});

  let metrics = null;
  let issues = [];
  try {
    metrics = await visualMetrics(page);
    if (metrics.horizontalOverflow) issues.push("horizontal overflow");
    if (vp.name === "mobile" && metrics.h1Count > 1) issues.push(`h1 count ${metrics.h1Count}`);
    if (vp.name === "mobile" && metrics.clippedHeadings > 0)
      issues.push(`${metrics.clippedHeadings} clipped headings`);
    if (vp.name === "mobile" && !metrics.hasBottomNav && !route.path.startsWith("/signin") && !route.path.startsWith("/signup") && !route.path.startsWith("/for/") && route.path !== "/")
      issues.push("no mobile bottom nav");
  } catch (e) {
    issues.push(`metrics failed: ${e.message}`);
  }

  const fullSize = statSync(fullFile).size;
  findings.push({ route: route.path, viewport: vp.name, files: { full: fullFile, top: topFile, bottom: bottomFile }, metrics, issues, fullSize });
  const mark = issues.length ? "!" : "✓";
  const kb = Math.round(fullSize / 1024);
  console.log(`${mark} ${vp.name.padEnd(7)} ${route.path.padEnd(36)} ${kb}KB${issues.length ? ` — ${issues.join("; ")}` : ""}`);
}

/** Chromium launch args tuned for containers (tiny /dev/shm causes Target crashed). */
const LAUNCH_OPTS = {
  headless: true,
  args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
};

/**
 * Sweep with full crash recovery: if a page OR the whole browser dies we
 * relaunch and resume from the next route. `session.setup(context)` re-applies
 * cookies/init scripts after a relaunch.
 */
async function sweepRoutes(session, routes, dir) {
  let browser = await chromium.launch(LAUNCH_OPTS);
  let context = await browser.newContext();
  await session.setup(context);

  for (const vp of VIEWPORTS) {
    let page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const route of routes) {
      try {
        await captureRoute(page, route, vp, dir);
      } catch {
        // Page or browser crash — rebuild whatever died and continue.
        await page.close().catch(() => {});
        if (!browser.isConnected()) {
          await browser.close().catch(() => {});
          browser = await chromium.launch(LAUNCH_OPTS);
          context = await browser.newContext();
          await session.setup(context);
        }
        try {
          page = await context.newPage();
        } catch {
          browser = await chromium.launch(LAUNCH_OPTS);
          context = await browser.newContext();
          await session.setup(context);
          page = await context.newPage();
        }
        await page.setViewportSize({ width: vp.width, height: vp.height });
        // One retry for the crashed route on the fresh page.
        await captureRoute(page, route, vp, dir).catch(() => {});
      }
    }
    await page.close().catch(() => {});
  }
  await browser.close().catch(() => {});
}

/** Pre-acknowledge cookie banner + onboarding modals so captures show the product, not chrome. */
async function quietContext(context) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem("wireline_cookie_consent", "acknowledged");
      localStorage.setItem("wireline_post_signup_dismissed", "true");
      localStorage.setItem("wireline_onboarding_celebrated", "true");
    } catch {
      /* ignore */
    }
  });
}

async function main() {
  console.log(`[visual-qa-deep] base=${base} viewports=${VIEWPORTS.map((v) => v.name).join(",")}`);

  // Public sweep (no auth)
  console.log(`\n— Public (${PUBLIC_ROUTES.length + AUTH_ROUTES_PUBLIC.length} routes) —`);
  await sweepRoutes(
    { setup: async (ctx) => quietContext(ctx) },
    [...PUBLIC_ROUTES, ...AUTH_ROUTES_PUBLIC],
    PUBLIC_DIR,
  );

  // Auth sweep — setup re-applies session cookie after any browser relaunch.
  console.log(`\n— Authenticated (${AUTH_ROUTES.length} routes) —`);
  await sweepRoutes(
    {
      setup: async (ctx) => {
        await quietContext(ctx);
        await loginViaApi(ctx);
      },
    },
    AUTH_ROUTES,
    AUTH_DIR,
  );

  const report = {
    base,
    at: new Date().toISOString(),
    email: EMAIL,
    viewports: VIEWPORTS.map((v) => v.name),
    publicRoutes: PUBLIC_ROUTES.length,
    authRoutes: AUTH_ROUTES.length,
    totalShots: findings.length,
    flagged: findings.filter((f) => (f.issues || []).length > 0),
    findings,
  };
  writeFileSync(path.join(OUT, "visual-qa-deep.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    path.join(OUT, "visual-qa-deep.md"),
    `# Visual QA Deep — ${base}\n\n**At:** ${report.at}\n**Demo:** ${report.email}\n**Viewports:** ${report.viewports.join(", ")}\n**Total captures:** ${report.totalShots}\n\n## Flagged (${report.flagged.length})\n\n${report.flagged
      .map(
        (f) =>
          `- **${f.viewport} \`${f.route}\`** — ${(f.issues || []).join("; ")} (full: \`${path.basename(
            f.files?.full || "",
          )}\`, ${Math.round((f.fullSize || 0) / 1024)}KB)`,
      )
      .join("\n")}\n\n## All captures\n\n${findings
      .map(
        (f) =>
          `- ${f.viewport} \`${f.route}\` → \`${path.relative(OUT, f.files?.full || "")}\` (${Math.round((f.fullSize || 0) / 1024)}KB)`,
      )
      .join("\n")}\n`,
  );
  console.log(`\nReport: ${path.join(OUT, "visual-qa-deep.md")} (${report.flagged.length} flagged)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
