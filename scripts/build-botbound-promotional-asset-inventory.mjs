import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  promotionalAssetClassificationPolicy,
  promotionalAssetDisposition,
} from "./lib/promotional-asset-disposition.mjs";

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
  ".srt",
  ".ts",
  ".tsx",
  ".txt",
  ".vtt",
]);

const roots = [
  { path: "brand-work", include: () => true },
  { path: "artifacts", include: () => true },
  { path: "public", include: (file) => mediaExtensions.has(path.extname(file).toLowerCase()) },
  {
    path: "apps/botbound-film",
    include: (file) => filmExtensions.has(path.extname(file).toLowerCase()),
  },
  {
    path: "apps/browser-extension",
    include: (file) => mediaExtensions.has(path.extname(file).toLowerCase()),
  },
  {
    path: "android/app/src/main/res",
    include: (file) => mediaExtensions.has(path.extname(file).toLowerCase()),
  },
  {
    path: "ios/Wireline/Assets.xcassets",
    include: (file) => mediaExtensions.has(path.extname(file).toLowerCase()),
  },
  {
    path: "docs",
    include: (file) =>
      /launch|brand|marketing|campaign|showcase|sales|deploy/i.test(path.basename(file)),
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
  const ascii = buffer
    .subarray(0, 64)
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (hex.startsWith("89504e470d0a1a0a")) return "png";
  if (hex.startsWith("ffd8ff")) return "jpeg";
  if (hex.startsWith("47494638")) return "gif";
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  if (buffer.subarray(0, 4).toString("ascii") === "%PDF") return "pdf";
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return "mp4-family";
  if (buffer.subarray(0, 2).toString("ascii") === "PK") return "zip";
  if (ascii.startsWith("<svg") || (ascii.startsWith("<?xml") && ascii.includes("<svg")))
    return "svg";
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
  const matchesSignature = extensionMatches(extension, signature);
  assets.push({
    path: relative,
    bytes: fileStat.size,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    extension,
    detected_format: signature,
    extension_matches_detected_format: matchesSignature,
    disposition: promotionalAssetDisposition(relative, matchesSignature),
    release_approval: "not-assessed",
  });
}

const byDisposition = Object.fromEntries(
  [...new Set(assets.map((asset) => asset.disposition))]
    .sort()
    .map((disposition) => [
      disposition,
      assets.filter((asset) => asset.disposition === disposition).length,
    ]),
);
const inventory = {
  generated_at: new Date().toISOString(),
  classification_policy: promotionalAssetClassificationPolicy,
  scope: roots.map((root) => root.path),
  asset_count: assets.length,
  total_bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
  extension_mismatch_count: assets.filter(
    (asset) => asset.extension_matches_detected_format === false,
  ).length,
  by_disposition: byDisposition,
  assets,
};

await writeFile(outputJson, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = [
  [
    "path",
    "bytes",
    "sha256",
    "extension",
    "detected_format",
    "extension_matches_detected_format",
    "disposition",
    "release_approval",
  ],
  ...assets.map((asset) => [
    asset.path,
    asset.bytes,
    asset.sha256,
    asset.extension,
    asset.detected_format,
    asset.extension_matches_detected_format,
    asset.disposition,
    asset.release_approval,
  ]),
]
  .map((row) => row.map(csvEscape).join(","))
  .join("\n");
await writeFile(outputCsv, `${csv}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      asset_count: inventory.asset_count,
      extension_mismatch_count: inventory.extension_mismatch_count,
      by_disposition: byDisposition,
    },
    null,
    2,
  ),
);
