export class CalendarTimeError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_DATE"
      | "INVALID_TIME"
      | "INVALID_TIMEZONE"
      | "NONEXISTENT_LOCAL_TIME"
      | "AMBIGUOUS_LOCAL_TIME",
  ) {
    super(message);
    this.name = "CalendarTimeError";
  }
}

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type LocalTimeParts = {
  hour: number;
  minute: number;
};

type ZonedParts = LocalDateParts & LocalTimeParts & { second: number };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export function normalizeIanaTimeZone(value: unknown, fallback = "UTC"): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (candidate !== "UTC" && !candidate.includes("/")) {
    throw new CalendarTimeError(
      `Timezone "${candidate}" is ambiguous. Use a full IANA timezone such as America/Chicago.`,
      "INVALID_TIMEZONE",
    );
  }
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: candidate }).resolvedOptions().timeZone;
  } catch {
    throw new CalendarTimeError(
      `Unsupported timezone "${candidate}". Use an IANA timezone such as America/Chicago.`,
      "INVALID_TIMEZONE",
    );
  }
}

export function parseIsoLocalDate(value: unknown): LocalDateParts {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = DATE_RE.exec(raw);
  if (!match) {
    throw new CalendarTimeError("Date must use YYYY-MM-DD format.", "INVALID_DATE");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new CalendarTimeError("Date is not a valid calendar day.", "INVALID_DATE");
  }
  return { year, month, day };
}

export function parse24HourTime(value: unknown): LocalTimeParts {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = TIME_RE.exec(raw);
  if (!match) {
    throw new CalendarTimeError("Time must use 24-hour HH:mm format.", "INVALID_TIME");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || "0");
  if (hour > 23 || minute > 59 || second > 59 || second !== 0) {
    throw new CalendarTimeError("Time must be a valid minute in 24-hour HH:mm format.", "INVALID_TIME");
  }
  return { hour, minute };
}

function partsForInstant(instantMs: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function offsetAt(instantMs: number, timeZone: string): number {
  const parts = partsForInstant(instantMs, timeZone);
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    instantMs
  );
}

function sameLocalMinute(parts: ZonedParts, target: LocalDateParts & LocalTimeParts): boolean {
  return (
    parts.year === target.year &&
    parts.month === target.month &&
    parts.day === target.day &&
    parts.hour === target.hour &&
    parts.minute === target.minute
  );
}

export function localDateTimeToUtcIso(input: {
  date: unknown;
  time: unknown;
  timeZone: unknown;
}): string {
  const date = parseIsoLocalDate(input.date);
  const time = parse24HourTime(input.time);
  const timeZone = normalizeIanaTimeZone(input.timeZone);
  const target = { ...date, ...time };
  const localEpoch = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, 0);

  const candidateOffsets = new Set<number>();
  for (const delta of [0, -86_400_000, 86_400_000, -604_800_000, 604_800_000]) {
    candidateOffsets.add(offsetAt(localEpoch + delta, timeZone));
  }

  const matches = new Set<number>();
  for (const offset of candidateOffsets) {
    const candidate = localEpoch - offset;
    if (sameLocalMinute(partsForInstant(candidate, timeZone), target)) matches.add(candidate);
  }

  if (matches.size === 0) {
    throw new CalendarTimeError(
      "That local time does not exist because of a daylight-saving transition. Confirm a different time.",
      "NONEXISTENT_LOCAL_TIME",
    );
  }
  if (matches.size > 1) {
    throw new CalendarTimeError(
      "That local time occurs twice because of a daylight-saving transition. Confirm a different, unambiguous time.",
      "AMBIGUOUS_LOCAL_TIME",
    );
  }

  return new Date([...matches][0]).toISOString();
}

export function addDaysToIsoDate(value: unknown, days: number): string {
  const date = parseIsoLocalDate(value);
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return [
    String(shifted.getUTCFullYear()).padStart(4, "0"),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function localDateWindowToUtc(input: { date: unknown; timeZone: unknown }): {
  startTime: string;
  endTime: string;
  timeZone: string;
} {
  const timeZone = normalizeIanaTimeZone(input.timeZone);
  const date = addDaysToIsoDate(input.date, 0);
  return {
    startTime: localDateTimeToUtcIso({ date, time: "00:00", timeZone }),
    endTime: localDateTimeToUtcIso({
      date: addDaysToIsoDate(date, 1),
      time: "00:00",
      timeZone,
    }),
    timeZone,
  };
}

export function addMinutesToIso(value: string, minutes: number): string {
  const start = new Date(value);
  if (!Number.isFinite(start.getTime())) {
    throw new CalendarTimeError("Appointment start time is invalid.", "INVALID_TIME");
  }
  return new Date(start.getTime() + minutes * 60_000).toISOString();
}

export function formatIsoInTimeZone(value: string, timeZone: unknown): string {
  const zone = normalizeIanaTimeZone(timeZone);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new CalendarTimeError("Calendar event time is invalid.", "INVALID_TIME");
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatTimeRangeInZone(
  startIso: string,
  endIso: string,
  timeZone: unknown,
): string {
  return `${formatIsoInTimeZone(startIso, timeZone)} to ${formatIsoInTimeZone(endIso, timeZone)}`;
}
