import { AppError } from "./api-error";
import {
  CalendarTimeError,
  localDateTimeToUtcIso,
  localDateWindowToUtc,
  normalizeIanaTimeZone,
  parse24HourTime,
  parseIsoLocalDate,
} from "./calendar-time";

export type NativeCalendarSettings = {
  enabled: boolean;
  time_zone: string;
  appointment_name: string;
  duration_minutes: number;
  buffer_minutes: number;
  minimum_notice_minutes: number;
  booking_mode: "automatic" | "approval" | "inherit";
  weekly_hours: Array<{ day: number; start: string; end: string }>;
};

export const DEFAULT_NATIVE_CALENDAR: NativeCalendarSettings = {
  enabled: false,
  time_zone: "UTC",
  appointment_name: "Appointment",
  duration_minutes: 30,
  buffer_minutes: 0,
  minimum_notice_minutes: 60,
  booking_mode: "inherit",
  weekly_hours: [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "17:00" })),
};

export const OCCUPIED_APPOINTMENT_STATUSES = ["Scheduled", "Confirmed", "Requested", "Rescheduled"];
export const APPOINTMENT_STATUSES = [...OCCUPIED_APPOINTMENT_STATUSES, "Completed", "Cancelled"];

function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw AppError.badRequest(`${label} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

export function calendarValidation<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof CalendarTimeError) throw AppError.badRequest(error.message);
    throw error;
  }
}

function clockMinute(value: unknown): number {
  const parts = parse24HourTime(value);
  return parts.hour * 60 + parts.minute;
}

export function validateNativeCalendarSettings(value: unknown): NativeCalendarSettings {
  return calendarValidation(() => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw AppError.badRequest("Calendar settings are required.");
    }
    const input = value as Record<string, unknown>;
    if (typeof input.enabled !== "boolean")
      throw AppError.badRequest("Choose whether to accept bookings.");
    const bookingMode = input.booking_mode;
    if (bookingMode !== "automatic" && bookingMode !== "approval" && bookingMode !== "inherit") {
      throw AppError.badRequest("Choose how this calendar confirms a booking.");
    }
    const name = typeof input.appointment_name === "string" ? input.appointment_name.trim() : "";
    if (!name || name.length > 100)
      throw AppError.badRequest("Appointment name must be 1 to 100 characters.");
    if (typeof input.time_zone !== "string" || !input.time_zone.trim()) {
      throw AppError.badRequest("Choose the calendar timezone.");
    }
    if (!Array.isArray(input.weekly_hours) || input.weekly_hours.length > 7) {
      throw AppError.badRequest("Choose up to one availability window per weekday.");
    }
    const seen = new Set<number>();
    const weekly_hours = input.weekly_hours
      .map((raw) => {
        if (!raw || typeof raw !== "object")
          throw AppError.badRequest("Invalid availability window.");
        const hour = raw as Record<string, unknown>;
        const day = integer(hour.day, 0, 6, "Weekday");
        if (seen.has(day)) throw AppError.badRequest("Use one availability window per weekday.");
        seen.add(day);
        const start = clockMinute(hour.start);
        const end = clockMinute(hour.end);
        if (end <= start)
          throw AppError.badRequest("Availability must end after it starts on the same day.");
        return { day, start: minuteClock(start), end: minuteClock(end) };
      })
      .sort((a, b) => a.day - b.day);
    if (input.enabled && !weekly_hours.length)
      throw AppError.badRequest("Add availability before enabling booking.");
    const duration = integer(input.duration_minutes, 15, 240, "Appointment duration");
    if (
      input.enabled &&
      !weekly_hours.some((hour) => clockMinute(hour.end) - clockMinute(hour.start) >= duration)
    ) {
      throw AppError.badRequest("At least one availability window must fit an appointment.");
    }
    return {
      enabled: input.enabled,
      time_zone: normalizeIanaTimeZone(input.time_zone),
      appointment_name: name,
      duration_minutes: duration,
      buffer_minutes: integer(input.buffer_minutes, 0, 120, "Buffer"),
      minimum_notice_minutes: integer(input.minimum_notice_minutes, 0, 10080, "Minimum notice"),
      booking_mode: bookingMode,
      weekly_hours,
    };
  });
}

export function minuteClock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export type CalendarInterval = { startAt: Date; endAt: Date; bufferMinutes?: number };

export function intervalsOverlap(a: CalendarInterval, b: CalendarInterval): boolean {
  return (
    a.startAt.getTime() < b.endAt.getTime() + (b.bufferMinutes ?? 0) * 60_000 &&
    b.startAt.getTime() < a.endAt.getTime() + (a.bufferMinutes ?? 0) * 60_000
  );
}

export function nativeAppointmentInterval(
  settings: NativeCalendarSettings,
  input: { date: string; time: string; timeZone?: string },
  now = new Date(),
): CalendarInterval & { date: string; time: string } {
  return calendarValidation(() => {
    if (!settings.enabled)
      throw AppError.conflict("Booking is paused. Enable booking in Calendar first.");
    if (input.timeZone && normalizeIanaTimeZone(input.timeZone) !== settings.time_zone) {
      throw AppError.badRequest(
        `This calendar uses ${settings.time_zone}. Confirm the appointment time in that timezone.`,
      );
    }
    const date = parseIsoLocalDate(input.date);
    const minute = clockMinute(input.time);
    const day = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    const hours = settings.weekly_hours.find((entry) => entry.day === day);
    if (
      !hours ||
      minute < clockMinute(hours.start) ||
      minute + settings.duration_minutes > clockMinute(hours.end)
    ) {
      throw AppError.conflict("That time is outside booking hours. Choose an available time.");
    }
    const startAt = new Date(
      localDateTimeToUtcIso({ date: input.date, time: input.time, timeZone: settings.time_zone }),
    );
    // Convert both wall-clock endpoints. Reject a span crossing a DST transition,
    // rather than quietly changing the promised appointment duration.
    const endAt = new Date(
      localDateTimeToUtcIso({
        date: input.date,
        time: minuteClock(minute + settings.duration_minutes),
        timeZone: settings.time_zone,
      }),
    );
    if (endAt.getTime() - startAt.getTime() !== settings.duration_minutes * 60_000) {
      throw AppError.conflict(
        "That appointment crosses a daylight-saving change. Choose another time.",
      );
    }
    if (startAt.getTime() < now.getTime() + settings.minimum_notice_minutes * 60_000) {
      throw AppError.conflict("That time is too soon. Choose a later available time.");
    }
    if (startAt.getTime() > now.getTime() + 366 * 86_400_000) {
      throw AppError.badRequest("Appointments can be booked up to one year ahead.");
    }
    return {
      startAt,
      endAt,
      bufferMinutes: settings.buffer_minutes,
      date: input.date.trim(),
      time: minuteClock(minute),
    };
  });
}

export function legacyBusyInterval(
  row: { date: string | null; time: string | null; notes: string | null },
  requestedDate: string,
  timeZone: string,
): CalendarInterval | null {
  // Never invent the original timezone or duration. An unconverted legacy
  // appointment reserves its whole local day until the owner cancels/rebooks it.
  // Invalid legacy dates fail closed because they cannot safely be placed.
  try {
    parseIsoLocalDate(row.date);
  } catch {
    throw AppError.conflict(
      "An existing appointment has an invalid date. Correct or cancel it in Calendar before taking new bookings.",
    );
  }
  if (row.date !== requestedDate) return null;
  const day = localDateWindowToUtc({ date: requestedDate, timeZone });
  return { startAt: new Date(day.startTime), endAt: new Date(day.endTime), bufferMinutes: 0 };
}
