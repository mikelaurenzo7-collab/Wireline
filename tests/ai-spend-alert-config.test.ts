import { describe, expect, it } from "vitest";

import { resolveAiDailySpendAlertUsd } from "../src/lib/ai-spend-alert";

describe("AI spend alert environment compatibility", () => {
  it("prefers the provider-neutral canonical threshold", () => {
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: "12.5",
        CLAUDE_DAILY_ALERT_USD: "9",
        CLAUDE_MONTHLY_BUDGET_USD: "400",
      }),
    ).toBe(12.5);
  });

  it("preserves the direct legacy daily alias", () => {
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: undefined,
        CLAUDE_DAILY_ALERT_USD: "9",
        CLAUDE_MONTHLY_BUDGET_USD: "400",
      }),
    ).toBe(9);
  });

  it("preserves the historical one-percent monthly conversion", () => {
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: undefined,
        CLAUDE_DAILY_ALERT_USD: undefined,
        CLAUDE_MONTHLY_BUDGET_USD: "400",
      }),
    ).toBe(4);
  });

  it("treats invalid and negative configured values as disabled", () => {
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: "not-a-number",
        CLAUDE_DAILY_ALERT_USD: "8",
        CLAUDE_MONTHLY_BUDGET_USD: "400",
      }),
    ).toBe(0);
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: "-10",
        CLAUDE_DAILY_ALERT_USD: undefined,
        CLAUDE_MONTHLY_BUDGET_USD: undefined,
      }),
    ).toBe(0);
  });

  it("falls through empty values and defaults to zero", () => {
    expect(
      resolveAiDailySpendAlertUsd({
        WIRELINE_AI_DAILY_ALERT_USD: " ",
        CLAUDE_DAILY_ALERT_USD: "",
        CLAUDE_MONTHLY_BUDGET_USD: undefined,
      }),
    ).toBe(0);
  });
});
