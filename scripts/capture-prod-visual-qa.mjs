import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.WIRELINE_VISUAL_BASE_URL || "https://trywireline.com").replace(/\/$/, "");
const outputRoot = path.resolve(process.env.WIRELINE_VISUAL_OUTPUT_DIR || "artifacts/visual-qa-prod");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(outputRoot, timestamp);
const signupEmail = process.env.WIRELINE_VISUAL_EMAIL?.trim() || `visual.qa.${Date.now()}@mailinator.com`;
const signupPassword = process.env.WIRELINE_VISUAL_PASSWORD || `WirelineQA!${String(Date.now()).slice(-6)}`;

const marketingRoutes = ["/", "/features", "/pricing", "/showcase", "/compare", "/about", "/signin", "/signup"];
const authenticatedRoutes = ["/agents", "/studio", "/knowledge", "/integrations", "/ops", "/settings"];

const viewports = [
  { name: "desktop", width: 1440, height: 1100, isMobile: false, hasTouch: false },
  { name: "laptop", width: 1280, height: 900, isMobile: false, hasTouch: false },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
];

function fileName(route) {
  if (route === "/") return "home";
  return route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "home";
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function captureRoute(page, viewportName, route, issues) {
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page);
  const status = response?.status() ?? null;
  if (status && status >= 400) issues.push({ viewport: viewportName, route, kind: "http", detail: String(status) });
  const file = path.join(outputDir, `${viewportName}-${fileName(route)}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
}

async function signUp(page, viewportName, issues) {
  await page.goto(`${baseUrl}/signup`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page);
  try {
    const createTab = page.getByRole("button", { name: "Create account" });
    if (await createTab.isVisible().catch(() => false)) await createTab.click();
    await page.locator("#auth-email").fill(signupEmail);
    await page.locator("#auth-password").fill(signupPassword);
    const terms = page.locator('input[type="checkbox"]');
    if (await terms.count()) await terms.first().check();
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/(agents|studio|onboarding)(?:\?|$)/, { timeout: 45_000 });
    await settle(page);
    return true;
  } catch (error) {
    issues.push({
      viewport: viewportName,
      route: "/signup",
      kind: "auth",
      detail: error instanceof Error ? error.message : "Sign-up failed",
    });
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
      if (message.type() === "error") {
        issues.push({ viewport: viewport.name, route: page.url(), kind: "console", detail: message.text() });
      }
    });

    for (const route of marketingRoutes) await captureRoute(page, viewport.name, route, issues);

    if (await signUp(page, viewport.name, issues)) {
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
  signupEmail,
  authenticatedCapture: issues.every((issue) => issue.kind !== "auth"),
  viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
  marketingRoutes,
  authenticatedRoutes,
  issues,
};
await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Visual QA screenshots written to ${outputDir}`);
console.log(`Demo account: ${signupEmail}`);
if (issues.length) {
  console.warn(`${issues.length} visual QA issue(s) recorded in manifest.json`);
}
