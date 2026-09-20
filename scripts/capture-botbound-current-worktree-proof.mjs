/* global document, window */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { chromiumLaunchOptions } from "./lib/resolve-preinstalled-chromium.mjs";
import {
  acquireProductProofLock,
  assertContainedPath,
  assertProofOutputDirectory,
  assertProductProofManifest,
  publishProofFiles,
} from "./lib/product-proof-files.mjs";
import { renderProductProofContactSheet } from "./lib/product-proof-contact-sheet.mjs";
import { readProductProofSource } from "./lib/product-proof-source.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.BOTBOUND_CAPTURE_BASE_URL ?? "http://127.0.0.1:3002").replace(
  /\/$/,
  "",
);
const outputDir = path.resolve(
  repositoryRoot,
  process.env.BOTBOUND_CAPTURE_OUTPUT_DIR ?? "brand-work/launch-2026-09/exports/product-proof",
);

const { revision, sourceSnapshot } = readProductProofSource(repositoryRoot);
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
    expectedText: "BOTS THAT CALL, TEXT & EMAIL",
  },
  {
    name: "04-features-mobile-430x932",
    route: "/features",
    width: 430,
    height: 932,
    mobile: true,
    expectedText: "BOTS THAT CALL, TEXT & EMAIL",
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
    expectedText: "SIGN IN",
  },
];

assertProofOutputDirectory(repositoryRoot, outputDir);
await mkdir(outputDir, { recursive: true });
const existingProofFrames = (await readdir(outputDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith("-exact-worktree-preview.png"))
  .map((entry) => entry.name);
const stagingParent = path.join(outputDir, "_rejected");
await mkdir(stagingParent, { recursive: true });
assertContainedPath(await realpath(outputDir), await realpath(stagingParent));
const stagingDir = await mkdtemp(path.join(stagingParent, ".botbound-proof-staging-"));
const stagedManifestPath = path.join(stagingDir, path.basename(proofManifestPath));
const stagedReadmePath = path.join(stagingDir, path.basename(proofReadmePath));

let sourceIdentity;
let releaseProofLock;
try {
  const expectedSourceIdentity = { commit: revision.commit, nonce: randomUUID() };
  releaseProofLock = acquireProductProofLock(repositoryRoot, expectedSourceIdentity);
  {
    const identityResponse = await fetch(
      `${baseUrl}/__botbound_proof_identity?nonce=${encodeURIComponent(expectedSourceIdentity.nonce)}`,
      { headers: { "Cache-Control": "no-store" }, signal: AbortSignal.timeout(10_000) },
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
  }
  const apiResponse = await fetch(`${baseUrl}/api/__botbound_proof_status`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!apiResponse.ok) throw new Error("Start the credential-free proof API stub before capture.");
  const apiEvidence = await apiResponse.json();
  if (
    apiEvidence.mode !== "credential-free-simulated-api" ||
    apiEvidence.checkout_available !== false
  ) {
    throw new Error("Product proof requires the explicitly simulated, activation-paused API.");
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
        if (
          ["/api/auth/providers", "/api/billing/plans"].some((route) =>
            failure.url.endsWith(route),
          ) &&
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
      await page.waitForFunction(
        (expectedText) =>
          document
            .querySelector("h1")
            ?.innerText.replace(/\s+/g, " ")
            .trim()
            .toUpperCase()
            .includes(expectedText),
        capture.expectedText,
        { timeout: 30_000 },
      );
      if (capture.route === "/pricing") {
        await page
          .getByText("Build free. Paid activation is currently unavailable.", { exact: true })
          .waitFor({ state: "visible", timeout: 15_000 });
      }
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
          expectedTextMatched: Boolean(
            document
              .querySelector("h1")
              ?.innerText.replace(/\s+/g, " ")
              .trim()
              .toUpperCase()
              .includes(expectedText),
          ),
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
    sourceSnapshot,
    apiEvidence,
    humanVisualReview: "required",
    publicationApproval: "not-assessed",
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

  const sourceAfterCapture = readProductProofSource(repositoryRoot);
  if (sourceAfterCapture.sourceSnapshot.sha256 !== sourceSnapshot.sha256) {
    throw new Error(
      "Public source changed during capture. The preceding proof batch is preserved; capture again after edits finish.",
    );
  }
  assertProductProofManifest(manifest);
  const rendered = renderProductProofContactSheet(repositoryRoot, stagingDir, manifest);
  await writeFile(path.join(stagingDir, rendered.contactSheet.file), rendered.png);
  manifest.contactSheet = rendered.contactSheet;
  await writeFile(stagedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    stagedReadmePath,
    `# BotBound exact-worktree product proof\n\n` +
      `**Status:** EXACT WORKTREE PREVIEW — NOT DEPLOYED PRODUCTION\n\n` +
      `Captured from \`${revision.branch}\` at \`${revision.commit}\` on ${manifest.capturedAt}. ` +
      `The working tree was ${revision.dirty ? "dirty (the active launch work in progress)" : "clean"}.\n\n` +
      `The Home, Features, Pricing, and Sign in images are public-surface proof. ` +
      `The mobile Home image is a 430 × 630 hero crop, not a full-page record. ` +
      `Auth and billing availability use a credential-free simulated API with paid activation paused; this does not verify sign-in, checkout, vendor balances, or live calling. ` +
      `Authenticated Studio proof is intentionally omitted because this source-only preview has no production credentials. ` +
      `Do not substitute archived August 2026 captures for this set.\n\n` +
      `The local \`_history/\` directory preserves preceding proof batches. The \`_rejected/\` quarantine holds historical rejected frames and temporary capture staging. ` +
      `It is not part of the release set and must not be uploaded or published.\n`,
  );

  publishProofFiles({
    outputDir,
    stagingDir,
    fileNames: [
      ...captures.map((capture) => `${capture.name}-exact-worktree-preview.png`),
      path.basename(proofReadmePath),
      path.basename(proofContactSheetPath),
      path.basename(proofManifestPath),
    ],
    retiredNames: existingProofFrames,
  });

  console.log(`Captured ${results.length} exact-worktree previews in ${outputDir}`);
} finally {
  releaseProofLock?.();
  assertContainedPath(await realpath(outputDir), await realpath(stagingDir));
  await rm(stagingDir, { recursive: true, force: true });
}
