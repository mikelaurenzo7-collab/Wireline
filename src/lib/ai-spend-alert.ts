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
 * `WIRELINE_AI_DAILY_ALERT_USD` is the provider-neutral canonical setting and
 * is interpreted directly in USD. Both Claude-prefixed settings remain exact
 * compatibility aliases for the former implementation, which applied the same
 * historical one-percent conversion after selecting either legacy value.
 */
export function resolveAiDailySpendAlertUsd(
  env: SpendAlertEnvironment = process.env,
): number {
  const canonical = nonNegativeUsd(env.WIRELINE_AI_DAILY_ALERT_USD);
  if (canonical != null) return canonical;

  const legacySelected = nonNegativeUsd(
    env.CLAUDE_DAILY_ALERT_USD ?? env.CLAUDE_MONTHLY_BUDGET_USD,
  );
  return legacySelected == null ? 0 : legacySelected * 0.01;
}
