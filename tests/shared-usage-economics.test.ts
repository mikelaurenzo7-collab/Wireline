import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  sharedUsageEconomics,
  sharedUsageRetailComparisons,
} from "../scripts/lib/shared-usage-economics.mts";

describe("current shared-usage economics", () => {
  it("prices retail allowance as provider work and reserves independent funding once", () => {
    const rows = sharedUsageEconomics();
    expect(rows.map((row) => row.id)).toEqual(["lite", "standard", "plus"]);
    expect(rows.map((row) => row.fullVoiceMinutes)).toEqual([16, 56, 144]);
    expect(rows.map((row) => row.identityCostUsd)).toEqual([3.15, 3.15, 6.3]);
    // Hand-computed totals include one payment fee, $2 AI, and each Computer
    // envelope. Deducting $4/$14/$36 as cash COGS would materially misprice plans.
    for (const [index, contribution] of [3.01, 6.898, 10.959].entries()) {
      expect(rows[index].stressContributionUsd).toBeCloseTo(contribution, 8);
      expect(rows[index].stressBelowFloor).toBe(true);
    }
    expect(rows[1].voiceContributionUsd).toBeCloseTo(10.398, 8);
  });

  it("detects the middle-plan bill disadvantage without misclassifying bundled Plus", () => {
    expect(sharedUsageRetailComparisons()).toEqual([
      expect.objectContaining({
        alternativeId: "lite",
        candidateId: "standard",
        maximumSavingUsd: 12,
        includedNumbers: 1,
        includedEmailAddresses: 1,
        alternativeComputerBudgetUsd: 1,
        candidateComputerBudgetUsd: 3.5,
      }),
    ]);
  });

  it("exposes adverse voice-cost sensitivity rather than clamping loss to zero", () => {
    const plus = sharedUsageEconomics(0.3).find((row) => row.id === "plus")!;
    expect(plus.stressContributionUsd).toBeCloseTo(-13.809, 8);
    expect(plus.stressBelowFloor).toBe(true);
    const ordinary = sharedUsageEconomics().find((row) => row.id === "plus")!;
    expect(
      sharedUsageEconomics(ordinary.voiceBreakEvenPerMinuteUsd)[2].stressContributionUsd,
    ).toBeCloseTo(0, 8);
    expect(() => sharedUsageEconomics(Number.NaN)).toThrow("finite and nonnegative");
  });

  it("makes the canonical CLI report current-plan review instead of a historical-only PASS", () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !/KEY|TOKEN|SECRET|URL|PASSWORD/.test(key)),
    );
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/report-plan-economics.mts"],
      {
        cwd: process.cwd(),
        env: { ...env, NODE_ENV: "test", WIRELINE_IMPORT_SMOKE_NO_DATABASE: "true" },
        encoding: "utf8",
        timeout: 20_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain("Current Shared-Usage Plans");
    for (const name of ["Lite", "Starter", "Plus"])
      expect(result.stdout).toContain(`REVIEW: ${name} reserve stress`);
    expect(result.stdout).toContain("VALUE WARNING: Starter never has a lower work bill than Lite");
    expect(result.stdout).toContain("not a reachable double use of the pool");
    expect(result.stdout).toContain(
      "Historical package PASS does not approve current plans or prove net profit",
    );
  });
});
