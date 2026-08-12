import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function gitValue(args) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function resolveSourceCommit() {
  const fromEnvironment = [process.env.VERCEL_GIT_COMMIT_SHA, process.env.GITHUB_SHA].find(
    (value) => /^[0-9a-f]{40}$/i.test(value || ""),
  );
  const checkoutCommit = gitValue(["rev-parse", "HEAD"]);
  const commit = fromEnvironment || checkoutCommit;
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error(
      "Launch-reel capture requires an exact 40-character source commit. Run it from a Git checkout or provide VERCEL_GIT_COMMIT_SHA/GITHUB_SHA.",
    );
  }
  if (checkoutCommit && checkoutCommit.toLowerCase() !== commit.toLowerCase()) {
    throw new Error(
      `Launch-reel source mismatch: environment says ${commit}, but the checkout is ${checkoutCommit}.`,
    );
  }
  return commit.toLowerCase();
}

function resolveSourceRef() {
  return (
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.GITHUB_REF_NAME ||
    gitValue(["rev-parse", "--abbrev-ref", "HEAD"]) ||
    "detached"
  );
}

function assertCleanCheckout(sourceCommit) {
  const checkoutCommit = gitValue(["rev-parse", "HEAD"]);
  if (!checkoutCommit) return;
  if (checkoutCommit.toLowerCase() !== sourceCommit) {
    throw new Error(
      `Launch-reel source moved during capture: started at ${sourceCommit}, now at ${checkoutCommit}.`,
    );
  }
  const dirty = gitValue(["status", "--porcelain", "--untracked-files=all"]);
  if (dirty) {
    throw new Error(
      "Launch-reel certification requires a clean Git checkout. Commit or discard local changes, then rebuild and recapture.",
    );
  }
}

function normalizeBaseURL(value) {
  const url = new URL(value || "https://trywireline.com");
  if (url.protocol !== "https:") {
    throw new Error(
      `Launch-reel certification requires an HTTPS production URL; received ${url.toString()}. ` +
        "Use marketing:kit:raw for localhost or mock capture work.",
    );
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function verifyRemoteSourceCommit(sourceCommit) {
  const baseURL = normalizeBaseURL(process.env.E2E_BASE_URL || "https://trywireline.com");
  const healthURL = new URL("/api/health/public", `${baseURL}/`);
  const response = await fetch(healthURL, {
    method: "HEAD",
    redirect: "error",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(
      `Launch-reel source verification failed: ${healthURL} returned ${response.status}. ` +
        "Do not certify footage when the deployed source cannot be proven.",
    );
  }

  const deployedCommit = String(response.headers.get("x-wireline-source-commit") || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(deployedCommit)) {
    throw new Error(
      "Launch-reel source verification failed: production health did not return a valid X-Wireline-Source-Commit header.",
    );
  }
  if (deployedCommit !== sourceCommit) {
    throw new Error(
      `Launch-reel source mismatch: checkout is ${sourceCommit}, but ${baseURL} serves ${deployedCommit}. ` +
        "Deploy the checkout being certified or capture from its exact production deployment URL.",
    );
  }

  return {
    baseURL,
    deployedCommit,
    verifiedAt: new Date().toISOString(),
  };
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
      throw new Error(`Launch-reel capture is implausibly small (${sizeBytes} bytes): ${asset.path}`);
    }
    return {
      id: asset.id,
      path: asset.path,
      sizeBytes,
      sha256: fileDigest(filePath),
    };
  });

  const screenshots = assets.filter(
    (asset) =>
      asset?.type === "screenshot" && AUTHENTICATED_SCREENSHOT_IDS.has(String(asset.id)),
  );
  const byLayout = new Map();
  for (const asset of screenshots) {
    const layout = String(asset.layout || "unknown");
    const records = byLayout.get(layout) || [];
    records.push({
      id: String(asset.id),
      path: asset.path,
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
          .join("\n")}\nThis usually means the capture filmed an auth wall, redirect, or shared error screen instead of the product.`,
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

// Freeze both sides of provenance before opening a browser: the clean checkout
// and the exact production URL must report the same source commit. Without this,
// a branch checkout could label footage from an older trywireline.com deployment
// with the branch SHA and still produce a publishable release record.
const sourceCommit = resolveSourceCommit();
const sourceRef = resolveSourceRef();
assertCleanCheckout(sourceCommit);
const sourceVerification = await verifyRemoteSourceCommit(sourceCommit);

const capture = spawnSync(process.execPath, [path.join(scriptDir, "marketing-kit.mjs")], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});
if (capture.error) throw capture.error;
if (capture.status !== 0) process.exit(capture.status ?? 1);
if (!existsSync(manifestPath)) {
  throw new Error("Marketing-kit capture completed without writing marketing-kit/manifest.json.");
}

assertCleanCheckout(sourceCommit);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const certifiedManifest = certifyManifest(
  manifest,
  sourceCommit,
  sourceRef,
  sourceVerification,
);
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
  authenticatedScreenshots: certifiedManifest.captureCertification.authenticatedScreenshots.map(
    ({ layout, routes, uniqueFrames }) => ({ layout, routes, uniqueFrames }),
  ),
};
const releaseRecordPath = path.join(outputRoot, "release-record.json");
writeFileSync(releaseRecordPath, `${JSON.stringify(releaseRecord, null, 2)}\n`, "utf8");

console.log(
  `Marketing kit certified against ${sourceCommit.slice(0, 12)} (${sourceRef}) on ${sourceVerification.baseURL}.`,
);
console.log(`Release record: ${releaseRecordPath}`);
