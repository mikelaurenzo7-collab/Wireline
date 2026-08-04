type SpendAlertEnvironment = Pick<
  NodeJS.ProcessEnv,
  "WIRELINE_AI_DAILY_ALERT_USD" | "CLAUDE_DAILY_ALERT_USD" | "CLAUDE_MONTHLY_BUDGET_USD"
>;

function nonNegativeUsd(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

/**
 * Resolve the rolling 24-hour AI spend telemetry threshold.
 *
 * `WIRELINE_AI_DAILY_ALERT_USD` is the provider-neutral canonical setting.
 * The Claude-prefixed settings remain read-only compatibility aliases:
 * `CLAUDE_DAILY_ALERT_USD` is a direct threshold, while the older
 * `CLAUDE_MONTHLY_BUDGET_USD` preserves its historical one-percent conversion.
 */
export function resolveAiDailySpendAlertUsd(
  env: SpendAlertEnvironment = process.env,
): number {
  const canonical = nonNegativeUsd(env.WIRELINE_AI_DAILY_ALERT_USD);
  if (canonical != null) return canonical;

  const legacyDaily = nonNegativeUsd(env.CLAUDE_DAILY_ALERT_USD);
  if (legacyDaily != null) return legacyDaily;

  const legacyMonthly = nonNegativeUsd(env.CLAUDE_MONTHLY_BUDGET_USD);
  return legacyMonthly == null ? 0 : legacyMonthly * 0.01;
}
