/**
 * Wireline marketing asset capture — production demo account.
 *
 *   E2E_BASE_URL=https://trywireline.com
 *   DEMO_EMAIL=composer.demo@trywireline.com
 *   DEMO_PASSWORD=...  (docs/DEMO_ACCOUNT.md)
 *   node scripts/marketing-kit.mjs
 *
 * Outputs: marketing-kit/
 *   screenshots/{desktop,mobile,reel-vertical}/*.png
 *   videos/*.webm  (Playwright screen recordings)
 *   zoom-crops/*.png
 *   copy/social-copy.md
 *   manifest.json
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, "..");

function loadEnvFileEarly(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}
loadEnvFileEarly(path.join(repoRoot, ".env.visual-qa"));
loadEnvFileEarly(path.join(repoRoot, ".env.local"));
loadEnvFileEarly(path.join(repoRoot, ".env"));

const baseURL = process.env.E2E_BASE_URL || "https://trywireline.com";
const demoEmail = process.env.DEMO_EMAIL || "composer.demo@trywireline.com";
const demoPassword = process.env.DEMO_PASSWORD || "";
const useMocks = process.env.MARKETING_USE_MOCKS === "1" || /localhost|127\.0\.0\.1/i.test(baseURL);

const outRoot = path.join(repoRoot, "marketing-kit");

const layouts = {
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 390, height: 844 },
  reel: { width: 1080, height: 1920 },
};

function json(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

function mockApi(pathname) {
  const now = "2026-05-22T12:00:00.000Z";
  if (pathname === "/api/nav-counts") return json({ "/phone": 24, "/overview": 6 });
  if (pathname === "/api/user-preferences") {
    return json({ persona: "operator", onboarding_completed: true, tour_completed: true });
  }
  if (pathname === "/api/billing/status") {
    return json({
      email_verified: true,
      subscription: { status: "active", plan: "growth" },
      trial: { status: "active", days_left: 12 },
      usage: { agents: 2, calls: 24 },
    });
  }
  if (pathname === "/api/agents") {
    return json({
      agents: [
        { id: "demo-avery-2f85", name: "Avery", role: "front-desk", status: "active", created_at: now },
        { id: "demo-riley-2f85", name: "Riley", role: "sales-development", status: "active", created_at: now },
      ],
    });
  }
  if (pathname === "/api/oauth/crm/status") {
    return json({
      salesforce: { connected: true, email: "ops@northstarmfg.com", connected_at: now },
      hubspot: { connected: true, email: "jordan@apexrealty.io", connected_at: now },
      slack: { connected: true, team: "Wireline Revenue", connected_at: now },
      zoom: { connected: false, configured: true },
      apollo: { connected: true, platform_active: true },
      meta: { connected: false, configured: true },
      shopify: { connected: true, configured: true },
      square: { connected: false, configured: true },
      microsoft_teams: { connected: true, team_name: "Alerts", channel_name: "wins", connected_at: now },
      microsoft_excel: { connected: true, connected_at: now },
    });
  }
  if (pathname === "/api/emails/accounts") {
    return json({
      accounts: [
        { id: "e1", provider: "google", email_address: "ops@wireline.test", agent_id: "demo-avery-2f85" },
        { id: "e2", provider: "microsoft", email_address: "billing@wireline.test", agent_id: "demo-riley-2f85" },
      ],
    });
  }
  if (pathname === "/api/triage") {
    return json({
      hot_leads: [
        {
          id: "h1",
          agent_id: "demo-avery-2f85",
          customer_number: "+14155551011",
          lead_score: 94,
          intent_label: "schedule_demo",
          summary: "Qualified inbound — booked demo Thursday 2pm",
          created_at: now,
        },
        {
          id: "h2",
          agent_id: "demo-riley-2f85",
          customer_number: "+16175552031",
          lead_score: 88,
          intent_label: "buy_now",
          summary: "Discovery — HIPAA + compliance walkthrough",
          created_at: now,
        },
      ],
      compliance: [],
      pending_tasks: [
        {
          id: "t1",
          agent_id: "demo-avery-2f85",
          description: "Send pricing recap to Alex Rivera",
          priority: "high",
          task_type: "send_email",
          status: "pending",
          created_at: now,
        },
      ],
      knowledge_gaps: [],
      escalations: [],
      counts: { hot_leads: 2, pending_tasks: 1, knowledge_gaps: 0, escalations: 0, compliance: 0 },
    });
  }
  if (pathname === "/api/call-logs") {
    return json({
      logs: Array.from({ length: 8 }, (_, i) => ({
        id: String(1000 + i),
        agent_id: i % 2 ? "demo-riley-2f85" : "demo-avery-2f85",
        customer_number: "+14155551011",
        direction: i % 2 ? "inbound" : "outbound",
        duration_seconds: 120 + i * 40,
        summary: "Demo showcase call — qualified lead, booked follow up",
        sentiment: "positive",
        intent_label: "schedule_demo",
        qa_score: 82 + i,
        demo: true,
        recording_url: null,
        created_at: now,
      })),
      total: 24,
    });
  }
  if (pathname === "/api/insights" || pathname.startsWith("/api/insights")) {
    return json({
      funnel: { booked: 12, qualified: 18, contacted: 24 },
      totals: { calls: 24, avg_qa: 84 },
    });
  }
  if (pathname === "/api/settings") return json({ brand_name: "Wireline", primary_color: "#4F1E7B", max_agents: 5 });
  return json({ ok: true });
}

async function installApiMocks(context) {
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill(mockApi(url.pathname));
  });
}

const pages = [
  { id: "auth-hero", route: "/", auth: false },
  { id: "compare", route: "/compare", auth: false },
  { id: "pricing", route: "/pricing", auth: false },
  { id: "overview", route: "/overview", auth: true },
  { id: "studio", route: "/studio", auth: true },
  { id: "connections", route: "/connections", auth: true },
  { id: "phone-logs", route: "/phone?tab=logs", auth: true },
  { id: "phone-outbound", route: "/phone?tab=outbound", auth: true },
  { id: "insights", route: "/insights", auth: true },
  { id: "apps", route: "/apps", auth: true },
  { id: "billing", route: "/settings/billing", auth: true },
];

const resolvedEmail =
  process.env.DEMO_EMAIL ||
  process.env.DOGFOOD_EMAIL ||
  process.env.WIRELINE_E2E_EMAIL ||
  process.env.E2E_USER_EMAIL ||
  demoEmail;
const resolvedPassword =
  process.env.DEMO_PASSWORD ||
  process.env.DOGFOOD_PASSWORD ||
  process.env.WIRELINE_E2E_PASSWORD ||
  process.env.E2E_USER_PASSWORD ||
  demoPassword;

function parseSetCookie(header) {
  if (!header) return null;
  const [pair, ...attrs] = header.split(";").map((s) => s.trim());
  const eq = pair.indexOf("=");
  if (eq < 0) return null;
  const name = pair.slice(0, eq);
  const value = pair.slice(eq + 1);
  const cookie = { name, value, path: "/", secure: true, httpOnly: true, sameSite: "Lax" };
  for (const a of attrs) {
    const [k, v] = a.split("=");
    const key = k.toLowerCase();
    if (key === "path" && v) cookie.path = v;
    if (key === "max-age" && v) cookie.expires = Math.floor(Date.now() / 1000) + Number(v);
    if (key === "expires" && v) cookie.expires = Math.floor(new Date(v).getTime() / 1000);
  }
  return cookie;
}

async function fetchSession() {
  if (!resolvedEmail || !resolvedPassword) throw new Error("Set DEMO_PASSWORD / DOGFOOD_* / WIRELINE_E2E_*");
  const res = await fetch(new URL("/api/auth/signin", baseURL).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: resolvedEmail, password: resolvedPassword }),
  });
  const data = await res.json().catch(() => ({}));
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  const sessionCookie = setCookies.map(parseSetCookie).find((c) => c?.name === "wireline_session");
  if (res.ok && data.user && sessionCookie) {
    return { user: data.user, cookie: sessionCookie, email: resolvedEmail };
  }
  if (res.ok && data.token) return { access_token: data.token, user: data.user };
  console.warn(`API sign-in failed (${res.status}), falling back to UI login…`);
  return null;
}

async function loginViaUi(browser) {
  const ctx = await browser.newContext({ viewport: layouts.desktop });
  await ctx.addInitScript(({ o }) => {
    if (window.location.origin !== o) return;
    localStorage.setItem("wireline_cookie_consent", "acknowledged");
  }, { o: new URL(baseURL).origin });
  const page = await ctx.newPage();
  await page.goto(new URL("/signin", baseURL).toString(), { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', resolvedEmail);
  await page.fill('input[type="password"]', resolvedPassword);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/(overview|studio|phone|connections|apps)?/i, { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const cookies = await ctx.cookies();
  const sessionCookie = cookies.find((c) => c.name === "wireline_session");
  await ctx.close();
  if (!sessionCookie) throw new Error("UI sign-in did not produce wireline_session cookie");
  return {
    user: { email: resolvedEmail },
    cookie: {
      name: sessionCookie.name,
      value: sessionCookie.value,
      path: sessionCookie.path || "/",
      expires: sessionCookie.expires,
    },
  };
}

async function seedSession(context, session) {
  const origin = new URL(baseURL).origin;
  const host = new URL(baseURL).hostname;
  if (session?.cookie) {
    await context.addCookies([
      {
        name: session.cookie.name,
        value: session.cookie.value,
        domain: host,
        path: session.cookie.path || "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        expires: session.cookie.expires || Math.floor(Date.now() / 1000) + 7200,
      },
    ]);
  }
  await context.addInitScript(({ o, s }) => {
    if (window.location.origin !== o) return;
    if (s?.access_token) localStorage.setItem("wireline_session", JSON.stringify(s));
    localStorage.setItem("wireline_cookie_consent", "acknowledged");
    localStorage.setItem("wireline_tour_seen", "true");
    localStorage.setItem("wireline_onboarding_completed", "true");
  }, { o: origin, s: session?.access_token ? session : null });
}

async function mockSession(context) {
  await seedSession(context, {
    access_token: "marketing-mock",
    user: {
      id: "2f85bad8-f9f6-479f-bb39-818d9cb9bf07",
      email: resolvedEmail,
      full_name: "Wireline Demo Showcase",
      role: "owner",
      is_owner: false,
    },
  });
}

async function dismissTour(page) {
  const close = page.getByRole("button", { name: /skip|close|dismiss|not now/i });
  if (await close.first().isVisible().catch(() => false)) {
    await close.first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await dismissTour(page);
  await page.waitForTimeout(1600);
}

async function captureScreenshots(browser, session, manifest) {
  for (const [layoutName, viewport] of Object.entries(layouts)) {
    const dir = path.join(outRoot, "screenshots", layoutName);
    await mkdir(dir, { recursive: true });

    const ctx = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    if (useMocks) {
      await installApiMocks(ctx);
      await mockSession(ctx);
    } else {
      await seedSession(ctx, session);
    }
    const page = await ctx.newPage();

    for (const p of pages) {
      if (!p.auth && layoutName !== "desktop" && p.id === "overview") continue;
      if (p.auth && p.id === "auth-hero") continue;
      const route = p.route;
      console.log(`[screenshot ${layoutName}] ${p.id}`);
      await page.goto(new URL(route, baseURL).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await settle(page);
      const file = path.join(dir, `${p.id}.png`);
      await page.screenshot({ path: file, fullPage: p.id === "compare" });
      manifest.assets.push({
        type: "screenshot",
        layout: layoutName,
        id: p.id,
        path: path.relative(repoRoot, file),
      });
    }
    await ctx.close();
  }
}

async function captureZoomCrops(browser, session, manifest) {
  const dir = path.join(outRoot, "zoom-crops");
  await mkdir(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: layouts.desktop });
  if (useMocks) {
    await installApiMocks(ctx);
    await mockSession(ctx);
  } else {
    await seedSession(ctx, session);
  }
  const page = await ctx.newPage();

  const shots = [
    { id: "overview-command", route: "/overview", selector: "main" },
    { id: "studio-create", route: "/studio?create=1", selector: "main" },
    { id: "connections-stack", route: "/connections", selector: "main" },
    { id: "phone-history", route: "/phone?tab=logs", selector: "main" },
    { id: "phone-outbound", route: "/phone?tab=outbound", selector: "main" },
    { id: "compare-matrix", route: "/compare", selector: "table" },
  ];

  for (const s of shots) {
    await page.goto(new URL(s.route, baseURL).toString(), { timeout: 60_000 });
    await settle(page);
    const loc = page.locator(s.selector).first();
    const file = path.join(dir, `${s.id}.png`);
    try {
      await loc.screenshot({ path: file, timeout: 8000 });
    } catch {
      await page.screenshot({ path: file });
    }
    manifest.assets.push({ type: "zoom-crop", id: s.id, path: path.relative(repoRoot, file) });
  }
  await ctx.close();
}

async function recordReel(browser, session, manifest) {
  const videoDir = path.join(outRoot, "videos");
  await mkdir(videoDir, { recursive: true });

  const reels = [
    {
      id: "reel-operator-console",
      viewport: layouts.reel,
      steps: async (page) => {
        for (const route of ["/overview", "/studio", "/phone?tab=logs", "/connections", "/apps"]) {
          await page.goto(new URL(route, baseURL).toString());
          await settle(page);
          await page.waitForTimeout(2200);
        }
      },
    },
    {
      id: "reel-compare-pan",
      viewport: layouts.reel,
      steps: async (page) => {
        await page.goto(new URL("/compare", baseURL).toString());
        await settle(page);
        const table = page.locator("table").first();
        const box = await table.boundingBox().catch(() => null);
        if (box) {
          for (let i = 0; i < 8; i++) {
            await page.mouse.wheel(120, 0);
            await page.waitForTimeout(400);
          }
        }
        await page.waitForTimeout(1500);
      },
    },
    {
      id: "reel-auth-to-phone",
      viewport: layouts.desktop,
      steps: async (page) => {
        await page.goto(new URL("/", baseURL).toString());
        await settle(page);
        await page.waitForTimeout(2000);
        await page.goto(new URL("/phone?tab=logs", baseURL).toString());
        await settle(page);
        await page.mouse.wheel(0, 280);
        await page.waitForTimeout(2500);
      },
    },
  ];

  for (const reel of reels) {
    const ctx = await browser.newContext({
      viewport: reel.viewport,
      recordVideo: { dir: videoDir, size: reel.viewport },
    });
    if (useMocks) {
      await installApiMocks(ctx);
      await mockSession(ctx);
    } else {
      await seedSession(ctx, session);
    }
    const page = await ctx.newPage();
    console.log(`[video] ${reel.id}`);
    await reel.steps(page);
    const video = page.video();
    const vpath = video ? await video.path() : null;
    await page.close();
    await ctx.close();
    manifest.assets.push({
      type: "video",
      id: reel.id,
      path: vpath ? path.relative(repoRoot, vpath) : `videos/${reel.id}.webm`,
      note: "Playwright webm — import to CapCut/Premiere for 9:16 export",
    });
  }
}

async function writeCopy(manifest) {
  const copyDir = path.join(outRoot, "copy");
  await mkdir(copyDir, { recursive: true });
  const md = `# Wireline marketing copy pack

Generated from **${resolvedEmail}** on ${baseURL} — ${new Date().toISOString().slice(0, 10)}.

## Hero (website / LinkedIn)

**Headline:** One console for every customer conversation — voice, SMS, and email.

**Sub:** Wireline agents answer, book, sync CRM, and escalate to your team with a real TCPA ledger. Not another voice API you have to assemble.

**CTA:** Start free on Free Builder · Call demo line (630) 581-1834

## 15s reel hook (vertical)

"Your receptionist is a phone hub now. Watch call history, integrations, and live agents — all in Wireline."

## 30s reel (pan compare table)

"Honest scoring vs Bland, Retell, and roll-your-own Vapi. Wireline wins when you need the full operator product."

## Instagram carousel (5 slides)

1. Auth hero — "Voice agents for every channel"
2. Phone zoom — "Hot leads surface automatically"
3. Integrations — "10+ connectors, one hub"
4. Compare — "Why Wireline vs voice-only APIs"
5. CTA — trywireline.com + demo line

## Call recordings note

Demo account call logs are seeded with summaries and QA scores but **no hosted audio URLs** yet. For website hero audio:

- Use **live demo line (630) 581-1834** and record a screen+call session, or
- Export a real tenant call from **Logs → playback** after a staging call.

## Asset folders

- \`screenshots/desktop\` — 1920×1080 web hero sections
- \`screenshots/reel\` — 1080×1920 vertical stills
- \`screenshots/mobile\` — App Store / mobile web
- \`zoom-crops/\` — detail shots for ads
- \`videos/\` — screen recordings (import to editor)
`;
  const file = path.join(copyDir, "social-copy.md");
  await writeFile(file, md, "utf8");
  manifest.assets.push({ type: "copy", path: path.relative(repoRoot, file) });
}

async function capturePublicProd(browser, manifest) {
  const prod = "https://trywireline.com";
  const dir = path.join(outRoot, "screenshots", "production-public");
  await mkdir(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: layouts.desktop });
  const page = await ctx.newPage();
  for (const route of ["/", "/compare", "/pricing"]) {
    const id = route === "/" ? "auth-hero" : route.slice(1);
    await page.goto(new URL(route, prod).toString());
    await page.waitForTimeout(2000);
    const file = path.join(dir, `${id}.png`);
    await page.screenshot({ path: file, fullPage: route === "/compare" });
    manifest.assets.push({
      type: "screenshot",
      layout: "production-public",
      id,
      path: path.relative(repoRoot, file),
    });
  }
  await ctx.close();
}

async function run() {
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseURL,
    demoEmail: resolvedEmail,
    mode: useMocks ? "local-mock" : "production-session",
    assets: [],
  };

  const browser = await chromium.launch({ headless: true });
  let session = null;
  if (!useMocks) {
    session = await fetchSession().catch(() => null);
    if (!session) session = await loginViaUi(browser);
  }
  try {
    if (!useMocks) await capturePublicProd(browser, manifest);
    await captureScreenshots(browser, session, manifest);
    await captureZoomCrops(browser, session, manifest);
    await recordReel(browser, session, manifest);
    await writeCopy(manifest);
    const manifestPath = path.join(outRoot, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    console.log(`\nMarketing kit ready: ${outRoot}`);
    console.log(`Manifest: ${manifestPath}`);
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
