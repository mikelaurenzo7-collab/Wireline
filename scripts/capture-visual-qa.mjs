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
  "/connections",
  "/connections/salesforce",
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
  { name: "phone-360", width: 360, height: 800, isMobile: true, hasTouch: true },
  { name: "phone-390", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "phone-430", width: 430, height: 932, isMobile: true, hasTouch: true },
  { name: "tablet-768", width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: "tablet-834", width: 834, height: 1112, isMobile: true, hasTouch: true },
  { name: "laptop-1024", width: 1024, height: 768, isMobile: false, hasTouch: false },
  { name: "laptop-1280", width: 1280, height: 900, isMobile: false, hasTouch: false },
  { name: "desktop-1440", width: 1440, height: 1100, isMobile: false, hasTouch: false },
];

function fileName(route) {
  if (route === "/") return "home";
  return route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
}

function describeControl(element) {
  return (
    element.getAttribute("aria-label") ||
    element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ||
    element.tagName.toLowerCase()
  );
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(450);
}

async function auditResponsiveLayout(page, viewportName, route, issues) {
  const findings = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const pageOverflow = document.documentElement.scrollWidth > viewportWidth + 1;
    const controls = Array.from(
      document.querySelectorAll('button, a, [role="button"], [role="tab"], [data-slot="button"]'),
    )
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const escapesViewport = rect.left < -1 || rect.right > viewportWidth + 1;
        const hasVisibleInternalOverflow =
          element.scrollWidth > element.clientWidth + 1 &&
          style.overflowX === "visible" &&
          !element.classList.contains("tab-strip-scroll");
        return {
          label:
            element.getAttribute("aria-label") ||
            element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ||
            element.tagName.toLowerCase(),
          escapesViewport,
          hasVisibleInternalOverflow,
        };
      })
      .filter((control) => control.escapesViewport || control.hasVisibleInternalOverflow);

    return { pageOverflow, controls };
  });

  if (findings.pageOverflow) {
    issues.push({ viewport: viewportName, route, kind: "overflow", detail: "Document exceeds viewport width." });
  }
  for (const control of findings.controls) {
    issues.push({
      viewport: viewportName,
      route,
      kind: "control-overflow",
      detail: `${control.label}: ${control.escapesViewport ? "escapes viewport" : "visible internal overflow"}`,
    });
  }
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
  await auditResponsiveLayout(page, viewportName, route, issues);
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
