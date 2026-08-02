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
  const commit = fromEnvironment || gitValue(["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error(
      "Launch-reel capture requires an exact 40-character source commit. Run it from a Git checkout or provide VERCEL_GIT_COMMIT_SHA/GITHUB_SHA.",
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

function fileDigest(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function resolveAssetPath(asset) {
  if (!asset || typeof asset.path !== "string" || !asset.path.trim()) {
    throw new Error("Marketing-kit manifest contains an asset without a path.");
  }
  const resolved = path.resolve(repoRoot, asset.path);
  if (!resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Marketing-kit asset escapes the repository: ${asset.path}`);
  }
  return resolved;
}

function certifyManifest(manifest, sourceCommit, sourceRef) {
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
      authenticatedScreenshots: screenshotCertification,
      videos: videoRecords,
    },
  };
}

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

const sourceCommit = resolveSourceCommit();
const sourceRef = resolveSourceRef();
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const certifiedManifest = certifyManifest(manifest, sourceCommit, sourceRef);
writeFileSync(manifestPath, `${JSON.stringify(certifiedManifest, null, 2)}\n`, "utf8");

const releaseRecord = {
  sourceCommit,
  sourceRef,
  generatedAt: certifiedManifest.generatedAt,
  certifiedAt: certifiedManifest.captureCertification.certifiedAt,
  baseURL: certifiedManifest.baseURL,
  mode: certifiedManifest.mode,
  videos: certifiedManifest.captureCertification.videos,
  authenticatedScreenshots: certifiedManifest.captureCertification.authenticatedScreenshots.map(
    ({ layout, routes, uniqueFrames }) => ({ layout, routes, uniqueFrames }),
  ),
};
const releaseRecordPath = path.join(outputRoot, "release-record.json");
writeFileSync(releaseRecordPath, `${JSON.stringify(releaseRecord, null, 2)}\n`, "utf8");

console.log(`Marketing kit certified against ${sourceCommit.slice(0, 12)} (${sourceRef}).`);
console.log(`Release record: ${releaseRecordPath}`);
