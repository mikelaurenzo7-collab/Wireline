import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AUTHENTICATED_ROUTE_TEMPLATES,
  FULL_SCREENSHOT_COUNT,
  PUBLIC_ROUTES,
  VISUAL_QA_SCHEMA_VERSION,
  VISUAL_QA_VIEWPORTS,
  allowedFinalPathnames,
  materializeAuthenticatedRoutes,
} from "./visual-qa-matrix.mjs";
import { readPngDimensions } from "./visual-qa-manifest.mjs";

const baseUrl = (process.env.WIRELINE_VISUAL_BASE_URL || "https://trywireline.com").replace(
  /\/$/,
  "",
);
const outputRoot = path.resolve(
  process.env.WIRELINE_VISUAL_OUTPUT_DIR || "artifacts/visual-qa-prod",
);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(outputRoot, timestamp);
const manifestPath = path.join(outputDir, "manifest.json");
const focus = (process.env.WIRELINE_QA_FOCUS || "full").trim().toLowerCase();
const routeTimeoutMs = Number(process.env.WIRELINE_VISUAL_ROUTE_TIMEOUT_MS || 60_000);
const providedEmail = process.env.WIRELINE_VISUAL_EMAIL?.trim() || "";
const providedPassword = process.env.WIRELINE_VISUAL_PASSWORD || "";
const demoAccountEmail = providedEmail || `visual.qa.${Date.now()}@mailinator.com`;
const demoAccountPassword = providedPassword || `WirelineQA!${String(Date.now()).slice(-8)}a`;

const captures = [];
const issues = [];
const ignoredEvents = [];
const issueKeys = new Set();
let browser;
let authenticatedStorageState = null;
let demoAgentId = "";
let authMode = providedEmail && providedPassword ? "signin" : "signup";
let orchestrationFinished = false;

const ignoredRequestHosts = new Set([
  "analytics.google.com",
  "connect.facebook.net",
  "plausible.io",
  "region1.google-analytics.com",
  "www.google-analytics.com",
  "www.googletagmanager.com",
]);

function routeSlug(route) {
  if (route === "/") return "home";
  return (
    route
      .replace(/^\//, "")
      .replace(/<demo-agent-id>/g, "demo-agent")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "") || "home"
  );
}

function pushIssue(issue) {
  const normalized = {
    mode: issue.mode || "system",
    viewport: issue.viewport || "seed",
    route: issue.route || "n/a",
    kind: issue.kind || "capture",
    detail: issue.detail || "Unknown visual QA issue.",
    explained: issue.explained === true,
  };
  const key = `${normalized.mode}|${normalized.viewport}|${normalized.route}|${normalized.kind}|${normalized.detail}`;
  if (issueKeys.has(key)) return;
  issueKeys.add(key);
  issues.push(normalized);
}

