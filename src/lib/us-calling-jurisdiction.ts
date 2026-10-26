/**
 * United States locations for reviewed calling.
 * Hours use the federal 8am–9pm window, then a stricter state start already
 * enforced for phone inference. The recipient's signed time zone must be one
 * the state actually uses.
 */

export const FEDERAL_CALLING_HOUR_START = 8;
export const FEDERAL_CALLING_HOUR_END = 21;

const STATE_CALLING_HOUR_START: Readonly<Record<string, number>> = { IL: 9 };

const US_CALLING_STATES = [
  ["AL", "Alabama", "America/Chicago"],
  ["AK", "Alaska", "America/Anchorage"],
  ["AZ", "Arizona", "America/Phoenix"],
  ["AR", "Arkansas", "America/Chicago"],
  ["CA", "California", "America/Los_Angeles"],
  ["CO", "Colorado", "America/Denver"],
  ["CT", "Connecticut", "America/New_York"],
  ["DE", "Delaware", "America/New_York"],
  ["DC", "District of Columbia", "America/New_York"],
  ["FL", "Florida", "America/New_York"],
  ["GA", "Georgia", "America/New_York"],
  ["HI", "Hawaii", "Pacific/Honolulu"],
  ["ID", "Idaho", "America/Boise"],
  ["IL", "Illinois", "America/Chicago"],
  ["IN", "Indiana", "America/Indiana/Indianapolis"],
  ["IA", "Iowa", "America/Chicago"],
  ["KS", "Kansas", "America/Chicago"],
  ["KY", "Kentucky", "America/New_York"],
  ["LA", "Louisiana", "America/Chicago"],
  ["ME", "Maine", "America/New_York"],
  ["MD", "Maryland", "America/New_York"],
  ["MA", "Massachusetts", "America/New_York"],
  ["MI", "Michigan", "America/Detroit"],
  ["MN", "Minnesota", "America/Chicago"],
  ["MS", "Mississippi", "America/Chicago"],
  ["MO", "Missouri", "America/Chicago"],
  ["MT", "Montana", "America/Denver"],
  ["NE", "Nebraska", "America/Chicago"],
  ["NV", "Nevada", "America/Los_Angeles"],
  ["NH", "New Hampshire", "America/New_York"],
  ["NJ", "New Jersey", "America/New_York"],
  ["NM", "New Mexico", "America/Denver"],
  ["NY", "New York", "America/New_York"],
  ["NC", "North Carolina", "America/New_York"],
  ["ND", "North Dakota", "America/Chicago"],
  ["OH", "Ohio", "America/New_York"],
  ["OK", "Oklahoma", "America/Chicago"],
  ["OR", "Oregon", "America/Los_Angeles"],
  ["PA", "Pennsylvania", "America/New_York"],
  ["RI", "Rhode Island", "America/New_York"],
  ["SC", "South Carolina", "America/New_York"],
  ["SD", "South Dakota", "America/Chicago"],
  ["TN", "Tennessee", "America/Chicago"],
  ["TX", "Texas", "America/Chicago"],
  ["UT", "Utah", "America/Denver"],
  ["VT", "Vermont", "America/New_York"],
  ["VA", "Virginia", "America/New_York"],
  ["WA", "Washington", "America/Los_Angeles"],
  ["WV", "West Virginia", "America/New_York"],
  ["WI", "Wisconsin", "America/Chicago"],
  ["WY", "Wyoming", "America/Denver"],
] as const;

export type UsCallingStateCode = (typeof US_CALLING_STATES)[number][0];

export const US_CALLING_STATE_CODES = US_CALLING_STATES.map((row) => row[0]) as unknown as [
  UsCallingStateCode,
  ...UsCallingStateCode[],
];

export const US_STATE_PRIMARY_TIMEZONE: Record<string, string> = Object.fromEntries(
  US_CALLING_STATES.map(([code, , timeZone]) => [code, timeZone]),
);

/** States whose numbers can sit in more than one zone. The signed zone must be one of these. */
export const US_STATE_SPANNED_TIMEZONES: Record<string, readonly string[]> = {
  FL: ["America/New_York", "America/Chicago"],
  MI: ["America/Detroit", "America/Chicago"],
  IN: ["America/Indiana/Indianapolis", "America/Chicago"],
  KY: ["America/New_York", "America/Chicago"],
  TN: ["America/Chicago", "America/New_York"],
  TX: ["America/Chicago", "America/Denver"],
  KS: ["America/Chicago", "America/Denver"],
  NE: ["America/Chicago", "America/Denver"],
  ND: ["America/Chicago", "America/Denver"],
  SD: ["America/Chicago", "America/Denver"],
  OR: ["America/Los_Angeles", "America/Denver"],
  ID: ["America/Boise", "America/Los_Angeles"],
};

const STATE_NAMES = new Map<string, string>(US_CALLING_STATES.map(([code, name]) => [code, name]));

export function isUsCallingState(value: unknown): value is UsCallingStateCode {
  return typeof value === "string" && STATE_NAMES.has(value);
}

export function usCallingStateName(code: string): string {
  return STATE_NAMES.get(code) || code;
}

export function callingHourStart(state: string | null | undefined): number {
  return (state && STATE_CALLING_HOUR_START[state]) || FEDERAL_CALLING_HOUR_START;
}

export function timeZonesForCallingState(state: string): readonly string[] {
  if (!isUsCallingState(state)) return [];
  return US_STATE_SPANNED_TIMEZONES[state] || [US_STATE_PRIMARY_TIMEZONE[state]];
}

export function isRecipientCallingTimeZone(state: string, timeZone: unknown): timeZone is string {
  return typeof timeZone === "string" && timeZonesForCallingState(state).includes(timeZone);
}

export function parseUsCallingStateFromAddress(address: string): UsCallingStateCode | null {
  if (!/\b\d{5}(?:-\d{4})?\b/.test(address)) return null;
  const code = address.toUpperCase().match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (code && isUsCallingState(code[1])) return code[1];
  const names = [...US_CALLING_STATES].sort((left, right) => right[1].length - left[1].length);
  for (const [abbr, name] of names) {
    if (new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\b`, "i").test(address)) return abbr;
  }
  return null;
}
