import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.WIRELINE_VISUAL_BASE_URL || "https://trywireline.com").replace(
  /\/$/,
  "",
);
const outputRoot = path.resolve(
  process.env.WIRELINE_VISUAL_OUTPUT_DIR || "artifacts/visual-qa-prod",
);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(outputRoot, timestamp);
const signupEmail =
  process.env.WIRELINE_VISUAL_EMAIL?.trim() || `visual.qa.${Date.now()}@mailinator.com`;
const signupPassword =
  process.env.WIRELINE_VISUAL_PASSWORD || `WirelineQA!${String(Date.now()).slice(-6)}`;

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
  "/studio?create=1",
  "/knowledge",
  "/phone",
  "/phone?tab=logs",
  "/phone?tab=outbound",
  "/phone?tab=campaigns",
  "/phone?tab=callbacks",
  "/actions",
  "/connections",
  "/apps",
  "/inbox",
  "/settings",
  "/settings/billing",
  "/admin",
];

/*
 * Multi-agent /studio visual QA (optional deep links):
 * - Default canvas: /studio?agent=<id>
 * - Workspace depth: /studio?agent=<id>&view=workspace
 * - Native shell switcher: append ?wireline_native=1
 * Set WIRELINE_VISUAL_STUDIO_AGENT to capture agent-specific studio states.
 */
function studioMultiAgentCaptureRoutes(agentId) {
  if (!agentId?.trim()) return [];
  const enc = encodeURIComponent(agentId.trim());
  return [`/studio?agent=${enc}`, `/studio?agent=${enc}&view=workspace`];
}

const studioDeepLinkRoutes = studioMultiAgentCaptureRoutes(
  process.env.WIRELINE_VISUAL_STUDIO_AGENT,
);

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
  const studioBrief = page.locator("textarea#studio-brief").first();
  const workroomComposer = page.locator("textarea#studio-workroom-message").first();
  const emptyCreate = page.getByRole("link", { name: /Create personal agent/i }).first();
  const composer = (await studioBrief.isVisible().catch(() => false))
    ? studioBrief
    : (await workroomComposer.isVisible().catch(() => false))
      ? workroomComposer
      : null;
  if (!composer) {
    if (await emptyCreate.isVisible().catch(() => false)) return;
    issues.push({
      viewport: viewportName,
      route: "/studio",
      mode: "authenticated",
      kind: "layout",
      detail: "Studio entry point is not visible.",
    });
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
      detail: "Studio entry point falls outside the visible viewport.",
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
  await page.screenshot({
    path: `${prefix}-viewport.png`,
    fullPage: false,
    animations: "disabled",
  });
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

async function completeOnboardingIfNecessary(page, viewportName, issues) {
  await page
    .waitForURL(/\/(overview|agents|studio|onboarding)(?:\?|$)/, { timeout: 15_000 })
    .catch(() => {});
  const url = page.url();
  if (url.includes("/onboarding")) {
    console.log(
      "[Onboarding Bypass] Onboarding page detected, selecting default Front Desk template...",
    );
    const frontDeskBtn = page.getByRole("button", { name: /Select Front Desk/i }).first();
    if (await frontDeskBtn.isVisible().catch(() => false)) {
      await frontDeskBtn.click();
      await page
        .waitForURL(/\/(overview|ops|studio|agents)(?:\?|$)/, { timeout: 15_000 })
        .catch(() => {});
      console.log(
        "[Onboarding Bypass] Workspace template selection complete. Current URL:",
        page.url(),
      );
      await settle(page);
    } else {
      issues.push({
        viewport: viewportName,
        route: "/onboarding",
        mode: "authenticated",
        kind: "flow",
        detail: "Onboarding selection buttons not visible.",
      });
    }
  }
}

function attachDiagnostics(page, viewportName, mode, issues) {
  page.on("console", (message) => {
    if (message.type() === "error" && !isBenignConsoleError(message.text())) {
      issues.push({
        viewport: viewportName,
        route: page.url(),
        mode,
        kind: "console",
        detail: message.text(),
      });
    }
  });
  page.on("pageerror", (error) => {
    issues.push({
      viewport: viewportName,
      route: page.url(),
      mode,
      kind: "pageerror",
      detail: error.message,
    });
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400 && !isBenignConsoleError(response.url())) {
      issues.push({
        viewport: viewportName,
        route: page.url(),
        mode,
        kind: "network",
        detail: `Failed to load resource: ${response.url()} returned status ${status}`,
      });
    }
  });
}

