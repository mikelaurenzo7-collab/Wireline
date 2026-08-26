import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production visual QA safety gate", () => {
  const capture = read("scripts/capture-prod-visual-qa.mjs");
  const workflow = read(".github/workflows/production-visual-qa.yml");

  it("uses a stable QA sign-in without creating or mutating production records", () => {
    expect(capture).toContain("WIRELINE_VISUAL_EMAIL");
    expect(capture).toContain("WIRELINE_VISUAL_PASSWORD");
    expect(capture).toContain("/signin?redirect=%2Fstudio");
    expect(capture).toContain("qaAccountConfigured");
    expect(capture).not.toMatch(/mailinator|signUp\(|auth-terms|completeOnboarding/i);
    expect(capture).not.toMatch(/Create and open Studio|Save fact|Change Plan|engineering\.test/);
  });

  it("writes a stable manifest and makes CI enforce every P0", () => {
    expect(capture).toContain('path.join(outputRoot, "latest-manifest.json")');
    expect(capture).toContain('kind: "auth"');
    expect(workflow).toContain("WIRELINE_VISUAL_EMAIL: ${{ secrets.WIRELINE_VISUAL_EMAIL }}");
    expect(workflow).toContain("WIRELINE_VISUAL_PASSWORD: ${{ secrets.WIRELINE_VISUAL_PASSWORD }}");
    expect(workflow).toContain(
      "node scripts/check-visual-qa-manifest.mjs artifacts/visual-qa-prod/latest-manifest.json",
    );
  });
});
