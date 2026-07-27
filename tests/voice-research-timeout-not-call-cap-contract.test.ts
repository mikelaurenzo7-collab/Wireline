import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: LIVE_RESEARCH_TIMEOUT_MS must remain a public-research HTTP timeout,
 * never a PSTN call-duration or profitability hard-cap.
 */
describe("live research timeout is not a call-duration cap", () => {
  it("documents that the 8s default belongs to the Perplexity request boundary", () => {
    const source = readFileSync(resolve("src/lib/perplexity-platform.ts"), "utf8");
    expect(source).toMatch(/LIVE_RESEARCH_TIMEOUT_MS/);
    expect(source).toMatch(/NOT a call-duration or billing cap/);
    expect(source).toMatch(/8_000/);
  });

  it("keeps voice accounting rules: finish active calls, prepaid overflow only", () => {
    const source = readFileSync(resolve("src/lib/voice-usage.ts"), "utf8");
    expect(source).toMatch(/never terminated for billing/i);
    expect(source).toMatch(/Runtime Balance/);
    expect(source).not.toMatch(/LIVE_RESEARCH_TIMEOUT/);
  });

  it("surfaces call-length clarity on the public pricing FAQ", () => {
    const source = readFileSync(resolve("src/pages/Pricing.tsx"), "utf8");
    expect(source).toMatch(/Are live calls limited to a few seconds\?/);
    expect(source).toMatch(/Calls run as long as the conversation needs/);
  });
});
