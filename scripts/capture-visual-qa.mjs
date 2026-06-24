import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.WIRELINE_VISUAL_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const outputRoot = path.resolve(process.env.WIRELINE_VISUAL_OUTPUT_DIR || "artifacts/visual-qa");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(outputRoot, timestamp);
const email = process.env.WIRELINE_VISUAL_EMAIL?.trim();
const password = process.env.WIRELINE_VISUAL_PASSWORD;

const marketingRoutes = [
  "/",
  "/features",
  "/pricing",
  "/showcase",
  "/compare",
  "/about",
  "/blog",
  "/contact",
  "/support",
  "/security",
  "/status",
  "/privacy",
  "/terms",
  "/signin",
  "/signup",
];

const authenticatedRoutes = [
  "/overview",
  "/agents",
  "/studio",
  "/studio?create=1",
  "/knowledge",
  "/actions",
  "/actions/salesforce",
  "/inbox",
  "/settings",
  "/settings/billing",
  "/settings/team",
  "/admin",
  "/admin?tab=subscription",
  "/admin?tab=team",
  "/admin?tab=branding",
  "/admin?tab=carrier",
];

const viewports = [
  { name: "desktop", width: 1440, height: 1100, isMobile: false, hasTouch: false },
  { name: "laptop", width: 1280, height: 900, isMobile: false, hasTouch: false },
  { name: "tablet", width: 834, height: 1112, isMobile: true, hasTouch: true },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
];

function fileName(route) {
  if (route === "/") return "home";
  return route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(450);
}

async function captureRoute(page, viewportName, route, issues) {
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await settle(page);
  const status = response?.status() ?? null;
  const finalUrl = page.url();
  if (status && status >= 400) issues.push({ viewport: viewportName, route, kind: "http", detail: String(status) });
  if (!finalUrl.startsWith(`${baseUrl}${route.split("?")[0]}`)) {
    issues.push({ viewport: viewportName, route, kind: "redirect", detail: finalUrl });
  }
  const file = path.join(outputDir, `${viewportName}-${fileName(route)}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
}

async function signIn(page, viewportName, issues) {
  if (!email || !password) return false;
  await page.goto(`${baseUrl}/signin?redirect=%2Foverview`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await settle(page);
  try {
    await page.locator("#auth-email").fill(email);
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/overview(?:\?|$)/, { timeout: 25_000 });
    await settle(page);
    return true;
  } catch (error) {
    issues.push({ viewport: viewportName, route: "/signin", kind: "auth", detail: error instanceof Error ? error.message : "Sign-in failed" });
    return false;
  }
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const issues = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") issues.push({ viewport: viewport.name, route: page.url(), kind: "console", detail: message.text() });
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure();
      if (failure?.errorText) issues.push({ viewport: viewport.name, route: page.url(), kind: "request", detail: `${request.url()} - ${failure.errorText}` });
    });

    for (const route of marketingRoutes) await captureRoute(page, viewport.name, route, issues);

    if (await signIn(page, viewport.name, issues)) {
      for (const route of authenticatedRoutes) await captureRoute(page, viewport.name, route, issues);
    }

    await context.close();
  }
} finally {
  await browser.close();
}

const manifest = {
  baseUrl,
  outputDir,
  authenticatedCapture: Boolean(email && password),
  viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
  marketingRoutes,
  authenticatedRoutes,
  issues,
};
await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Visual QA screenshots written to ${outputDir}`);
if (issues.length) {
  console.warn(`${issues.length} visual QA issue(s) recorded in manifest.json`);
  process.exitCode = 1;
}
