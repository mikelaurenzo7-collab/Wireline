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
  "/chat,/agents,/training,/ops,/ops?tab=triage,/phone,/email,/sms,/pipeline,/insights,/integrations,/admin")
  .split(",");

const MOCK_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "qa@wireline.test",
  full_name: "QA Operator",
  role: "owner",
  is_owner: true,
};

// A self-contained "design screenshot" rendered as an SVG data URL, so the
// Stitch gallery's Screenshot tab shows a real image with zero network. Renders
// a Brightline home-services landing page approximating what a real Google
// Stitch generation would produce — proper headlines, body copy, real button
// labels, three feature cards with icons + captions, and a CTA footer band.
const STITCH_PREVIEW_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1180" viewBox="0 0 900 1180" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
      <defs>
        <linearGradient id="heroGrad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#EFE9DC"/>
          <stop offset="100%" stop-color="#E8E0CF"/>
        </linearGradient>
        <linearGradient id="brandGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#8B3FD6"/>
          <stop offset="100%" stop-color="#4F1E7B"/>
        </linearGradient>
      </defs>
      <rect width="900" height="1180" fill="url(#heroGrad)"/>
      <!-- Top nav -->
      <rect width="900" height="72" fill="#1A1614"/>
      <circle cx="48" cy="36" r="11" fill="#8B3FD6"/>
      <text x="68" y="42" fill="#EFE9DC" font-size="16" font-weight="700">Brightline</text>
      <text x="540" y="42" fill="#EFE9DC" opacity="0.7" font-size="13">Services</text>
      <text x="618" y="42" fill="#EFE9DC" opacity="0.7" font-size="13">Pricing</text>
      <text x="685" y="42" fill="#EFE9DC" opacity="0.7" font-size="13">About</text>
      <text x="740" y="42" fill="#EFE9DC" opacity="0.7" font-size="13">Contact</text>
      <rect x="800" y="22" width="80" height="28" rx="14" fill="url(#brandGrad)"/>
      <text x="840" y="40" fill="#EFE9DC" font-size="12" font-weight="600" text-anchor="middle">Book now</text>
      <!-- Hero headline -->
      <text x="80" y="190" fill="#1A1614" font-size="44" font-weight="700" font-style="italic">Quality home care,</text>
      <text x="80" y="240" fill="#4F1E7B" font-size="44" font-weight="700" font-style="italic">every season.</text>
      <text x="80" y="290" fill="#1A1614" font-size="15" opacity="0.7">Trusted by 2,400+ homeowners — HVAC, plumbing,</text>
      <text x="80" y="312" fill="#1A1614" font-size="15" opacity="0.7">electrical, and emergency service in 24 hours or less.</text>
      <!-- Hero CTAs -->
      <rect x="80" y="356" width="200" height="52" rx="10" fill="url(#brandGrad)"/>
      <text x="180" y="388" fill="#FFFFFF" font-size="14" font-weight="700" text-anchor="middle">Get a free estimate</text>
      <rect x="296" y="356" width="180" height="52" rx="10" fill="none" stroke="#4F1E7B" stroke-width="2"/>
      <text x="386" y="388" fill="#4F1E7B" font-size="14" font-weight="600" text-anchor="middle">Call (847) 555-0110</text>
      <text x="80" y="442" fill="#1A1614" font-size="11" opacity="0.55">★★★★★  4.9/5 — 412 Google reviews · Licensed &amp; insured</text>
      <!-- Feature cards -->
      <text x="80" y="510" fill="#1A1614" font-size="22" font-weight="700" font-style="italic">What we do best</text>
      <rect x="80" y="540" width="240" height="280" rx="14" fill="#FFFFFF" stroke="#8B3FD6" stroke-opacity="0.18"/>
      <circle cx="200" cy="600" r="28" fill="#8B3FD6" opacity="0.15"/>
      <circle cx="200" cy="600" r="12" fill="#8B3FD6"/>
      <text x="200" y="664" fill="#1A1614" font-size="17" font-weight="700" text-anchor="middle">HVAC &amp; Heating</text>
      <text x="200" y="700" fill="#1A1614" font-size="12" opacity="0.65" text-anchor="middle">Furnace, AC, ducts.</text>
      <text x="200" y="720" fill="#1A1614" font-size="12" opacity="0.65" text-anchor="middle">Tune-ups &amp; new installs.</text>
      <text x="200" y="780" fill="#4F1E7B" font-size="13" font-weight="600" text-anchor="middle">From $89 →</text>
      <rect x="340" y="540" width="240" height="280" rx="14" fill="#FFFFFF" stroke="#8B3FD6" stroke-opacity="0.18"/>
      <circle cx="460" cy="600" r="28" fill="#6B2FA8" opacity="0.15"/>
      <circle cx="460" cy="600" r="12" fill="#6B2FA8"/>
      <text x="460" y="664" fill="#1A1614" font-size="17" font-weight="700" text-anchor="middle">Plumbing</text>
      <text x="460" y="700" fill="#1A1614" font-size="12" opacity="0.65" text-anchor="middle">Drains, water heaters,</text>
      <text x="460" y="720" fill="#1A1614" font-size="12" opacity="0.65" text-anchor="middle">leaks &amp; emergencies.</text>
      <text x="460" y="780" fill="#4F1E7B" font-size="13" font-weight="600" text-anchor="middle">From $129 →</text>
      <rect x="600" y="540" width="240" height="280" rx="14" fill="#FFFFFF" stroke="#8B3FD6" stroke-opacity="0.18"/>
      <circle cx="720" cy="600" r="28" fill="#10B981" opacity="0.18"/>
      <circle cx="720" cy="600" r="12" fill="#10B981"/>
      <text x="720" y="664" fill="#1A1614" font-size="17" font-weight="700" text-anchor="middle">Electrical</text>
      <text x="720" y="700" fill="#1A1614" font-size="12" opacity="0.65" text-anchor="middle">Panels, wiring, EV</text>
      <text x="720" y="720" fill="#1A1614" font-size="12" opacity="0.65" text-anchor="middle">chargers &amp; lighting.</text>
      <text x="720" y="780" fill="#4F1E7B" font-size="13" font-weight="600" text-anchor="middle">From $99 →</text>
      <!-- Testimonial / stats band -->
      <text x="80" y="880" fill="#1A1614" font-size="14" opacity="0.5">⎯ TRUSTED BY ⎯</text>
      <text x="80" y="918" fill="#1A1614" font-size="22" font-weight="600" font-style="italic">"Saved us $400 on our furnace tune-up. Same-day service."</text>
      <text x="80" y="948" fill="#1A1614" font-size="13" opacity="0.6">— Jen K., Naperville · Verified customer</text>
      <!-- CTA footer -->
      <rect x="80" y="990" width="740" height="150" rx="16" fill="#4F1E7B"/>
      <text x="120" y="1040" fill="#EFE9DC" font-size="22" font-weight="700" font-style="italic">Ready to book?</text>
      <text x="120" y="1070" fill="#EFE9DC" font-size="14" opacity="0.85">No-obligation estimate. Most jobs scheduled within 24 hours.</text>
      <rect x="620" y="1024" width="170" height="48" rx="10" fill="#8B3FD6"/>
      <text x="705" y="1054" fill="#FFFFFF" font-size="14" font-weight="700" text-anchor="middle">Get my estimate</text>
    </svg>`,
  );

// A Director conversation that exercises the chat thread AND the Google Stitch
// in-chat render (the gallery only mounts when a message's previews[0] is a
// Stitch preview — kind:"stitch" or rationale matching /google stitch/i).
const STITCH_CONVERSATION = {
  messages: [
    {
      id: "qa-user-1",
      role: "user",
      content: "Design a landing page for my new home-services brand, Brightline.",
      createdAt: new Date(Date.now() - 60000).toISOString(),
    },
    {
      id: "qa-director-1",
      role: "director",
      content:
        "Here's a first pass from Google Stitch — a clean, conversion-focused landing page in your brand palette. Flip to Live HTML to interact, or Export to hand it to your dev team.",
      createdAt: new Date(Date.now() - 45000).toISOString(),
      model: "opus",
      modelLabel: "Opus",
      previews: [
        {
          conceptId: "qa-stitch-1",
          title: "Brightline — Hero + Services",
          rationale: "Google Stitch concept, desktop-first.",
          kind: "stitch",
          previewDataUrl: STITCH_PREVIEW_SVG,
          htmlDownloadUrl: "/api/director/files/qa-stitch-1.html?inline=1",
          imageDownloadUrl: "/api/director/files/qa-stitch-1.png",
          deviceType: "DESKTOP",
        },
        {
          conceptId: "qa-stitch-2",
          title: "Brightline — Mobile variant",
          rationale: "Google Stitch concept, mobile layout.",
          kind: "stitch",
          previewDataUrl: STITCH_PREVIEW_SVG,
          htmlDownloadUrl: "/api/director/files/qa-stitch-2.html?inline=1",
          deviceType: "MOBILE",
        },
      ],
    },
  ],
  artifacts: [],
  fleet: [],
  featureFlags: { toolExecution: true },
  degraded: false,
};

// Sensible empty defaults so pages don't crash on missing data.
function mockApi(urlPath) {
  if (urlPath.includes("/auth/session")) return { user: MOCK_USER };
  if (urlPath.includes("/nav-counts")) return {};
  // Director chat: return a thread that includes a live Google Stitch render.
  if (urlPath.includes("/director/messages")) return STITCH_CONVERSATION;
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
  const [vw, vh] = (process.env.QA_VIEWPORT || "1440x900").split("x").map(Number);
  const context = await browser.newContext({
    viewport: { width: vw, height: vh },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });

  // Suppress the post-signup onboarding modal so we see the real page layout.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("wireline_post_signup_dismissed", "true");
      localStorage.setItem("wireline_onboarding_celebrated", "true");
      // Force the expanded (labeled) sidebar rail for QA.
      localStorage.setItem("wireline_rail_expanded", "true");
    } catch {
      /* ignore */
    }
  });

  // One handler for every request: fulfill API calls with mocks, let same-origin
  // app assets through, and abort anything off-origin (Google Fonts, analytics)
  // so `networkidle` actually settles in a network-restricted sandbox.
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/")) {
      const u = new URL(url);
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockApi(u.pathname)),
        });
      } catch {
        await route.abort();
      }
      return;
    }
    if (url.startsWith(BASE_URL) || url.startsWith("data:") || url.startsWith("blob:")) {
      await route.continue();
      return;
    }
    await route.abort();
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
        const tg = q('[data-testid="triage-grid"]');
        let tgChain = null;
        if (tg) {
          tgChain = [];
          let el = tg;
          for (let i = 0; i < 6 && el; i++) {
            const b = el.getBoundingClientRect();
            tgChain.push(`${el.tagName}.${(el.className ? el.className.toString().slice(0, 16) : "")}=${Math.round(b.height)}`);
            el = el.parentElement;
          }
        }
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
          tgChain,
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
