import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromiumLaunchOptions } from "./lib/resolve-preinstalled-chromium.mjs";
import {
  assertCleanCheckout,
  resolveSourceCommit,
  verifyRemoteSourceCommit,
  waitForRemoteSourceCommit,
} from "./lib/release-source-verification.mjs";

const baseUrl = (process.env.WIRELINE_VISUAL_BASE_URL || "https://botbound.me").replace(/\/$/, "");
const outputRoot = path.resolve(
  process.env.WIRELINE_VISUAL_OUTPUT_DIR || "artifacts/visual-qa-prod",
);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(outputRoot, timestamp);
const qaEmail = process.env.WIRELINE_VISUAL_EMAIL?.trim();
const qaPassword = process.env.WIRELINE_VISUAL_PASSWORD;
const expectedQaEmail = process.env.WIRELINE_VISUAL_EXPECTED_EMAIL?.trim().toLowerCase();
const qaAccountConfigured = Boolean(
  qaEmail && qaPassword && expectedQaEmail && qaEmail.toLowerCase() === expectedQaEmail,
);
const sourceWaitMs = Number(process.env.WIRELINE_VISUAL_SOURCE_WAIT_MS || 10 * 60_000);
const repoRoot = process.cwd();
const sourceCommit = resolveSourceCommit(repoRoot);

assertCleanCheckout(repoRoot, sourceCommit);
const sourceVerificationBefore = await waitForRemoteSourceCommit(sourceCommit, baseUrl, {
  timeoutMs: sourceWaitMs,
});

const marketingRoutes = [
  "/",
  "/features",
  "/pricing",
  "/showcase",
  "/compare",
  "/solutions/support",
  "/solutions/sales",
  "/for/everyday",
  "/for/home-services",
  "/for/medical",
  "/for/legal",
  "/for/real-estate",
  "/for/insurance",
  "/for/restaurants",
  "/for/sales",
  "/about",
  "/blog",
  "/changelog",
  "/security",
  "/trust",
  "/trust/medical",
  "/trust/legal",
  "/trust/insurance",
  "/trust/enterprise",
  "/support",
  "/contact",
  "/privacy",
  "/terms",
  "/developers",
  "/get-started",
  "/signin",
  "/signup",
  "/404",
  "/not-found",
];

const authenticatedRoutes = [
  "/studio",
  "/studio?create=1",
  "/templates",
  "/knowledge",
  "/connections",
  "/connections/salesforce",
  "/phone",
  "/phone?tab=setup#company-identity",
  "/phone?tab=logs",
  "/phone?tab=outbound",
  "/phone?tab=campaigns",
  "/phone?tab=callbacks",
  "/insights",
  "/inbox",
  "/approvals",
  "/settings",
  "/settings/billing",
  "/settings/team",
  "/settings/customization",
  "/settings/compliance",
  "/settings/apps",
  "/settings/apps/command",
  "/settings/not-a-route",
  "/admin",
  "/admin?tab=subscription",
  "/admin?tab=team",
  "/admin?tab=branding",
  "/admin?tab=carrier",
];

const compatibilityRoutes = [
  "/overview",
  "/studio/live-video",
  "/settings/phone#company-identity",
  "/apps",
  "/apps/command",
];

const expectedRedirects = new Map([
  ["/overview", "/studio"],
  ["/studio/live-video", "/studio"],
  ["/settings/phone", "/phone?tab=setup"],
  ["/apps", "/settings/apps"],
  ["/apps/command", "/settings/apps/command"],
]);

const allViewports = [
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "desktop", width: 1440, height: 1100, isMobile: false, hasTouch: false },
  { name: "laptop", width: 1280, height: 900, isMobile: false, hasTouch: false },
  { name: "breakpoint", width: 1023, height: 768, isMobile: false, hasTouch: false },
  { name: "short", width: 1365, height: 650, isMobile: false, hasTouch: false },
];
const viewportFilter = new Set(
  (process.env.WIRELINE_VISUAL_VIEWPORTS || "phone,desktop,laptop,breakpoint,short")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);
const viewports = allViewports.filter((viewport) => viewportFilter.has(viewport.name));

