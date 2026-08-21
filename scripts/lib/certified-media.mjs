import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Resolve and authenticate one release-record media entry before packaging it.
 * Paths, sizes, and bytes are all bound so a stale or substituted capture can
 * never become an official launch asset merely because its filename matches.
 */
export async function verifyCertifiedMediaRecord(
  record,
  { repoRoot, marketingRoot, expectedPath, allowedExtensions = [], minSizeBytes = 1 },
) {
  if (!record || typeof record.path !== "string") {
    throw new Error("Certified media record is missing its path.");
  }
  const relativePath = record.path.replaceAll("\\", "/");
  if (
    relativePath !== record.path ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath
  ) {
    throw new Error(`Certified media path is not canonical: ${record.path}`);
  }
  if (expectedPath && relativePath !== expectedPath) {
    throw new Error(
      `Certified media path mismatch: expected ${expectedPath}, found ${relativePath}.`,
    );
  }

  const extension = path.posix.extname(relativePath).toLowerCase();
  if (allowedExtensions.length && !allowedExtensions.includes(extension)) {
    throw new Error(`Certified media has an unsupported extension: ${relativePath}`);
  }
  if (!Number.isSafeInteger(record.sizeBytes) || record.sizeBytes < minSizeBytes) {
    throw new Error(`Certified media has an invalid recorded size: ${relativePath}`);
  }
  if (!/^[0-9a-f]{64}$/.test(record.sha256 || "")) {
    throw new Error(`Certified media has an invalid recorded SHA-256: ${relativePath}`);
  }

  const resolved = path.resolve(repoRoot, ...relativePath.split("/"));
  const realMarketingRoot = await realpath(marketingRoot);
  const info = await lstat(resolved);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Certified media must be a regular file: ${relativePath}`);
  }
  const realResolved = await realpath(resolved);
  if (!isWithin(realMarketingRoot, realResolved)) {
    throw new Error(`Certified media escapes marketing-kit/: ${relativePath}`);
  }

  const bytes = await readFile(realResolved);
  if (bytes.length !== record.sizeBytes) {
    throw new Error(`Certified media size changed after capture: ${relativePath}`);
  }
  if (sha256(bytes) !== record.sha256) {
    throw new Error(`Certified media bytes changed after capture: ${relativePath}`);
  }
  return bytes;
}