function urlPath(value) {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

function isIgnoredUrl(value) {
  try {
    const url = new URL(value);
    return (
      ignoredRequestHosts.has(url.hostname) ||
      url.pathname === "/favicon.ico" ||
      url.pathname === "/apple-touch-icon.png"
    );
  } catch {
    return false;
  }
}

function isExpectedAnonymousResponse(mode, value, status) {
  if (mode !== "public") return false;
  try {
    const url = new URL(value);
    return url.pathname === "/api/auth/session" && (status === 401 || status === 403);
  } catch {
    return false;
  }
}

function attachRuntimeDiagnostics(page, context) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const detail = message.text();
    // Chromium also emits a generic console error for failed responses; the
    // response listener below records the exact URL and status once.
    if (/Failed to load resource/i.test(detail)) return;
    if (/favicon|plausible\.io|googletagmanager|third-party cookie/i.test(detail)) return;
    pushIssue({ ...context, kind: "console", detail });
  });
  page.on("pageerror", (error) => {
    pushIssue({ ...context, kind: "pageerror", detail: error.message });
  });
  page.on("requestfailed", (request) => {
    if (isIgnoredUrl(request.url())) return;
    const failure = request.failure();
    if (failure?.errorText?.includes("ERR_ABORTED")) {
      ignoredEvents.push({
        mode: context.mode,
        viewport: context.viewport,
        route: context.route,
        kind: "navigation-abort",
        detail: `${request.url()} - ${failure.errorText}`,
      });
      return;
    }
    pushIssue({
      ...context,
      kind: "request",
      detail: `${request.url()} - ${failure?.errorText || "request failed"}`,
    });
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status < 400 || response.request().resourceType() === "document") return;
    if (isIgnoredUrl(response.url())) return;
    if (isExpectedAnonymousResponse(context.mode, response.url(), status)) {
      ignoredEvents.push({
        mode: context.mode,
        viewport: context.viewport,
        route: context.route,
        kind: "expected-anonymous-session",
        detail: `${response.url()} returned ${status}`,
      });
      return;
    }
    pushIssue({
      ...context,
      kind: "network",
      detail: `${response.url()} returned ${status}`,
    });
  });
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {});
  await page
    .evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    })
    .catch(() => {});
  await page
    .waitForFunction(
      () => {
        const elements = Array.from(
          document.querySelectorAll(
            'main[aria-busy="true"], [data-route-loading="true"], [aria-label="Loading workspace"]',
          ),
        );
        return !elements.some((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.height > 0;
        });
      },
      undefined,
      { timeout: 12_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
}

async function gotoWithRetry(page, route, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.goto(`${baseUrl}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: routeTimeoutMs,
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await page.waitForTimeout(800 * attempt);
    }
  }
  throw lastError;
}

async function collectDomDiagnostics(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      );
    };
    const labelFor = (element) =>
      element.getAttribute("aria-label") ||
      element.getAttribute("alt") ||
      element.textContent?.replace(/\s+/g, " ").trim().slice(0, 90) ||
      element.tagName.toLowerCase();
    const hasClippingAncestor = (element) => {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) return true;
        parent = parent.parentElement;
      }
      return false;
    };

    const ids = new Map();
    for (const element of document.querySelectorAll("[id]")) {
      const id = element.id.trim();
      if (id) ids.set(id, (ids.get(id) || 0) + 1);
    }
    const duplicateIds = Array.from(ids.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id)
      .sort();

    const brokenImages = Array.from(document.images)
      .filter((image) => isVisible(image) && Boolean(image.currentSrc || image.src))
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src);

    const dialogs = Array.from(
      document.querySelectorAll('[role="dialog"], [aria-modal="true"]'),
    ).filter(isVisible);
    const busyElements = Array.from(document.querySelectorAll('[aria-busy="true"]')).filter(
      isVisible,
    );
    const overflowElements = Array.from(
      document.querySelectorAll(
        'a, button, input, select, textarea, [role="button"], [role="tab"], h1, h2, h3, img',
      ),
    )
      .filter(isVisible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          (rect.left < -1 || rect.right > window.innerWidth + 1) && !hasClippingAncestor(element)
        );
      })
      .map(labelFor)
      .slice(0, 12);
    const nestedScrollSurfaces = Array.from(document.querySelectorAll("body *"))
      .filter(isVisible)
      .filter((element) => {
        const style = window.getComputedStyle(element);
        return (
          ["auto", "scroll"].includes(style.overflowY) &&
          element.scrollHeight > element.clientHeight + 2
        );
      })
      .map((element) => ({
        label: labelFor(element),
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      }))
      .slice(0, 12);

    const bodyText = document.body?.innerText?.replace(/\s+/g, " ").trim() || "";
    const semanticElements = Array.from(
      document.querySelectorAll("h1, h2, h3, p, a, button, input, textarea, img, main, section"),
    ).filter(isVisible).length;
    const h1s = Array.from(document.querySelectorAll("h1"));

    return {
      title: document.title.trim(),
      h1Count: h1s.length,
      h1Text: h1s.map((heading) => heading.textContent?.replace(/\s+/g, " ").trim() || ""),
      duplicateIds,
      brokenImages,
      modalCount: dialogs.length,
      modalLabels: dialogs.map(labelFor),
      busyCount: busyElements.length,
      busyLabels: busyElements.map(labelFor).slice(0, 12),
      bodyTextLength: bodyText.length,
      bodyTextSample: bodyText.slice(0, 180),
      visibleSemanticElementCount: semanticElements,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      overflowElements,
      nestedScrollSurfaces,
    };
  });
}

async function collectScreenshotStats(page, pngBuffer) {
  const dataUrl = `data:image/png;base64,${pngBuffer.toString("base64")}`;
  return page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas context unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let luminanceTotal = 0;
    let luminanceSquaredTotal = 0;
    let opaquePixels = 0;
    const sampleCount = pixels.length / 4;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}:${alpha >> 4}`);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      luminanceTotal += luminance;
      luminanceSquaredTotal += luminance * luminance;
      if (alpha > 245) opaquePixels += 1;
    }
    const mean = luminanceTotal / sampleCount;
    const variance = Math.max(0, luminanceSquaredTotal / sampleCount - mean * mean);
    return {
      sampledPixels: sampleCount,
      quantizedColorCount: colors.size,
      luminanceMean: Number(mean.toFixed(2)),
      luminanceStdDev: Number(Math.sqrt(variance).toFixed(2)),
      opaqueRatio: Number((opaquePixels / sampleCount).toFixed(4)),
    };
  }, dataUrl);
}