const ignoredRequestHosts = new Set([
  "analytics.google.com",
  "region1.google-analytics.com",
  "www.google-analytics.com",
  "www.googletagmanager.com",
  "plausible.io",
  "connect.facebook.net",
  "www.facebook.com",
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

function isBenignExternal(value) {
  try {
    return ignoredRequestHosts.has(new URL(value).hostname);
  } catch {
    return [...ignoredRequestHosts].some((host) => value.includes(host));
  }
}

function pushIssue(issues, issue) {
  if (
    issues.some(
      (existing) =>
        existing.viewport === issue.viewport &&
        existing.route === issue.route &&
        existing.kind === issue.kind &&
        existing.detail === issue.detail,
    )
  ) {
    return;
  }
  issues.push(issue);
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function blockThirdPartyBeacons(page) {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    return isBenignExternal(url) ? route.abort() : route.continue();
  });
}

function routeReached(route, finalUrl) {
  try {
    const requested = new URL(route, `${baseUrl}/`);
    const redirectTarget = new URL(
      expectedRedirects.get(requested.pathname) || requested.pathname,
      requested.origin,
    );
    const expectedSearchParams = new URLSearchParams(requested.search);
    for (const [key, value] of redirectTarget.searchParams) expectedSearchParams.set(key, value);
    const expectedSearchValue = expectedSearchParams.toString();
    const expectedSearch = expectedSearchValue ? `?${expectedSearchValue}` : "";
    const expectedHash = redirectTarget.hash || requested.hash;
    const final = new URL(finalUrl);
    return (
      final.origin === requested.origin &&
      final.pathname === redirectTarget.pathname &&
      final.search === expectedSearch &&
      final.hash === expectedHash
    );
  } catch {
    return false;
  }
}

async function auditResponsiveLayout(page, viewportName, route, issues) {
  const findings = await page.evaluate(() => {
    const width = window.innerWidth;
    const pageOverflow = document.documentElement.scrollWidth > width + 1;
    const escapingControls = Array.from(
      document.querySelectorAll('button, a, [role="button"], [role="tab"], [data-slot="button"]'),
    )
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0)
          return false;
        const scroller = element.closest(".overflow-x-auto, .tab-strip-scroll, .wl-workspace-tabs");
        const scrollStyle = scroller ? window.getComputedStyle(scroller) : null;
        const intentionallyScrollable =
          scrollStyle?.overflowX === "auto" || scrollStyle?.overflowX === "scroll";
        return !intentionallyScrollable && (rect.left < -1 || rect.right > width + 1);
      })
      .map(
        (element) =>
          element.getAttribute("aria-label") ||
          element.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ||
          element.tagName.toLowerCase(),
      );
    return { pageOverflow, escapingControls };
  });

  if (findings.pageOverflow) {
    pushIssue(issues, {
      viewport: viewportName,
      route,
      mode: "layout",
      kind: "overflow",
      detail: "Document exceeds viewport width.",
    });
  }
  for (const label of findings.escapingControls) {
    pushIssue(issues, {
      viewport: viewportName,
      route,
      mode: "layout",
      kind: "control-overflow",
      detail: `${label}: escapes viewport`,
    });
  }
}

function attachDiagnostics(page, viewportName, mode, issues) {
  page.on("console", (message) => {
    if (message.type() === "error" && !isBenignExternal(message.text())) {
      pushIssue(issues, {
        viewport: viewportName,
        route: page.url(),
        mode,
        kind: "console",
        detail: message.text(),
      });
    }
  });
  page.on("pageerror", (error) => {
    pushIssue(issues, {
      viewport: viewportName,
      route: page.url(),
      mode,
      kind: "pageerror",
      detail: error.message,
    });
  });
  page.on("requestfailed", (request) => {
    if (isBenignExternal(request.url())) return;
    const detail = request.failure()?.errorText;
    if (!detail) return;
    pushIssue(issues, {
      viewport: viewportName,
      route: page.url(),
      mode,
      kind: "request",
      detail: `${request.url()} - ${detail}`,
    });
  });
}

