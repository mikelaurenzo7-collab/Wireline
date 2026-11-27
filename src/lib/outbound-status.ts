export const CAMPAIGN_STATUS = {
  DRAFT: "draft",
  QUEUED: "queued",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export const LEAD_STATUS = {
  PENDING: "Pending",
  QUEUED: "Queued",
  RETRYING: "Retrying",
  DIALING: "Dialing",
  CONNECTED: "Connected",
  COMPLETED: "Completed",
  FAILED: "Failed",
  ERROR: "Error",
  BLOCKED_DNC: "Blocked-DNC",
  BLOCKED_TCPA: "Blocked-TCPA",
  MAX_ATTEMPTS: "Max-Attempts",
  VOICEMAIL_LEFT: "Voicemail-Left",
  CALLBACK_SCHEDULED: "Callback-Scheduled",
  SKIPPED_DUPLICATE: "Skipped-Duplicate",
} as const;

export const LEAD_PROCESSABLE_STATUSES = [
  LEAD_STATUS.QUEUED,
  LEAD_STATUS.PENDING,
  LEAD_STATUS.RETRYING,
] as const;

export const DEFAULT_LEAD_MAX_ATTEMPTS = 3;

/**
 * Busy, no-answer, canceled, and AMD drops consume one attempt. Remaining
 * budget returns a campaign lead to the campaign dialer; exhaustion is
 * terminal. Only the campaign dialer redials, so a lead with no campaign (a
 * single call) is never left waiting on a retry nobody will make: it ends as
 * Failed and the owner can call again. Fax is handled by callers as a separate
 * non-retryable failure.
 */
export function resolveRetryableLeadStatus(
  attempts: number | null | undefined,
  maxAttempts: number | null | undefined,
  campaignId: string | null | undefined,
): typeof LEAD_STATUS.RETRYING | typeof LEAD_STATUS.MAX_ATTEMPTS | typeof LEAD_STATUS.FAILED {
  if (!campaignId) return LEAD_STATUS.FAILED;
  const current = Math.max(1, Number(attempts) || 0);
  const budget = Math.max(1, Number(maxAttempts) || DEFAULT_LEAD_MAX_ATTEMPTS);
  return current < budget ? LEAD_STATUS.RETRYING : LEAD_STATUS.MAX_ATTEMPTS;
}
