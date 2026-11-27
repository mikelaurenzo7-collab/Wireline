/**
 * Per-bot permission shown in Set Up.
 *
 * A Bot acts on its own unless the owner asks it to check first. That is the
 * product: the owner sets what the Bot may do, and the Bot does it. Checking
 * first is a choice an owner can make, never the starting point.
 *
 * Full (stored `auto`) executes. Auto (stored `supervised`) checks before
 * customer-facing sends. Ask (stored `draft`) waits for everything.
 * Calendar confirmation follows this Bot unless the calendar sets its own mode.
 *
 * None of this waives the checks the law or the carrier requires: consent,
 * do-not-call, calling hours, carrier approval and the message review all run
 * for a Bot that acts on its own.
 */

export const BOT_PERMISSION_LEVELS = ["full", "auto", "ask"] as const;
export type BotPermissionLevel = (typeof BOT_PERMISSION_LEVELS)[number];
/**
 * A workspace nobody has changed acts on its own, and a new Bot follows its
 * workspace. Stamping "auto" on each new Bot would make it ignore a workspace
 * whose owner asked every Bot to check first.
 */
export const DEFAULT_NEW_BOT_AUTONOMY = "inherit" as const;
export const DEFAULT_WORKSPACE_AUTONOMY = "auto" as const;

/**
 * The only values a workspace or a chat proposal may store. A value outside
 * this list is unreadable to the runtime, which then makes the Bot wait for
 * everything: an owner who asked chat for "full autonomy" once got the
 * opposite that way.
 */
export const STORED_AUTONOMY_VALUES = ["auto", "supervised", "draft"] as const;
export const STORED_AUTONOMY_GUIDE =
  "auto (works on its own), supervised (checks with the owner before it emails or texts a customer), draft (checks with the owner before everything)";

/** Owner-facing names. "On its own" comes first because it is the default. */
export const BOT_PERMISSION_LABELS: Readonly<Record<BotPermissionLevel, string>> = {
  full: "On its own",
  auto: "Check with me before it emails or texts a customer",
  ask: "Check with me before it does anything",
};

/** One sentence on what the owner should expect at each level. */
export const BOT_PERMISSION_SUMMARIES: Readonly<Record<BotPermissionLevel, string>> = {
  full: "Your Bot handles the work without waiting for you. You get a summary after every call.",
  auto: "Your Bot waits for you before it emails or texts a customer, and handles everything else on its own.",
  ask: "Your Bot waits for you before it acts. Callers hear that someone will follow up.",
};

const CUSTOMER_SENDS = new Set(["send_email", "send_text_message", "send_contract"]);

export function isBotPermissionLevel(value: unknown): value is BotPermissionLevel {
  return value === "full" || value === "auto" || value === "ask";
}

/** Reads a stored value the way the engine does, so the screen never shows a level the Bot is not running at. */
export function permissionLevelFromAutonomy(value: string | null | undefined): BotPermissionLevel {
  const level = effectiveAutonomy(value, null);
  if (level === "draft") return "ask";
  if (level === "supervised") return "auto";
  return "full";
}

export function autonomyFromPermissionLevel(
  level: BotPermissionLevel,
): "auto" | "supervised" | "draft" {
  if (level === "full") return "auto";
  if (level === "ask") return "draft";
  return "supervised";
}

/**
 * The Bot's own choice wins; a Bot that follows the workspace takes the
 * workspace's. Nothing stored anywhere means nobody asked the Bot to check
 * first, so it acts on its own. A stored value this code does not recognise
 * is not that: it waits, because an unreadable setting must never be read as
 * permission.
 */
export function effectiveAutonomy(
  agentLevel?: string | null,
  tenantLevel?: string | null,
): "auto" | "supervised" | "draft" {
  const stored = agentLevel && agentLevel !== "inherit" ? agentLevel : tenantLevel;
  if (!stored || stored === "inherit" || stored === "auto") return "auto";
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
