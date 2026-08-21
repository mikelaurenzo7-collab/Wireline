import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_PRODUCTION_URL } from "./lib/production-url.mjs";
import {
  assertCleanCheckout,
  normalizeBaseURL,
  resolveSourceCommit,
  resolveSourceRef,
  verifyRemoteSourceCommit,
} from "./lib/release-source-verification.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputRoot = path.join(repoRoot, "marketing-kit");
const manifestPath = path.join(outputRoot, "manifest.json");

const AUTHENTICATED_SCREENSHOT_IDS = new Set([
  "overview",
  "studio",
  "connections",
  "phone-logs",
  "phone-outbound",
  "insights",
  "apps",
  "billing",
]);

async function verifyCaptureOrigins(sourceCommit) {
  const configuredBaseURL = normalizeBaseURL(process.env.E2E_BASE_URL || CANONICAL_PRODUCTION_URL);
  // `marketing-kit.mjs` takes authenticated/video captures from E2E_BASE_URL
  // and the public screenshot set from the canonical production origin. The
  // set remains explicit so any future split must prove the same source commit.
  const origins = [...new Set([configuredBaseURL, CANONICAL_PRODUCTION_URL])];
  const verified = [];
  for (const origin of origins) {
    verified.push(await verifyRemoteSourceCommit(sourceCommit, origin));
  }
  return { baseURL: configuredBaseURL, verified };
}

