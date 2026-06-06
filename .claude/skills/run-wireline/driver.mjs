#!/usr/bin/env node
/**
 * Wireline Director Chat — headless Playwright driver.
 *
 * Usage:
 *   node .claude/skills/run-wireline/driver.mjs [action] [options]
 *
 * Actions:
 *   smoke          Launch app, screenshot landing page + Director Chat (default)
 *   screenshot     Navigate to a specific route and screenshot
 *   interact       Run a full Director Chat interaction flow
 *   routes         Screenshot every major route for visual QA
 *   viewports      Screenshot key routes at mobile / tablet / desktop widths
 *                  (responsive visual QA — "world-class UI from every viewport")
 *
 * Options:
 *   --url URL          Base URL (default: http://localhost:3000)
 *   --route PATH       Route to screenshot (with "screenshot" / "viewports")
 *   --out DIR          Screenshot output directory (default: /tmp/wireline-screenshots)
 *   --headed           Run with visible browser (non-headless)
 *   --full             Capture full-page (scrolled) screenshots, not just the fold
 *   --block-external   Abort all non-base-origin requests (fonts, analytics).
 *                      Use in network-restricted environments where blocked
 *                      third-party requests would otherwise stall navigation.
 *
 * Navigation note: we wait with `commit` + a poll for the React root to
 * populate, NOT `networkidle`. The app holds long-lived connections (auth
 * SSE, analytics), so `networkidle` never settles and every goto would time
 * out. The root-populated check is the reliable "app is interactive" signal.
 */

import { chromium } from "playwright";
import { existsSync, mkdirSync } from "fs";
import path from "path";

const args = process.argv.slice(2);
const action = args.find((a) => !a.startsWith("--")) || "smoke";
const getFlag = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
};
const hasFlag = (name) => args.includes(`--${name}`);

const BASE_URL = getFlag("url") || "http://localhost:3000";
const OUT_DIR = getFlag("out") || "/tmp/wireline-screenshots";
const ROUTE = getFlag("route") || "/";
const FULL_PAGE = hasFlag("full");

// Responsive QA breakpoints. Wireline is designed mobile-first at 390px
// (see DESIGN.md / CLAUDE.md), so that's the canonical small viewport;
// tablet and desktop confirm the layout scales up cleanly.
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, scale: 2 }, // iPhone 14-class
  { name: "tablet", width: 834, height: 1112, scale: 2 }, // iPad-class
  { name: "desktop", width: 1440, height: 900, scale: 2 }, // laptop
];

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function ssPath(name) {
  return path.join(OUT_DIR, `${name}.png`);
}

async function launch(viewport = { width: 1440, height: 900, scale: 2 }) {
  const browser = await chromium.launch({
    headless: !hasFlag("headed"),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.scale ?? 2,
    colorScheme: "light",
    isMobile: viewport.width < 600,
    hasTouch: viewport.width < 600,
  });
  // In network-restricted environments, blocked third-party requests (Google
  // Fonts, Plausible) hang and stall navigation. Aborting anything off the
  // app origin keeps the page from waiting on them.
  if (hasFlag("block-external")) {
    await context.route("**/*", (route) =>
      route.request().url().startsWith(BASE_URL) ? route.continue() : route.abort(),
    );
  }
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return { browser, context, page };
}

// Navigate and wait until the SPA is actually rendered. We use `commit`
// (resolves as soon as the document response lands) and then poll for the
// React root to fill in — `networkidle` is unusable here because the app keeps
// long-lived connections (auth SSE, analytics) open, so it never fires.
async function gotoStable(page, url) {
  await page.goto(url, { waitUntil: "commit", timeout: 30000 });
  await page
    .waitForFunction(
      () => {
        const el = document.getElementById("root");
        return !!el && el.innerText.trim().length > 30;
      },
      { timeout: 20000 },
    )
    .catch(() => {
      // Fall through to the settle delay even if the heuristic doesn't trip —
      // some routes (bare auth gates) render less than 30 chars of text.
    });
  await page.waitForTimeout(1500);
}

// Marketing/landing pages reveal most sections with `whileInView`
// (intersection-observer) animations that start at opacity:0 and only animate
// in once scrolled into view. A static full-page screenshot never scrolls, so
// those sections capture as empty cream voids — making the page look broken
// when it isn't. Before a full-page shot, walk the scroll position down the
// document (and back to top) so every reveal fires.
async function revealOnScroll(page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 700) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(220);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

async function waitForApp(page) {
  await gotoStable(page, BASE_URL);
}

async function navigateTo(page, route) {
  await gotoStable(page, `${BASE_URL}${route}`);
}

