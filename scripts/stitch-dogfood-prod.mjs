#!/usr/bin/env node
/**
 * Production Stitch dogfood — latest deploy, 3–5m copy check, wait for inline render.
 * Usage: node scripts/stitch-dogfood-prod.mjs [--base https://trywireline.com]
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const base = (() => {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : process.env.APP_URL || "https://trywireline.com";
})();
const EMAIL = process.env.DOGFOOD_EMAIL || "wireline.demo@trywireline.com";
const PASSWORD = process.env.DOGFOOD_PASSWORD || "WirelineDemo!2026";
const PROMPT =
  process.env.STITCH_PROMPT ||
  "Design a sleek mobile landing page for Laurenzo Cleaning Company — hero, services, testimonials, book-now CTA. Warm trustworthy palette.";
const WAIT_MS = Number(process.env.STITCH_WAIT_MS || 6 * 60 * 1000);
const OUT = path.join(process.cwd(), "terminals", "dogfood-prod", "stitch");
const SS = path.join(OUT, "screenshots");
[OUT, SS].forEach((d) => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
});

const report = { base, at: new Date().toISOString(), checks: [] };

function note(id, ok, detail) {
  report.checks.push({ id, ok, detail, at: new Date().toISOString() });
  console.log(`${ok ? "✓" : "✗"} ${id}${detail ? ` — ${detail}` : ""}`);
}

async function loginViaApi(context) {
  const r = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  const cookies = r.headers.getSetCookie?.() ?? [];
  const session = cookies.find((c) => c.startsWith("wireline_session="));
  if (!r.ok || !session) throw new Error(`API login failed ${r.status}`);
  const value = session.split(";")[0].split("=")[1];
  await context.addCookies([
    {
      name: "wireline_session",
      value,
      domain: new URL(base).hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

async function bodyText(page) {
  return page.locator("body").innerText();
}

async function main() {
  console.log(`Stitch dogfood @ ${base} (${EMAIL})`);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("wireline_post_signup_dismissed", "true");
      localStorage.setItem("wireline_onboarding_celebrated", "true");
    } catch {
      /* ignore */
    }
  });

  const page = await context.newPage();
  await loginViaApi(context);

  // Hard reload — no ?deploy= pin; bypass cache
  await page.goto(`${base}/chat`, { waitUntil: "commit", timeout: 60_000 });
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 }).catch(() =>
    page.reload({ waitUntil: "commit", timeout: 60_000 }),
  );
  await page.waitForTimeout(2000);

  let text = await bodyText(page);
  if (/2.4 minutes/i.test(text)) {
    note("deploy-copy", false, "still showing 2–4 minutes (stale bundle?)");
  } else if (/3.5 minutes/i.test(text)) {
    note("deploy-copy", true, "3–5 minutes copy visible");
  } else {
    note("deploy-copy", true, "no stitch loader yet (empty state ok)");
  }

  // Verify JS bundle string from fetched assets
  const bundleHas35 = await page.evaluate(async () => {
    const scripts = [...document.querySelectorAll("script[src]")].map((s) => s.src);
    for (const src of scripts.slice(-3)) {
      try {
        const r = await fetch(src, { cache: "no-store" });
        const js = await r.text();
        if (js.includes("3–5 minutes") || js.includes("3-5 minutes")) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  });
  note("bundle-3-5", bundleHas35, bundleHas35 ? "JS chunk contains 3–5 copy" : "3–5 not found in recent chunks");

  await page.screenshot({ path: path.join(SS, "01-after-reload.png"), fullPage: false });

  const clearBtn = page.getByRole("button", { name: /clear/i });
  if (await clearBtn.count()) {
    await clearBtn.first().click().catch(() => {});
    await page.waitForTimeout(2000);
  }

  const composer = page.getByRole("textbox").last();
  await composer.waitFor({ state: "visible", timeout: 20_000 });
  await composer.fill(PROMPT);
  await page.getByRole("button", { name: /send/i }).click();

  await page.waitForTimeout(3000);
  text = await bodyText(page);
  if (/2.4 minutes/i.test(text)) {
    note("loader-copy", false, "loader shows 2–4 not 3–5");
  } else if (/3.5 minutes/i.test(text)) {
    note("loader-copy", true, "loader shows 3–5");
  }
  await page.screenshot({ path: path.join(SS, "02-stitch-started.png"), fullPage: false });

  const t0 = Date.now();
  let renderOk = false;
  let lastPhase = "";
  while (Date.now() - t0 < WAIT_MS) {
    await page.waitForTimeout(15_000);
    text = await bodyText(page);
    const elapsed = Math.round((Date.now() - t0) / 1000);

    const hasDevice =
      (await page.locator(".wl-stitch-device, .wl-stitch-gallery").count()) > 0;
    const hasScreenshotTab = /Screenshot/i.test(text) && /Wireline Design/i.test(text);
    const hasLiveHtml = /Live HTML/i.test(text);
    const hasImg = (await page.locator(".wl-stitch-device-screen img, .wl-stitch-gallery img").count()) > 0;
    const hasIframe = (await page.locator(".wl-stitch-device-screen iframe").count()) > 0;
    const assetsPending = /assets pending/i.test(text);
    const stitchFail = /couldn't finish|couldn't complete/i.test(text);
    const sendFail = /Couldn't send|Stream interrupted/i.test(text);

    const phase =
      text.match(/Composing|Generating|Packaging|Wireline Design/i)?.[0] || "waiting";
    if (phase !== lastPhase) {
      console.log(`  … ${elapsed}s — ${phase}`);
      lastPhase = phase;
    }

    if (sendFail) {
      note("stitch-render", false, `send error at ${elapsed}s`);
      break;
    }
    if (stitchFail) {
      note("stitch-render", false, `stitch fail copy at ${elapsed}s`);
      await page.screenshot({ path: path.join(SS, "03-stitch-fail.png"), fullPage: true });
      break;
    }
    if (hasDevice && (hasImg || hasIframe || hasScreenshotTab || hasLiveHtml)) {
      renderOk = true;
      note("stitch-render", true, `inline render at ${elapsed}s`);
      await page.screenshot({ path: path.join(SS, "04-stitch-success.png"), fullPage: true });
      break;
    }
    if (assetsPending && elapsed > 120) {
      console.log(`  ! assets pending at ${elapsed}s (no device frame yet)`);
    }
    if (elapsed % 60 < 20) {
      await page.screenshot({
        path: path.join(SS, `progress-${elapsed}s.png`),
        fullPage: false,
      });
    }
  }

  if (!renderOk && !report.checks.some((c) => c.id === "stitch-render" && !c.ok)) {
    note("stitch-render", false, `no inline render within ${WAIT_MS / 1000}s`);
    await page.screenshot({ path: path.join(SS, "05-timeout.png"), fullPage: true });
  }

  text = await bodyText(page);
  report.finalSnippet = text.slice(0, 2000);
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Report: ${path.join(OUT, "report.json")}`);
  await browser.close();
  process.exit(renderOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
