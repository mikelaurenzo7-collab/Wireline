export type CalendarSettings = {
  enabled: boolean;
  time_zone: string;
  appointment_name: string;
  duration_minutes: number;
  buffer_minutes: number;
  minimum_notice_minutes: number;
  booking_mode: "automatic" | "approval" | "inherit";
  weekly_hours: Array<{ day: number; start: string; end: string }>;
};

export function readCalendarSettings(value: unknown): CalendarSettings | null {
  if (!value || typeof value !== "object") return null;
  const settings = value as CalendarSettings;
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (
    typeof settings.enabled !== "boolean" ||
    typeof settings.time_zone !== "string" ||
    !settings.time_zone ||
    typeof settings.appointment_name !== "string" ||
    !settings.appointment_name.trim() ||
    settings.appointment_name.length > 100 ||
    !Number.isInteger(settings.duration_minutes) ||
    settings.duration_minutes < 15 ||
    settings.duration_minutes > 240 ||
    !Number.isInteger(settings.buffer_minutes) ||
    settings.buffer_minutes < 0 ||
    settings.buffer_minutes > 120 ||
    !Number.isInteger(settings.minimum_notice_minutes) ||
    settings.minimum_notice_minutes < 0 ||
    settings.minimum_notice_minutes > 10080 ||
    !["automatic", "approval", "inherit"].includes(settings.booking_mode) ||
    !Array.isArray(settings.weekly_hours) ||
    settings.weekly_hours.length > 7 ||
    settings.weekly_hours.some(
      (hours) =>
        !hours ||
        !Number.isInteger(hours.day) ||
        hours.day < 0 ||
        hours.day > 6 ||
        !clock.test(hours.start) ||
        !clock.test(hours.end) ||
        hours.end <= hours.start,
    ) ||
    new Set(settings.weekly_hours.map((hours) => hours.day)).size !== settings.weekly_hours.length
  )
    return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: settings.time_zone }).format();
  } catch {
    return null;
  }
  return settings;
}

export function calendarSettingsMatch(
  expected: CalendarSettings,
  saved: CalendarSettings,
): boolean {
  const zone = (timeZone: string) =>
    new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone;
  return (
    expected.enabled === saved.enabled &&
    zone(expected.time_zone) === zone(saved.time_zone) &&
    expected.appointment_name.trim() === saved.appointment_name &&
    expected.duration_minutes === saved.duration_minutes &&
    expected.buffer_minutes === saved.buffer_minutes &&
    expected.minimum_notice_minutes === saved.minimum_notice_minutes &&
    expected.booking_mode === saved.booking_mode &&
    expected.weekly_hours.length === saved.weekly_hours.length &&
    expected.weekly_hours.every((hours) =>
      saved.weekly_hours.some(
        (row) => row.day === hours.day && row.start === hours.start && row.end === hours.end,
      ),
    )
  );
}

export function initialCalendarSettings(
  settings: CalendarSettings,
  configured: boolean,
): CalendarSettings {
  if (configured) return settings;
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone ? { ...settings, time_zone: zone } : settings;
  } catch {
    return settings;
  }
}