function fileDigest(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function resolveAssetPath(asset) {
  if (!asset || typeof asset.path !== "string" || !asset.path.trim()) {
    throw new Error("Marketing-kit manifest contains an asset without a path.");
  }
  const resolved = path.resolve(repoRoot, asset.path);
  const relativeToOutput = path.relative(outputRoot, resolved);
  if (relativeToOutput.startsWith("..") || path.isAbsolute(relativeToOutput)) {
    throw new Error(`Marketing-kit asset escapes marketing-kit/: ${asset.path}`);
  }
  return resolved;
}

function certifyManifest(manifest, sourceCommit, sourceRef, sourceVerification) {
  const mode = String(manifest?.mode || "");
  if (mode !== "production-session") {
    throw new Error(
      `Launch-reel certification requires a production-session capture; received ${mode || "unknown"}. ` +
        "local-mock captures are layout/test fixtures only and must never produce a publishable release record.",
    );
  }

  const manifestBaseURL = normalizeBaseURL(manifest?.baseURL || "");
  if (manifestBaseURL !== sourceVerification.baseURL) {
    throw new Error(
      `Launch-reel capture URL changed during certification: verified ${sourceVerification.baseURL}, captured ${manifestBaseURL}.`,
    );
  }

  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  if (!assets.length) throw new Error("Marketing-kit manifest contains no assets.");

  const missing = assets
    .map((asset) => ({ asset, filePath: resolveAssetPath(asset) }))
    .filter(({ filePath }) => !existsSync(filePath));
  if (missing.length) {
    throw new Error(
      `Marketing-kit manifest references missing files:\n${missing
        .map(({ asset }) => `- ${asset.path}`)
        .join("\n")}`,
    );
  }

  const videos = assets.filter((asset) => asset?.type === "video");
  if (videos.length !== 3) {
    throw new Error(`Expected exactly 3 launch-reel captures; found ${videos.length}.`);
  }

  const videoRecords = videos.map((asset) => {
    const filePath = resolveAssetPath(asset);
    const sizeBytes = statSync(filePath).size;
    if (sizeBytes < 100_000) {
      throw new Error(
        `Launch-reel capture is implausibly small (${sizeBytes} bytes): ${asset.path}`,
      );
    }
    return {
      id: asset.id,
      path: asset.path,
      sizeBytes,
      sha256: fileDigest(filePath),
    };
  });

  const screenshots = assets.filter(
    (asset) => asset?.type === "screenshot" && AUTHENTICATED_SCREENSHOT_IDS.has(String(asset.id)),
  );
  const byLayout = new Map();
  for (const asset of screenshots) {
    const layout = String(asset.layout || "unknown");
    const records = byLayout.get(layout) || [];
    records.push({
      id: String(asset.id),
      path: asset.path,
      sizeBytes: statSync(resolveAssetPath(asset)).size,
      sha256: fileDigest(resolveAssetPath(asset)),
    });
    byLayout.set(layout, records);
  }

  const screenshotCertification = [];
  for (const [layout, records] of byLayout) {
    if (records.length !== AUTHENTICATED_SCREENSHOT_IDS.size) {
      throw new Error(
        `Authenticated ${layout} capture is incomplete: expected ${AUTHENTICATED_SCREENSHOT_IDS.size} routes, found ${records.length}.`,
      );
    }

    const hashOwners = new Map();
    for (const record of records) {
      const owners = hashOwners.get(record.sha256) || [];
      owners.push(record.id);
      hashOwners.set(record.sha256, owners);
    }
    const duplicates = [...hashOwners.values()].filter((owners) => owners.length > 1);
    if (duplicates.length) {
      throw new Error(
        `Authenticated ${layout} capture contains byte-identical routes:\n${duplicates
          .map((owners) => `- ${owners.join(", ")}`)
          .join(
            "\n",
          )}\nThis usually means the capture filmed an auth wall, redirect, or shared error screen instead of the product.`,
      );
    }

    screenshotCertification.push({
      layout,
      routes: records.length,
      uniqueFrames: hashOwners.size,
      frames: records,
    });
  }

  if (screenshotCertification.length !== 3) {
    throw new Error(
      `Expected authenticated screenshot certification for desktop, mobile, and reel layouts; found ${screenshotCertification.length}.`,
    );
  }

  return {
    ...manifest,
    sourceCommit,
    sourceRef,
    captureCertification: {
      certifiedAt: new Date().toISOString(),
      publishable: true,
      mode,
      sourceVerification,
      authenticatedScreenshots: screenshotCertification,
      videos: videoRecords,
    },
  };
}

function combineSourceVerification(sourceCommit, beforeCapture, afterCapture) {
  if (beforeCapture.baseURL !== afterCapture.baseURL) {
    throw new Error(
      `Launch-reel source URL changed during capture: started at ${beforeCapture.baseURL}, ended at ${afterCapture.baseURL}.`,
    );
  }
  const afterByURL = new Map(afterCapture.verified.map((item) => [item.baseURL, item]));
  const origins = beforeCapture.verified.map((before) => {
    const after = afterByURL.get(before.baseURL);
    if (!after) {
      throw new Error(`Launch-reel source origin disappeared during capture: ${before.baseURL}.`);
    }
    return {
      baseURL: before.baseURL,
      deployedCommit: sourceCommit,
      verifiedBeforeCaptureAt: before.verifiedAt,
      verifiedAfterCaptureAt: after.verifiedAt,
    };
  });
  if (origins.length !== afterCapture.verified.length) {
    throw new Error("Launch-reel source origin set changed during capture.");
  }
  const primary = origins.find((origin) => origin.baseURL === beforeCapture.baseURL);
  if (!primary) throw new Error("Launch-reel primary source verification is missing.");
  return {
    baseURL: beforeCapture.baseURL,
    deployedCommit: sourceCommit,
    verifiedBeforeCaptureAt: primary.verifiedBeforeCaptureAt,
    verifiedAfterCaptureAt: primary.verifiedAfterCaptureAt,
    origins,
  };
}

// A certification attempt invalidates all prior generated output immediately.
// If preflight, capture, or postflight fails, downstream packaging must not be
// able to reuse a previous release record or stale videos by accident.
rmSync(outputRoot, { recursive: true, force: true });

try {
  // Freeze every origin represented by the publishable manifest before opening
  // a browser. The clean checkout, authenticated/video base URL, and canonical
  // public-screenshot alias must all report the same source commit.
  const sourceCommit = resolveSourceCommit(repoRoot);
  const sourceRef = resolveSourceRef(repoRoot);
  assertCleanCheckout(repoRoot, sourceCommit);
  const beforeCapture = await verifyCaptureOrigins(sourceCommit);

  const capture = spawnSync(process.execPath, [path.join(scriptDir, "marketing-kit.mjs")], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (capture.error) throw capture.error;
  if (capture.status !== 0) {
    throw new Error(`Marketing-kit capture failed with exit code ${capture.status ?? "unknown"}.`);
  }
  if (!existsSync(manifestPath)) {
    throw new Error("Marketing-kit capture completed without writing marketing-kit/manifest.json.");
  }

  assertCleanCheckout(repoRoot, sourceCommit);
  const afterCapture = await verifyCaptureOrigins(sourceCommit);
  const sourceVerification = combineSourceVerification(sourceCommit, beforeCapture, afterCapture);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const certifiedManifest = certifyManifest(manifest, sourceCommit, sourceRef, sourceVerification);
  writeFileSync(manifestPath, `${JSON.stringify(certifiedManifest, null, 2)}\n`, "utf8");

  const releaseRecord = {
    sourceCommit,
    sourceRef,
    generatedAt: certifiedManifest.generatedAt,
    certifiedAt: certifiedManifest.captureCertification.certifiedAt,
    baseURL: certifiedManifest.baseURL,
    mode: certifiedManifest.mode,
    publishable: certifiedManifest.captureCertification.publishable,
    sourceVerification: certifiedManifest.captureCertification.sourceVerification,
    videos: certifiedManifest.captureCertification.videos,
    authenticatedScreenshots: certifiedManifest.captureCertification.authenticatedScreenshots,
  };
  const releaseRecordPath = path.join(outputRoot, "release-record.json");
  writeFileSync(releaseRecordPath, `${JSON.stringify(releaseRecord, null, 2)}\n`, "utf8");

  console.log(
    `Marketing kit certified against ${sourceCommit.slice(0, 12)} (${sourceRef}) on ${sourceVerification.baseURL}.`,
  );
  console.log(`Release record: ${releaseRecordPath}`);
} catch (error) {
  rmSync(outputRoot, { recursive: true, force: true });
  throw error;
}