function evaluateDiagnostics(context, responseStatus, finalUrl, diagnostics, png, screenshotStats) {
  if (responseStatus && responseStatus >= 400) {
    pushIssue({ ...context, kind: "http", detail: `Document returned ${responseStatus}.` });
  }

  const finalPath = urlPath(finalUrl);
  const allowedPaths = allowedFinalPathnames(context.mode, context.route);
  if (!allowedPaths.includes(finalPath)) {
    pushIssue({
      ...context,
      kind: "redirect",
      detail: `Expected ${allowedPaths.join(" or ")}; reached ${finalPath}.`,
    });
  }

  if (!png) {
    pushIssue({ ...context, kind: "png", detail: "Screenshot is not a valid PNG." });
  } else if (png.width !== context.width || png.height !== context.height) {
    pushIssue({
      ...context,
      kind: "png-dimensions",
      detail: `Expected ${context.width}x${context.height}; received ${png.width}x${png.height}.`,
    });
  }
  if (!diagnostics.title || /^loading\b/i.test(diagnostics.title)) {
    pushIssue({ ...context, kind: "title", detail: "Document title is missing or unresolved." });
  }
  if (diagnostics.h1Count !== 1) {
    pushIssue({
      ...context,
      kind: "h1",
      detail: `Expected one h1; received ${diagnostics.h1Count}.`,
    });
  }
  if (diagnostics.duplicateIds.length > 0) {
    pushIssue({
      ...context,
      kind: "duplicate-id",
      detail: diagnostics.duplicateIds.join(", "),
    });
  }
  if (diagnostics.brokenImages.length > 0) {
    pushIssue({
      ...context,
      kind: "broken-image",
      detail: diagnostics.brokenImages.join(", "),
    });
  }
  if (diagnostics.pageOverflow) {
    pushIssue({
      ...context,
      kind: "overflow",
      detail: `Document width ${diagnostics.documentWidth}px exceeds ${diagnostics.viewportWidth}px.`,
    });
  }
  if (diagnostics.overflowElements.length > 0) {
    pushIssue({
      ...context,
      kind: "element-overflow",
      detail: diagnostics.overflowElements.join(" | "),
    });
  }
  if (diagnostics.busyCount > 0) {
    pushIssue({
      ...context,
      kind: "loading",
      detail: `Unresolved busy surfaces: ${diagnostics.busyLabels.join(" | ") || diagnostics.busyCount}.`,
    });
  }

  const modalExpected = context.mode === "authenticated" && context.route === "/studio?create=1";
  if (modalExpected && diagnostics.modalCount < 1) {
    pushIssue({ ...context, kind: "modal", detail: "Fast Start modal is not visible." });
  }
  if (!modalExpected && diagnostics.modalCount > 0) {
    pushIssue({
      ...context,
      kind: "modal",
      detail: `Unexpected modal: ${diagnostics.modalLabels.join(" | ") || "unlabelled dialog"}.`,
    });
  }

  const visuallyBlank =
    screenshotStats.quantizedColorCount <= 2 && screenshotStats.luminanceStdDev < 0.75;
  diagnostics.blank =
    diagnostics.bodyTextLength < 12 ||
    diagnostics.visibleSemanticElementCount < 2 ||
    (visuallyBlank && diagnostics.bodyTextLength < 80);
  if (diagnostics.blank) {
    pushIssue({
      ...context,
      kind: "blank",
      detail: `Visible text ${diagnostics.bodyTextLength} chars; ${screenshotStats.quantizedColorCount} sampled colors.`,
    });
  }
}

