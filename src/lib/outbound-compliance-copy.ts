/**
 * Customer-facing outbound block copy. Plain language for a small business.
 * LAWYER REVIEW NEEDED before these sentences are treated as legal advice.
 */

export const SALES_DNC_LISTED_MESSAGE = "Do Not Call screening blocked this sales call or text.";

export const SALES_DNC_UNAVAILABLE_MESSAGE =
  "Campaigns and automated sales need an active Do Not Call screening connection. Check Campaign Screening in Compliance.";

export const SALES_DNC_LOOKUP_FAILED_MESSAGE =
  "Do Not Call screening could not check this number. Try again after screening is available.";

export const BULK_SALES_SCREENING_REQUIRED_MESSAGE = SALES_DNC_UNAVAILABLE_MESSAGE;

export const SALES_DNC_ATTESTATION_LABEL =
  "I'm responsible for having permission to contact the people I call or text for sales, and for following Do Not Call rules.";

export const SALES_DNC_ATTESTATION_VERSION = "sales-dnc-attestation-2026-10-26";

export const SALES_ATTESTATION_REQUIRED_MESSAGE =
  "Before a sales call or text, confirm you're responsible for permission and Do Not Call rules. It's one checkbox, and we remember it for this workspace.";

export const INTERNAL_DNC_MESSAGE =
  "This person asked not to be contacted. We won't call or text them from this line.";

export const ONE_CALL_PER_DAY_MESSAGE =
  "BotBound attempted a call to this number in the last 24 hours. Check History for the outcome.";

export const CONTACT_PERMISSION_LABEL = "I have this person's permission to contact them.";

export const NONSALES_CONFIRMATION_LABEL = "This isn't selling anything.";

export const CONTACT_PERMISSION_VERSION = "contact-permission-2026-10-26";
export const NONSALES_CONFIRMATION_VERSION = "nonsales-confirmation-2026-10-26";

export const PERMISSION_REQUIRED_MESSAGE =
  "Confirm you have this person's permission before the first call or text.";

export const CALL_NEEDS_PERMISSION_MESSAGE = "This call needs the person's permission first.";

export const NONSALES_REQUIRED_MESSAGE =
  "Confirm this isn't selling anything before a non-sales call or text.";

export const CUSTOMER_SINCE_REQUIRED_MESSAGE =
  "Enter the approximate date of their last purchase or service.";

export const CAMPAIGN_SALES_BADGE =
  "Sales campaign. Connect your seller's Do Not Call Registry subscription to screen each number.";

export const DNC_SAN_HELP =
  "Add your full Registry subscription in Compliance so BotBound can connect the correct screening project.";

function hourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "pm" : "am";
  const twelve = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelve}${suffix}`;
}

/** Quiet-hours block. End hour is exclusive, so 20 reads as 8pm. */
export function quietHoursBlockedMessage(hours: { startHour?: number; endHour?: number }): string {
  const start = hourLabel(hours.startHour ?? 8);
  const end = hourLabel(hours.endHour ?? 20);
  return `It's outside ${start} to ${end} where they are. Try after ${start} their time.`;
}
