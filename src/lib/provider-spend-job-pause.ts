/**
 * Durable queue policy for work whose primary purpose is creating new paid
 * provider activity. Pure reconciliation and teardown jobs that only settle
 * already-incurred usage or reduce billable resources stay out of this list.
 */
export const PAUSABLE_PROVIDER_SPEND_JOB_TYPES = [
  "post_call_artifact",
  "scheduled_report",
  "post_call_enrichment",
  "v2a_action_extraction",
  "execute_action",
  "adaptive_optimization",
  "proactive_lead_enrichment",
  "autonomous_prospecting",
  "knowledge_from_url",
  "vapi_webhook",
  "campaign_dial",
  "cadence_tick",
  "callback_tick",
  "auto_qa_score",
  "trial_ending_soon_email",
  "margin_at_risk_alert",
] as const;

const PAUSABLE_PROVIDER_SPEND_JOB_TYPE_SET = new Set<string>(PAUSABLE_PROVIDER_SPEND_JOB_TYPES);

export const PROVIDER_SPEND_PAUSED_CODE = "PROVIDER_SPEND_PAUSED";
export const PROVIDER_SPEND_PAUSE_DELAY_MS = 5 * 60 * 1000;

export class ProviderSpendPausedError extends Error {
  readonly code = PROVIDER_SPEND_PAUSED_CODE;
  readonly jobType: string;

  constructor(jobType: string) {
    super(`Launch hard gate is on; provider-spend job ${jobType} is paused.`);
    this.name = "ProviderSpendPausedError";
    this.jobType = jobType;
  }
}

export function isProviderSpendPausedError(error: unknown): error is ProviderSpendPausedError {
  return (
    error instanceof ProviderSpendPausedError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === PROVIDER_SPEND_PAUSED_CODE)
  );
}

export function isPausableProviderSpendJobType(type: string): boolean {
  return PAUSABLE_PROVIDER_SPEND_JOB_TYPE_SET.has(type);
}

/** One customer reservation follows the durable job across every attempt. */
export function runtimeReservationReferenceForJob(job: { id: string; type: string }): string {
  return `${job.type}:${job.id}`;
}

/**
 * Undo the attempt increment performed by claimEligibleJob and schedule a
 * bounded recheck. Kept pure so the attempt-neutral behavior is executable in
 * tests independently of Drizzle.
 */
export function providerSpendPauseSchedule(
  claimedAttempts: unknown,
  pausedAt: Date,
  delayMs = PROVIDER_SPEND_PAUSE_DELAY_MS,
): { attempts: number; runAt: Date } {
  const parsed = Number(claimedAttempts);
  const attempts = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  const safeDelayMs = Number.isFinite(delayMs) ? Math.max(0, Math.floor(delayMs)) : 0;
  return {
    attempts: Math.max(0, attempts - 1),
    runAt: new Date(pausedAt.getTime() + safeDelayMs),
  };
}
