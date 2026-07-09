export const CAMPAIGN_STATUS = {
  DRAFT: "draft",
  QUEUED: "queued",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];

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

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

export const CAMPAIGN_PROCESSABLE_STATUSES = [CAMPAIGN_STATUS.RUNNING] as const;
export const LEAD_PROCESSABLE_STATUSES = [
  LEAD_STATUS.QUEUED,
  LEAD_STATUS.PENDING,
  LEAD_STATUS.RETRYING,
] as const;

export function isTerminalLeadStatus(status: string | null | undefined): boolean {
  const terminalStatuses: readonly string[] = [
    LEAD_STATUS.COMPLETED,
    LEAD_STATUS.FAILED,
    LEAD_STATUS.ERROR,
    LEAD_STATUS.BLOCKED_DNC,
    LEAD_STATUS.BLOCKED_TCPA,
    LEAD_STATUS.MAX_ATTEMPTS,
    LEAD_STATUS.SKIPPED_DUPLICATE,
    LEAD_STATUS.VOICEMAIL_LEFT,
    LEAD_STATUS.CALLBACK_SCHEDULED,
  ];
  return terminalStatuses.includes(status || "");
}
