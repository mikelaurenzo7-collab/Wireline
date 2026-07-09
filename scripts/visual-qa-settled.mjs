/**
 * Re-capture key auth pages with longer settle + network idle.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdir as mkdirP } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadEnvFile(filePath) {
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
  } catch {}
}
loadEnvFile(path.join(repoRoot, ".env.visual-qa"));

const baseURL = "https://trywireline.com";
const email = process.env.DOGFOOD_EMAIL;
const password = process.env.DOGFOOD_PASSWORD;
const out = path.join(repoRoot, "visual-qa", "settled");

function parseSetCookie(header) {
  const [pair, ...attrs] = header.split(";").map((s) => s.trim());
  const eq = pair.indexOf("=");
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

const pages = [
  "/overview",
  "/studio",
  "/phone",
  "/phone?tab=outbound",
  "/approvals",
  "/insights",
  "/inbox",
  "/connections",
  "/settings",
  "/settings/billing",
  "/settings/compliance",
  "/templates",
  "/knowledge",
  "/apps",
];

const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
};

async function main() {
  const res = await fetch(`${baseURL}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  const setCookies = res.headers.getSetCookie();
  const sessionCookie = setCookies.map(parseSetCookie).find((c) => c.name === "wireline_session");
  if (!data.user || !sessionCookie) throw new Error("signin failed");

  const browser = await chromium.launch({ headless: true });
  await mkdirP(out, { recursive: true });

  for (const [vpName, viewport] of Object.entries(viewports)) {
    const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
    await ctx.addCookies([
      {
        name: sessionCookie.name,
        value: sessionCookie.value,
        domain: "trywireline.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        expires: sessionCookie.expires || Math.floor(Date.now() / 1000) + 7200,
      },
    ]);
    await ctx.addInitScript(() => {
      localStorage.setItem("wireline_cookie_consent", "acknowledged");
      localStorage.setItem("wireline_tour_seen", "true");
      localStorage.setItem("wireline_onboarding_completed", "true");
    });
    const page = await ctx.newPage();
    for (const route of pages) {
      const id = route.replace(/^\//, "").replace(/[?/&=]/g, "-") || "home";
      await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle", timeout: 90_000 }).catch(async () => {
        await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      });
      await page.waitForTimeout(2000);
      // dismiss overlays
      for (const sel of ['button:has-text("Skip")', 'button:has-text("Got it")', '[aria-label="Close"]', 'button:has-text("Not now")', 'button:has-text("Dismiss")']) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) await el.click().catch(() => {});
      }
      // Phone History: wait for framed empty (or call ops) so we don't screenshot the probe gap.
      if (route === "/phone" || route.startsWith("/phone?")) {
        await Promise.race([
          page.getByText("No call history yet").waitFor({ state: "visible", timeout: 15_000 }),
          page.getByText("Call ops").waitFor({ state: "visible", timeout: 15_000 }),
          page.getByText("Outbound dispatch").waitFor({ state: "visible", timeout: 15_000 }),
          page.getByText("Appointments sync").waitFor({ state: "visible", timeout: 15_000 }),
        ]).catch(() => {});
        await page.getByText("Loading call history").waitFor({ state: "hidden", timeout: 8_000 }).catch(() => {});
      }
      // Generic late-load guard
      await Promise.race([
        page.locator('[class*="animate-spin"]').first().waitFor({ state: "hidden", timeout: 6_000 }),
        page.waitForTimeout(2000),
      ]).catch(() => {});
      await page.waitForTimeout(900);
      const dir = path.join(out, vpName);
      await mkdirP(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${id}.png`), animations: "disabled" });
      await page.screenshot({ path: path.join(dir, `${id}-full.png`), fullPage: true, animations: "disabled" });
      const bodyText = await page.locator("body").innerText().catch(() => "");
      console.log(`✓ ${vpName} ${id} textLen=${bodyText.trim().length} url=${page.url()}`);
    }
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
