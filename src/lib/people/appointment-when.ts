/**
 * Pure formatting for booked appointment times, shared by Calendar and the
 * People timeline.
 * No database or server imports, so it stays unit-testable on its own.
 */

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The booked time in the words the Calendar uses ("Nov 27, 2026 · 9:00 AM"),
 * in the booking's own time zone when it has one. Older rows carry only a
 * local date and time, which are shown as written, never shifted.
 */
export function appointmentWhen(row: {
  startAt: Date | string | null;
  timeZone: string | null;
  date: string | null;
  time: string | null;
}): string | null {
  const start = iso(row.startAt);
  if (start && row.timeZone) {
    try {
      const instant = new Date(start);
      const day = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: row.timeZone,
      }).format(instant);
      const clock = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: row.timeZone,
        timeZoneName: "short",
      }).format(instant);
      return `${day} · ${clock}`;
    } catch {
      /* An unknown zone name falls through to the stored date and time. */
    }
  }
  let day = row.date?.trim() || null;
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const parsed = new Date(`${day}T00:00:00Z`);
    // A date that rolls over (Feb 30 becomes Mar 2) is shown as written.
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day) {
      day = parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }
  let clock = row.time?.trim() || null;
  if (clock && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(clock)) {
    const [hours, minutes] = clock.split(":").map(Number);
    clock = new Date(Date.UTC(2000, 0, 1, hours, minutes)).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });
  }
  const parts = [day, clock].filter(Boolean);
  if (!parts.length && start) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    }).format(new Date(start));
  }
  return parts.length ? parts.join(" · ") : null;
}
