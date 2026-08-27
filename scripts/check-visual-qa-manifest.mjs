#!/usr/bin/env node
/**
 * Fail CI unless production visual QA has complete, authenticated,
 * cryptographically verifiable evidence for the canonical route matrix.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import {
  CANONICAL_PRODUCTION_VISUAL_BASE_URL,
  isSafeProductionVisualArtifactDirectory,
  optionalProductionVisualArtifactNames,
  PRODUCTION_VISUAL_AUTHENTICATED_ROUTES,
  PRODUCTION_VISUAL_COMPATIBILITY_ROUTES,
  PRODUCTION_VISUAL_MANIFEST_VIEWPORTS,
  PRODUCTION_VISUAL_MARKETING_ROUTES,
  requiredProductionVisualArtifactNames,
  requiredProductionVisualSemanticAssertions,
} from "./lib/production-visual-qa-contract.mjs";

const cliArgs = process.argv.slice(2);
const productionMode = cliArgs.includes("--production");
const manifestPath =
  cliArgs.find((argument) => !argument.startsWith("--")) || process.env.WIRELINE_VISUAL_MANIFEST;
if (!manifestPath) {
  console.error(
    "Usage: node scripts/check-visual-qa-manifest.mjs [--production] <path/to/manifest.json>",
  );
  process.exit(2);
}

const P0_KINDS = new Set([
  "http",
  "navigation",
  "capture",
  "overflow",
  "control-overflow",
  "redirect",
  "auth",
  "console",
  "pageerror",
  "request",
  "api-response",
  "content",
  "semantic",
  "source",
  "manifest",
  "artifact",
  // The capture script records this when #root never mounted — a screenshot of
  // a proxy/gateway interstitial is not evidence the app rendered, and the
  // gate must agree with the capture script about what counts as P0.
  "shell-not-mounted",
]);

const resolvedManifestPath = path.resolve(manifestPath);
const manifest = JSON.parse(readFileSync(resolvedManifestPath, "utf8"));
const issues = Array.isArray(manifest.issues) ? [...manifest.issues] : [];
const gateIssues = [];

function addGateIssue(kind, detail) {
  gateIssues.push({
    kind,
    viewport: "release",
    route: manifest.baseUrl || "production",
    detail,
  });
}

if (!Array.isArray(manifest.issues)) {
  addGateIssue("manifest", "Manifest issues must be an array.");
}

if (productionMode) {
  const exactCommit = /^[0-9a-f]{40}$/i;
  const sourceProofs = [manifest.sourceProofBefore, manifest.sourceProofAfter];
  if (
    !exactCommit.test(manifest.sourceCommit || "") ||
    !exactCommit.test(manifest.expectedCommit || "") ||
    String(manifest.sourceCommit).toLowerCase() !== String(manifest.expectedCommit).toLowerCase() ||
    !manifest.sourceVerifiedAt ||
    Number.isNaN(Date.parse(manifest.sourceVerifiedAt)) ||
    sourceProofs.some(
      (proof) =>
        !proof ||
        proof.baseURL !== CANONICAL_PRODUCTION_VISUAL_BASE_URL ||
        !exactCommit.test(proof.deployedCommit || "") ||
        String(proof.deployedCommit).toLowerCase() !==
          String(manifest.expectedCommit).toLowerCase() ||
        !proof.verifiedAt ||
        Number.isNaN(Date.parse(proof.verifiedAt)),
    )
  ) {
    addGateIssue("source", "Manifest is missing valid, matching canonical source provenance.");
  }

  if (manifest.baseUrl !== CANONICAL_PRODUCTION_VISUAL_BASE_URL) {
    addGateIssue("manifest", `Manifest baseUrl must be ${CANONICAL_PRODUCTION_VISUAL_BASE_URL}.`);
  }
  if (manifest.qaAccountConfigured !== true) {
    addGateIssue("manifest", "A dedicated production QA account was not configured.");
  }
  if (manifest.authenticatedCapture !== true) {
    addGateIssue("manifest", "Authenticated production routes were not captured.");
  }

  function hasExactJsonValue(actual, expected) {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  for (const [field, actual, expected] of [
    ["marketingRoutes", manifest.marketingRoutes, PRODUCTION_VISUAL_MARKETING_ROUTES],
    ["authenticatedRoutes", manifest.authenticatedRoutes, PRODUCTION_VISUAL_AUTHENTICATED_ROUTES],
    ["compatibilityRoutes", manifest.compatibilityRoutes, PRODUCTION_VISUAL_COMPATIBILITY_ROUTES],
    ["viewports", manifest.viewports, PRODUCTION_VISUAL_MANIFEST_VIEWPORTS],
  ]) {
    if (!hasExactJsonValue(actual, expected)) {
      addGateIssue(
        "manifest",
        `${field} does not match the canonical production visual QA contract.`,
      );
    }
  }

  if (
    !hasExactJsonValue(manifest.semanticAssertions, requiredProductionVisualSemanticAssertions())
  ) {
    addGateIssue(
      "semantic",
      "semanticAssertions must prove the exact canonical page and active state for every route and viewport.",
    );
  }

  const requiredArtifacts = requiredProductionVisualArtifactNames();
  const requiredArtifactSet = new Set(requiredArtifacts);
  const optionalArtifactSet = new Set(optionalProductionVisualArtifactNames());
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  if (!Array.isArray(manifest.artifacts)) {
    addGateIssue("manifest", "Manifest artifacts must be an array.");
  }
  if (manifest.screenshotCountExpected !== requiredArtifacts.length) {
    addGateIssue(
      "manifest",
      `screenshotCountExpected must be ${requiredArtifacts.length}; received ${String(manifest.screenshotCountExpected)}.`,
    );
  }
  if (manifest.screenshotCountActual !== artifacts.length) {
    addGateIssue(
      "manifest",
      "screenshotCountActual must equal the number of inventoried PNG artifacts.",
    );
  }

  const inventoryNames = [];
  const seenInventoryNames = new Set();
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object") {
      addGateIssue("artifact", "Every artifact inventory entry must be an object.");
      continue;
    }
    const file = artifact.file;
    const fileIsRelativeBasename =
      typeof file === "string" &&
      file.length > 0 &&
      file === path.basename(file) &&
      !file.includes("/") &&
      !file.includes("\\");
    if (!fileIsRelativeBasename) {
      addGateIssue("artifact", "Artifact filenames must be safe relative basenames.");
      continue;
    }
    inventoryNames.push(file);
    if (seenInventoryNames.has(file)) {
      addGateIssue("artifact", `Artifact inventory contains duplicate filename ${file}.`);
    }
    seenInventoryNames.add(file);
    if (!requiredArtifactSet.has(file) && !optionalArtifactSet.has(file)) {
      addGateIssue("artifact", `Unexpected PNG artifact ${file}.`);
    }
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0) {
      addGateIssue("artifact", `Artifact ${file} has an invalid byte size.`);
    }
    if (!/^[0-9a-f]{64}$/.test(artifact.sha256 || "")) {
      addGateIssue("artifact", `Artifact ${file} has an invalid SHA-256 digest.`);
    }
  }

  for (const file of requiredArtifacts) {
    if (!seenInventoryNames.has(file)) {
      addGateIssue("artifact", `Required PNG artifact ${file} is missing from the inventory.`);
    }
  }
  const sortedInventoryNames = [...inventoryNames].sort((left, right) => left.localeCompare(right));
  if (!hasExactJsonValue(inventoryNames, sortedInventoryNames)) {
    addGateIssue("artifact", "Artifact inventory must be sorted by relative filename.");
  }

  function artifactDirectoryFromManifest() {
    if (!isSafeProductionVisualArtifactDirectory(manifest.artifactDirectory)) {
      addGateIssue(
        "artifact",
        "artifactDirectory is missing or is not a safe capture directory name.",
      );
      return null;
    }

    const manifestParent = path.dirname(resolvedManifestPath);
    const isRunManifest = path.basename(resolvedManifestPath) === "manifest.json";
    let scopeRoot = manifestParent;
    let candidate = path.resolve(manifestParent, manifest.artifactDirectory);
    if (isRunManifest) {
      if (path.basename(manifestParent) !== manifest.artifactDirectory) {
        addGateIssue(
          "artifact",
          "A per-run manifest must live inside its named artifactDirectory.",
        );
        return null;
      }
      scopeRoot = path.dirname(manifestParent);
      candidate = manifestParent;
    }

    const relativeCandidate = path.relative(scopeRoot, candidate);
    if (
      !relativeCandidate ||
      relativeCandidate.startsWith(`..${path.sep}`) ||
      relativeCandidate === ".." ||
      path.isAbsolute(relativeCandidate)
    ) {
      addGateIssue("artifact", "artifactDirectory escapes its manifest scope.");
      return null;
    }
    if (!existsSync(candidate) || !statSync(candidate).isDirectory()) {
      addGateIssue("artifact", "artifactDirectory does not exist or is not a directory.");
      return null;
    }

    const realScopeRoot = realpathSync(scopeRoot);
    const realCandidate = realpathSync(candidate);
    const realRelativeCandidate = path.relative(realScopeRoot, realCandidate);
    if (
      !realRelativeCandidate ||
      realRelativeCandidate.startsWith(`..${path.sep}`) ||
      realRelativeCandidate === ".." ||
      path.isAbsolute(realRelativeCandidate)
    ) {
      addGateIssue("artifact", "artifactDirectory resolves outside its manifest scope.");
      return null;
    }
    return realCandidate;
  }

  // Avoid treating an attacker-controlled or incomplete manifest as authority for
  // filesystem traversal. Only inspect files after its full structural contract
  // has passed.
  if (gateIssues.length === 0) {
    const artifactDirectory = artifactDirectoryFromManifest();
    if (artifactDirectory) {
      const pngEntries = readdirSync(artifactDirectory, { withFileTypes: true }).filter((entry) =>
        entry.name.endsWith(".png"),
      );
      for (const entry of pngEntries) {
        if (!entry.isFile()) {
          addGateIssue("artifact", `PNG artifact ${entry.name} is not a regular file.`);
        }
      }
      const diskNames = pngEntries
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
      if (!hasExactJsonValue(diskNames, sortedInventoryNames)) {
        addGateIssue("artifact", "On-disk PNG files do not exactly match the manifest inventory.");
      }

      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      for (const artifact of artifacts) {
        const artifactPath = path.join(artifactDirectory, artifact.file);
        if (!existsSync(artifactPath) || !lstatSync(artifactPath).isFile()) {
          addGateIssue("artifact", `Inventoried PNG artifact ${artifact.file} is missing.`);
          continue;
        }
        const contents = readFileSync(artifactPath);
        if (
          contents.byteLength < pngSignature.byteLength ||
          !contents.subarray(0, pngSignature.byteLength).equals(pngSignature)
        ) {
          addGateIssue("artifact", `Artifact ${artifact.file} is not a PNG file.`);
        }
        if (contents.byteLength !== artifact.bytes) {
          addGateIssue(
            "artifact",
            `Artifact ${artifact.file} byte size does not match its inventory.`,
          );
        }
        const digest = createHash("sha256").update(contents).digest("hex");
        if (digest !== artifact.sha256) {
          addGateIssue(
            "artifact",
            `Artifact ${artifact.file} SHA-256 does not match its inventory.`,
          );
        }
      }
    }
  }
}

issues.push(...gateIssues);
const p0 = issues.filter((issue) => P0_KINDS.has(issue.kind));

if (p0.length) {
  console.error(`Visual QA P0 gate failed: ${p0.length} issue(s)`);
  for (const issue of p0.slice(0, 20)) {
    console.error(
      `  [${String(issue.kind)}] ${String(issue.viewport || "unknown")} ${String(issue.route || "unknown")}: ${String(issue.detail || "No detail provided")}`,
    );
  }
  process.exit(1);
}

console.log(`Visual QA manifest ok (${issues.length} non-blocking issue(s) ignored)`);