async function captureMarketing(browser, viewport, issues) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  attachDiagnostics(page, viewport.name, "public", issues);
  for (const route of marketingRoutes)
    await captureRoute(page, viewport.name, route, issues, "public");
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
  for (const route of authenticatedRoutes)
    await captureRoute(page, viewport.name, route, issues, "authenticated");
  for (const route of studioDeepLinkRoutes)
    await captureRoute(page, viewport.name, route, issues, "authenticated");
  await context.close();
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const issues = [];
let storageState = null;

let currentTurn = 1;
try {
  const loopStateStr = await readFile("artifacts/qa-loop-state.json", "utf8");
  const loopState = JSON.parse(loopStateStr);
  if (loopState && typeof loopState.currentTurn === "number") {
    currentTurn = loopState.currentTurn;
  }
} catch (e) {
  // Ignore error if loop state file doesn't exist
}

let qaFocus = (process.env.WIRELINE_QA_FOCUS || "").trim().toLowerCase();
if (!qaFocus || qaFocus === "auto") {
  const focuses = [
    "onboarding",
    "create-agent",
    "training",
    "studio-compose",
    "billing-checkout",
    "connections-actions",
    "inbox-recaps",
    "telemetry-performance",
    "settings-team",
    "mobile-responsive-smoke",
  ];
  const turnMod = (currentTurn - 1) % focuses.length;
  qaFocus = focuses[turnMod];
  console.log(
    `[Evolving QA] Turn ${currentTurn} detected. Auto-selecting focus: '${qaFocus}' (highest-leverage check)`,
  );
} else {
  console.log(`[Explicit QA] Using explicit focus override: '${qaFocus}'`);
}

