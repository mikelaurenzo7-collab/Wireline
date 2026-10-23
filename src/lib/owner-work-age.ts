export type OwnerWorkAge = {
  dateTime: string;
  ageLabel: string;
};

/** Creation metadata only: age never implies expiry or permission to act. */
export function ownerWorkAge(value: unknown, now = Date.now()): OwnerWorkAge | null {
  if (typeof value !== "string" || !Number.isFinite(now)) return null;
  const timestamp = value.trim();
  // Do not interpret a missing zone, date-only value or numeric string as an
  // exact creation time in the viewer's timezone.
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      timestamp,
    )
  )
    return null;
  const datePart = timestamp.slice(0, 10);
  const calendarDate = new Date(`${datePart}T00:00:00Z`);
  if (
    !Number.isFinite(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== datePart
  )
    return null;
  const created = Date.parse(timestamp);
  if (!Number.isFinite(created)) return null;
  const elapsed = now - created;
  const dateTime = new Date(created).toISOString();
  if (elapsed < 0) return { dateTime, ageLabel: "Future timestamp" };

  const days = Math.floor(elapsed / 86_400_000);
  const hours = Math.floor(elapsed / 3_600_000);
  const minutes = Math.floor(elapsed / 60_000);
  const count = days || hours || minutes;
  const unit = days ? "day" : hours ? "hour" : "minute";
  return {
    dateTime,
    ageLabel: count ? `${count} ${unit}${count === 1 ? "" : "s"} ago` : "Less than a minute ago",
  };
}
