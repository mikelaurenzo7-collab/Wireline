/* global document, window */

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { chromiumLaunchOptions } from "./lib/resolve-preinstalled-chromium.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.BOTBOUND_CAPTURE_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const outputDir = path.resolve(
  repositoryRoot,
  process.env.BOTBOUND_CAPTURE_OUTPUT_DIR ?? "brand-work/launch-2026-09/exports/product-proof",
);

const git = (args) =>
  execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  }).trim();

const revision = {
  commit: git(["rev-parse", "HEAD"]),
  branch: git(["branch", "--show-current"]),
  dirty: Boolean(git(["status", "--porcelain"])),
};
const identityPath = path.join(repositoryRoot, ".botbound-proof-source-identity.json");
const proofManifestPath = path.join(outputDir, "botbound-current-worktree-proof.json");
const proofReadmePath = path.join(outputDir, "README.md");
const proofContactSheetPath = path.join(
  outputDir,
  "botbound-exact-worktree-proof-contact-sheet-1920x1400.png",
);

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
    expectedText: "IT CALLS OUT. IT ANSWERS IN.",
  },
  {
    name: "04-features-mobile-430x932",
    route: "/features",
    width: 430,
    height: 932,
    mobile: true,
    expectedText: "IT CALLS OUT. IT ANSWERS IN.",
  },
  {
    name: "05-pricing-desktop-1600x1000",
    route: "/pricing",
    width: 1600,
    height: 1000,
    expectedText: "BUILD FREE. PLANS FROM $19.",
  },
  {
    name: "06-pricing-mobile-430x932",
    route: "/pricing",
    width: 430,
    height: 932,
    mobile: true,
    expectedText: "BUILD FREE. PLANS FROM $19.",
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
const existingProofFrames = (await readdir(outputDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith("-exact-worktree-preview.png"))
  .map((entry) => path.join(outputDir, entry.name));
await Promise.all(
  [proofManifestPath, proofReadmePath, proofContactSheetPath, ...existingProofFrames].map(
    (ownedPath) => rm(ownedPath, { force: true }),
  ),
);
const stagingParent = path.join(outputDir, "_rejected");
await mkdir(stagingParent, { recursive: true });
const stagingDir = await mkdtemp(path.join(stagingParent, ".botbound-proof-staging-"));
const stagedManifestPath = path.join(stagingDir, path.basename(proofManifestPath));
const stagedReadmePath = path.join(stagingDir, path.basename(proofReadmePath));

let sourceIdentity;
try {
  const expectedSourceIdentity = { commit: revision.commit, nonce: randomUUID() };
  await writeFile(identityPath, `${JSON.stringify(expectedSourceIdentity)}\n`, "utf8");
  try {
    const identityResponse = await fetch(
      `${baseUrl}/__botbound_proof_identity?nonce=${encodeURIComponent(expectedSourceIdentity.nonce)}`,
      { headers: { "Cache-Control": "no-store" } },
    );
    if (!identityResponse.ok) {
      throw new Error(
        `Source preview identity endpoint returned HTTP ${identityResponse.status}. Start Vite with scripts/vite-product-proof.config.ts.`,
      );
    }
    sourceIdentity = await identityResponse.json();
    if (
      sourceIdentity?.commit !== expectedSourceIdentity.commit ||
      sourceIdentity?.nonce !== expectedSourceIdentity.nonce
    ) {
      throw new Error("Capture server is not serving this exact BotBound worktree and proof run.");
    }
  } finally {
    await rm(identityPath, { force: true });
  }

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
        if (failure.url.endsWith("/api/auth/providers") && failure.error === "net::ERR_ABORTED") {
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
      await page.waitForFunction(
        (expectedText) => document.body.innerText.includes(expectedText),
        capture.expectedText,
        { timeout: 30_000 },
      );
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

      const outputFilename = `${capture.name}-exact-worktree-preview.png`;
      const outputPath = path.join(stagingDir, outputFilename);
      const finalOutputPath = path.join(outputDir, outputFilename);
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
      const outputBytes = await readFile(outputPath);

      const metrics = await page.evaluate(
        (expectedText) => ({
          bodyHorizontalOverflow: document.body.scrollWidth - document.body.clientWidth,
          rootHorizontalOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          title: document.title,
          heading: document.querySelector("h1")?.textContent?.trim() ?? null,
          rootMounted: Boolean(document.getElementById("root")?.childElementCount),
          expectedTextMatched: document.body.innerText.includes(expectedText),
        }),
        capture.expectedText,
      );
      const final = new URL(page.url());
      const expected = new URL(capture.route, `${baseUrl}/`);
      const finalRouteMatched =
        final.origin === expected.origin &&
        final.pathname === expected.pathname &&
        final.search === expected.search &&
        final.hash === expected.hash;

      results.push({
        ...capture,
        requestedUrl,
        finalUrl: page.url(),
        finalRouteMatched,
        output: path.relative(repositoryRoot, finalOutputPath).replaceAll("\\", "/"),
        bytes: outputBytes.byteLength,
        sha256: createHash("sha256").update(outputBytes).digest("hex"),
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
    sourceIdentity,
    results,
  };

  const hardFailures = results.filter(
    (result) =>
      result.pageErrors.length > 0 ||
      result.consoleErrors.length > 0 ||
      result.failedRequests.length > 0 ||
      !result.rootMounted ||
      !result.expectedTextMatched ||
      !result.finalRouteMatched ||
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

  await writeFile(stagedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    stagedReadmePath,
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

  for (const capture of captures) {
    const filename = `${capture.name}-exact-worktree-preview.png`;
    await rename(path.join(stagingDir, filename), path.join(outputDir, filename));
  }
  await rename(stagedReadmePath, proofReadmePath);
  // The manifest is the approval marker and must be the final published file.
  await rename(stagedManifestPath, proofManifestPath);

  console.log(`Captured ${results.length} exact-worktree previews in ${outputDir}`);
} finally {
  await rm(stagingDir, { recursive: true, force: true });
}
