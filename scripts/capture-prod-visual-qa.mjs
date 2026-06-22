import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.WIRELINE_VISUAL_BASE_URL || "https://trywireline.com").replace(/\/$/, "");
const outputRoot = path.resolve(process.env.WIRELINE_VISUAL_OUTPUT_DIR || "artifacts/visual-qa-prod");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(outputRoot, timestamp);
const signupEmail = process.env.WIRELINE_VISUAL_EMAIL?.trim() || `visual.qa.${Date.now()}@mailinator.com`;
const signupPassword = process.env.WIRELINE_VISUAL_PASSWORD || `WirelineQA!${String(Date.now()).slice(-6)}`;

const marketingRoutes = [
  "/",
  "/features",
  "/pricing",
  "/showcase",
  "/compare",
  "/solutions/personal",
  "/for/personal",
  "/for/home-services",
  "/for/medical",
  "/for/legal",
  "/for/real-estate",
  "/for/insurance",
  "/for/restaurants",
  "/for/sales",
  "/about",
  "/blog",
  "/security",
  "/status",
  "/support",
  "/contact",
  "/privacy",
  "/terms",
  "/get-started",
  "/signin",
  "/signup",
];

const authenticatedRoutes = [
  "/overview",
  "/agents",
  "/studio",
  "/knowledge",
  "/actions",
  "/inbox",
  "/settings",
  "/settings/billing",
  "/admin",
];

/*
 * `thinkpad` approximates the effective CSS viewport of a Windows laptop
 * after browser chrome/scaling. It is intentionally shorter than the regular
 * laptop target because composer visibility is a vertical ergonomics contract.
 */
const viewports = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "laptop", width: 1280, height: 900 },
  { name: "thinkpad", width: 1365, height: 768 },
];

function fileName(route) {
  if (route === "/") return "home";
  return route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "home";
}

function isBenignConsoleError(text) {
  return [
    /favicon/i,
    /plausible\.io/i,
    /connect\.facebook\.net/i,
    /googletagmanager/i,
    /third-party cookie/i,
  ].some((pattern) => pattern.test(text));
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function assertStudioComposer(page, viewportName, issues) {
  const composer = page.locator('textarea#studio-training-composer').first();
  if (!(await composer.isVisible().catch(() => false))) {
    issues.push({ viewport: viewportName, route: "/studio", mode: "authenticated", kind: "layout", detail: "Studio composer is not visible." });
    return;
  }
  const box = await composer.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport || box.y < 0 || box.y + box.height > viewport.height) {
    issues.push({
      viewport: viewportName,
      route: "/studio",
      mode: "authenticated",
      kind: "layout",
      detail: "Studio composer falls outside the visible viewport.",
    });
  }
}

async function captureRoute(page, viewportName, route, issues, mode) {
  const response = await page.goto(`${baseUrl}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await settle(page);
  const status = response?.status() ?? null;
  if (status && status >= 400) {
    issues.push({ viewport: viewportName, route, mode, kind: "http", detail: String(status) });
  }

  if (mode === "authenticated" && route === "/studio") {
    await assertStudioComposer(page, viewportName, issues);
  }

  const prefix = path.join(outputDir, `${viewportName}-${mode}-${fileName(route)}`);
  await page.screenshot({ path: `${prefix}-viewport.png`, fullPage: false, animations: "disabled" });
  await page.screenshot({ path: `${prefix}-full.png`, fullPage: true, animations: "disabled" });
}

async function signUp(page, viewportName, issues) {
  await page.goto(`${baseUrl}/signup`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await settle(page);
  try {
    const createTab = page.getByRole("button", { name: "Create account" });
    if (await createTab.isVisible().catch(() => false)) await createTab.click();
    await page.locator("#auth-email").fill(signupEmail);
    await page.locator("#auth-password").fill(signupPassword);
    const terms = page.locator('input[type="checkbox"]');
    if (await terms.count()) await terms.first().check();
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/(overview|agents|studio|onboarding)(?:\?|$)/, { timeout: 45_000 });
    await settle(page);
    return true;
  } catch (error) {
    issues.push({
      viewport: viewportName,
      route: "/signup",
      mode: "authenticated",
      kind: "auth",
      detail: error instanceof Error ? error.message : "Sign-up failed",
    });
    return false;
  }
}

function attachDiagnostics(page, viewportName, mode, issues) {
  page.on("console", (message) => {
    if (message.type() === "error" && !isBenignConsoleError(message.text())) {
      issues.push({ viewport: viewportName, route: page.url(), mode, kind: "console", detail: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    issues.push({ viewport: viewportName, route: page.url(), mode, kind: "pageerror", detail: error.message });
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400 && !isBenignConsoleError(response.url())) {
      issues.push({
        viewport: viewportName,
        route: page.url(),
        mode,
        kind: "network",
        detail: `Failed to load resource: ${response.url()} returned status ${status}`
      });
    }
  });
}

async function captureMarketing(browser, viewport, issues) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  attachDiagnostics(page, viewport.name, "public", issues);
  for (const route of marketingRoutes) await captureRoute(page, viewport.name, route, issues, "public");
  await context.close();
}

async function captureAuthenticated(browser, viewport, storageState, issues) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    storageState,
  });
  const page = await context.newPage();
  attachDiagnostics(page, viewport.name, "authenticated", issues);
  for (const route of authenticatedRoutes) await captureRoute(page, viewport.name, route, issues, "authenticated");
  await context.close();
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const issues = [];
let storageState = null;

try {
  const desktop = viewports[0];
  await captureMarketing(browser, desktop, issues);

  const signupContext = await browser.newContext({ viewport: { width: desktop.width, height: desktop.height }, deviceScaleFactor: 1 });
  const signupPage = await signupContext.newPage();
  attachDiagnostics(signupPage, desktop.name, "authenticated", issues);

  if (await signUp(signupPage, desktop.name, issues)) {
    storageState = await signupContext.storageState();
    for (const route of authenticatedRoutes) {
      await captureRoute(signupPage, desktop.name, route, issues, "authenticated");
    }
  }
  await signupContext.close();

  for (const viewport of viewports.slice(1)) {
    await captureMarketing(browser, viewport, issues);
    if (storageState) await captureAuthenticated(browser, viewport, storageState, issues);
  }
} finally {
  await browser.close();
}

const routeCount = marketingRoutes.length * viewports.length + (storageState ? authenticatedRoutes.length * viewports.length : 0);
const manifest = {
  baseUrl,
  outputDir,
  signupEmail,
  authenticatedCapture: !!storageState,
  viewports,
  marketingRoutes,
  authenticatedRoutes,
  screenshotCountExpected: routeCount * 2,
  issues,
};
await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Visual QA screenshots written to ${outputDir}`);
console.log(`Demo account: ${signupEmail}`);
if (issues.length) console.warn(`${issues.length} visual QA issue(s) recorded in manifest.json`);