async function captureRoute(context, viewport, mode, routeTemplate, route) {
  const page = await context.newPage();
  page.setDefaultTimeout(routeTimeoutMs);
  page.setDefaultNavigationTimeout(routeTimeoutMs);
  const diagnosticContext = {
    mode,
    viewport: viewport.name,
    route: routeTemplate,
    width: viewport.width,
    height: viewport.height,
  };
  attachRuntimeDiagnostics(page, diagnosticContext);

  const record = {
    mode,
    viewport: viewport.name,
    routeTemplate,
    route,
    finalUrl: null,
    responseStatus: null,
    file: null,
    success: false,
    png: null,
    diagnostics: null,
    screenshotStats: null,
  };

  try {
    const response = await gotoWithRetry(page, route);
    await settle(page);
    record.responseStatus = response?.status() ?? null;
    record.finalUrl = page.url();
    const diagnostics = await collectDomDiagnostics(page);
    const file = `${mode}--${viewport.name}--${routeSlug(routeTemplate)}.png`;
    const pngBuffer = await page.screenshot({
      path: path.join(outputDir, file),
      fullPage: false,
      animations: "disabled",
      caret: "hide",
      timeout: routeTimeoutMs,
    });
    const png = readPngDimensions(pngBuffer);
    const screenshotStats = await collectScreenshotStats(page, pngBuffer);
    evaluateDiagnostics(
      diagnosticContext,
      record.responseStatus,
      record.finalUrl,
      diagnostics,
      png,
      screenshotStats,
    );
    record.file = file;
    record.success = true;
    record.png = png;
    record.diagnostics = diagnostics;
    record.screenshotStats = screenshotStats;
  } catch (error) {
    pushIssue({
      ...diagnosticContext,
      kind: "capture",
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    captures.push(record);
    await page.close({ runBeforeUnload: false }).catch(() => {});
  }
}

async function waitForAuthenticatedDestination(page) {
  await page.waitForURL((url) => ["/overview", "/studio", "/onboarding"].includes(url.pathname), {
    timeout: routeTimeoutMs,
  });
  await settle(page);
}

async function signIn(page) {
  await page.goto(`${baseUrl}/signin?redirect=%2Foverview`, {
    waitUntil: "domcontentloaded",
    timeout: routeTimeoutMs,
  });
  await settle(page);
  await page.locator("#auth-email").fill(demoAccountEmail);
  await page.locator("#auth-password").fill(demoAccountPassword);
  await page.locator('form button[type="submit"]').click();
  await waitForAuthenticatedDestination(page);
}

async function signUp(page) {
  await page.goto(`${baseUrl}/signup`, {
    waitUntil: "domcontentloaded",
    timeout: routeTimeoutMs,
  });
  await settle(page);
  await page.locator("#auth-email").fill(demoAccountEmail);
  await page.locator("#auth-password").fill(demoAccountPassword);
  await page.locator('form input[type="checkbox"]').check();
  await page.locator('form button[type="submit"]').click();
  await waitForAuthenticatedDestination(page);
}

async function discoverAgentId(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/agents", { credentials: "include" });
    if (!response.ok) return "";
    const body = await response.json().catch(() => null);
    const id = Array.isArray(body?.agents) ? body.agents[0]?.id : "";
    return typeof id === "string" ? id : "";
  });
}

