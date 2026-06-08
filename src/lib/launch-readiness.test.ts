import { describe, expect, it } from "vitest";
import { evaluateLaunchReadiness } from "./launch-readiness";

describe("launch-readiness", () => {
  it("returns capability report with score", () => {
    const report = evaluateLaunchReadiness();
    expect(report.overall_score).toBeGreaterThanOrEqual(0);
    expect(report.overall_score).toBeLessThanOrEqual(100);
    expect(report.capabilities.length).toBeGreaterThanOrEqual(4);
    expect(report.generated_at).toBeTruthy();
  });
});
