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
const WAIT_MS = Number(process.env.STITCH_WAIT_MS || 8 * 60 * 1000);
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
    await page.waitForTimeout(2500);
    for (let i = 0; i < 8; i++) {
      const body = await bodyText(page);
      if (!/DIRECTOR/i.test(body) || /Orchestrate your fleet/i.test(body)) break;
      await page.waitForTimeout(1500);
    }
  }

  const composer = page.getByRole("textbox").last();
  await composer.waitFor({ state: "visible", timeout: 20_000 });
  await composer.fill(PROMPT);
  const sentAt = Date.now();
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
  let previewOk = false;
  let lastPhase = "";
  while (Date.now() - t0 < WAIT_MS) {
    await page.waitForTimeout(15_000);
    text = await bodyText(page);
    const elapsed = Math.round((Date.now() - t0) / 1000);

    const hasTeaser = /Design ready/i.test(text) && /Open preview/i.test(text);
    const hasDevice =
      (await page.locator(".wl-stitch-device, .wl-stitch-gallery, .wl-stitch-preview-teaser").count()) > 0;
    const hasScreenshotTab = /Screenshot/i.test(text) && /Wireline Design/i.test(text);
    const hasLiveHtml = /Live HTML/i.test(text);
    const hasImg = (await page.locator(".wl-stitch-device-screen img, .wl-stitch-gallery img").count()) > 0;
    const hasIframe = (await page.locator(".wl-stitch-device-screen iframe, .wl-stitch-live-iframe").count()) > 0;
    const assetsPending = /finishing the HTML preview|assets pending|Packaging preview/i.test(text);
    const working = /Director is working|Rendering screen|Composing layout|WIRELINE DESIGN/i.test(
      text,
    );
    const stitchClarify =
      !working &&
      elapsed > 10 &&
      /Gathering design requirements|Before I generate screens/i.test(text);
    if (stitchClarify && elapsed > 20) {
      note("stitch-clarify", false, `stuck on clarify gate at ${elapsed}s — brief inference bug`);
      await page.screenshot({ path: path.join(SS, "03-stitch-clarify-blocked.png"), fullPage: true });
      break;
    }
    const stitchFail =
      !working &&
      elapsed > 30 &&
      (/couldn't finish|couldn't complete|live render unavailable/i.test(text) &&
        !assetsPending);
    const sendFail = /Couldn't send|Stream interrupted/i.test(text);

    const phase =
      text.match(/Composing|Generating|Packaging|Wireline Design|Design ready|finishing/i)?.[0] ||
      "waiting";
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
    if (hasTeaser || (hasDevice && (hasImg || hasIframe || hasScreenshotTab || hasLiveHtml))) {
      renderOk = true;
      note("stitch-render", true, `thread teaser/render at ${elapsed}s`);
      await page.screenshot({ path: path.join(SS, "04-stitch-success.png"), fullPage: true });
      break;
    }
    if (assetsPending && elapsed > 60) {
      console.log(`  … ${elapsed}s — packaging/finalize in progress`);
    }
    if (elapsed % 60 < 20) {
      await page.screenshot({
        path: path.join(SS, `progress-${elapsed}s.png`),
        fullPage: false,
      });
    }
  }

  if (renderOk) {
    const openPreview = page.getByRole("link", { name: /Open preview/i }).or(
      page.getByRole("button", { name: /Open preview/i }),
    );
    if (await openPreview.count()) {
      await openPreview.first().click();
      await page.waitForURL(/\/design\/preview/, { timeout: 30_000 }).catch(() => {});
    } else {
      await page.goto(`${base}/design/preview`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() =>
        page.goto(`${base}/design/preview`, { waitUntil: "commit", timeout: 60_000 }),
      );
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SS, "stitch-preview-page.png"), fullPage: false });

    const previewText = await bodyText(page);
    const hasPreviewStudio = (await page.locator(".wl-stitch-studio").count()) > 0;
    const hasLiveIframe = (await page.locator(".wl-stitch-live-iframe").count()) > 0;
    previewOk =
      hasPreviewStudio &&
      (hasLiveIframe || /Live HTML/i.test(previewText)) &&
      !/drafting HTML prototype/i.test(previewText);
    note(
      "preview-page",
      previewOk,
      previewOk
        ? "full-screen preview with live HTML"
        : `studio=${hasPreviewStudio} iframe=${hasLiveIframe}`,
    );
    if (previewOk) {
      await page.screenshot({ path: path.join(SS, "stitch-render-success.png"), fullPage: true });
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
  process.exit(renderOk && previewOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
