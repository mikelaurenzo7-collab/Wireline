/**
 * Visual QA capture — marketing + authenticated surfaces across viewports.
 * Credentials from .env.visual-qa (Vercel production pull).
 *
 *   node scripts/visual-qa-capture.mjs
 */
import { chromium, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdir as mkdirP, writeFile as writeFileP } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, "..");
const outRoot = path.join(repoRoot, "visual-qa");

function loadEnvFile(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(path.join(repoRoot, ".env.visual-qa"));
loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, ".env"));

const baseURL = process.env.E2E_BASE_URL || "https://trywireline.com";
const demoEmail =
  process.env.DEMO_EMAIL ||
  process.env.DOGFOOD_EMAIL ||
  process.env.WIRELINE_E2E_EMAIL ||
  process.env.E2E_USER_EMAIL ||
  "";
const demoPassword =
  process.env.DEMO_PASSWORD ||
  process.env.DOGFOOD_PASSWORD ||
  process.env.WIRELINE_E2E_PASSWORD ||
  process.env.E2E_USER_PASSWORD ||
  "";

const viewports = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
  "mobile-sm": { width: 360, height: 740 },
};

const marketingPages = [
  { id: "home", route: "/" },
  { id: "features", route: "/features" },
  { id: "pricing", route: "/pricing" },
  { id: "showcase", route: "/showcase" },
  { id: "compare", route: "/compare" },
  { id: "about", route: "/about" },
  { id: "blog", route: "/blog" },
  { id: "security", route: "/security" },
  { id: "status", route: "/status" },
  { id: "support", route: "/support" },
  { id: "contact", route: "/contact" },
  { id: "privacy", route: "/privacy" },
  { id: "terms", route: "/terms" },
  { id: "developers", route: "/developers" },
  { id: "signin", route: "/signin" },
  { id: "signup", route: "/signup" },
  { id: "for-personal", route: "/for/personal" },
  { id: "for-home-services", route: "/for/home-services" },
  { id: "for-medical", route: "/for/medical" },
  { id: "for-legal", route: "/for/legal" },
  { id: "for-real-estate", route: "/for/real-estate" },
  { id: "for-insurance", route: "/for/insurance" },
  { id: "for-restaurants", route: "/for/restaurants" },
  { id: "for-sales", route: "/for/sales" },
  { id: "solutions-sales", route: "/solutions/sales" },
];

const authPages = [
  { id: "overview", route: "/overview" },
  { id: "studio", route: "/studio" },
  { id: "templates", route: "/templates" },
  { id: "knowledge", route: "/knowledge" },
  { id: "connections", route: "/connections" },
  { id: "phone", route: "/phone" },
  { id: "phone-logs", route: "/phone?tab=logs" },
  { id: "phone-outbound", route: "/phone?tab=outbound" },
  { id: "insights", route: "/insights" },
  { id: "inbox", route: "/inbox" },
  { id: "approvals", route: "/approvals" },
  { id: "apps", route: "/apps" },
  { id: "settings", route: "/settings" },
  { id: "billing", route: "/settings/billing" },
  { id: "settings-phone", route: "/settings/phone" },
  { id: "settings-team", route: "/settings/team" },
  { id: "settings-customization", route: "/settings/customization" },
  { id: "settings-compliance", route: "/settings/compliance" },
];

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
    if (key === "domain" && v) cookie.domain = v;
    if (key === "max-age" && v) cookie.expires = Math.floor(Date.now() / 1000) + Number(v);
    if (key === "expires" && v) cookie.expires = Math.floor(new Date(v).getTime() / 1000);
    if (key === "samesite" && v) cookie.sameSite = v;
    if (key === "httponly") cookie.httpOnly = true;
    if (key === "secure") cookie.secure = true;
  }
  return cookie;
}

async function fetchSession() {
  if (!demoEmail || !demoPassword) {
    throw new Error("Missing demo credentials (DEMO_* / DOGFOOD_* / WIRELINE_E2E_* / E2E_USER_*)");
  }
  const res = await fetch(new URL("/api/auth/signin", baseURL).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: demoEmail, password: demoPassword }),
  });
  const data = await res.json().catch(() => ({}));
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  const sessionCookie = setCookies.map(parseSetCookie).find((c) => c?.name === "wireline_session");
  if (res.ok && data.user && sessionCookie) {
    return {
      user: data.user,
      email: demoEmail,
      cookie: sessionCookie,
    };
  }
  throw new Error(
    `API sign-in failed ${res.status}: user=${!!data.user} cookie=${!!sessionCookie} body=${JSON.stringify(data).slice(0, 180)}`,
  );
}

async function seedSession(context, session) {
  const origin = new URL(baseURL).origin;
  const host = new URL(baseURL).hostname;
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
  await context.addInitScript(({ o }) => {
    if (window.location.origin !== o) return;
    localStorage.setItem("wireline_cookie_consent", "acknowledged");
    localStorage.setItem("wireline_tour_seen", "true");
    localStorage.setItem("wireline_onboarding_completed", "true");
  }, { o: origin });
}

async function dismissOverlays(page) {
  const selectors = [
    'button:has-text("Skip")',
    'button:has-text("Not now")',
    'button:has-text("Dismiss")',
    'button:has-text("Got it")',
    'button:has-text("Close")',
    '[aria-label="Close"]',
    '[data-testid="cookie-accept"]',
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await dismissOverlays(page);
  // Wait out common late-load / skeleton states before shooting.
  await Promise.race([
    page.locator('[class*="animate-spin"], [data-loading="true"], .route-fallback-tile').first().waitFor({
      state: "hidden",
      timeout: 8_000,
    }),
    page.waitForTimeout(2500),
  ]).catch(() => {});
  await page.waitForTimeout(800);
}

async function capturePage(page, filePath, fullPage = false) {
  await mkdirP(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage, animations: "disabled" });
}