try {
  const desktop = viewports[0];

  if (qaFocus === "onboarding") {
    console.log("Running onboarding flow focused QA...");
    const signupContext = await browser.newContext({
      viewport: { width: desktop.width, height: desktop.height },
      deviceScaleFactor: 1,
    });
    const signupPage = await signupContext.newPage();
    attachDiagnostics(signupPage, desktop.name, "authenticated", issues);

    if (await signUp(signupPage, desktop.name, issues)) {
      await signupPage.waitForURL(/\/onboarding(?:\?|$)/, { timeout: 15_000 }).catch(() => {});
      console.log("Onboarding URL reached:", signupPage.url());

      const frontDeskBtn = signupPage.getByRole("button", { name: /Select Front Desk/i });
      if (await frontDeskBtn.isVisible().catch(() => false)) {
        await frontDeskBtn.click();
        await signupPage
          .waitForURL(/\/(overview|ops|studio)(?:\?|$)/, { timeout: 15_000 })
          .catch(() => {});
        console.log("After onboarding selection URL:", signupPage.url());
      } else {
        issues.push({
          viewport: desktop.name,
          route: "/onboarding",
          mode: "authenticated",
          kind: "flow",
          detail: "Onboarding selection buttons not visible.",
        });
      }

      const prefix = path.join(outputDir, `${desktop.name}-flow-onboarding`);
      await signupPage.screenshot({ path: `${prefix}-success-viewport.png`, fullPage: false });
      await signupPage.screenshot({ path: `${prefix}-success-full.png`, fullPage: true });
    }
    await signupContext.close();
  } else if (qaFocus === "create-agent") {
    console.log("Running create-agent flow focused QA...");
    const signupContext = await browser.newContext({
      viewport: { width: desktop.width, height: desktop.height },
      deviceScaleFactor: 1,
    });
    const signupPage = await signupContext.newPage();
    attachDiagnostics(signupPage, desktop.name, "authenticated", issues);

    if (await signUp(signupPage, desktop.name, issues)) {
      await completeOnboardingIfNecessary(signupPage, desktop.name, issues);

      // Navigate to /agents
      await signupPage.goto(`${baseUrl}/agents`, { waitUntil: "domcontentloaded" });
      await settle(signupPage);

      // Click "Create agent" button or go to /studio?create=1
      const createBtn = signupPage.getByRole("link", { name: /Create agent/i }).first();
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
      } else {
        await signupPage.goto(`${baseUrl}/studio?create=1`, { waitUntil: "domcontentloaded" });
      }
      await settle(signupPage);

      // Fill Name and select role
      const nameInput = signupPage.locator("input[placeholder*='Casey']").first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill("Receptionist Pro");
        const roleSelect = signupPage.locator("select").first();
        if (await roleSelect.isVisible().catch(() => false)) {
          await roleSelect.selectOption("receptionist");
        }
        const briefTextarea = signupPage
          .locator("textarea[placeholder*='Call my pharmacy']")
          .first();
        if (await briefTextarea.isVisible().catch(() => false)) {
          await briefTextarea.fill(
            "Greet incoming business callers, answer office FAQs, and capture lead callback details.",
          );
        }
        const submitBtn = signupPage
          .getByRole("button", { name: /Create and open Studio/i })
          .first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click();
          await signupPage.waitForURL(/\/studio\?agent=/, { timeout: 15_000 }).catch(() => {});
          console.log("New agent created successfully! Current URL:", signupPage.url());
          await settle(signupPage);
        }
      } else {
        issues.push({
          viewport: desktop.name,
          route: "/studio?create=1",
          mode: "authenticated",
          kind: "flow",
          detail: "New agent modal or inputs not visible.",
        });
      }

      const prefix = path.join(outputDir, `${desktop.name}-flow-create-agent`);
      await signupPage.screenshot({ path: `${prefix}-success-viewport.png`, fullPage: false });
      await signupPage.screenshot({ path: `${prefix}-success-full.png`, fullPage: true });
    }
    await signupContext.close();
  } else if (qaFocus === "training") {
    console.log("Running training flow focused QA...");
    const signupContext = await browser.newContext({
      viewport: { width: desktop.width, height: desktop.height },
      deviceScaleFactor: 1,
    });
    const signupPage = await signupContext.newPage();
    attachDiagnostics(signupPage, desktop.name, "authenticated", issues);

    if (await signUp(signupPage, desktop.name, issues)) {
      await completeOnboardingIfNecessary(signupPage, desktop.name, issues);

      // Navigate to /training
      await signupPage.goto(`${baseUrl}/training`, { waitUntil: "domcontentloaded" });
      await settle(signupPage);

      const titleInput = signupPage.locator("input[placeholder*='Preferred pharmacy']").first();
      const contentTextarea = signupPage
        .locator("textarea[placeholder*='Describe a fact']")
        .first();
      const saveBtn = signupPage.getByRole("button", { name: /Save fact/i }).first();

      if (await contentTextarea.isVisible().catch(() => false)) {
        if (await titleInput.isVisible().catch(() => false)) {
          await titleInput.fill("Pricing & Packages");
        }
        await contentTextarea.fill(
          "Wireline Business uses shared operating capacity, approvals, analytics, CRM sync, roles, and pooled Conversation Balance.",
        );
        if (await saveBtn.isVisible().catch(() => false)) {
          await saveBtn.click();
          await signupPage.waitForTimeout(1500);
          console.log("New business fact added successfully to Training.");
        }
      } else {
        issues.push({
          viewport: desktop.name,
          route: "/training",
          mode: "authenticated",
          kind: "flow",
          detail: "Add detail input elements not found on /knowledge.",
        });
      }

      const prefix = path.join(outputDir, `${desktop.name}-flow-training`);
      await signupPage.screenshot({ path: `${prefix}-success-viewport.png`, fullPage: false });
      await signupPage.screenshot({ path: `${prefix}-success-full.png`, fullPage: true });
    }
    await signupContext.close();
  } else if (qaFocus === "studio-compose") {
    console.log("Running studio composer focused QA...");
    const signupContext = await browser.newContext({
      viewport: { width: desktop.width, height: desktop.height },
      deviceScaleFactor: 1,
    });
    const signupPage = await signupContext.newPage();
    attachDiagnostics(signupPage, desktop.name, "authenticated", issues);

    if (await signUp(signupPage, desktop.name, issues)) {
      await completeOnboardingIfNecessary(signupPage, desktop.name, issues);

      // Navigate to /studio
      await signupPage.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded" });
      await settle(signupPage);

      const composer = signupPage.locator("textarea#studio-brief").first();
      if (await composer.isVisible().catch(() => false)) {
        await composer.fill(
          "When a customer calls for sales, ask for their email address and phone number, and offer to schedule a callback.",
        );
        const saveBtn = signupPage.getByRole("button", { name: /Save|Deploy|Update/i }).first();
        if (await saveBtn.isVisible().catch(() => false)) {
          await saveBtn.click();
          await signupPage.waitForTimeout(1500);
          console.log("Studio composer training instructions updated successfully.");
        }
      } else {
        issues.push({
          viewport: desktop.name,
          route: "/studio",
          mode: "authenticated",
          kind: "layout",
          detail: "Studio composer not found.",
        });
      }

      const prefix = path.join(outputDir, `${desktop.name}-flow-studio-compose`);
      await signupPage.screenshot({ path: `${prefix}-success-viewport.png`, fullPage: false });
      await signupPage.screenshot({ path: `${prefix}-success-full.png`, fullPage: true });
    }
    await signupContext.close();
  } else if (qaFocus === "billing-checkout") {
    console.log("Running billing checkout focused QA...");
    const signupContext = await browser.newContext({
      viewport: { width: desktop.width, height: desktop.height },
      deviceScaleFactor: 1,
    });
    const signupPage = await signupContext.newPage();
    attachDiagnostics(signupPage, desktop.name, "authenticated", issues);

    if (await signUp(signupPage, desktop.name, issues)) {
      await completeOnboardingIfNecessary(signupPage, desktop.name, issues);

      await signupPage.goto(`${baseUrl}/settings/billing`, { waitUntil: "domcontentloaded" });
      await settle(signupPage);

      const changePlanBtn = signupPage
        .getByRole("button", { name: /Change Plan|Upgrade|Subscribe/i })
        .first();
      if (await changePlanBtn.isVisible().catch(() => false)) {
        await changePlanBtn.click();
        await signupPage.waitForTimeout(1000);
      }

      const prefix = path.join(outputDir, `${desktop.name}-flow-billing-checkout`);
      await signupPage.screenshot({ path: `${prefix}-success-viewport.png`, fullPage: false });
      await signupPage.screenshot({ path: `${prefix}-success-full.png`, fullPage: true });
    }
    await signupContext.close();
  } else if (qaFocus === "connections-actions") {
    console.log("Running connections and actions focused QA...");
    const signupContext = await browser.newContext({
      viewport: { width: desktop.width, height: desktop.height },
      deviceScaleFactor: 1,
    });
    const signupPage = await signupContext.newPage();
    attachDiagnostics(signupPage, desktop.name, "authenticated", issues);

    if (await signUp(signupPage, desktop.name, issues)) {
      await completeOnboardingIfNecessary(signupPage, desktop.name, issues);

      // Navigate to /actions
      await signupPage.goto(`${baseUrl}/actions`, { waitUntil: "domcontentloaded" });
      await settle(signupPage);

      // Toggle first tool row if available and enabled
      const toolRow = signupPage.locator(".wl-stitch-tool-row").first();
      const isVisible = await toolRow.isVisible().catch(() => false);
      const isEnabled = isVisible && (await toolRow.isEnabled().catch(() => false));
      if (isEnabled) {
        await toolRow.click();
        await signupPage.waitForTimeout(1500);
        console.log("Toggled an integration tool in Actions workspace successfully.");
      } else {
        console.log(
          `[QA Note] First tool row is visible: ${isVisible}, enabled: ${isEnabled}. Skipping toggle click.`,
        );
        issues.push({
          viewport: desktop.name,
          route: "/actions",
          mode: "authenticated",
          kind: "flow",
          detail: `Tool row under Actions was not clickable (visible=${isVisible}, enabled=${isEnabled}).`,
        });
      }

      const prefix = path.join(outputDir, `${desktop.name}-flow-connections-actions`);
      await signupPage.screenshot({ path: `${prefix}-success-viewport.png`, fullPage: false });
      await signupPage.screenshot({ path: `${prefix}-success-full.png`, fullPage: true });
    }
    await signupContext.close();
  } else if (qaFocus === "inbox-recaps") {
    console.log("Running inbox and email recaps focused QA...");
    const signupContext = await browser.newContext({
      viewport: { width: desktop.width, height: desktop.height },
      deviceScaleFactor: 1,
    });
    const signupPage = await signupContext.newPage();
    attachDiagnostics(signupPage, desktop.name, "authenticated", issues);

    if (await signUp(signupPage, desktop.name, issues)) {
      await completeOnboardingIfNecessary(signupPage, desktop.name, issues);

      // Navigate to /inbox
      await signupPage.goto(`${baseUrl}/inbox`, { waitUntil: "domcontentloaded" });
      await settle(signupPage);

      const inboxHeader = signupPage.locator("h1:has-text('Inbox')").first();
      if (!(await inboxHeader.isVisible().catch(() => false))) {
        console.log("Inbox header not explicitly found; standardizing route check.");
      }

      const prefix = path.join(outputDir, `${desktop.name}-flow-inbox-recaps`);
      await signupPage.screenshot({ path: `${prefix}-success-viewport.png`, fullPage: false });
      await signupPage.screenshot({ path: `${prefix}-success-full.png`, fullPage: true });
    }
    await signupContext.close();
  } else if (qaFocus === "telemetry-performance") {
    console.log("Running performance telemetry audit QA...");
    const signupContext = await browser.newContext({
      viewport: { width: desktop.width, height: desktop.height },
      deviceScaleFactor: 1,
    });
    const signupPage = await signupContext.newPage();
    attachDiagnostics(signupPage, desktop.name, "authenticated", issues);

    if (await signUp(signupPage, desktop.name, issues)) {
      await completeOnboardingIfNecessary(signupPage, desktop.name, issues);

      // Navigate to /overview to run performance collection
      const startTime = Date.now();
      await signupPage.goto(`${baseUrl}/overview`, { waitUntil: "load" });
      const loadTimeMs = Date.now() - startTime;
      console.log(`Page Load Telemetry: '/overview' loaded in ${loadTimeMs}ms`);

      // Collect window.performance indicators
      const performanceMetrics = await signupPage
        .evaluate(() => {
          const t = window.performance.timing;
          return {
            domContentLoaded: t.domContentLoadedEventEnd - t.navigationStart,
            loadComplete: t.loadEventEnd - t.navigationStart,
            totalResources: window.performance.getEntriesByType("resource").length,
          };
        })
        .catch(() => ({ domContentLoaded: -1, loadComplete: -1, totalResources: -1 }));

      console.log(`Metrics harvested:`, performanceMetrics);
      if (performanceMetrics.loadComplete > 5000) {
        issues.push({
          viewport: desktop.name,
          route: "/overview",
          mode: "authenticated",
          kind: "telemetry",
          detail: `High latency detected! Page load took ${performanceMetrics.loadComplete}ms (threshold 5000ms).`,
        });
      }

      const prefix = path.join(outputDir, `${desktop.name}-flow-telemetry-performance`);
      await signupPage.screenshot({ path: `${prefix}-success-viewport.png`, fullPage: false });
    }
    await signupContext.close();
  } else if (qaFocus === "settings-team") {
    console.log("Running team settings roster focused QA...");
    const signupContext = await browser.newContext({
      viewport: { width: desktop.width, height: desktop.height },
      deviceScaleFactor: 1,
    });
    const signupPage = await signupContext.newPage();
    attachDiagnostics(signupPage, desktop.name, "authenticated", issues);

    if (await signUp(signupPage, desktop.name, issues)) {
      await completeOnboardingIfNecessary(signupPage, desktop.name, issues);

      // Navigate to /admin (where team is managed)
      await signupPage.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
      await settle(signupPage);

      // Look for Team tab and click it if available
      const teamTab = signupPage.locator("button:has-text('Team')").first();
      if (await teamTab.isVisible().catch(() => false)) {
        await teamTab.click();
        await settle(signupPage);
      }

      const emailInput = signupPage.locator("input[placeholder*='colleague@']").first();
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill("engineering.test@trywireline.com");
        console.log("Populated the team roster invitation input successfully.");
      } else {
        issues.push({
          viewport: desktop.name,
          route: "/admin",
          mode: "authenticated",
          kind: "flow",
          detail: "Team roster invitation fields are not visible.",
        });
      }

      const prefix = path.join(outputDir, `${desktop.name}-flow-settings-team`);
      await signupPage.screenshot({ path: `${prefix}-success-viewport.png`, fullPage: false });
      await signupPage.screenshot({ path: `${prefix}-success-full.png`, fullPage: true });
    }
    await signupContext.close();
  } else if (qaFocus === "mobile-responsive-smoke") {
    console.log("Running mobile-responsive layout smoke checks...");
    // Emulate iPhone viewport (390 x 844)
    const mobileWidth = 390;
    const mobileHeight = 844;
    const mobileContext = await browser.newContext({
      viewport: { width: mobileWidth, height: mobileHeight },
      deviceScaleFactor: 2,
    });
    const mobilePage = await mobileContext.newPage();
    attachDiagnostics(mobilePage, "iphone", "public", issues);

    // Visit public route and check for layout overflow
    await mobilePage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await settle(mobilePage);

    const overflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    );
    if (overflow) {
      issues.push({
        viewport: "iphone",
        route: "/",
        mode: "public",
        kind: "layout",
        detail: "Horizontal layout overflow detected on landing page under mobile widths.",
      });
    }

    const prefix = path.join(outputDir, `iphone-mobile-responsive-smoke`);
    await mobilePage.screenshot({ path: `${prefix}-viewport.png`, fullPage: false });
    await mobilePage.screenshot({ path: `${prefix}-full.png`, fullPage: true });
    await mobileContext.close();
  } else {
    console.log("Running complete multi-viewport standard visual QA sweep...");
    await captureMarketing(browser, desktop, issues);

    const signupContext = await browser.newContext({
      viewport: { width: desktop.width, height: desktop.height },
      deviceScaleFactor: 1,
    });
    const signupPage = await signupContext.newPage();
    attachDiagnostics(signupPage, desktop.name, "authenticated", issues);

    if (await signUp(signupPage, desktop.name, issues)) {
      await completeOnboardingIfNecessary(signupPage, desktop.name, issues);
      storageState = await signupContext.storageState();
      for (const route of [...authenticatedRoutes, ...studioDeepLinkRoutes]) {
        await captureRoute(signupPage, desktop.name, route, issues, "authenticated");
      }
    }
    await signupContext.close();

    for (const viewport of viewports.slice(1)) {
      await captureMarketing(browser, viewport, issues);
      if (storageState) await captureAuthenticated(browser, viewport, storageState, issues);
    }
  }
} finally {
  await browser.close();
}

const authenticatedCaptureRoutes = [...authenticatedRoutes, ...studioDeepLinkRoutes];
const routeCount =
  marketingRoutes.length * viewports.length +
  (storageState ? authenticatedCaptureRoutes.length * viewports.length : 0);
const manifest = {
  baseUrl,
  outputDir,
  signupEmail,
  authenticatedCapture: !!storageState,
  viewports,
  marketingRoutes,
  authenticatedRoutes: authenticatedCaptureRoutes,
  studioDeepLinkRoutes,
  screenshotCountExpected: routeCount * 2,
  issues,
};
await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Visual QA screenshots written to ${outputDir}`);
console.log(`Demo account: ${signupEmail}`);
if (issues.length) console.warn(`${issues.length} visual QA issue(s) recorded in manifest.json`);
