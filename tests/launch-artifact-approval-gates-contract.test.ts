import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("launch artifact approval gates", () => {
  it("publishes exact-worktree proof only after content and diagnostics are bound", () => {
    const capture = read("scripts/capture-botbound-current-worktree-proof.mjs");
    const validation = capture.indexOf("assertProductProofManifest(manifest)");
    const batchPublish = capture.indexOf("publishProofFiles({", validation);
    const frameEntry = capture.indexOf("...captures.map(", batchPublish);
    const manifestEntry = capture.indexOf("path.basename(proofManifestPath)", batchPublish);

    expect(capture).toContain('createHash("sha256").update(outputBytes).digest("hex")');
    expect(capture).toContain("bytes: outputBytes.byteLength");
    expect(capture).toContain("result.consoleErrors.length > 0");
    expect(capture).toContain("result.failedRequests.length > 0");
    expect(capture).toContain("result.finalRouteMatched");
    expect(validation).toBeGreaterThan(-1);
    expect(batchPublish).toBeGreaterThan(validation);
    expect(frameEntry).toBeGreaterThan(batchPublish);
    expect(manifestEntry).toBeGreaterThan(frameEntry);
    expect(capture).toContain("acquireProductProofLock(repositoryRoot");
  });

  it("refuses to assemble a release from stale or byte-swapped product proof", () => {
    const release = read("scripts/build-botbound-launch-release-manifest.mjs");
    const approval = release.indexOf("await assertCurrentProductProof(repositoryBaseSha)");
    const inventory = release.indexOf("const allFiles =", approval);

    expect(approval).toBeGreaterThan(-1);
    expect(inventory).toBeGreaterThan(approval);
    expect(release).toContain('createHash("sha256").update(bytes).digest("hex")');
    expect(release).toContain("result.bytes !== bytes.byteLength");
    expect(release).toContain("proof.revision.commit !== repositoryBaseSha");
    expect(release).toContain("relative !== path.basename(relative)");
    expect(release).toContain("proof.contactSheet.sha256.toLowerCase() !== contactSheetDigest");
    expect(release).toContain("stale or unaccepted frames");
    expect(release).toContain("assertProductProofManifest(proof)");
    expect(release).toContain(
      "proof.sourceSnapshot.sha256 !== readProductProofSource(repoRoot).sourceSnapshot.sha256",
    );
  });

  it("binds the outbound campaign manifest to one exact, currently approved motion set", () => {
    const renderer = read("scripts/render-botbound-outbound-launch-assets.mjs");
    const invalidate = renderer.indexOf("rmSync(resolve(campaignRoot, receipt), { force: true })");
    const motionApproval = renderer.indexOf(
      "if (!staticOnly) assertApprovedOutboundMotion()",
      invalidate,
    );
    const firstRender = renderer.indexOf("const render =", motionApproval);
    const checksumPublish = renderer.indexOf("renameSync(stagedChecksumPath, checksumPath)");
    const manifestPublish = renderer.indexOf("renameSync(stagedManifestPath, manifestPath)");

    expect(invalidate).toBeGreaterThan(-1);
    expect(renderer.slice(0, invalidate)).toContain('"manifest.json"');
    expect(renderer.slice(0, invalidate)).toContain('"static-manifest.json"');
    expect(motionApproval).toBeGreaterThan(invalidate);
    expect(firstRender).toBeGreaterThan(motionApproval);
    expect(renderer).toContain("Outbound motion inventory is not the approved 6s/10s/15s set");
    expect(renderer).toContain("assertOutboundRenderReceipt(renderReceipt, currentSource)");
    expect(renderer).toContain('metadataReceipt?.file !== "render-provenance.json"');
    expect(renderer).toContain("metadataReceipt?.sha256 !== sha256File(renderReceiptPath)");
    expect(renderer).toContain(
      "Outbound motion QA metadata is not bound to its exact render receipt.",
    );
    expect(renderer).toContain("artifact.bytes !== evidenceBytes.byteLength");
    expect(renderer).toContain("artifact.sha256.toLowerCase() !== evidenceDigest");
    expect(checksumPublish).toBeGreaterThan(-1);
    expect(manifestPublish).toBeGreaterThan(checksumPublish);
  });

  it("builds the selectable investor PDF before approving the static release inventory", () => {
    const renderer = read("scripts/render-botbound-outbound-launch-assets.mjs");
    const pdfBuilder = read("scripts/build-botbound-outbound-investor-pdf.py");
    const pdfBuild = renderer.indexOf("const investorPdf = buildInvestorPdf()");
    const releaseInventory = renderer.indexOf("const manifestFiles =", pdfBuild);

    expect(renderer).toContain("build-botbound-outbound-investor-pdf.py");
    expect(renderer).toContain("botbound-outbound-investor-one-pager-2026-09.pdf");
    expect(pdfBuild).toBeGreaterThan(-1);
    expect(releaseInventory).toBeGreaterThan(pdfBuild);
    expect(pdfBuilder).toContain("rl_config.invariant = 1");
    expect(pdfBuilder).toContain("invariant=1");
  });

  it("keeps website messaging two-directional without a public demo promise", () => {
    const messaging = read("brand-work/launch-2026-09-outbound/WEBSITE_MESSAGING.md");

    expect(messaging).toMatch(/^### Outbound$/im);
    expect(messaging).toMatch(/^### Inbound$/im);
    expect(messaging).toContain("Hearing or testing a Bot begins after account creation");
    expect(messaging).toContain("there is no public call or public audio demo");
    expect(messaging).not.toContain("HEAR A LIVE BOT");
    expect(messaging).not.toContain("Sales Bot demo");
  });

  it("keeps every changed launch approval tool inside the brand-film workflow", () => {
    const workflow = read(".github/workflows/brand-film-qa.yml");
    for (const script of [
      "scripts/render-botbound-outbound-launch-assets.mjs",
      "scripts/render-botbound-product-proof-contact-sheet.mjs",
      "scripts/capture-botbound-current-worktree-proof.mjs",
      "scripts/build-botbound-launch-release-manifest.mjs",
      "scripts/lib/product-proof-*",
      "scripts/start-botbound-proof-api-stub.mjs",
    ]) {
      expect(workflow).toContain(script);
    }
  });
});