async function run() {
  console.log(`Base: ${baseURL}`);
  console.log(`Auth as: ${demoEmail}`);
  await mkdirP(outRoot, { recursive: true });

  const session = await fetchSession();
  console.log(`Signed in as ${session.user?.email || demoEmail} (role=${session.user?.role || "?"})`);

  const browser = await chromium.launch({ headless: true });
  const manifest = {
    capturedAt: new Date().toISOString(),
    baseURL,
    email: demoEmail,
    viewports,
    marketing: [],
    auth: [],
    errors: [],
  };

  // Marketing — all viewports, viewport shot + full-page for desktop/mobile
  for (const [vpName, viewport] of Object.entries(viewports)) {
    const ctx = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      deviceScaleFactor: vpName.startsWith("mobile") ? 2 : 1,
    });
    await ctx.addInitScript(({ o }) => {
      if (window.location.origin !== o) return;
      localStorage.setItem("wireline_cookie_consent", "acknowledged");
    }, { o: new URL(baseURL).origin });
    const page = await ctx.newPage();

    for (const p of marketingPages) {
      const url = new URL(p.route, baseURL).toString();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await settle(page);
        const shotPath = path.join(outRoot, "marketing", vpName, `${p.id}.png`);
        await capturePage(page, shotPath, false);
        const entry = { id: p.id, route: p.route, viewport: vpName, path: shotPath, title: await page.title() };
        if (vpName === "desktop" || vpName === "mobile") {
          const fullPath = path.join(outRoot, "marketing", `${vpName}-full`, `${p.id}.png`);
          await capturePage(page, fullPath, true);
          entry.fullPage = fullPath;
        }
        manifest.marketing.push(entry);
        console.log(`✓ marketing ${vpName} ${p.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        manifest.errors.push({ surface: "marketing", id: p.id, viewport: vpName, error: msg });
        console.warn(`✗ marketing ${vpName} ${p.id}: ${msg}`);
      }
    }
    await ctx.close();
  }

  // Auth — all viewports
  for (const [vpName, viewport] of Object.entries(viewports)) {
    const ctx = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      deviceScaleFactor: vpName.startsWith("mobile") ? 2 : 1,
    });
    await seedSession(ctx, session);
    const page = await ctx.newPage();

    for (const p of authPages) {
      const url = new URL(p.route, baseURL).toString();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await settle(page);
        // If bounced to signin, fail loudly
        if (/\/signin|\/signup|\/auth/i.test(page.url())) {
          throw new Error(`Redirected to auth: ${page.url()}`);
        }
        const shotPath = path.join(outRoot, "auth", vpName, `${p.id}.png`);
        await capturePage(page, shotPath, false);
        const entry = { id: p.id, route: p.route, viewport: vpName, path: shotPath, title: await page.title(), finalUrl: page.url() };
        if (vpName === "desktop" || vpName === "mobile") {
          const fullPath = path.join(outRoot, "auth", `${vpName}-full`, `${p.id}.png`);
          await capturePage(page, fullPath, true);
          entry.fullPage = fullPath;
        }
        manifest.auth.push(entry);
        console.log(`✓ auth ${vpName} ${p.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        manifest.errors.push({ surface: "auth", id: p.id, viewport: vpName, error: msg });
        console.warn(`✗ auth ${vpName} ${p.id}: ${msg}`);
      }
    }
    await ctx.close();
  }

  // Device presets (iPhone / Pixel / iPad)
  const devicePresets = [
    { name: "iphone-14", descriptor: devices["iPhone 14"] },
    { name: "pixel-7", descriptor: devices["Pixel 7"] },
    { name: "ipad-pro", descriptor: devices["iPad Pro"] },
  ];
  const deviceRoutes = [
    ...marketingPages.filter((p) =>
      ["home", "pricing", "showcase", "for-sales", "signin", "compare"].includes(p.id),
    ),
    ...authPages.filter((p) =>
      ["overview", "studio", "phone", "insights", "approvals", "settings"].includes(p.id),
    ).map((p) => ({ ...p, auth: true })),
  ];

  for (const { name, descriptor } of devicePresets) {
    const ctx = await browser.newContext({
      ...descriptor,
      reducedMotion: "reduce",
    });
    await seedSession(ctx, session);
    await ctx.addInitScript(({ o }) => {
      if (window.location.origin !== o) return;
      localStorage.setItem("wireline_cookie_consent", "acknowledged");
    }, { o: new URL(baseURL).origin });
    const page = await ctx.newPage();
    for (const p of deviceRoutes) {
      const url = new URL(p.route, baseURL).toString();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await settle(page);
        const folder = p.auth ? "auth" : "marketing";
        const shotPath = path.join(outRoot, "devices", name, folder, `${p.id}.png`);
        await capturePage(page, shotPath, false);
        console.log(`✓ device ${name} ${folder}/${p.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        manifest.errors.push({ surface: `device:${name}`, id: p.id, error: msg });
        console.warn(`✗ device ${name} ${p.id}: ${msg}`);
      }
    }
    await ctx.close();
  }

  await writeFileP(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nDone. Errors: ${manifest.errors.length}`);
  console.log(`Output: ${outRoot}`);
  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
