import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  IntegrationService,
  type OwnerCalendarEventInput,
  type OwnerCalendarEventRef,
} from "./integrations";
import { drizzle, log, tenantStore } from "./server-context";

/**
 * Keeps one copy of each confirmed Bot booking on the owner's own Google or
 * Outlook calendar, so an owner sees the Bot's bookings where they already
 * look. BotBound stays the record: the copy follows the appointment, never
 * the other way round.
 *
 * Reconciling, not event-driven: each run reads the appointment and the copy
 * it last wrote (`external_calendar`) and makes the provider match. That makes
 * a repeat run harmless and lets any later change repair an earlier failure.
 * A provider failure never changes the appointment.
 */

type Appointment = typeof schema.appointments.$inferSelect;

/** A confirmed booking has a copy. A request awaiting approval does not yet. */
const MIRRORED_STATUSES: readonly string[] = ["Scheduled", "Confirmed", "Rescheduled"];

export type OwnerCalendarMirrorState = OwnerCalendarEventRef & {
  startAt: string;
  endAt: string;
  title: string;
};

export type OwnerCalendarSyncOutcome =
  "created" | "updated" | "deleted" | "unchanged" | "skipped" | "failed";

type CalendarWriter = Pick<
  IntegrationService,
  "createOwnerCalendarEvent" | "updateOwnerCalendarEvent" | "deleteOwnerCalendarEvent"
>;

export function parseOwnerCalendarMirror(value: unknown): OwnerCalendarMirrorState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.provider !== "google" && record.provider !== "microsoft") return null;
  for (const key of ["accountId", "eventId", "startAt", "endAt", "title"]) {
    if (typeof record[key] !== "string" || !record[key]) return null;
  }
  return record as unknown as OwnerCalendarMirrorState;
}

/** What the owner sees on their calendar. No notes: they can hold anything a caller said. */
export function ownerCalendarEventFor(
  appointment: Pick<
    Appointment,
    "serviceType" | "customerName" | "phoneNumber" | "startAt" | "endAt"
  >,
): OwnerCalendarEventInput | null {
  if (!appointment.startAt || !appointment.endAt) return null;
  const service = appointment.serviceType?.trim() || "Appointment";
  const customer = appointment.customerName?.trim();
  const phone = appointment.phoneNumber?.trim();
  return {
    title: customer ? `${service}: ${customer}` : service,
    description: [
      "Booked by your Bot in BotBound.",
      phone ? `Customer phone: ${phone}` : null,
      "Change or cancel it in BotBound so this calendar stays in step.",
    ]
      .filter(Boolean)
      .join("\n"),
    startTime: appointment.startAt.toISOString(),
    endTime: appointment.endAt.toISOString(),
  };
}

async function saveMirror(
  userId: string,
  appointmentId: string,
  state: OwnerCalendarMirrorState | null,
): Promise<void> {
  await tenantStore.run(userId, async () => {
    await drizzle
      .update(schema.appointments)
      .set({ externalCalendar: state })
      .where(
        and(eq(schema.appointments.id, appointmentId), eq(schema.appointments.userId, userId)),
      );
  });
}

/**
 * The busy-time import keeps its own snapshot of the owner's calendar. Drop
 * the snapshot of an event BotBound just removed, so the freed slot is free
 * at once instead of after the next import.
 */
async function forgetImportedCopy(userId: string, eventId: string): Promise<void> {
  await tenantStore.run(userId, async () => {
    await drizzle
      .delete(schema.calendarEvents)
      .where(
        and(
          eq(schema.calendarEvents.userId, userId),
          eq(schema.calendarEvents.externalEventId, eventId),
        ),
      );
  });
}

export async function syncAppointmentToOwnerCalendar(
  userId: string,
  appointmentId: string,
  writer: CalendarWriter = new IntegrationService(userId),
): Promise<OwnerCalendarSyncOutcome> {
  const [appointment] = await tenantStore.run(userId, async () =>
    drizzle
      .select()
      .from(schema.appointments)
      .where(and(eq(schema.appointments.id, appointmentId), eq(schema.appointments.userId, userId)))
      .limit(1),
  );
  // "connected" bookings were written to the owner's calendar when they were
  // made, before BotBound stored event ids. Copying them again would duplicate.
  if (!appointment || appointment.demo || appointment.bookingSource === "connected") {
    return "skipped";
  }
  const current = parseOwnerCalendarMirror(appointment.externalCalendar);
  const event = ownerCalendarEventFor(appointment);
  const status = appointment.status ?? "";

  if (status === "Cancelled") {
    if (!current) return "unchanged";
    if (!(await writer.deleteOwnerCalendarEvent(current))) return "failed";
    await saveMirror(userId, appointmentId, null);
    await forgetImportedCopy(userId, current.eventId);
    return "deleted";
  }
  // Completed keeps whatever copy it has; a request has none until confirmed.
  if (!MIRRORED_STATUSES.includes(status) || !event) return current ? "unchanged" : "skipped";

  const next = (ref: OwnerCalendarEventRef): OwnerCalendarMirrorState => ({
    provider: ref.provider,
    accountId: ref.accountId,
    eventId: ref.eventId,
    startAt: event.startTime,
    endAt: event.endTime,
    title: event.title,
  });

  if (current) {
    if (
      current.startAt === event.startTime &&
      current.endAt === event.endTime &&
      current.title === event.title
    ) {
      return "unchanged";
    }
    const outcome = await writer.updateOwnerCalendarEvent(current, event);
    if (outcome === "failed") return "failed";
    if (outcome === "updated") {
      await saveMirror(userId, appointmentId, next(current));
      return "updated";
    }
    // The owner deleted the event themselves: fall through and write it again.
  }
  const created = await writer.createOwnerCalendarEvent(event);
  if (!created) return current ? "failed" : "skipped";
  await saveMirror(userId, appointmentId, next(created));
  return "created";
}

/** One sync at a time per appointment, so a book-then-reschedule cannot interleave. */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Start a sync without making the caller wait. A live call should not pause
 * on the owner's calendar provider, and the booking is already saved.
 */
export function queueOwnerCalendarSync(userId: string, appointmentId: string): void {
  const previous = inFlight.get(appointmentId) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(() => syncAppointmentToOwnerCalendar(userId, appointmentId))
    .then((outcome) => {
      if (outcome === "failed") {
        log.warn("Owner calendar copy is out of step with a booking", { userId, appointmentId });
      }
    })
    .catch((error: unknown) => {
      log.warn("Owner calendar sync failed", {
        userId,
        appointmentId,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      if (inFlight.get(appointmentId) === run) inFlight.delete(appointmentId);
    });
  inFlight.set(appointmentId, run);
}
