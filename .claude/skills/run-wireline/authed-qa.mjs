#!/usr/bin/env node
/**
 * Authenticated layout QA — mocks the session + API so the real AppShell and
 * each sidebar page render, then screenshots and measures the flex-height chain
 * to flag (a) content clipped mid-viewport by an overflow-hidden stage and
 * (b) content that stops well short of the viewport bottom (dead space).
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE_URL = process.env.QA_URL || "http://localhost:3000";
const OUT_DIR = process.env.QA_OUT || "/tmp/wireline-screenshots";
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const ROUTES = (process.env.QA_ROUTES ||
  "/chat,/agents,/training,/ops,/triage,/phone,/email,/sms,/pipeline,/insights,/integrations,/admin")
  .split(",");

const MOCK_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "qa@wireline.test",
  full_name: "QA Operator",
  role: "owner",
  is_owner: true,
};

// Sensible empty defaults so pages don't crash on missing data.
function mockApi(urlPath) {
  if (urlPath.includes("/auth/session")) return { user: MOCK_USER };
  if (urlPath.includes("/nav-counts")) return {};
  if (urlPath.includes("/agents")) return { agents: [] };
  if (urlPath.includes("/settings")) return { settings: {} };
  // Generic: arrays for list-y endpoints, object otherwise.
  if (/(logs|leads|threads|messages|events|appointments|campaigns|list|history|items)/.test(urlPath))
    return [];
  return {};
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });

  // Suppress the post-signup onboarding modal so we see the real page layout.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("wireline_post_signup_dismissed", "true");
      localStorage.setItem("wireline_onboarding_celebrated", "true");
    } catch {
      /* ignore */
    }
  });

  await context.route("**/api/**", async (route) => {
    const u = new URL(route.request().url());
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockApi(u.pathname)),
      });
    } catch {
      await route.abort();
    }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const results = [];

  for (const r of ROUTES) {
    const name = r.replace(/\//g, "") || "root";
    const entry = { route: r, errors: [] };
    page.removeAllListeners("console");
    page.on("console", (m) => {
      if (m.type() === "error") entry.errors.push(m.text().slice(0, 160));
    });
    try {
      await page.goto(BASE_URL + r, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1800);

      const diag = await page.evaluate(() => {
        const vh = window.innerHeight;
        const q = (s) => document.querySelector(s);
        const box = (el) => {
          if (!el) return null;
          const b = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            top: Math.round(b.top),
            bottom: Math.round(b.bottom),
            h: Math.round(b.height),
            scrollH: el.scrollHeight,
            clientH: el.clientHeight,
            overflowY: cs.overflowY,
            clipped: cs.overflowY !== "visible" && el.scrollHeight - el.clientHeight > 4,
          };
        };
        const dw = q('[data-testid="director-workspace"]');
        const dwBox = dw ? { top: Math.round(dw.getBoundingClientRect().top), bottom: Math.round(dw.getBoundingClientRect().bottom), h: Math.round(dw.getBoundingClientRect().height), parentH: Math.round(dw.parentElement.getBoundingClientRect().height), gpH: Math.round(dw.parentElement.parentElement.getBoundingClientRect().height) } : null;
        const main = q("#main-content");
        const stage = q(".client-console__stage");
        const surface = q(".app-surface");
        // Deepest visible content bottom inside the surface.
        let contentBottom = 0;
        if (surface) {
          surface.querySelectorAll("*").forEach((el) => {
            const b = el.getBoundingClientRect();
            if (b.height > 0 && b.width > 0 && b.bottom <= vh + 1 && b.bottom > contentBottom)
              contentBottom = b.bottom;
          });
        }
        return {
          vh,
          main: box(main),
          stage: box(stage),
          surface: box(surface),
          contentBottom: Math.round(contentBottom),
          bottomGap: surface ? Math.round(vh - contentBottom) : null,
          dw: dwBox,
        };
      });
      entry.diag = diag;

      // Heuristics
      if (diag.stage?.clipped)
        entry.flags = [...(entry.flags || []), `STAGE CLIPPED (scrollH ${diag.stage.scrollH} > clientH ${diag.stage.clientH}, overflowY ${diag.stage.overflowY})`];
      if (diag.surface?.clipped)
        entry.flags = [...(entry.flags || []), `SURFACE CLIPPED (scrollH ${diag.surface.scrollH} > clientH ${diag.surface.clientH})`];
      if (diag.bottomGap != null && diag.bottomGap > 120)
        entry.flags = [...(entry.flags || []), `BOTTOM DEAD SPACE ${diag.bottomGap}px (content ends at ${diag.contentBottom}, vh ${diag.vh})`];

      await page.screenshot({ path: path.join(OUT_DIR, `authed-${name}.png`) });
    } catch (e) {
      entry.error = String(e).slice(0, 200);
    }
    results.push(entry);
    console.log(JSON.stringify(entry));
  }

  writeFileSync(path.join(OUT_DIR, "authed-qa.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
