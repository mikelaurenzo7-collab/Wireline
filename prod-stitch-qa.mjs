import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseUrl = "https://trywireline.com";
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const email = process.env.QA_EMAIL || `wireline.qa.stitch.${stamp}@example.com`;
const password = process.env.QA_PASSWORD || `WirelineQA${stamp}!`;
const authMode = process.env.QA_EMAIL && process.env.QA_PASSWORD ? "signin" : "signup";
const outDir = "./qa-artifacts/wireline-prod-stitch";
const prompt = [
  "Generate a full mobile landing page design for BrightNest Cleaning, a residential cleaning company in Austin.",
  "Include a premium hero, trust badges, before/after proof section, service cards, testimonials, pricing preview, FAQ, Book a Cleaning CTA, and Call Now CTA.",
  "Use a warm cream, sage, and charcoal visual direction with friendly high-end typography, realistic copy, accessible labels, and production-ready semantic HTML/CSS.",
].join(" ");

await fs.mkdir(outDir, { recursive: true });
const logPath = `${outDir}/prod-stitch-${stamp}.log`;
const appendLog = async (line) => {
  const text = `[${new Date().toISOString()}] ${line}\n`;
  console.log(text.trimEnd());
  await fs.appendFile(logPath, text);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  deviceScaleFactor: 2,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 WirelineQA/1.0",
});
const page = await context.newPage();
page.setDefaultTimeout(60_000);

const apiEvents = [];
page.on("response", async (res) => {
  const url = res.url();
  if (!url.includes("/api/director") && !url.includes("/api/auth")) return;
  const entry = `${res.status()} ${url.replace(baseUrl, "")}`;
  apiEvents.push(entry);
  await appendLog(`response ${entry}`).catch(() => {});
});
page.on("console", (msg) => {
  const text = msg.text();
  if (/director|stitch|error|failed/i.test(text)) {
    void appendLog(`console ${msg.type()}: ${text.slice(0, 400)}`).catch(() => {});
  }
});
page.on("pageerror", (err) => {
  void appendLog(`pageerror ${err.message}`).catch(() => {});
});

try {
  await appendLog(`Starting production Stitch QA at ${baseUrl}`);
  await page.goto(`${baseUrl}/${authMode}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByLabel(/^Email$/).fill(email);
  await page.getByLabel(/^Password$/).fill(password);
  if (authMode === "signup") {
    await page.locator('label:has-text("I agree")').click();
  }
  await page.locator('form button[type="submit"]').click();

  await page.waitForURL(/\/(ops|chat)(?:\?|$)/, { timeout: 120_000 }).catch(async () => {
    await page.waitForResponse(
      (res) => res.url().includes("/api/auth/refresh") && res.status() === 200,
      { timeout: 60_000 },
    );
  });
  const sessionCookie = (await context.cookies(baseUrl)).find((cookie) => {
    return cookie.name === "wireline_session" && cookie.httpOnly;
  });
  if (!sessionCookie) {
    throw new Error("Signup completed but httpOnly wireline_session cookie was not present");
  }
  await appendLog(`${authMode === "signup" ? "Signed up" : "Signed in"} demo account ${email}`);

  await page.goto(`${baseUrl}/chat`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector('[data-testid="director-workspace"]', { timeout: 90_000 });
  await page.waitForSelector('[data-testid="director-composer"]', { timeout: 90_000 });

  const dismissOnboarding = async () => {
    const closeExplore = page.getByRole("button", { name: /close and explore/i });
    if ((await closeExplore.count().catch(() => 0)) > 0) {
      await closeExplore.click({ timeout: 10_000 });
      await appendLog("Dismissed onboarding via close button");
      return;
    }
    const exploreConsole = page.getByRole("button", { name: /explore the console/i });
    if ((await exploreConsole.count().catch(() => 0)) > 0) {
      await exploreConsole.click({ timeout: 10_000 });
      await appendLog("Dismissed onboarding via Explore the console");
    }
  };
  await dismissOnboarding();
  await page.waitForTimeout(1_000);

  await page.screenshot({ path: `${outDir}/01-chat-ready-${stamp}.png`, fullPage: true });
  await appendLog("Chat loaded; sending Stitch render prompt");

  await page.locator('[data-testid="director-composer"]').fill(prompt);
  await page.locator('button[aria-label="Send message"]').click({ timeout: 60_000 });

  const start = Date.now();
  let status = "waiting";
  let previewHref = "";
  let lastText = "";
  for (let i = 0; i < 150; i++) {
    await page.waitForTimeout(10_000);
    const elapsed = Math.round((Date.now() - start) / 1000);
    const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(-2500);
    lastText = bodyText;
    const designReady = /Design ready/i.test(bodyText);
    const pending = /Finishing the render|finishing the HTML preview|Packaging preview|Rendering screen/i.test(
      bodyText,
    );
    const failed = /couldn.t finish this design render|render unavailable|failed|temporarily unavailable/i.test(
      bodyText,
    );
    const teaserCount = await page.locator("text=Design ready").count().catch(() => 0);
    const iframeCount = await page.locator("iframe.wl-stitch-live-iframe").count().catch(() => 0);
    const imgCount = await page.locator(".wl-stitch-device-screen img").count().catch(() => 0);
    const openPreview = page.getByRole("link", { name: /open preview/i }).first();
    const headerPreview = page.getByRole("link", { name: /design preview/i }).first();
    if ((await openPreview.count().catch(() => 0)) > 0) {
      previewHref = (await openPreview.getAttribute("href")) || "";
    } else if ((await headerPreview.count().catch(() => 0)) > 0) {
      previewHref = (await headerPreview.getAttribute("href")) || "";
    }
    await appendLog(
      `poll ${i + 1}: ${elapsed}s designReady=${designReady} pending=${pending} teaser=${teaserCount} iframe=${iframeCount} img=${imgCount} href=${previewHref || "none"}`,
    );
    if (designReady && (previewHref || iframeCount > 0 || imgCount > 0 || teaserCount > 0)) {
      status = "ready";
      break;
    }
    if (failed && !pending) {
      status = "failed";
      break;
    }
  }

  await page.screenshot({ path: `${outDir}/02-chat-result-${stamp}.png`, fullPage: true });

  let previewPageUrl = "";
  if (status === "ready" && previewHref) {
    previewPageUrl = previewHref.startsWith("http") ? previewHref : `${baseUrl}${previewHref}`;
    await appendLog(`Opening preview page ${previewPageUrl}`);
    await page.goto(previewPageUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(8_000);
    await page.screenshot({ path: `${outDir}/03-design-preview-${stamp}.png`, fullPage: true });
  }

  const result = {
    ok: status === "ready",
    status,
    baseUrl,
    email,
    prompt,
    previewPageUrl,
    screenshots: {
      chatReady: `${outDir}/01-chat-ready-${stamp}.png`,
      chatResult: `${outDir}/02-chat-result-${stamp}.png`,
      designPreview: previewPageUrl ? `${outDir}/03-design-preview-${stamp}.png` : null,
    },
    logPath,
    apiEvents,
    lastTextTail: lastText.slice(-1200),
  };
  await fs.writeFile(`${outDir}/result-${stamp}.json`, JSON.stringify(result, null, 2));
  await appendLog(`RESULT ${JSON.stringify(result, null, 2)}`);
  if (!result.ok) process.exitCode = 2;
} catch (err) {
  await page.screenshot({ path: `${outDir}/error-${stamp}.png`, fullPage: true }).catch(() => {});
  await appendLog(`ERROR ${err?.stack || err?.message || String(err)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