async function createDemoAgent(page) {
  const brief =
    "Answer missed calls, qualify demand, book appointments, and send a concise follow-up.";
  await page.goto(
    `${baseUrl}/studio?create=1&posture=business&brief=${encodeURIComponent(brief)}`,
    { waitUntil: "domcontentloaded", timeout: routeTimeoutMs },
  );
  await settle(page);
  const dialog = page.getByRole("dialog", { name: /Fast Start/i });
  await dialog.waitFor({ state: "visible", timeout: routeTimeoutMs });
  await dialog.locator("textarea").fill(brief);
  const nameInput = dialog.getByLabel(/(?:AI employee|Agent) name/i);
  await nameInput.fill("Visual QA Front Desk");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("button", { name: /^Create (?:AI employee|agent)$/i }).click();
  await page.waitForURL(
    (url) => url.pathname === "/studio" && Boolean(url.searchParams.get("agent")),
    {
      timeout: routeTimeoutMs,
    },
  );
  await settle(page);
  const createdId = new URL(page.url()).searchParams.get("agent") || "";
  const closeGuide = page.getByRole("button", { name: "Close setup guide" });
  if (await closeGuide.isVisible().catch(() => false)) {
    await closeGuide.click();
    await closeGuide.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  }
  return createdId;
}

async function seedAuthenticatedState() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(routeTimeoutMs);
  page.setDefaultNavigationTimeout(routeTimeoutMs);
  attachRuntimeDiagnostics(page, {
    mode: "authenticated",
    viewport: "seed",
    route: authMode === "signin" ? "/signin" : "/signup",
  });
  try {
    if (providedEmail && providedPassword) await signIn(page);
    else await signUp(page);

    demoAgentId = await discoverAgentId(page);
    if (!demoAgentId) demoAgentId = await createDemoAgent(page);
    if (!demoAgentId) throw new Error("Demo agent could not be created or discovered.");
    authenticatedStorageState = await context.storageState();
  } catch (error) {
    const notices = await page
      .locator('[role="alert"]')
      .allTextContents()
      .catch(() => []);
    pushIssue({
      mode: "authenticated",
      viewport: "seed",
      route: authMode === "signin" ? "/signin" : "/signup",
      kind: "auth",
      detail: `${error instanceof Error ? error.message : String(error)}${notices.length ? ` | ${notices.join(" | ")}` : ""}`,
    });
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => {});
    await context.close().catch(() => {});
  }
}

function currentManifest(final = false) {
  const successfulCaptures = captures.filter((capture) => capture.success).length;
  const captureComplete =
    final &&
    orchestrationFinished &&
    Boolean(authenticatedStorageState) &&
    Boolean(demoAgentId) &&
    captures.length === FULL_SCREENSHOT_COUNT &&
    successfulCaptures === FULL_SCREENSHOT_COUNT;
  return {
    schemaVersion: VISUAL_QA_SCHEMA_VERSION,
    createdAt: timestamp,
    completedAt: final ? new Date().toISOString() : null,
    baseUrl,
    focus,
    captureMode: "settled-viewport",
    fullPageEvidence: false,
    outputDir,
    demoAccountEmail,
    authMode,
    demoAgentId,
    authenticatedCapture: Boolean(authenticatedStorageState),
    captureComplete,
    viewports: VISUAL_QA_VIEWPORTS.map(({ name, width, height }) => ({ name, width, height })),
    publicRoutes: [...PUBLIC_ROUTES],
    authenticatedRouteTemplates: [...AUTHENTICATED_ROUTE_TEMPLATES],
    authenticatedRoutes: demoAgentId ? materializeAuthenticatedRoutes(demoAgentId) : [],
    screenshotCountExpected: FULL_SCREENSHOT_COUNT,
    screenshotCountActual: successfulCaptures,
    captures,
    issues,
    ignoredEvents,
  };
}

