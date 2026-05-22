/**
 * Launch showcase — Auth portal + client pages × 3 viewports.
 *
 * Production (recommended):
 *   E2E_BASE_URL=https://trywireline.com
 *   DEMO_EMAIL=composer.demo@trywireline.com
 *   DEMO_PASSWORD=...   (see docs/DEMO_ACCOUNT.md)
 *   npm run qa:design-showcase
 *
 * Local (mocked API — requires Vite on :5173):
 *   E2E_BASE_URL=http://127.0.0.1:5173
 */
import { chromium } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, "..");
const baseURL = process.env.E2E_BASE_URL || "https://trywireline.com";
const demoEmail = process.env.DEMO_EMAIL || "composer.demo@trywireline.com";
const demoPassword = process.env.DEMO_PASSWORD || "";
const useProduction =
  /trywireline\.com/i.test(baseURL) || process.env.QA_PRODUCTION === "1";
const outDir = path.join(repoRoot, "test-results", "design-showcase");

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
];

const targets = [
  { name: "auth-portal", route: "/", auth: false },
  { name: "client-triage", route: "/triage", auth: true },
  { name: "client-integrations", route: "/integrations", auth: true },
  { name: "client-agents", route: "/agents", auth: true },
];

function json(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

function mockApi(pathname, method) {
  if (method !== "GET") return json({ ok: true });
  const now = "2026-05-21T12:00:00.000Z";
  if (pathname === "/api/nav-counts") return json({ "/triage": 4, "/logs": 2 });
  if (pathname === "/api/user-preferences") {
    return json({ persona: "operator", onboarding_completed: true, tour_completed: true });
  }
  if (pathname === "/api/billing/status") {
    return json({
      email_verified: true,
      subscription: { status: "active", plan: "growth" },
      trial: { status: "active", days_left: 12 },
      usage: { agents: 2, calls: 41 },
    });
  }
  if (pathname === "/api/agents") {
    return json({
      agents: [
        { id: "a1", name: "Avery", role: "front-desk", status: "active", created_at: now },
        { id: "a2", name: "Riley", role: "sales", status: "active", created_at: now },
      ],
    });
  }
  if (pathname === "/api/oauth/crm/status") {
    return json({
      salesforce: { connected: true, email: "ops@acme.com", connected_at: now },
      hubspot: { connected: false, configured: true },
      slack: { connected: true, team: "Wireline Ops", connected_at: now },
      zoom: { connected: false, configured: true },
      apollo: { connected: false, configured: true, platform_active: true },
      meta: { connected: false, configured: false },
      shopify: { connected: false, configured: true },
      square: { connected: false, configured: true },
      microsoft_teams: { connected: true, team_name: "Revenue", channel_name: "alerts", connected_at: now },
      microsoft_excel: { connected: false, configured: true },
    });
  }
  if (pathname === "/api/emails/accounts") {
    return json({
      accounts: [
        { id: "e1", provider: "google", email_address: "ops@wireline.test", agent_id: "a1" },
      ],
    });
  }
  if (pathname === "/api/triage") {
    return json({
      hot_leads: [
        {
          id: "h1",
          agent_id: "a1",
          customer_number: "+15555550100",
          lead_score: 91,
          intent_label: "Book inspection",
          summary: "Ready to schedule tomorrow PM",
          created_at: now,
        },
      ],
      compliance: [],
      pending_tasks: [
        {
          id: "t1",
          agent_id: "a1",
          description: "Send pricing recap",
          priority: "high",
          task_type: "send_email",
          status: "pending",
          created_at: now,
        },
      ],
      knowledge_gaps: [],
      escalations: [],
      counts: { hot_leads: 1, pending_tasks: 1, knowledge_gaps: 0, escalations: 0, compliance: 0 },
    });
  }
  if (pathname === "/api/settings") {
    return json({ brand_name: "Wireline", primary_color: "#4F1E7B", max_agents: 3 });
  }
  return json({ ok: true });
}

async function installApiMocks(context) {
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill(mockApi(url.pathname, route.request().method()));
  });
}

async function prepareContext(context, { authenticated }) {
  await context.addInitScript(
    ({ origin }) => {
      if (window.location.origin !== origin) return;
      try {
        localStorage.setItem("wireline_cookie_consent", "acknowledged");
        localStorage.setItem("wireline_tour_seen", "true");
      } catch {
        /* ignore */
      }
    },
    { origin: new URL(baseURL).origin },
  );
  if (!useProduction && authenticated) {
    await context.addInitScript(
      ({ origin }) => {
        if (window.location.origin !== origin) return;
        localStorage.setItem(
          "wireline_session",
          JSON.stringify({
            access_token: "showcase",
            user: {
              id: "showcase",
              email: demoEmail,
              full_name: "Wireline Demo",
              role: "owner",
              is_owner: false,
            },
          }),
        );
      },
      { origin: new URL(baseURL).origin },
    );
  }
}