// ── SMOKE: Landing page + Director Chat ──
async function smoke() {
  console.log("[driver] Smoke test — launching browser...");
  const { browser, page } = await launch();

  try {
    // 1. Landing page
    console.log("[driver] Navigating to landing page...");
    await waitForApp(page);
    await page.screenshot({ path: ssPath("01-landing"), fullPage: false });
    console.log(`[driver] Screenshot: ${ssPath("01-landing")}`);

    // 2. Try to reach Director Chat (may redirect to login)
    console.log("[driver] Navigating to Director Chat...");
    await navigateTo(page, "/director");
    await page.screenshot({ path: ssPath("02-director-or-login"), fullPage: false });
    console.log(`[driver] Screenshot: ${ssPath("02-director-or-login")}`);

    // 3. Check for login page — if so, screenshot it
    const url = page.url();
    if (url.includes("login") || url.includes("auth")) {
      console.log("[driver] Redirected to login — screenshotting auth page");
      await page.screenshot({ path: ssPath("03-login-page"), fullPage: false });
      console.log(`[driver] Screenshot: ${ssPath("03-login-page")}`);
    }

    // 4. Check console errors
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.waitForTimeout(1000);

    if (errors.length > 0) {
      console.log(`[driver] Console errors (${errors.length}):`);
      errors.slice(0, 5).forEach((e) => console.log(`  - ${e}`));
    } else {
      console.log("[driver] No console errors");
    }

    console.log("[driver] Smoke test complete.");
  } finally {
    await browser.close();
  }
}

// ── SCREENSHOT: Single route ──
async function screenshotRoute() {
  console.log(`[driver] Screenshot route: ${ROUTE}`);
  const { browser, page } = await launch();
  try {
    await navigateTo(page, ROUTE);
    const name = ROUTE.replace(/\//g, "-").replace(/^-/, "") || "index";
    await page.screenshot({ path: ssPath(name), fullPage: false });
    console.log(`[driver] Screenshot: ${ssPath(name)}`);
  } finally {
    await browser.close();
  }
}

// ── INTERACT: Drive Director Chat with a test message ──
async function interact() {
  console.log("[driver] Interact — full Director Chat flow...");
  const { browser, page } = await launch();

  try {
    await navigateTo(page, "/director");
    await page.screenshot({ path: ssPath("interact-01-director-loaded"), fullPage: false });

    // Look for the composer textarea
    const composer = page.locator("textarea");
    if ((await composer.count()) > 0) {
      console.log("[driver] Found composer textarea — typing message...");
      await composer.first().fill("What agent should I hire first?");
      await page.screenshot({ path: ssPath("interact-02-typed-message"), fullPage: false });

      // Click send button
      const sendBtn = page.locator('button[aria-label="Send message"]');
      if ((await sendBtn.count()) > 0) {
        await sendBtn.click();
        console.log("[driver] Message sent — waiting for response...");
        await page.waitForTimeout(3000);
        await page.screenshot({ path: ssPath("interact-03-response"), fullPage: false });
      }
    } else {
      console.log("[driver] No composer found (likely needs auth)");
    }

    console.log("[driver] Interact flow complete.");
  } finally {
    await browser.close();
  }
}

// ── ROUTES: Screenshot every major route ──
async function routes() {
  const ROUTES = [
    "/",
    "/director",
    "/agents",
    "/training",
    "/ops",
    "/insights",
    "/integrations",
    "/settings",
    "/pricing",
  ];

  console.log(`[driver] Route sweep — ${ROUTES.length} routes...`);
  const { browser, page } = await launch();

  try {
    for (const route of ROUTES) {
      console.log(`[driver]   ${route}`);
      await navigateTo(page, route);
      const name = route.replace(/\//g, "-").replace(/^-/, "") || "index";
      await page.screenshot({ path: ssPath(`route-${name}`), fullPage: false });
    }
    console.log("[driver] Route sweep complete.");
  } finally {
    await browser.close();
  }
}

// ── VIEWPORTS: One route (or a default set) across mobile/tablet/desktop ──
async function viewports() {
  // When --route is passed, sweep just that route across breakpoints; otherwise
  // sweep a representative set covering public + auth-gate surfaces.
  // Default set covers the public surfaces that render fully without a session.
  // (`/showcase` is the real Demos page; `/demos` and `/director` are NOT routes
  // and redirect to the sign-in gate — use the authed-qa harness for the console.)
  const routeFlag = getFlag("route");
  const ROUTES = routeFlag ? [routeFlag] : ["/", "/pricing", "/showcase", "/compare"];

  console.log(
    `[driver] Viewport sweep — ${ROUTES.length} route(s) × ${VIEWPORTS.length} breakpoints${
      FULL_PAGE ? " (full-page)" : ""
    }...`,
  );

  for (const vp of VIEWPORTS) {
    const { browser, page } = await launch(vp);
    try {
      for (const route of ROUTES) {
        await gotoStable(page, `${BASE_URL}${route}`);
        // For full-page shots, trigger scroll-reveal sections first so the
        // capture reflects the real page, not empty pre-animation voids.
        if (FULL_PAGE) await revealOnScroll(page);
        const slug = route.replace(/\//g, "-").replace(/^-/, "") || "index";
        const name = `vp-${vp.name}-${slug}`;
        await page.screenshot({ path: ssPath(name), fullPage: FULL_PAGE });
        console.log(`[driver]   ${vp.name.padEnd(7)} ${vp.width}px  ${route}  → ${ssPath(name)}`);
      }
    } finally {
      await browser.close();
    }
  }
  console.log("[driver] Viewport sweep complete.");
}

// ── DISPATCH ──
switch (action) {
  case "smoke":
    await smoke();
    break;
  case "screenshot":
    await screenshotRoute();
    break;
  case "interact":
    await interact();
    break;
  case "routes":
    await routes();
    break;
  case "viewports":
    await viewports();
    break;
  default:
    console.error(`Unknown action: ${action}`);
    console.error("Valid actions: smoke, screenshot, interact, routes, viewports");
    process.exit(1);
}
