import { getNativeCalendarSettings } from "./native-calendar";

/** Saved policy only: private rehearsals never read live slots or create bookings. */
export async function nativeCalendarRehearsalContext(
  userId: string,
  enabledTools: unknown,
): Promise<string> {
  if (
    enabledTools != null &&
    (!Array.isArray(enabledTools) || !enabledTools.includes("book_appointment"))
  ) {
    return "Scheduling tools are not enabled for this Bot. Do not claim this Bot can book an appointment; collect the customer's details only.";
  }
  try {
    const settings = await getNativeCalendarSettings(userId);
    if (!settings.enabled || settings.weekly_hours.length === 0) {
      return "Native Calendar booking is not enabled or has no configured hours. Connected-calendar availability has not been checked in this rehearsal. Do not invent available times or an owner-approval requirement.";
    }
    return [
      `Saved Calendar policy: ${settings.duration_minutes}-minute appointments in ${settings.time_zone}.`,
      settings.booking_mode === "approval"
        ? "The owner chose approval: live booking requests remain pending until the owner approves them. Never describe a pending request as confirmed."
        : "The owner chose automatic booking: in live calls, check availability and book after the customer confirms the exact time. Do not ask for separate owner confirmation.",
      "This rehearsal has no live calendar access and creates no appointments. Practice collecting the customer's name, requested service, date, time, and timezone; describe the next step conditionally instead of claiming availability or a completed booking.",
    ].join(" ");
  } catch {
    return "Calendar settings could not be verified. Do not invent availability, a completed booking, or an owner-approval requirement.";
  }
}
