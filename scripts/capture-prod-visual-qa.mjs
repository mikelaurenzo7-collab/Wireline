import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CANONICAL_PRODUCTION_VISUAL_BASE_URL,
  productionVisualRouteExpectation,
  PRODUCTION_VISUAL_AUTHENTICATED_ROUTES,
  PRODUCTION_VISUAL_COMPATIBILITY_ROUTES,
  PRODUCTION_VISUAL_MARKETING_ROUTES,
  PRODUCTION_VISUAL_VIEWPORTS,
  routeReachedExactly,
  visualQaFileStem,
} from "./lib/production-visual-qa-contract.mjs";
import { chromiumLaunchOptions } from "./lib/resolve-preinstalled-chromium.mjs";
import { isIntentionalCaptureAbort } from "./lib/visual-capture-diagnostics.mjs";
import {
  assertCleanCheckout,
  resolveSourceCommit,
  verifyRemoteSourceCommit,
  waitForRemoteSourceCommit,
} from "./lib/release-source-verification.mjs";

const baseUrl = (process.env.WIRELINE_VISUAL_BASE_URL || "https://botbound.app").replace(/\/$/, "");
if (baseUrl !== CANONICAL_PRODUCTION_VISUAL_BASE_URL) {
  throw new Error(
    `Production visual QA must capture ${CANONICAL_PRODUCTION_VISUAL_BASE_URL}; received ${baseUrl}.`,
  );
}
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
const expectedCommit = String(
  process.env.WIRELINE_VISUAL_EXPECTED_COMMIT || sourceCommit,
).toLowerCase();
if (!/^[0-9a-f]{40}$/.test(expectedCommit) || expectedCommit !== sourceCommit) {
  throw new Error(
    `Production visual QA expected ${expectedCommit || "no commit"}, but checked out ${sourceCommit}.`,
  );
}

assertCleanCheckout(repoRoot, sourceCommit);
const sourceVerificationBefore = await waitForRemoteSourceCommit(sourceCommit, baseUrl, {
  timeoutMs: sourceWaitMs,
});

const marketingRoutes = PRODUCTION_VISUAL_MARKETING_ROUTES;
const authenticatedRoutes = PRODUCTION_VISUAL_AUTHENTICATED_ROUTES;
const compatibilityRoutes = PRODUCTION_VISUAL_COMPATIBILITY_ROUTES;
const allViewports = PRODUCTION_VISUAL_VIEWPORTS;
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
const intentionallyAbortedRequestUrls = new WeakMap();

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
  const abortedUrls = new Set();
  intentionallyAbortedRequestUrls.set(page, abortedUrls);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (isBenignExternal(url)) {
      abortedUrls.add(url);
      return route.abort();
    }
    return route.continue();
  });
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
      if (
        isIntentionalCaptureAbort(
          message.text(),
          message.location().url,
          intentionallyAbortedRequestUrls.get(page),
        )
      ) {
        return;
      }
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
  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    let url;
    try {
      url = new URL(response.url());
    } catch {
      return;
    }
    if (url.origin !== new URL(baseUrl).origin || !url.pathname.startsWith("/api/")) return;
    if (mode === "public" && url.pathname === "/api/auth/me" && status === 401) return;
    pushIssue(issues, {
      viewport: viewportName,
      route: page.url(),
      mode,
      kind: "api-response",
      detail: `${status} ${url.pathname}`,
    });
  });
}

function emptySemanticAssertion(viewportName, route, mode) {
  const expectation = productionVisualRouteExpectation(mode, route);
  return {
    viewport: viewportName,
    mode,
    route,
    expectedPage: expectation?.page ?? null,
    expectedStates: expectation ? [...expectation.states] : [],
    assertedPages: [],
    assertedStates: [],
    success: false,
  };
}

