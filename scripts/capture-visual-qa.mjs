import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.WIRELINE_VISUAL_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const outputRoot = path.resolve(process.env.WIRELINE_VISUAL_OUTPUT_DIR || "artifacts/visual-qa");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(outputRoot, timestamp);
const email = process.env.WIRELINE_VISUAL_EMAIL?.trim();
const password = process.env.WIRELINE_VISUAL_PASSWORD;
const routeTimeoutMs = Number(process.env.WIRELINE_VISUAL_ROUTE_TIMEOUT_MS || 90_000);

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

function parseList(value) {
  return new Set(
    (value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

const viewportFilter = parseList(process.env.WIRELINE_VISUAL_VIEWPORTS);
const marketingRouteFilter = parseList(process.env.WIRELINE_VISUAL_MARKETING_ROUTES);
const authenticatedRouteFilter = parseList(process.env.WIRELINE_VISUAL_AUTH_ROUTES);
const activeMarketingRoutes = marketingRouteFilter.size
  ? marketingRoutes.filter((route) => marketingRouteFilter.has(route))
  : marketingRoutes;
const activeAuthenticatedRoutes = authenticatedRouteFilter.size
  ? authenticatedRoutes.filter((route) => authenticatedRouteFilter.has(route))
  : authenticatedRoutes;
const activeViewports = viewportFilter.size
  ? viewports.filter((viewport) => viewportFilter.has(viewport.name))
  : viewports;
const ignoredRequestHosts = new Set([
  "analytics.google.com",
  "region1.google-analytics.com",
  "www.google-analytics.com",
  "www.googletagmanager.com",
  ...parseList(process.env.WIRELINE_VISUAL_IGNORED_REQUEST_HOSTS),
]);

function fileName(route) {
  if (route === "/") return "home";
  return (
    route
      .replace(/^\//, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "") || "home"
  );
}

function describeControl(element) {
  return (
    element.getAttribute("aria-label") ||
    element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ||
    element.tagName.toLowerCase()
  );
}

function isIgnoredRequestFailure(request) {
  try {
    return ignoredRequestHosts.has(new URL(request.url()).hostname);
  } catch {
    return false;
  }
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(450);
}

function pushIssue(issues, issue) {
  const P0 = new Set([
    "http",
    "navigation",
    "capture",
    "overflow",
    "control-overflow",
    "redirect",
    "auth",
  ]);
  issues.push({ ...issue, severity: P0.has(issue.kind) ? "P0" : "P1" });
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
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
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
    pushIssue(issues, {
      viewport: viewportName,
      route,
      kind: "overflow",
      detail: "Document exceeds viewport width.",
    });
  }
  for (const control of findings.controls) {
    pushIssue(issues, {
      viewport: viewportName,
      route,
      kind: "control-overflow",
      detail: `${control.label}: ${control.escapesViewport ? "escapes viewport" : "visible internal overflow"}`,
    });
  }
}

async function gotoWithRetry(page, route, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.goto(`${baseUrl}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await page.waitForTimeout(1_000 * attempt);
    }
  }
  throw lastError;
}

async function captureRoute(page, viewportName, route, issues) {
  let response;
  try {
    response = await gotoWithRetry(page, route);
  } catch (error) {
    pushIssue(issues, {
      viewport: viewportName,
      route,
      kind: "navigation",
      detail: error instanceof Error ? error.message : "Navigation failed",
    });
    return;
  }
  await settle(page);
  const status = response?.status() ?? null;
  const finalUrl = page.url();
  if (status && status >= 400)
    pushIssue(issues, { viewport: viewportName, route, kind: "http", detail: String(status) });
  if (!finalUrl.startsWith(`${baseUrl}${route.split("?")[0]}`)) {
    pushIssue(issues, { viewport: viewportName, route, kind: "redirect", detail: finalUrl });
  }
  await auditResponsiveLayout(page, viewportName, route, issues);
  const file = path.join(outputDir, `${viewportName}-${fileName(route)}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled", timeout: 30_000 });
}

function attachPageDiagnostics(page, viewportName, issues) {
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(45_000);
  page.on("console", (message) => {
    if (message.type() === "error") {
      pushIssue(issues, {
        viewport: viewportName,
        route: page.url(),
        kind: "console",
        detail: message.text(),
      });
    }
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (isIgnoredRequestFailure(request)) return;
    if (failure?.errorText) {
      pushIssue(issues, {
        viewport: viewportName,
        route: page.url(),
        kind: "request",
        detail: `${request.url()} - ${failure.errorText}`,
      });
    }
  });
}

async function withTimeout(work, timeoutMs, message) {
  let timeout;
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function captureRouteInFreshPage(context, viewportName, route, issues) {
  const page = await context.newPage();
  attachPageDiagnostics(page, viewportName, issues);
  try {
    await withTimeout(
      captureRoute(page, viewportName, route, issues),
      routeTimeoutMs,
      `Capture timed out after ${routeTimeoutMs}ms`,
    );
  } catch (error) {
    pushIssue(issues, {
      viewport: viewportName,
      route,
      kind: "capture",
      detail: error instanceof Error ? error.message : "Capture failed",
    });
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => {});
  }
}

async function signIn(page, viewportName, issues) {
  if (!email || !password) return false;
  await page.goto(`${baseUrl}/signin?redirect=%2Foverview`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await settle(page);
  try {
    await page.locator("#auth-email").fill(email);
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/overview(?:\?|$)/, { timeout: 25_000 });
    await settle(page);
    return true;
  } catch (error) {
    pushIssue(issues, {
      viewport: viewportName,
      route: "/signin",
      kind: "auth",
      detail: error instanceof Error ? error.message : "Sign-in failed",
    });
    return false;
  }
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const issues = [];
let authenticatedStorageState = null;

try {
  if (email && password) {
    const authContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
    });
    const authPage = await authContext.newPage();
    attachPageDiagnostics(authPage, "auth-seed", issues);
    const signedIn = await signIn(authPage, "auth-seed", issues);
    if (signedIn) authenticatedStorageState = await authContext.storageState();
    await authPage.close({ runBeforeUnload: false }).catch(() => {});
    await authContext.close();
  }

  for (const viewport of activeViewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      deviceScaleFactor: 1,
      storageState: authenticatedStorageState ?? undefined,
    });

    for (const route of activeMarketingRoutes)
      await captureRouteInFreshPage(context, viewport.name, route, issues);

    if (authenticatedStorageState) {
      for (const route of activeAuthenticatedRoutes)
        await captureRouteInFreshPage(context, viewport.name, route, issues);
    }

    await context.close();
  }
} finally {
  await browser.close();
}

const manifest = {
  baseUrl,
  outputDir,
  authenticatedCapture: Boolean(authenticatedStorageState),
  viewports: activeViewports.map(({ name, width, height }) => ({ name, width, height })),
  marketingRoutes: activeMarketingRoutes,
  authenticatedRoutes: activeAuthenticatedRoutes,
  issues,
  p0_count: issues.filter((i) => i.severity === "P0").length,
};
await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Visual QA screenshots written to ${outputDir}`);
const p0Count = manifest.p0_count;
if (p0Count) {
  console.warn(`${p0Count} visual QA P0 issue(s) recorded in manifest.json`);
  process.exitCode = 1;
} else if (issues.length) {
  console.warn(`${issues.length} non-blocking visual QA issue(s) recorded in manifest.json`);
}
