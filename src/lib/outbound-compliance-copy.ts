/**
 * Customer-facing outbound block copy. Plain language for a small business.
 * LAWYER REVIEW NEEDED before these sentences are treated as legal advice.
 */

export const SALES_DNC_LISTED_MESSAGE =
  "This number is on the Do Not Call list, so we can't place sales calls or texts to it. If they're already your customer, or they reached out to you recently, choose Existing customer or Returning their call instead.";

export const SALES_DNC_UNAVAILABLE_MESSAGE =
  "Campaigns and automated sales need number screening before they can send. Add a Do Not Call screening connection in Settings. One-at-a-time sales calls and texts still work after you confirm you're responsible for permission and Do Not Call rules. Personal, appointment, and follow-up calls still work.";

export const BULK_SALES_SCREENING_REQUIRED_MESSAGE = SALES_DNC_UNAVAILABLE_MESSAGE;

export const SALES_DNC_ATTESTATION_LABEL =
  "I'm responsible for having permission to contact the people I call or text for sales, and for following Do Not Call rules.";

export const SALES_DNC_ATTESTATION_VERSION = "sales-dnc-attestation-2026-10-26";

export const SALES_ATTESTATION_REQUIRED_MESSAGE =
  "Before a sales call or text, confirm you're responsible for permission and Do Not Call rules. It's one checkbox, and we remember it for this workspace.";

export const INTERNAL_DNC_MESSAGE =
  "This person asked not to be contacted. We won't call or text them from this line.";

export const ONE_CALL_PER_DAY_MESSAGE =
  "This number already got a call today. You can try again tomorrow.";

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
  "Sales campaign. Number screening has to be connected, and Do Not Call numbers are skipped.";

export const DNC_SAN_HELP =
  "Optional. If you connect Do Not Call screening, paste your registry account number here and we send it with sales checks. One-at-a-time sales calls and texts work without it after you confirm you're responsible for permission and Do Not Call rules. Campaigns need screening connected. Personal, appointment, and follow-up calls don't use it.";

function hourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "pm" : "am";
  const twelve = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelve}${suffix}`;
}

/** Quiet-hours block. End hour is exclusive, so 20 reads as 8pm. */
export function quietHoursBlockedMessage(hours: {
  startHour?: number;
  endHour?: number;
}): string {
  const start = hourLabel(hours.startHour ?? 8);
  const end = hourLabel(hours.endHour ?? 20);
  return `It's outside ${start}–${end} where they are. Try after ${start} their time.`;
}