async function writeManifest(final = false) {
  await writeFile(manifestPath, `${JSON.stringify(currentManifest(final), null, 2)}\n`);
}

await mkdir(outputDir, { recursive: true });
if (focus !== "full") {
  pushIssue({
    kind: "configuration",
    detail: `WIRELINE_QA_FOCUS must be 'full'; received '${focus}'. The full matrix will still run.`,
  });
}
if (Boolean(providedEmail) !== Boolean(providedPassword)) {
  authMode = "invalid-credentials";
  pushIssue({
    kind: "configuration",
    detail: "WIRELINE_VISUAL_EMAIL and WIRELINE_VISUAL_PASSWORD must be provided together.",
  });
}
await writeManifest(false);

try {
  const proxyServer =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.WIRELINE_E2E_CHROMIUM
      ? { executablePath: process.env.WIRELINE_E2E_CHROMIUM }
      : {}),
    ...(proxyServer
      ? { proxy: { server: proxyServer, bypass: "localhost,127.0.0.1,<-loopback>" } }
      : {}),
  });

  await seedAuthenticatedState();
  const authenticatedRoutes = demoAgentId ? materializeAuthenticatedRoutes(demoAgentId) : [];

  for (const viewport of VISUAL_QA_VIEWPORTS) {
    const publicContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      colorScheme: "light",
    });
    // Route screenshots should expose the route itself, not a delayed consent
    // overlay. CookieConsent has its own interaction coverage.
    await publicContext.addInitScript(() => {
      window.localStorage.setItem("wireline_cookie_consent", "acknowledged");
    });
    for (const route of PUBLIC_ROUTES) {
      await captureRoute(publicContext, viewport, "public", route, route);
    }
    await publicContext.close();

    if (authenticatedStorageState && authenticatedRoutes.length > 0) {
      const authContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
        colorScheme: "light",
        storageState: authenticatedStorageState,
      });
      for (let index = 0; index < AUTHENTICATED_ROUTE_TEMPLATES.length; index += 1) {
        await captureRoute(
          authContext,
          viewport,
          "authenticated",
          AUTHENTICATED_ROUTE_TEMPLATES[index],
          authenticatedRoutes[index],
        );
      }
      await authContext.close();
    }

    await writeManifest(false);
    console.log(
      `[visual-qa] ${viewport.name}: ${captures.filter((capture) => capture.viewport === viewport.name && capture.success).length} viewport captures`,
    );
  }
  orchestrationFinished = true;
} catch (error) {
  pushIssue({
    kind: "orchestration",
    detail: error instanceof Error ? error.stack || error.message : String(error),
  });
} finally {
  if (browser) await browser.close().catch(() => {});
  await writeManifest(true);
}

const manifest = currentManifest(true);
console.log(`Visual QA manifest: ${manifestPath}`);
console.log(
  `Captured ${manifest.screenshotCountActual}/${manifest.screenshotCountExpected} settled viewport screenshots.`,
);
if (!manifest.authenticatedCapture) {
  console.warn("Authenticated capture was not established; the manifest gate will fail.");
}
if (manifest.issues.length > 0) {
  console.warn(
    `${manifest.issues.length} unexplained issue(s) recorded; the manifest gate will fail.`,
  );
}
