/** Explicit per-line opt-in for routine inbound customer texts. */
export function smsAutoReplyEnabled(preferences: unknown, lineNumber: string): boolean {
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) return false;
  const setting = (preferences as Record<string, unknown>).sms_auto_reply;
  return (
    !!setting &&
    typeof setting === "object" &&
    !Array.isArray(setting) &&
    Array.isArray((setting as Record<string, unknown>).enabledNumbers) &&
    ((setting as Record<string, unknown>).enabledNumbers as unknown[]).includes(lineNumber)
  );
}

/** The first automated response to a customer-initiated text carries the program disclosures. */
export function inboundAutoReplyBody(draft: string, firstBusinessReply: boolean): string {
  if (!firstBusinessReply) return draft;
  const disclosures = "Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.";
  return `${draft.trim()} ${disclosures}`;
}

/** A later inbound text or an owner reply supersedes this queued response. */
export function shouldAnswerLatestInbound(input: {
  expectedMessageId: string;
  latestMessageId: string | null;
  latestDirection: string | null;
  receivedAt: Date | null;
  now?: Date;
}): boolean {
  if (
    !input.latestMessageId ||
    input.latestMessageId !== input.expectedMessageId ||
    input.latestDirection !== "in" ||
    !(input.receivedAt instanceof Date)
  ) return false;
  const age = (input.now ?? new Date()).getTime() - input.receivedAt.getTime();
  return age >= 0 && age <= 60 * 60_000;
}
