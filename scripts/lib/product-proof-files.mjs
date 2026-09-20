import { createHash } from "node:crypto";
import {
  existsSync,
  closeSync,
  openSync,
  writeFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";

export const proofManifestName = "botbound-current-worktree-proof.json";
export const proofContactSheetName = "botbound-exact-worktree-proof-contact-sheet-1920x1400.png";
export const proofFrameNames = [
  "01-home-desktop-1600x1000",
  "02-home-mobile-hero-430x630",
  "03-features-desktop-1600x1000",
  "04-features-mobile-430x932",
  "05-pricing-desktop-1600x1000",
  "06-pricing-mobile-430x932",
  "07-signin-desktop-1600x1000",
].map((name) => name + "-exact-worktree-preview.png");

export function assertContainedPath(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Proof path must remain inside its intended directory: " + target);
  }
}

export function assertProofOutputDirectory(repositoryRoot, outputDir) {
  assertContainedPath(repositoryRoot, outputDir);
  const relative = path.relative(repositoryRoot, outputDir).split(path.sep).join("/");
  if (!(
    relative.startsWith("brand-work/launch-2026-09/exports/") || relative.startsWith("artifacts/")
  )) {
    throw new Error(
      "Proof output must be inside current campaign exports or artifacts; historical proof is immutable.",
    );
  }
  let existing = outputDir;
  while (!existsSync(existing)) existing = path.dirname(existing);
  if (realpathSync(existing) !== realpathSync(repositoryRoot)) {
    assertContainedPath(realpathSync(repositoryRoot), realpathSync(existing));
  }
}

export function assertProductProofManifest(manifest) {
  if (
    manifest.exactWorktreePreview !== true ||
    manifest.deployedProduction !== false ||
    !Number.isFinite(Date.parse(manifest.capturedAt)) ||
    !/^[0-9a-f]{40}$/i.test(String(manifest.revision?.commit || "")) ||
    manifest.sourceIdentity?.commit !== manifest.revision.commit ||
    !manifest.sourceIdentity?.nonce ||
    !/^[0-9a-f]{64}$/i.test(String(manifest.sourceSnapshot?.sha256 || "")) ||
    manifest.apiEvidence?.mode !== "credential-free-simulated-api" ||
    manifest.apiEvidence?.checkout_available !== false ||
    !Array.isArray(manifest.results) ||
    manifest.results.length !== proofFrameNames.length
  )
    throw new Error("Product proof lacks complete current-worktree and simulated-API provenance.");
  const names = new Set();
  for (const result of manifest.results) {
    const filename = String(result.output || "")
      .split(/[\\/]/)
      .at(-1);
    if (
      !proofFrameNames.includes(filename) ||
      names.has(filename) ||
      result.finalRouteMatched !== true ||
      result.expectedTextMatched !== true ||
      result.rootMounted !== true ||
      !Number.isInteger(result.status) ||
      result.status < 200 ||
      result.status >= 400 ||
      !Number.isFinite(result.bodyHorizontalOverflow) ||
      result.bodyHorizontalOverflow > 2 ||
      !Number.isFinite(result.rootHorizontalOverflow) ||
      result.rootHorizontalOverflow > 2 ||
      ![result.pageErrors, result.consoleErrors, result.failedRequests].every(
        (errors) => Array.isArray(errors) && errors.length === 0,
      )
    )
      throw new Error("Product-proof frame failed acceptance: " + filename);
    names.add(filename);
  }
}

export function verifiedProofFrameBytes(proofRoot, result) {
  const filename = String(result.output || "")
    .split(/[\\/]/)
    .at(-1);
  if (!proofFrameNames.includes(filename))
    throw new Error("Unknown product-proof frame: " + filename);
  const file = path.join(proofRoot, filename);
  if (!lstatSync(file).isFile())
    throw new Error("Product-proof frame must be a regular file: " + filename);
  const bytes = readFileSync(file);
  if (
    !Number.isSafeInteger(result.bytes) ||
    result.bytes <= 0 ||
    result.bytes !== bytes.byteLength ||
    createHash("sha256").update(bytes).digest("hex") !== result.sha256
  ) {
    throw new Error("Product-proof frame bytes do not match the manifest: " + filename);
  }
  return bytes;
}

// Archive the preceding batch, and restore it if promotion fails. The manifest
// is installed last: it is an integrity receipt, not publication approval.
export function publishProofFiles({
  outputDir,
  stagingDir,
  fileNames,
  retiredNames = [],
  move = renameSync,
}) {
  assertContainedPath(realpathSync(outputDir), realpathSync(stagingDir));
  if (!fileNames.includes(proofManifestName) || new Set(fileNames).size !== fileNames.length) {
    throw new Error("A proof batch needs one final manifest.");
  }
  const ownedNames = [...new Set([...fileNames, ...retiredNames])];
  for (const name of ownedNames) {
    if (!name || name !== path.basename(name) || name === "." || name === "..")
      throw new Error("Unsafe proof filename: " + name);
    const destination = path.join(outputDir, name);
    if (existsSync(destination) && !lstatSync(destination).isFile())
      throw new Error("Proof destination is not a regular file: " + name);
  }
  for (const name of fileNames) {
    if (!lstatSync(path.join(stagingDir, name)).isFile())
      throw new Error("Missing staged proof file: " + name);
  }
  const historyRoot = path.join(outputDir, "_history");
  mkdirSync(historyRoot, { recursive: true });
  assertContainedPath(realpathSync(outputDir), realpathSync(historyRoot));
  const historyDir = mkdtempSync(
    path.join(historyRoot, new Date().toISOString().replaceAll(":", "-") + "-"),
  );
  const backedUp = [];
  const installed = [];
  try {
    for (const name of [
      proofManifestName,
      ...ownedNames.filter((name) => name !== proofManifestName),
    ]) {
      if (!existsSync(path.join(outputDir, name))) continue;
      move(path.join(outputDir, name), path.join(historyDir, name));
      backedUp.push(name);
    }
    for (const name of [
      ...fileNames.filter((name) => name !== proofManifestName),
      proofManifestName,
    ]) {
      move(path.join(stagingDir, name), path.join(outputDir, name));
      installed.push(name);
    }
    return historyDir;
  } catch (error) {
    for (const name of installed.reverse()) rmSync(path.join(outputDir, name), { force: true });
    for (const name of [
      ...backedUp.filter((name) => name !== proofManifestName),
      ...backedUp.filter((name) => name === proofManifestName),
    ]) {
      renameSync(path.join(historyDir, name), path.join(outputDir, name));
    }
    throw error;
  }
}

export function acquireProductProofLock(repositoryRoot, identity) {
  const lockPath = path.join(repositoryRoot, ".botbound-proof-source-identity.json");
  const descriptor = openSync(lockPath, "wx");
  try {
    writeFileSync(descriptor, JSON.stringify(identity) + "\n", "utf8");
  } catch (error) {
    closeSync(descriptor);
    rmSync(lockPath, { force: true });
    throw error;
  }
  closeSync(descriptor);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    rmSync(lockPath, { force: true });
  };
}