async function captureRoute(page, viewportName, route, issues, mode) {
  try {
    const response = await page.goto(`${baseUrl}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await settle(page);
    const status = response?.status() ?? null;
    if (status && status >= 400) {
      pushIssue(issues, {
        viewport: viewportName,
        route,
        mode,
        kind: "http",
        detail: String(status),
      });
    }
    const finalUrl = page.url();
    if (!routeReached(route, finalUrl)) {
      pushIssue(issues, {
        viewport: viewportName,
        route,
        mode,
        kind: "redirect",
        detail: finalUrl,
      });
    }
    if (mode === "authenticated" && /\/signin(?:\?|$)/.test(new URL(finalUrl).pathname)) {
      pushIssue(issues, {
        viewport: viewportName,
        route,
        mode,
        kind: "auth",
        detail: "Authenticated session was lost during capture.",
      });
    }
    const shellMounted = await page.evaluate(() => {
      const root = document.getElementById("root");
      return Boolean(root && root.childElementCount > 0);
    });
    if (!shellMounted) {
      pushIssue(issues, {
        viewport: viewportName,
        route,
        mode,
        kind: "shell-not-mounted",
        detail: "#root has no children.",
      });
    }
    await auditResponsiveLayout(page, viewportName, route, issues);
    const prefix = path.join(outputDir, `${viewportName}-${mode}-${fileName(route)}`);
    await page.screenshot({
      path: `${prefix}-viewport.png`,
      fullPage: false,
      animations: "disabled",
    });
    await page.screenshot({ path: `${prefix}-full.png`, fullPage: true, animations: "disabled" });
    if (mode === "authenticated") {
      const workspaceScrollport = page.locator(".wl-workspace-content").first();
      if ((await workspaceScrollport.count()) > 0 && (await workspaceScrollport.isVisible())) {
        await workspaceScrollport.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await page.waitForTimeout(150);
        authenticatedScrollCaptureCount += 1;
        await page.screenshot({
          path: `${prefix}-scroll-end.png`,
          fullPage: false,
          animations: "disabled",
        });
      }
    }
  } catch (error) {
    pushIssue(issues, {
      viewport: viewportName,
      route,
      mode,
      kind: "capture",
      detail: error instanceof Error ? error.message : "Capture failed",
    });
  }
}

async function createContext(browser, viewport, storageState) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    deviceScaleFactor: 1,
    ...(storageState ? { storageState } : {}),
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("wireline_cookie_consent", "acknowledged");
      localStorage.setItem("wireline_marketing_measurement_consent", "denied");
    } catch {
      // Private contexts may block storage.
    }
  });
  return context;
}

async function signIn(page, issues) {
  if (!qaAccountConfigured) {
    pushIssue(issues, {
      viewport: "auth-seed",
      route: "/signin",
      mode: "authenticated",
      kind: "auth",
      detail:
        "Production visual QA requires credentials whose email exactly matches WIRELINE_VISUAL_EXPECTED_EMAIL.",
    });
    return false;
  }

  try {
    await page.goto(`${baseUrl}/signin?redirect=%2Fstudio`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await settle(page);
    await page.locator("#auth-email").fill(qaEmail);
    await page.locator("#auth-password").fill(qaPassword);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/studio(?:\?|$)/, { timeout: 45_000 });
    await settle(page);

    const accountEnvironment = await page.evaluate(async () => {
      const response = await fetch("/api/settings", { credentials: "same-origin" });
      if (!response.ok) return null;
      const body = await response.json().catch(() => null);
      if (!body || typeof body !== "object") return null;
      const nested =
        "settings" in body && body.settings && typeof body.settings === "object"
          ? body.settings
          : body;
      return "account_environment" in nested ? nested.account_environment : null;
    });
    if (accountEnvironment !== "demo") {
      throw new Error("Authenticated visual QA refused a non-demo account.");
    }
    return true;
  } catch (error) {
    pushIssue(issues, {
      viewport: "auth-seed",
      route: "/signin",
      mode: "authenticated",
      kind: "auth",
      detail: error instanceof Error ? error.message : "Sign-in failed",
    });
    return false;
  }
}

await mkdir(outputDir, { recursive: true });
const issues = [];
const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  headless: true,
  ...chromiumLaunchOptions(),
  ...(proxyServer ? { proxy: { server: proxyServer, bypass: "localhost,127.0.0.1,::1" } } : {}),
});

let storageState = null;
let authenticatedScrollCaptureCount = 0;
try {
  const seedViewport = allViewports.find((viewport) => viewport.name === "desktop");
  const seedContext = await createContext(browser, seedViewport);
  const seedPage = await seedContext.newPage();
  await blockThirdPartyBeacons(seedPage);
  attachDiagnostics(seedPage, "auth-seed", "authenticated", issues);
  if (await signIn(seedPage, issues)) storageState = await seedContext.storageState();
  await seedContext.close();

  for (const viewport of viewports) {
    const publicContext = await createContext(browser, viewport);
    const publicPage = await publicContext.newPage();
    await blockThirdPartyBeacons(publicPage);
    attachDiagnostics(publicPage, viewport.name, "public", issues);
    for (const route of marketingRoutes) {
      await captureRoute(publicPage, viewport.name, route, issues, "public");
    }
    await publicContext.close();

    if (!storageState) continue;
    const authContext = await createContext(browser, viewport, storageState);
    const authPage = await authContext.newPage();
    await blockThirdPartyBeacons(authPage);
    attachDiagnostics(authPage, viewport.name, "authenticated", issues);
    for (const route of [...authenticatedRoutes, ...compatibilityRoutes]) {
      await captureRoute(authPage, viewport.name, route, issues, "authenticated");
    }
    await authContext.close();
  }
} finally {
  await browser.close();
}

const sourceVerificationAfter = await verifyRemoteSourceCommit(sourceCommit, baseUrl);
assertCleanCheckout(repoRoot, sourceCommit);

const authenticatedCaptureRoutes = [...authenticatedRoutes, ...compatibilityRoutes];
const publicScreenshotCountExpected = marketingRoutes.length * viewports.length * 2;
const authenticatedScreenshotCountExpected = storageState
  ? authenticatedCaptureRoutes.length * viewports.length * 2 + authenticatedScrollCaptureCount
  : 0;
const manifest = {
  baseUrl,
  outputDir,
  sourceCommit,
  sourceVerificationBefore,
  sourceVerificationAfter,
  qaAccountConfigured,
  authenticatedCapture: Boolean(storageState),
  viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
  marketingRoutes,
  authenticatedRoutes,
  compatibilityRoutes,
  screenshotCountExpected: publicScreenshotCountExpected + authenticatedScreenshotCountExpected,
  issues,
};
const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(path.join(outputDir, "manifest.json"), manifestJson);
await writeFile(path.join(outputRoot, "latest-manifest.json"), manifestJson);
console.log(`Production visual QA screenshots written to ${outputDir}`);
console.log(
  `Authenticated capture: ${manifest.authenticatedCapture ? "complete" : "not available"}`,
);
if (issues.length) console.warn(`${issues.length} visual QA issue(s) recorded in manifest.json`);
