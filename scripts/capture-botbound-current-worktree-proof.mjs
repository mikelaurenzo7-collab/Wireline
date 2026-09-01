/* global document, window */

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright";

import { chromiumLaunchOptions } from "./lib/resolve-preinstalled-chromium.mjs";

const baseUrl = (process.env.BOTBOUND_CAPTURE_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const outputDir = path.resolve(
  process.env.BOTBOUND_CAPTURE_OUTPUT_DIR ??
    "brand-work/launch-2026-09/exports/product-proof",
);

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", windowsHide: true }).trim();

const revision = {
  commit: git(["rev-parse", "HEAD"]),
  branch: git(["branch", "--show-current"]),
  dirty: Boolean(git(["status", "--porcelain"])),
};

const captures = [
  {
    name: "01-home-desktop-1600x1000",
    route: "/",
    width: 1600,
    height: 1000,
    expectedText: "PUT YOUR BOT ON THE LINE",
  },
  {
    name: "02-home-mobile-hero-430x630",
    route: "/",
    width: 430,
    height: 932,
    clipHeight: 630,
    mobile: true,
    expectedText: "PUT YOUR BOT ON THE LINE",
  },
  {
    name: "03-features-desktop-1600x1000",
    route: "/features",
    width: 1600,
    height: 1000,
    expectedText: "THEY CALL. YOUR BOT ANSWERS",
  },
  {
    name: "04-features-mobile-430x932",
    route: "/features",
    width: 430,
    height: 932,
    mobile: true,
    expectedText: "THEY CALL. YOUR BOT ANSWERS",
  },
  {
    name: "05-pricing-desktop-1600x1000",
    route: "/pricing",
    width: 1600,
    height: 1000,
    expectedText: "START FREE. GO LIVE FROM $19.",
  },
  {
    name: "06-pricing-mobile-430x932",
    route: "/pricing",
    width: 430,
    height: 932,
    mobile: true,
    expectedText: "START FREE. GO LIVE FROM $19.",
  },
  {
    name: "07-signin-desktop-1600x1000",
    route: "/signin",
    width: 1600,
    height: 1000,
    expectedText: "CREATE ACCOUNT",
  },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  ...chromiumLaunchOptions(),
  headless: true,
});

const results = [];

try {
  for (const capture of captures) {
    const page = await browser.newPage({
      viewport: { width: capture.width, height: capture.height },
      deviceScaleFactor: 2,
      colorScheme: "dark",
      reducedMotion: "reduce",
      isMobile: Boolean(capture.mobile),
      hasTouch: Boolean(capture.mobile),
    });
    const pageErrors = [];
    const consoleErrors = [];
    const failedRequests = [];
    const expectedAbortedRequests = [];

    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      const failure = {
        url: request.url(),
        error: request.failure()?.errorText ?? "unknown",
      };
      // React StrictMode tears down the first provider-availability effect and
      // aborts its fetch before issuing the settled request. It is intentional,
      // invisible, and not a network defect in the captured route.
      if (
        failure.url.endsWith("/api/auth/providers") &&
        failure.error === "net::ERR_ABORTED"
      ) {
        expectedAbortedRequests.push(failure);
        return;
      }
      failedRequests.push(failure);
    });

    const requestedUrl = `${baseUrl}${capture.route}`;
    const response = await page.goto(requestedUrl, {
      // Vite keeps its HMR socket open; waiting for networkidle would falsely
      // treat a healthy source preview as a hung page.
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (!response || response.status() >= 400) {
      throw new Error(
        `Capture failed for ${requestedUrl}: HTTP ${response?.status() ?? "no response"}`,
      );
    }

    await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });
    // The initial shell uses an H1 reading "Loading" while route chunks and
    // auth state initialize. A capture is usable only after the real route H1
    // replaces that shell; this is the hard guard against blank/loading proof.
    await page
      .locator("h1")
      .filter({ hasNotText: /^loading$/i })
      .first()
      .waitFor({ state: "visible", timeout: 60_000 });
    await page.evaluate(async () => {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 5_000)),
      ]);
      window.scrollTo(0, 0);
    });
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0.001ms !important;
          animation-delay: 0ms !important;
          transition-duration: 0.001ms !important;
          caret-color: transparent !important;
        }
        [data-vite-dev-id], vite-error-overlay { display: none !important; }
      `,
    });
    await page.waitForTimeout(250);

    const outputPath = path.join(outputDir, `${capture.name}-exact-worktree-preview.png`);
    await page.screenshot({
      path: outputPath,
      fullPage: false,
      animations: "disabled",
      ...(capture.clipHeight
        ? {
            clip: {
              x: 0,
              y: 0,
              width: capture.width,
              height: capture.clipHeight,
            },
          }
        : {}),
    });

    const metrics = await page.evaluate(() => ({
      bodyHorizontalOverflow: document.body.scrollWidth - document.body.clientWidth,
      rootHorizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? null,
    }));

    results.push({
      ...capture,
      requestedUrl,
      finalUrl: page.url(),
      output: path.relative(process.cwd(), outputPath).replaceAll("\\", "/"),
      status: response.status(),
      ...metrics,
      pageErrors,
      consoleErrors,
      failedRequests,
      expectedAbortedRequests,
    });

    await page.close();
  }
} finally {
  await browser.close();
}

const manifest = {
  label: "EXACT WORKTREE PREVIEW — NOT DEPLOYED PRODUCTION",
  exactWorktreePreview: true,
  deployedProduction: false,
  capturedAt: new Date().toISOString(),
  baseUrl,
  captureRuntime: "Vite source preview",
  revision,
  results,
};

await writeFile(
  path.join(outputDir, "botbound-current-worktree-proof.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

await writeFile(
  path.join(outputDir, "README.md"),
  `# BotBound exact-worktree product proof\n\n` +
    `**Status:** EXACT WORKTREE PREVIEW — NOT DEPLOYED PRODUCTION\n\n` +
    `Captured from \`${revision.branch}\` at \`${revision.commit}\` on ${manifest.capturedAt}. ` +
    `The working tree was ${revision.dirty ? "dirty (the active launch work in progress)" : "clean"}.\n\n` +
    `The Home, Features, Pricing, and Sign in images are public-surface proof. ` +
    `The mobile Home proof is intentionally cropped to the complete hero and demo card, before the account form begins. ` +
    `Authenticated Studio proof is intentionally omitted because this source-only preview has no production credentials. ` +
    `Do not substitute archived August 2026 captures for this set.\n\n` +
    `The local \`_rejected/\` quarantine contains superseded loading or partial-form frames. ` +
    `It is not part of the release set and must not be uploaded or published.\n`,
);

const hardFailures = results.filter(
  (result) =>
    result.pageErrors.length > 0 ||
    result.rootHorizontalOverflow > 2 ||
    result.bodyHorizontalOverflow > 2,
);

if (hardFailures.length > 0) {
  throw new Error(
    `Current-worktree proof detected defects in: ${hardFailures
      .map((failure) => failure.name)
      .join(", ")}`,
  );
}

console.log(`Captured ${results.length} exact-worktree previews in ${outputDir}`);
