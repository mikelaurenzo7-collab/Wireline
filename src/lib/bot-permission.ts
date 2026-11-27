/**
 * Per-bot permission shown in Set Up.
 *
 * A Bot does the work. How far it goes without its owner is the owner's
 * choice, and the starting point is Auto:
 *
 * - Auto (stored `auto`): acts on its own, and decides for itself when the
 *   owner would want a say. A customer message it decides the owner should
 *   see waits for the owner, with the reason.
 * - Full (stored `full`): acts on its own and never holds a message for the
 *   owner's judgement.
 * - Messages (stored `supervised`): checks before it emails or texts a
 *   customer.
 * - Ask (stored `draft`): waits for everything.
 *
 * Calendar confirmation follows this Bot unless the calendar sets its own mode.
 *
 * None of this waives the checks the law or the carrier requires: consent,
 * do-not-call, calling hours, carrier approval and the message review all run
 * at every level.
 */

export const BOT_PERMISSION_LEVELS = ["auto", "full", "messages", "ask"] as const;
export type BotPermissionLevel = (typeof BOT_PERMISSION_LEVELS)[number];
/**
 * A workspace nobody has changed runs on Auto, and a new Bot follows its
 * workspace. Stamping a level on each new Bot would make it ignore a
 * workspace whose owner asked every Bot to check first.
 */
export const DEFAULT_NEW_BOT_AUTONOMY = "inherit" as const;
export const DEFAULT_WORKSPACE_AUTONOMY = "auto" as const;

/**
 * The only values a workspace or a chat proposal may store. A value outside
 * this list is unreadable to the runtime, which then makes the Bot wait for
 * everything: an owner who asked chat for "full autonomy" once got the
 * opposite that way.
 */
export const STORED_AUTONOMY_VALUES = ["auto", "full", "supervised", "draft"] as const;
export type StoredAutonomy = (typeof STORED_AUTONOMY_VALUES)[number];
export const STORED_AUTONOMY_GUIDE =
  "auto (works on its own and decides when to check with the owner), full (works on its own and never checks), supervised (checks with the owner before it emails or texts a customer), draft (checks with the owner before everything)";

/** Owner-facing names. Auto comes first because it is the starting point. */
export const BOT_PERMISSION_LABELS: Readonly<Record<BotPermissionLevel, string>> = {
  auto: "Auto: it decides when to check with me",
  full: "On its own, always",
  messages: "Check with me before it emails or texts a customer",
  ask: "Check with me before it does anything",
};

/** One sentence on what the owner should expect at each level. */
export const BOT_PERMISSION_SUMMARIES: Readonly<Record<BotPermissionLevel, string>> = {
  auto: "Your Bot handles the work and checks with you only when it decides you would want a say, such as a discount, a refund or a complaint. You get a summary after every call.",
  full: "Your Bot handles the work and never asks before it sends. It still passes you what only you can do, such as a caller who asks for a person. You get a summary after every call.",
  messages:
    "Your Bot waits for you before it emails or texts a customer, and handles everything else on its own.",
  ask: "Your Bot waits for you before it acts. Callers hear that someone will follow up.",
};

const CUSTOMER_SENDS = new Set(["send_email", "send_text_message", "send_contract"]);

export function isBotPermissionLevel(value: unknown): value is BotPermissionLevel {
  return value === "auto" || value === "full" || value === "messages" || value === "ask";
}

/** Reads a stored value the way the engine does, so the screen never shows a level the Bot is not running at. */
export function permissionLevelFromAutonomy(value: string | null | undefined): BotPermissionLevel {
  const level = effectiveAutonomy(value, null);
  if (level === "draft") return "ask";
  if (level === "supervised") return "messages";
  return level;
}

export function autonomyFromPermissionLevel(level: BotPermissionLevel): StoredAutonomy {
  if (level === "ask") return "draft";
  if (level === "messages") return "supervised";
  return level;
}

/**
 * The Bot's own choice wins; a Bot that follows the workspace takes the
 * workspace's. Nothing stored anywhere means nobody chose a level, so the
 * Bot runs on Auto. A stored value this code does not recognise is not that:
 * it waits, because an unreadable setting must never be read as permission.
 */
export function effectiveAutonomy(
  agentLevel?: string | null,
  tenantLevel?: string | null,
): StoredAutonomy {
  const stored = agentLevel && agentLevel !== "inherit" ? agentLevel : tenantLevel;
  if (!stored || stored === "inherit" || stored === "auto") return "auto";
  if (stored === "full") return "full";
  if (stored === "supervised") return "supervised";
  return "draft";
}

/**
 * Whether the Bot itself decides when a customer message needs its owner.
 * Only Auto does. Full never asks, and the two check-first levels always do,
 * so there is nothing left for the Bot to decide at those.
 */
export function botDecidesWhenToAsk(
  agentLevel?: string | null,
  tenantLevel?: string | null,
): boolean {
  return effectiveAutonomy(agentLevel, tenantLevel) === "auto";
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

/** Whether the action engine executes now or files the item for the owner. */
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
  if (level === "auto" || level === "full") return "auto";
  if (level === "draft") return "draft";
  return CUSTOMER_SENDS.has(input.actionType) ? "draft" : "auto";
}
