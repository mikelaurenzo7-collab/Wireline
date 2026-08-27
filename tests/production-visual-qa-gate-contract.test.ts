import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production visual QA safety gate", () => {
  const capture = read("scripts/capture-prod-visual-qa.mjs");
  const gate = read("scripts/check-visual-qa-manifest.mjs");
  const workflow = read(".github/workflows/production-visual-qa.yml");

  it("uses a stable QA sign-in without creating or mutating production records", () => {
    expect(capture).toContain("WIRELINE_VISUAL_EMAIL");
    expect(capture).toContain("WIRELINE_VISUAL_PASSWORD");
    expect(capture).toContain("WIRELINE_VISUAL_EXPECTED_EMAIL");
    expect(capture).toContain('accountEnvironment !== "demo"');
    expect(capture).toContain('fetch("/api/settings", { credentials: "same-origin" })');
    expect(capture).toContain("/signin?redirect=%2Fstudio");
    expect(capture).toContain("qaAccountConfigured");
    expect(capture).not.toMatch(/mailinator|signUp\(|auth-terms|completeOnboarding/i);
    expect(capture).not.toMatch(/Create and open Studio|Save fact|Change Plan|engineering\.test/);
  });

  it("writes a stable manifest and makes CI enforce every P0", () => {
    expect(capture).toContain('path.join(outputRoot, "latest-manifest.json")');
    expect(capture).toContain('kind: "auth"');
    expect(capture).toContain('"/settings/not-a-route"');
    expect(capture).toContain('"phone,desktop,laptop,breakpoint,short"');
    expect(capture).toContain("path: `${prefix}-scroll-end.png`");
    expect(capture).toContain("final.pathname === redirectTarget.pathname");
    expect(capture).toContain("final.search === expectedSearch");
    expect(capture).toContain("final.hash === expectedHash");
    expect(capture).toContain('["/settings/phone", "/phone?tab=setup"]');
    expect(capture).not.toContain("finalUrl.startsWith");
    expect(capture).toContain("authenticatedScrollCaptureCount += 1");
    expect(capture).toContain(
      "authenticatedCaptureRoutes.length * viewports.length * 2 + authenticatedScrollCaptureCount",
    );
    expect(capture).toContain(
      "publicScreenshotCountExpected + authenticatedScreenshotCountExpected",
    );
    expect(gate).toContain('"pageerror"');
    expect(gate).toContain('"console"');
    expect(gate).toContain("manifest.qaAccountConfigured !== true");
    expect(gate).toContain("manifest.authenticatedCapture !== true");
    expect(workflow).toContain("WIRELINE_VISUAL_EXPECTED_EMAIL: wireline.demo@trywireline.com");
    expect(workflow).toContain("WIRELINE_VISUAL_EMAIL: ${{ secrets.WIRELINE_VISUAL_EMAIL }}");
    expect(workflow).toContain("WIRELINE_VISUAL_PASSWORD: ${{ secrets.WIRELINE_VISUAL_PASSWORD }}");
    expect(workflow).toContain(
      "node scripts/check-visual-qa-manifest.mjs artifacts/visual-qa-prod/latest-manifest.json",
    );
  });

  it("binds every capture to the exact production source before and after browser work", () => {
    const beforeIndex = capture.indexOf("waitForRemoteSourceCommit(sourceCommit, baseUrl");
    const browserIndex = capture.indexOf("chromium.launch");
    const browserCloseIndex = capture.indexOf("await browser.close()");
    const afterIndex = capture.indexOf("verifyRemoteSourceCommit(sourceCommit, baseUrl)");

    expect(capture).toContain("resolveSourceCommit(repoRoot)");
    expect(capture.match(/assertCleanCheckout\(repoRoot, sourceCommit\)/g)).toHaveLength(2);
    expect(beforeIndex).toBeGreaterThan(-1);
    expect(browserIndex).toBeGreaterThan(beforeIndex);
    expect(afterIndex).toBeGreaterThan(browserCloseIndex);
    expect(capture).toContain("sourceVerificationBefore");
    expect(capture).toContain("sourceVerificationAfter");
    expect(gate).toContain("manifest.sourceVerificationBefore?.deployedCommit");
    expect(gate).toContain("manifest.sourceVerificationAfter?.deployedCommit");
    expect(workflow).toContain("timeout-minutes: 35");
  });
});
