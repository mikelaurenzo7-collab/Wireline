import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("launch artifact approval gates", () => {
  it("publishes exact-worktree proof only after content and diagnostics are bound", () => {
    const capture = read("scripts/capture-botbound-current-worktree-proof.mjs");
    const framePublish = capture.indexOf("await rename(path.join(stagingDir, filename)");
    const manifestPublish = capture.indexOf("await rename(stagedManifestPath, proofManifestPath)");

    expect(capture).toContain('createHash("sha256").update(outputBytes).digest("hex")');
    expect(capture).toContain("bytes: outputBytes.byteLength");
    expect(capture).toContain("result.consoleErrors.length > 0");
    expect(capture).toContain("result.failedRequests.length > 0");
    expect(capture).toContain("result.finalRouteMatched");
    expect(framePublish).toBeGreaterThan(-1);
    expect(manifestPublish).toBeGreaterThan(framePublish);
  });

  it("refuses to assemble a release from stale or byte-swapped product proof", () => {
    const release = read("scripts/build-botbound-launch-release-manifest.mjs");
    const approval = release.indexOf("await assertApprovedProductProof()");
    const inventory = release.indexOf("const allFiles =", approval);

    expect(approval).toBeGreaterThan(-1);
    expect(inventory).toBeGreaterThan(approval);
    expect(release).toContain('createHash("sha256").update(bytes).digest("hex")');
    expect(release).toContain("result.bytes !== bytes.byteLength");
    expect(release).toContain("stale or unapproved frames");
  });

  it("binds the outbound campaign manifest to one exact, currently approved motion set", () => {
    const renderer = read("scripts/render-botbound-outbound-launch-assets.mjs");
    const invalidate = renderer.indexOf("rmSync(manifestPath, { force: true })");
    const motionApproval = renderer.indexOf("assertApprovedOutboundMotion()", invalidate);
    const firstRender = renderer.indexOf("const render =", motionApproval);
    const checksumPublish = renderer.indexOf("renameSync(stagedChecksumPath, checksumPath)");
    const manifestPublish = renderer.indexOf("renameSync(stagedManifestPath, manifestPath)");

    expect(invalidate).toBeGreaterThan(-1);
    expect(motionApproval).toBeGreaterThan(invalidate);
    expect(firstRender).toBeGreaterThan(motionApproval);
    expect(renderer).toContain("Outbound motion inventory is not the approved 6s/10s/15s set");
    expect(renderer).toContain("assertOutboundRenderReceipt(renderReceipt, currentSource)");
    expect(renderer).toContain('metadataReceipt?.file !== "render-provenance.json"');
    expect(renderer).toContain("metadataReceipt?.sha256 !== sha256File(renderReceiptPath)");
    expect(renderer).toContain(
      "Outbound motion QA metadata is not bound to its exact render receipt.",
    );
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

    expect(messaging).toContain("### OUTBOUND");
    expect(messaging).toContain("### INBOUND");
    expect(messaging).toContain(
      "Create a free account to build, train, and hear your Bot privately",
    );
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
    ]) {
      expect(workflow).toContain(script);
    }
  });
});
