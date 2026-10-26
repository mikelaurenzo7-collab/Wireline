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
import {
  callingHourStart,
  FEDERAL_CALLING_HOUR_END,
  FEDERAL_CALLING_HOUR_START,
  isRecipientCallingTimeZone,
  isUsCallingState,
  US_STATE_PRIMARY_TIMEZONE,
  US_STATE_SPANNED_TIMEZONES,
} from "./us-calling-jurisdiction";

export const TCPA_CALLING_HOUR_START = FEDERAL_CALLING_HOUR_START;
export const TCPA_CALLING_HOUR_END = FEDERAL_CALLING_HOUR_END; // exclusive of 21:00+ (last legal hour is 20:xx)

/** Primary IANA zone per USPS state for TCPA local-time checks. */
const STATE_PRIMARY_TIMEZONE: Record<string, string> = {
  ...US_STATE_PRIMARY_TIMEZONE,
  // NANP territories commonly reached from US outbound. They are not reviewed-call states.
  PR: "America/Puerto_Rico",
  VI: "America/St_Thomas",
  GU: "Pacific/Guam",
};

/**
 * States whose NANP footprint straddles a timezone line. A single area code
 * can cover both sides (e.g. FL 850 spans Eastern Tallahassee and Central
 * Pensacola), so the number alone can't pin the exact zone. To stay fail-safe
 * on TCPA hours we require the call to fall inside 8am–9pm local in EVERY zone
 * the state spans — a number in the western (or eastern) slice is then never
 * dialed outside permitted hours, at the cost of the one boundary hour for
 * those states. Under-blocking here is a per-call TCPA violation; over-blocking
 * only defers the edge hour, so we accept the trade in the compliant direction.
 */
const STATE_SPANNED_TIMEZONES = US_STATE_SPANNED_TIMEZONES;

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
  const stateStartHour = callingHourStart(state);

  // Split-timezone states: the call must be within permitted hours in every
  // zone the state spans (fail-safe intersection). Report the binding zone —
  // the first one that is out of hours, or the last checked when all pass.
  const spannedZones = state ? STATE_SPANNED_TIMEZONES[state] : undefined;
  if (spannedZones && spannedZones.length > 0) {
    let allowed = true;
    let bindingZone = spannedZones[0];
    let bindingHour = localHourInZone(now, spannedZones[0]);
    for (const zone of spannedZones) {
      const hour = localHourInZone(now, zone);
      bindingZone = zone;
      bindingHour = hour;
      if (!(hour >= stateStartHour && hour < TCPA_CALLING_HOUR_END)) {
        allowed = false;
        break;
      }
    }
    return {
      allowed,
      state,
      timeZone: bindingZone,
      localHour: bindingHour,
      startHour: stateStartHour,
      endHour: TCPA_CALLING_HOUR_END,
      inferred: true,
    };
  }

  const inferredZone = state ? STATE_PRIMARY_TIMEZONE[state] : null;
  const inferred = Boolean(inferredZone);
  const timeZone = inferredZone || UNKNOWN_DESTINATION_TIMEZONE;
  const startHour = inferred ? stateStartHour : UNKNOWN_DESTINATION_START_HOUR;
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

/** Explicit recipient location for reviewed US calling.
 * A phone area code is never substituted for the location the recipient signs.
 * Caller and recipient must each be a US state or the District of Columbia, and
 * the signed zone must be one that recipient state uses.
 */
export function resolvePermissionCallingHours(
  jurisdiction: { callerState: string; recipientState: string; timeZone: string },
  now: Date = new Date(),
): CallingHoursDecision {
  const supported =
    isUsCallingState(jurisdiction.callerState) &&
    isUsCallingState(jurisdiction.recipientState) &&
    isRecipientCallingTimeZone(jurisdiction.recipientState, jurisdiction.timeZone);
  const startHour = supported
    ? callingHourStart(jurisdiction.recipientState)
    : TCPA_CALLING_HOUR_START;
  const localHour = supported ? localHourInZone(now, jurisdiction.timeZone) : -1;
  return {
    allowed: supported && localHour >= startHour && localHour < TCPA_CALLING_HOUR_END,
    state: supported ? jurisdiction.recipientState : null,
    timeZone: supported ? jurisdiction.timeZone : "unknown",
    localHour,
    startHour,
    endHour: TCPA_CALLING_HOUR_END,
    inferred: false,
  };
}

export function isWithinTcpACallingHours(
  phone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return resolveCallingHoursForPhone(phone, now).allowed;
}
