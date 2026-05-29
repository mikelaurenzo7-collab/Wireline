/**
 * Wireline visual QA driver.
 *
 * Usage (from repo root):
 *   PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers node .claude/skills/run-wireline/driver.mjs [--auth] [--url=<base>]
 *
 * Options:
 *   --auth          Include authenticated pages (agent chat, fleet, etc.)
 *                   Requires BASE_URL to be the Vercel preview URL.
 *   --url=<url>     Override base URL (default: http://localhost:4173)
 *   --out=<dir>     Screenshot output dir (default: ./screenshots)
 */
import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import { join, resolve } from "path";
import { createRequire } from "module";

const args = process.argv.slice(2);
const doAuth = args.includes("--auth");
const urlArg = args.find((a) => a.startsWith("--url="))?.slice(6);
const outArg = args.find((a) => a.startsWith("--out="))?.slice(6);

const BASE = urlArg || process.env.BASE_URL || "http://localhost:4173";
const OUTDIR = outArg || "./screenshots";

// QA session is the single source of truth in tests/helpers/wireline-auth.ts.
// We load it at runtime via a small inline require so the token lives in one
// place and GitGuardian never sees a duplicate hardcoded secret here.
const authHelperPath = resolve("tests/helpers/wireline-auth.ts");
let QA_SESSION;
try {
  const require = createRequire(import.meta.url);
  // tsx registers .ts → ts-node resolution; fall back to a plain JSON stub
  // if the helper can't be loaded (e.g., in a stripped dist tree).
  QA_SESSION = require(authHelperPath).QA_SESSION;
} catch {
  // If the TS helper isn't loadable, prompt the caller to set env vars.
  if (!process.env.QA_ACCESS_TOKEN) {
    console.error(
      "Cannot load QA_SESSION from tests/helpers/wireline-auth.ts.\n" +
        "Set QA_ACCESS_TOKEN and QA_USER_ID env vars to use --auth mode.",
    );
    process.exit(1);
  }
  QA_SESSION = {
    access_token: process.env.QA_ACCESS_TOKEN,
    user: { id: process.env.QA_USER_ID || "", email: process.env.QA_USER_EMAIL || "" },
  };
}

const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-certificate-errors"];

async function snap(page, name) {
  await page.waitForTimeout(1500);
  const out = join(OUTDIR, `${name}.png`);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`✓ ${name}.png`);
  return out;
}

async function withAuth(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, ignoreHTTPSErrors: true });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => localStorage.setItem("wireline_session", JSON.stringify(s)), QA_SESSION);
  await page.reload({ waitUntil: "domcontentloaded" });
  return page;
}

await mkdir(OUTDIR, { recursive: true });

const browser = await chromium.launch({ args: LAUNCH_ARGS });

// ── Public pages ──────────────────────────────────────────────────────────────
const PUBLIC = [
  { path: "/",        suffix: "landing-desktop", w: 1280, h: 900  },
  { path: "/",        suffix: "landing-mobile",  w: 390,  h: 844  },
  { path: "/pricing", suffix: "pricing-desktop", w: 1280, h: 900  },
  { path: "/showcase",suffix: "showcase-desktop",w: 1280, h: 900  },
];

for (const { path, suffix, w, h } of PUBLIC) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true });
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
  await snap(page, suffix);

  // Landing: also scroll to the live-now section
  if (path === "/" && w === 1280) {
    await page.evaluate(() => window.scrollBy(0, 700));
    await snap(page, "landing-desktop-live-section");
  }
  await page.close();
}

// ── Authenticated pages (Vercel preview only) ─────────────────────────────────
if (doAuth) {
  const AUTH_ROUTES = [
    { path: "/chat",      suffix: "chat-desktop", w: 1280, h: 900  },
    { path: "/chat",      suffix: "chat-mobile",  w: 390,  h: 844  },
    { path: "/agents",    suffix: "agents-desktop",w: 1280, h: 900  },
    { path: "/phone",     suffix: "phone-desktop", w: 1280, h: 900  },
    { path: "/training",  suffix: "training-desktop",w:1280,h: 900  },
  ];

  for (const { path, suffix, w, h } of AUTH_ROUTES) {
    const page = await withAuth(browser, w, h);
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    // Dismiss onboarding welcome modal if present
    const closeBtn = page.locator('[aria-label="Close"], button:has-text("×"), [data-modal-close]').first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
    await snap(page, suffix);
    await page.close();
  }
}

await browser.close();
console.log(`\nAll screenshots written to ${OUTDIR}/`);
