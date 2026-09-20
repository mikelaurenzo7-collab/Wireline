import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error -- shared release-script module.
import {
  acquireProductProofLock,
  assertContainedPath,
  assertProofOutputDirectory,
  assertProductProofManifest,
  proofFrameNames,
  proofManifestName,
  publishProofFiles,
  verifiedProofFrameBytes,
} from "./product-proof-files.mjs";
// @ts-expect-error -- shared source-preview module.
import { productProofApiResponse } from "./product-proof-api.mjs";

const temporaryRoots: string[] = [];
function temporaryRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "botbound-proof-test-"));
  temporaryRoots.push(root);
  return root;
}
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    assertContainedPath(os.tmpdir(), root);
    expect(path.basename(root).startsWith("botbound-proof-test-")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  }
});
function manifestFixture() {
  return {
    exactWorktreePreview: true,
    deployedProduction: false,
    capturedAt: "2026-09-19T00:00:00Z",
    revision: { commit: "a".repeat(40) },
    sourceIdentity: { commit: "a".repeat(40), nonce: "proof-run" },
    sourceSnapshot: { sha256: "b".repeat(64) },
    apiEvidence: { mode: "credential-free-simulated-api", checkout_available: false },
    results: proofFrameNames.map((output: string) => ({
      output,
      finalRouteMatched: true,
      expectedTextMatched: true,
      rootMounted: true,
      status: 200,
      bodyHorizontalOverflow: 0,
      rootHorizontalOverflow: 0,
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
    })),
  };
}
describe("product-proof acceptance", () => {
  it("requires all seven distinct settled frames and explicit simulated provenance", () => {
    expect(() => assertProductProofManifest(manifestFixture())).not.toThrow();
    const incomplete = manifestFixture();
    incomplete.results.pop();
    expect(() => assertProductProofManifest(incomplete)).toThrow();
    const duplicate = manifestFixture();
    duplicate.results[6] = duplicate.results[0];
    expect(() => assertProductProofManifest(duplicate)).toThrow();
    const enabled = manifestFixture();
    enabled.apiEvidence.checkout_available = true;
    expect(() => assertProductProofManifest(enabled)).toThrow();
    const old = manifestFixture();
    old.sourceSnapshot.sha256 = "";
    expect(() => assertProductProofManifest(old)).toThrow();
  });
  it.each(["pageErrors", "consoleErrors", "failedRequests"])(
    "rejects %s and viewport overflow",
    (key) => {
      const manifest = manifestFixture();
      Object.assign(manifest.results[0], { [key]: ["error"] });
      expect(() => assertProductProofManifest(manifest)).toThrow();
      const overflow = manifestFixture();
      overflow.results[0].bodyHorizontalOverflow = 3;
      expect(() => assertProductProofManifest(overflow)).toThrow();
    },
  );
  it("rejects frame-byte tampering before contact-sheet generation", () => {
    const root = temporaryRoot();
    const bytes = Buffer.from("original screenshot");
    writeFileSync(path.join(root, proofFrameNames[0]), bytes);
    const result = {
      output: proofFrameNames[0],
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    expect(verifiedProofFrameBytes(root, result)).toEqual(bytes);
    writeFileSync(path.join(root, proofFrameNames[0]), "different screenshot");
    expect(() => verifiedProofFrameBytes(root, result)).toThrow(/do not match/);
  });
  it("refuses historical or escaped output destinations", () => {
    const root = temporaryRoot();
    expect(() =>
      assertProofOutputDirectory(root, path.join(root, "brand-work/exports/product-proof")),
    ).toThrow(/historical/);
    expect(() => assertProofOutputDirectory(root, path.resolve(root, "../escaped"))).toThrow(
      /inside/,
    );
    expect(() =>
      assertProofOutputDirectory(root, path.join(root, "artifacts/product-proof")),
    ).not.toThrow();
  });
});
describe("product-proof promotion", () => {
  function batch() {
    const outputDir = temporaryRoot();
    const stagingDir = path.join(outputDir, "_rejected", "candidate");
    mkdirSync(stagingDir, { recursive: true });
    for (const [dir, version] of [
      [outputDir, "old"],
      [stagingDir, "new"],
    ]) {
      writeFileSync(path.join(dir, "frame.png"), version + "-frame");
      writeFileSync(path.join(dir, proofManifestName), version + "-manifest");
    }
    return { outputDir, stagingDir, fileNames: ["frame.png", proofManifestName] };
  }
  it("preserves the prior batch and installs its replacement manifest last", () => {
    const options = batch();
    const destinations: string[] = [];
    const history = publishProofFiles({
      ...options,
      move: (from: string, to: string) => {
        destinations.push(to);
        renameSync(from, to);
      },
    });
    expect(readFileSync(path.join(history, "frame.png"), "utf8")).toBe("old-frame");
    expect(readFileSync(path.join(history, proofManifestName), "utf8")).toBe("old-manifest");
    expect(readFileSync(path.join(options.outputDir, "frame.png"), "utf8")).toBe("new-frame");
    expect(destinations.at(-1)).toBe(path.join(options.outputDir, proofManifestName));
  });
  it("restores the entire preceding batch if the final manifest move fails", () => {
    const options = batch();
    expect(() =>
      publishProofFiles({
        ...options,
        move: (from: string, to: string) => {
          if (from === path.join(options.stagingDir, proofManifestName))
            throw new Error("simulated locked destination");
          renameSync(from, to);
        },
      }),
    ).toThrow(/locked/);
    expect(readFileSync(path.join(options.outputDir, "frame.png"), "utf8")).toBe("old-frame");
    expect(readFileSync(path.join(options.outputDir, proofManifestName), "utf8")).toBe(
      "old-manifest",
    );
  });
  it("does not touch the preceding batch if a staged file is missing", () => {
    const options = batch();
    expect(() =>
      publishProofFiles({ ...options, fileNames: [...options.fileNames, "missing.png"] }),
    ).toThrow();
    expect(readFileSync(path.join(options.outputDir, proofManifestName), "utf8")).toBe(
      "old-manifest",
    );
    expect(existsSync(path.join(options.outputDir, "_history"))).toBe(false);
  });
});
describe("credential-free proof API", () => {
  it("returns explicit paused billing and exposes that the data is simulated", () => {
    expect(productProofApiResponse("GET", "/api/billing/plans").body).toEqual({
      plans: [],
      stripe_configured: false,
      checkout_available: false,
    });
    expect(productProofApiResponse("GET", "/api/__botbound_proof_status").body).toMatchObject({
      mode: "credential-free-simulated-api",
      vendorReadinessVerified: false,
    });
  });
  it("does not simulate authenticated actions or accept similarly prefixed routes", () => {
    expect(productProofApiResponse("POST", "/api/billing/plans").status).toBe(405);
    expect(productProofApiResponse("GET", "/api/auth/session-extra").status).toBe(404);
    expect(productProofApiResponse("GET", "/api/billing/checkout").status).toBe(404);
  });
});

describe("source-checksum modes", () => {
  it("hashes staged bytes without absorbing working-tree edits and checks without rewriting", () => {
    const root = temporaryRoot();
    const checksumScript = path.resolve("scripts/refresh-botbound-source-checksums.mjs");
    const options = { cwd: root, windowsHide: true, stdio: "pipe" as const };
    execFileSync("git", ["init", "--quiet"], options);
    writeFileSync(path.join(root, "source.txt"), "staged\n");
    execFileSync("git", ["add", "source.txt"], options);
    writeFileSync(path.join(root, "source.txt"), "working draft\n");
    mkdirSync(path.join(root, "brand-work"));
    const receipt = path.join(root, "brand-work", "SOURCE-SHA256SUMS.txt");
    writeFileSync(receipt, "0".repeat(64) + "  source.txt\n");
    execFileSync(process.execPath, [checksumScript, "--index"], options);
    const recorded = readFileSync(receipt, "utf8");
    expect(recorded).toBe(createHash("sha256").update("staged\n").digest("hex") + "  source.txt\n");
    execFileSync(process.execPath, [checksumScript, "--index", "--check"], options);
    expect(() => execFileSync(process.execPath, [checksumScript, "--check"], options)).toThrow();
    expect(readFileSync(receipt, "utf8")).toBe(recorded);
    expect(readFileSync(path.join(root, "source.txt"), "utf8")).toBe("working draft\n");
  });
});

describe("shared proof-operation lock", () => {
  it("prevents renderer or release assembly from racing capture and releases only once", () => {
    const root = temporaryRoot();
    const lockPath = path.join(root, ".botbound-proof-source-identity.json");
    const releaseCapture = acquireProductProofLock(root, { nonce: "capture" });
    expect(() => acquireProductProofLock(root, { purpose: "contact-sheet" })).toThrow();
    expect(JSON.parse(readFileSync(lockPath, "utf8"))).toEqual({ nonce: "capture" });
    releaseCapture();
    const releaseRenderer = acquireProductProofLock(root, { purpose: "contact-sheet" });
    releaseCapture();
    expect(JSON.parse(readFileSync(lockPath, "utf8"))).toEqual({ purpose: "contact-sheet" });
    releaseRenderer();
    expect(existsSync(lockPath)).toBe(false);
  });
});