/** One API sign-in per run — avoids auth rate limits from repeated form posts. */
async function fetchProductionSession() {
  if (!demoPassword) {
    throw new Error("Set DEMO_PASSWORD for production captures (see docs/DEMO_ACCOUNT.md)");
  }
  const res = await fetch(new URL("/api/auth/signin", baseURL).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: demoEmail, password: demoPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Sign-in failed (${res.status})`);
  }
  return { access_token: data.token, user: data.user };
}

async function seedProductionSession(context, session) {
  await context.addInitScript(
    ({ origin, session: s }) => {
      if (window.location.origin !== origin) return;
      localStorage.setItem("wireline_session", JSON.stringify(s));
      localStorage.setItem("wireline_cookie_consent", "acknowledged");
      localStorage.setItem("wireline_tour_seen", "true");
    },
    { origin: new URL(baseURL).origin, session },
  );
}

async function dismissProductTour(page) {
  const skip = page.getByRole("button", { name: /skip|close|dismiss/i });
  const startTour = page.getByRole("button", { name: /start tour/i });
  if (await startTour.isVisible().catch(() => false)) {
    await page.locator('button').filter({ has: page.locator("svg") }).first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  if (await skip.first().isVisible().catch(() => false)) {
    await skip.first().click();
    await page.waitForTimeout(400);
  }
}

async function stabilize(page) {
  await page.waitForLoadState("domcontentloaded");
  await dismissProductTour(page);
  await page
    .waitForFunction(() => !document.querySelector('[aria-busy="true"] .skeleton-shimmer'), {
      timeout: 12_000,
    })
    .catch(() => {});
  await page.waitForTimeout(useProduction ? 1400 : 700);
}

async function run() {
  if (useProduction && !demoPassword) {
    console.error("Production mode requires DEMO_PASSWORD. See docs/DEMO_ACCOUNT.md");
    process.exit(1);
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const manifest = [];
  const productionSession = useProduction ? await fetchProductionSession() : null;

  try {
    for (const viewport of viewports) {
      const dir = path.join(outDir, viewport.name);
      await mkdir(dir, { recursive: true });

      const publicTargets = targets.filter((t) => !t.auth);
      const authedTargets = targets.filter((t) => t.auth);

      for (const target of publicTargets) {
        const ctx = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: "reduce",
        });
        if (!useProduction) await installApiMocks(ctx);
        await prepareContext(ctx, { authenticated: false });
        const page = await ctx.newPage();
        console.log(`[${viewport.name}] ${target.name} (${useProduction ? "prod" : "mock"})`);
        await page.goto(new URL(target.route, baseURL).toString(), {
          waitUntil: "domcontentloaded",
          timeout: 45_000,
        });
        await stabilize(page);
        const screenshotPath = path.join(dir, `${target.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        manifest.push({ viewport: viewport.name, target: target.name, path: path.relative(repoRoot, screenshotPath) });
        await ctx.close();
      }

      if (authedTargets.length) {
        const ctx = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: "reduce",
        });
        if (!useProduction) await installApiMocks(ctx);
        await prepareContext(ctx, { authenticated: true });
        if (useProduction && productionSession) {
          await seedProductionSession(ctx, productionSession);
        }
        const page = await ctx.newPage();
        for (const target of authedTargets) {
          console.log(`[${viewport.name}] ${target.name} (${useProduction ? "prod" : "mock"})`);
          await page.goto(new URL(target.route, baseURL).toString(), {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          });
          await stabilize(page);
          const screenshotPath = path.join(dir, `${target.name}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          manifest.push({ viewport: viewport.name, target: target.name, path: path.relative(repoRoot, screenshotPath) });
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  const md = [
    "# Wireline Design Showcase",
    "",
    `Captured against \`${baseURL}\` (${useProduction ? "production login" : "mocked API"})`,
    "",
    "## Auth portal",
    ...viewports.map((v) => `- **${v.name}** (${v.width}×${v.height}): \`${v.name}/auth-portal.png\``),
    "",
    "## Client — Triage",
    ...viewports.map((v) => `- **${v.name}**: \`${v.name}/client-triage.png\``),
    "",
    "## Client — Integrations",
    ...viewports.map((v) => `- **${v.name}**: \`${v.name}/client-integrations.png\``),
    "",
    "## Client — Agents",
    ...viewports.map((v) => `- **${v.name}**: \`${v.name}/client-agents.png\``),
    "",
  ].join("\n");

  await writeFile(path.join(outDir, "README.md"), md);
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify({ baseURL, useProduction, manifest }, null, 2));
  console.log(`Showcase written to ${path.relative(repoRoot, outDir)}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
