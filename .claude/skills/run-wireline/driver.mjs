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
 *
 * Options:
 *   --url URL      Base URL (default: http://localhost:3000)
 *   --route PATH   Route to screenshot (with "screenshot" action)
 *   --out DIR      Screenshot output directory (default: /tmp/wireline-screenshots)
 *   --headed       Run with visible browser (non-headless)
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

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function ssPath(name) {
  return path.join(OUT_DIR, `${name}.png`);
}

async function launch() {
  const browser = await chromium.launch({
    headless: !hasFlag("headed"),
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return { browser, context, page };
}

async function waitForApp(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  // Wait for React to mount
  await page.waitForTimeout(2000);
}

async function navigateTo(page, route) {
  await page.goto(`${BASE_URL}${route}`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(2000);
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
  default:
    console.error(`Unknown action: ${action}`);
    console.error("Valid actions: smoke, screenshot, interact, routes");
    process.exit(1);
}
