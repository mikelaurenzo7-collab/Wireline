/**
 * TCPA permitted calling hours (47 CFR § 64.1200(c)(1)):
 * automated/telemarketing calls may only be placed between 8:00 a.m. and
 * 9:00 p.m. local time at the called party's location.
 *
 * State → timezone is a best-effort NANP mapping. When the destination state
 * cannot be inferred, we use the continental US intersection window
 * (11:00–21:00 America/New_York) so a call is legal in every continental zone.
 */
import { inferStateFromPhone } from "./tcpa-consent";

export const TCPA_CALLING_HOUR_START = 8;
export const TCPA_CALLING_HOUR_END = 21; // exclusive of 21:00+ (last legal hour is 20:xx)

/** Primary IANA zone per USPS state for TCPA local-time checks. */
const STATE_PRIMARY_TIMEZONE: Record<string, string> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Boise",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago",
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
  // NANP territories commonly reached from US outbound
  PR: "America/Puerto_Rico",
  VI: "America/St_Thomas",
  GU: "Pacific/Guam",
};

/** Conservative continental intersection when state/timezone is unknown. */
const UNKNOWN_DESTINATION_TIMEZONE = "America/New_York";
const UNKNOWN_DESTINATION_START_HOUR = 11;
const UNKNOWN_DESTINATION_END_HOUR = 21;

export type CallingHoursDecision = {
  allowed: boolean;
  state: string | null;
  timeZone: string;
  localHour: number;
  startHour: number;
  endHour: number;
  inferred: boolean;
};

function localHourInZone(now: Date, timeZone: string): number {
  const hourRaw = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hourPart = hourRaw.find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart);
  return Number.isFinite(hour) ? hour : -1;
}

export function resolveCallingHoursForPhone(
  phone: string | null | undefined,
  now: Date = new Date(),
): CallingHoursDecision {
  const state = inferStateFromPhone(phone);
  const inferredZone = state ? STATE_PRIMARY_TIMEZONE[state] : null;
  const inferred = Boolean(inferredZone);
  const timeZone = inferredZone || UNKNOWN_DESTINATION_TIMEZONE;
  const startHour = inferred ? TCPA_CALLING_HOUR_START : UNKNOWN_DESTINATION_START_HOUR;
  const endHour = inferred ? TCPA_CALLING_HOUR_END : UNKNOWN_DESTINATION_END_HOUR;
  const localHour = localHourInZone(now, timeZone);
  const allowed = localHour >= startHour && localHour < endHour;

  return {
    allowed,
    state,
    timeZone,
    localHour,
    startHour,
    endHour,
    inferred,
  };
}

export function isWithinTcpACallingHours(
  phone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return resolveCallingHoursForPhone(phone, now).allowed;
}
