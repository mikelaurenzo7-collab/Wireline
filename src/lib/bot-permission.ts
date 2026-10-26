/**
 * Per-bot permission shown in Set Up.
 * Full access executes. Auto asks before customer-facing sends. Ask waits for everything.
 * Calendar confirmation follows this Bot unless the calendar sets its own mode.
 */

export const BOT_PERMISSION_LEVELS = ["full", "auto", "ask"] as const;
export type BotPermissionLevel = (typeof BOT_PERMISSION_LEVELS)[number];
export const DEFAULT_NEW_BOT_AUTONOMY = "supervised" as const;

const CUSTOMER_SENDS = new Set([
  "send_email",
  "send_text_message",
  "update_crm_lead",
  "send_contract",
  "prospect_leads",
]);

export function isBotPermissionLevel(value: unknown): value is BotPermissionLevel {
  return value === "full" || value === "auto" || value === "ask";
}

export function permissionLevelFromAutonomy(value: string | null | undefined): BotPermissionLevel {
  if (value === "auto") return "full";
  if (value === "draft") return "ask";
  return "auto";
}

export function autonomyFromPermissionLevel(
  level: BotPermissionLevel,
): "auto" | "supervised" | "draft" {
  if (level === "full") return "auto";
  if (level === "ask") return "draft";
  return "supervised";
}

export function effectiveAutonomy(
  agentLevel?: string | null,
  tenantLevel?: string | null,
): "auto" | "supervised" | "draft" {
  const stored = agentLevel && agentLevel !== "inherit" ? agentLevel : tenantLevel;
  if (stored === "auto") return "auto";
  if (stored === "supervised") return "supervised";
  return "draft";
}

/**
 * Calendar confirmation. Approval always waits. Automatic always books.
 * Inherit follows the Bot, then the workspace. Ask (`draft`) is Requested
 * unless the owner already approved this booking.
 */
export function nativeAppointmentStatus(input: {
  bookingMode: "automatic" | "approval" | "inherit";
  agentLevel?: string | null;
  tenantLevel?: string | null;
  ownerApproved?: boolean;
}): "Scheduled" | "Requested" {
  if (input.bookingMode === "approval") return "Requested";
  if (input.bookingMode === "automatic" || input.ownerApproved) return "Scheduled";
  return effectiveAutonomy(input.agentLevel, input.tenantLevel) === "draft"
    ? "Requested"
    : "Scheduled";
}

/** Whether the action engine executes now or files an approval. */
export function actionExecutionMode(input: {
  agentLevel?: string | null;
  tenantLevel?: string | null;
  actionType: string;
  calendarBookingMode?: string | null;
  nativeCalendarConfigured?: boolean;
}): "auto" | "draft" {
  if (input.actionType === "schedule_calendar" && input.nativeCalendarConfigured) {
    if (input.calendarBookingMode === "automatic" || input.calendarBookingMode === "approval") {
      return "auto";
    }
    return effectiveAutonomy(input.agentLevel, input.tenantLevel) === "draft" ? "draft" : "auto";
  }
  const level = effectiveAutonomy(input.agentLevel, input.tenantLevel);
  if (level === "auto") return "auto";
  if (level === "draft") return "draft";
  return CUSTOMER_SENDS.has(input.actionType) ? "draft" : "auto";
}