async function assertSemanticContent(page, viewportName, route, mode, issues) {
  const assertion = emptySemanticAssertion(viewportName, route, mode);
  if (!assertion.expectedPage) {
    pushIssue(issues, {
      viewport: viewportName,
      route,
      mode,
      kind: "semantic",
      detail: "No canonical semantic marker expectation exists for this route.",
    });
    return assertion;
  }

  await page
    .waitForFunction(
      ({ expectedPage, expectedStates }) => {
        const pagePresent = Array.from(document.querySelectorAll("[data-visual-qa-page]")).some(
          (element) => element.getAttribute("data-visual-qa-page") === expectedPage,
        );
        const observedStates = new Set(
          Array.from(document.querySelectorAll("[data-visual-qa-state]"))
            .map((element) => element.getAttribute("data-visual-qa-state"))
            .filter(Boolean),
        );
        return pagePresent && expectedStates.every((state) => observedStates.has(state));
      },
      { expectedPage: assertion.expectedPage, expectedStates: assertion.expectedStates },
      { timeout: 10_000 },
    )
    .catch(() => {});

  const observed = await page.evaluate(() => ({
    pages: [
      ...new Set(
        Array.from(document.querySelectorAll("[data-visual-qa-page]"))
          .map((element) => element.getAttribute("data-visual-qa-page"))
          .filter(Boolean),
      ),
    ].sort(),
    states: [
      ...new Set(
        Array.from(document.querySelectorAll("[data-visual-qa-state]"))
          .map((element) => element.getAttribute("data-visual-qa-state"))
          .filter(Boolean),
      ),
    ].sort(),
  }));
  assertion.assertedPages = observed.pages;
  assertion.assertedStates = observed.states;
  assertion.success =
    JSON.stringify(assertion.assertedPages) === JSON.stringify([assertion.expectedPage]) &&
    JSON.stringify(assertion.assertedStates) === JSON.stringify(assertion.expectedStates);

  if (!assertion.success) {
    pushIssue(issues, {
      viewport: viewportName,
      route,
      mode,
      kind: "semantic",
      detail: `Expected page/state markers ${JSON.stringify([
        assertion.expectedPage,
        assertion.expectedStates,
      ])}; observed ${JSON.stringify([assertion.assertedPages, assertion.assertedStates])}.`,
    });
  }
  return assertion;
}

async function captureRoute(page, viewportName, route, issues, semanticAssertions, mode) {
  let semanticAssertion = emptySemanticAssertion(viewportName, route, mode);
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
    if (!routeReachedExactly(baseUrl, route, finalUrl)) {
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
    semanticAssertion = await assertSemanticContent(page, viewportName, route, mode, issues);
    await auditResponsiveLayout(page, viewportName, route, issues);
    const prefix = path.join(outputDir, `${viewportName}-${mode}-${visualQaFileStem(route)}`);
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
  } finally {
    semanticAssertions.push(semanticAssertion);
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
const semanticAssertions = [];
const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  headless: true,
  ...chromiumLaunchOptions(),
  ...(proxyServer ? { proxy: { server: proxyServer, bypass: "localhost,127.0.0.1,::1" } } : {}),
});

let storageState = null;
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
      await captureRoute(publicPage, viewport.name, route, issues, semanticAssertions, "public");
    }
    await publicContext.close();

    if (!storageState) continue;
    const authContext = await createContext(browser, viewport, storageState);
    const authPage = await authContext.newPage();
    await blockThirdPartyBeacons(authPage);
    attachDiagnostics(authPage, viewport.name, "authenticated", issues);
    for (const route of [...authenticatedRoutes, ...compatibilityRoutes]) {
      await captureRoute(
        authPage,
        viewport.name,
        route,
        issues,
        semanticAssertions,
        "authenticated",
      );
    }
    await authContext.close();
  }
} finally {
  await browser.close();
}

const sourceVerificationAfter = await verifyRemoteSourceCommit(sourceCommit, baseUrl);
assertCleanCheckout(repoRoot, sourceCommit);

const artifacts = await Promise.all(
  (await readdir(outputDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
    .map(async (file) => {
      const contents = await readFile(path.join(outputDir, file));
      return {
        file,
        bytes: contents.byteLength,
        sha256: createHash("sha256").update(contents).digest("hex"),
      };
    }),
);

const authenticatedCaptureRoutes = [...authenticatedRoutes, ...compatibilityRoutes];
const routeCount =
  marketingRoutes.length * viewports.length +
  (storageState ? authenticatedCaptureRoutes.length * viewports.length : 0);
const manifest = {
  baseUrl,
  outputDir,
  artifactDirectory: timestamp,
  sourceCommit,
  expectedCommit,
  sourceVerifiedAt: sourceVerificationBefore.verifiedAt,
  sourceProofBefore: sourceVerificationBefore,
  sourceProofAfter: sourceVerificationAfter,
  qaAccountConfigured,
  authenticatedCapture: Boolean(storageState),
  viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
  marketingRoutes,
  authenticatedRoutes,
  compatibilityRoutes,
  screenshotCountExpected: routeCount * 2,
  screenshotCountActual: artifacts.length,
  artifacts,
  semanticAssertions,
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
