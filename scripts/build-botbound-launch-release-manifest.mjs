import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const repoRoot = process.cwd();
const releaseRoot = path.join(repoRoot, "brand-work", "launch-2026-09");
const manifestPath = path.join(releaseRoot, "manifest.json");
const checksumsPath = path.join(releaseRoot, "SHA256SUMS.txt");

const ignored = new Set(["manifest.json", "SHA256SUMS.txt"]);
const execFileAsync = promisify(execFile);

async function git(args) {
  const { stdout } = await execFileAsync(process.env.GIT_EXECUTABLE || "git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  return stdout.trim();
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function mimeFor(relative) {
  const ext = path.extname(relative).toLowerCase();
  return {
    ".json": "application/json",
    ".md": "text/markdown",
    ".mp4": "video/mp4",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".srt": "application/x-subrip",
    ".ttf": "font/ttf",
    ".txt": "text/plain",
    ".vtt": "text/vtt",
  }[ext] || "application/octet-stream";
}

function categoryFor(relative) {
  const parts = relative.split("/");
  if (parts[0] === "exports") return parts[1] || "export";
  return parts[0];
}

function releaseStatusFor(relative) {
  if (relative.startsWith("sources/")) return "editorial-source-not-placement";
  if (relative.startsWith("fonts/")) return "source-dependency";
  if (relative.startsWith("exports/product-proof/")) return "exact-worktree-preview-not-deployed-proof";
  if (relative.startsWith("exports/motion/")) return "cinematic-concept-owner-review";
  if (relative.startsWith("exports/billboard/")) return "creative-master-paid-and-ooh-hold";
  if (relative.startsWith("exports/investor/")) return "investor-master-factual-review";
  if (relative.startsWith("exports/")) return "creative-master-owner-review";
  return "release-documentation";
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

const allFiles = (await walk(releaseRoot))
  .map((absolute) => ({
    absolute,
    relative: path.relative(releaseRoot, absolute).split(path.sep).join("/"),
  }))
  .filter(({ relative }) => {
    if (ignored.has(relative)) return false;
    const parts = relative.toLowerCase().split("/");
    return !parts.some((part) => ["_rejected", "rejected", "quarantine"].includes(part));
  })
  .sort((a, b) => a.relative.localeCompare(b.relative));

const assets = [];
for (const file of allFiles) {
  const fileStat = await stat(file.absolute);
  assets.push({
    path: file.relative,
    category: categoryFor(file.relative),
    mime_type: mimeFor(file.relative),
    bytes: fileStat.size,
    sha256: await sha256(file.absolute),
    release_status: releaseStatusFor(file.relative),
  });
}

const repositoryBaseSha = await git(["rev-parse", "HEAD"]);
const repositoryDirty = Boolean(await git(["status", "--porcelain"]));

const manifest = {
  release: "BotBound Launch Release — 2026-09-01",
  campaign: "The Second Ring",
  generated_at: new Date().toISOString(),
  repository_base_sha: repositoryBaseSha,
  repository_worktree_status: repositoryDirty ? "dirty" : "clean",
  deployment_status: "not deployed by this release-preparation pass",
  paid_media_status: "hold pending explicit approval and release gates",
  product_proof_status: "worktree preview is not deployed production proof",
  asset_count: assets.length,
  total_bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
  assets,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(
  checksumsPath,
  `${assets.map((asset) => `${asset.sha256}  ${asset.path}`).join("\n")}\n`,
  "utf8",
);

console.log(`Wrote ${path.relative(repoRoot, manifestPath)} with ${assets.length} assets.`);
console.log(`Wrote ${path.relative(repoRoot, checksumsPath)}.`);
