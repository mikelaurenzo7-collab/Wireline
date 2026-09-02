import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const outputJson = path.join(repoRoot, "brand-work", "PROMOTIONAL-ASSET-INVENTORY-2026-09-01.json");
const outputCsv = path.join(repoRoot, "brand-work", "PROMOTIONAL-ASSET-INVENTORY-2026-09-01.csv");
const excludedOutputs = new Set([outputJson, outputCsv]);

const mediaExtensions = new Set([
  ".gif",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".svg",
  ".wav",
  ".webm",
  ".webp",
  ".zip",
]);
const filmExtensions = new Set([
  ...mediaExtensions,
  ".css",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".vtt",
]);

const roots = [
  { path: "brand-work", include: () => true },
  { path: "artifacts", include: () => true },
  { path: "public", include: (file) => mediaExtensions.has(path.extname(file).toLowerCase()) },
  { path: "apps/botbound-film", include: (file) => filmExtensions.has(path.extname(file).toLowerCase()) },
  { path: "apps/browser-extension", include: (file) => mediaExtensions.has(path.extname(file).toLowerCase()) },
  { path: "android/app/src/main/res", include: (file) => mediaExtensions.has(path.extname(file).toLowerCase()) },
  { path: "ios/Wireline/Assets.xcassets", include: (file) => mediaExtensions.has(path.extname(file).toLowerCase()) },
  {
    path: "docs",
    include: (file) => /launch|brand|marketing|campaign|showcase|sales|deploy/i.test(path.basename(file)),
  },
];

async function walk(directory, include) {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "coverage"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(absolute, include)));
    if (entry.isFile() && include(absolute) && !excludedOutputs.has(absolute)) found.push(absolute);
  }
  return found;
}

function signatureFor(buffer) {
  const hex = buffer.subarray(0, 16).toString("hex");
  const ascii = buffer.subarray(0, 64).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (hex.startsWith("89504e470d0a1a0a")) return "png";
  if (hex.startsWith("ffd8ff")) return "jpeg";
  if (hex.startsWith("47494638")) return "gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buffer.subarray(0, 4).toString("ascii") === "%PDF") return "pdf";
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return "mp4-family";
  if (buffer.subarray(0, 2).toString("ascii") === "PK") return "zip";
  if (ascii.startsWith("<svg") || ascii.startsWith("<?xml") && ascii.includes("<svg")) return "svg";
  return "text-or-other";
}

function extensionMatches(extension, signature) {
  const expected = {
    ".gif": "gif",
    ".jpeg": "jpeg",
    ".jpg": "jpeg",
    ".mov": "mp4-family",
    ".mp4": "mp4-family",
    ".pdf": "pdf",
    ".png": "png",
    ".svg": "svg",
    ".webp": "webp",
    ".zip": "zip",
  }[extension];
  return expected ? expected === signature : null;
}

function dispositionFor(relative) {
  const normalized = relative.replaceAll("\\", "/");
  if (normalized.includes("/_rejected/") || normalized.includes("/rejected/")) return "quarantine-invalid-proof";
  if (normalized.startsWith("brand-work/launch-2026-09-outbound/")) return "approved-outbound-release";
  if (
    normalized === "brand-work/launch-2026-09/exports/investor/botbound-investor-one-pager-2026-09.pdf" ||
    normalized === "brand-work/launch-2026-09/exports/investor/preview/botbound-investor-one-pager-preview.png"
  ) return "preserved-inbound-repair-before-reuse";
  if (normalized.startsWith("brand-work/launch-2026-09/exports/product-proof/")) return "preserved-inbound-internal-proof";
  if (normalized.startsWith("brand-work/launch-2026-09/")) return "preserved-inbound-release";
  if (normalized.includes("botbound-outbound-motion-drafts-2026-09-01")) return "quarantine-superseded-draft";
  if (normalized.includes("candidate-browser-gate")) return "quarantine-invalid-loading-proof";
  if (normalized.includes("artifacts/creative-audit-2026-09-01")) return "quarantine-extension-mismatch";
  if (normalized.includes("botbound-outbound-website-pass-2026-09-01")) return "internal-worktree-proof-not-release";
  if (normalized.startsWith("artifacts/")) return "internal-qa-only";
  if (normalized.startsWith("brand-work/gtm/") || normalized.startsWith("brand-work/exports/") || normalized.startsWith("brand-work/launch-stills/")) return "historical-creative";
  if (normalized.startsWith("public/") || normalized.startsWith("android/") || normalized.startsWith("ios/") || normalized.startsWith("apps/browser-extension/")) return "production-identity-or-package";
  if (normalized.startsWith("apps/botbound-film/")) return "motion-source";
  if (normalized.startsWith("docs/")) return "launch-authority-review";
  return "brand-source-or-control";
}

const files = [];
for (const root of roots) {
  const absoluteRoot = path.resolve(repoRoot, root.path);
  files.push(...(await walk(absoluteRoot, root.include)));
}

const uniqueFiles = [...new Set(files)].sort((a, b) => a.localeCompare(b));
const assets = [];
for (const absolute of uniqueFiles) {
  const buffer = await readFile(absolute);
  const fileStat = await stat(absolute);
  const relative = path.relative(repoRoot, absolute).replaceAll("\\", "/");
  const extension = path.extname(relative).toLowerCase();
  const signature = signatureFor(buffer);
  assets.push({
    path: relative,
    bytes: fileStat.size,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    extension,
    detected_format: signature,
    extension_matches_detected_format: extensionMatches(extension, signature),
    disposition: dispositionFor(relative),
  });
}

const byDisposition = Object.fromEntries(
  [...new Set(assets.map((asset) => asset.disposition))]
    .sort()
    .map((disposition) => [disposition, assets.filter((asset) => asset.disposition === disposition).length]),
);
const inventory = {
  generated_at: new Date().toISOString(),
  scope: roots.map((root) => root.path),
  asset_count: assets.length,
  total_bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
  extension_mismatch_count: assets.filter((asset) => asset.extension_matches_detected_format === false).length,
  by_disposition: byDisposition,
  assets,
};

await writeFile(outputJson, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = [
  ["path", "bytes", "sha256", "extension", "detected_format", "extension_matches_detected_format", "disposition"],
  ...assets.map((asset) => [
    asset.path,
    asset.bytes,
    asset.sha256,
    asset.extension,
    asset.detected_format,
    asset.extension_matches_detected_format,
    asset.disposition,
  ]),
]
  .map((row) => row.map(csvEscape).join(","))
  .join("\n");
await writeFile(outputCsv, `${csv}\n`, "utf8");

console.log(JSON.stringify({ asset_count: inventory.asset_count, extension_mismatch_count: inventory.extension_mismatch_count, by_disposition: byDisposition }, null, 2));
