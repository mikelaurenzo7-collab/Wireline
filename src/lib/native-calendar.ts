import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { drizzle, tenantStore } from "./server-context";
import { AppError } from "./api-error";
import { invalidateDashboard } from "./dashboard-cache";
import { localDateWindowToUtc, parseIsoLocalDate } from "./calendar-time";
import {
  APPOINTMENT_STATUSES,
  calendarValidation,
  DEFAULT_NATIVE_CALENDAR,
  intervalsOverlap,
  legacyBusyInterval,
  minuteClock,
  nativeAppointmentInterval,
  OCCUPIED_APPOINTMENT_STATUSES,
  validateNativeCalendarSettings,
  type CalendarInterval,
  type NativeCalendarSettings,
} from "./native-calendar-policy";

export type { NativeCalendarSettings } from "./native-calendar-policy";
type Tx = Parameters<Parameters<typeof drizzle.transaction>[0]>[0];
type Appointment = typeof schema.appointments.$inferSelect;

async function lockCalendar(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`native-calendar:${userId}`}, 0))`);
}

async function settingsFrom(tx: Pick<Tx, "select">, userId: string) {
  const [row] = await tx.select({ calendar: schema.settings.nativeCalendar }).from(schema.settings)
    .where(eq(schema.settings.userId, userId)).limit(1);
  return row?.calendar ? validateNativeCalendarSettings(row.calendar) : structuredClone(DEFAULT_NATIVE_CALENDAR);
}

export async function getNativeCalendarSettings(userId: string): Promise<NativeCalendarSettings> {
  return tenantStore.run(userId, () => settingsFrom(drizzle, userId));
}

export async function getNativeCalendarConfiguration(userId: string) {
  return tenantStore.run(userId, async () => {
    const [row] = await drizzle.select({ calendar: schema.settings.nativeCalendar }).from(schema.settings)
      .where(eq(schema.settings.userId, userId)).limit(1);
    return { settings: row?.calendar ? validateNativeCalendarSettings(row.calendar) : structuredClone(DEFAULT_NATIVE_CALENDAR), configured: Boolean(row?.calendar) };
  });
}

export async function isNativeCalendarConfigured(userId: string): Promise<boolean> {
  return (await getNativeCalendarSettings(userId)).enabled;
}

export async function saveNativeCalendarSettings(userId: string, value: unknown) {
  const settings = validateNativeCalendarSettings(value);
  await tenantStore.run(userId, () => drizzle.transaction(async (tx) => {
    await lockCalendar(tx, userId);
    const [row] = await tx.update(schema.settings).set({ nativeCalendar: settings, updatedAt: new Date() })
      .where(eq(schema.settings.userId, userId)).returning({ id: schema.settings.id });
    if (!row) throw AppError.notFound("Workspace settings not found. Refresh and try again.");
    await audit(tx, userId, "calendar.settings_updated", "calendar", settings.booking_mode);
  }));
  return settings;
}

async function audit(tx: Tx, userId: string, action: string, resourceId: string, status: string) {
  await tx.insert(schema.auditLog).values({ userId, action, eventType: action, resourceType: "appointment", resourceId, metadata: { status } });
}

async function assertOwnedAgent(tx: Tx, userId: string, agentId: string | null | undefined) {
  if (!agentId) return;
  const [row] = await tx.select({ id: schema.agents.id }).from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId))).limit(1);
  if (!row) throw AppError.notFound("Bot not found.");
}

async function busyIntervals(tx: Tx, userId: string, date: string, zone: string, excludeId?: string): Promise<CalendarInterval[]> {
  const rows = await tx.select().from(schema.appointments)
    .where(and(eq(schema.appointments.userId, userId), eq(schema.appointments.demo, false), inArray(schema.appointments.status, OCCUPIED_APPOINTMENT_STATUSES))).limit(5001);
  if (rows.length > 5000) throw AppError.conflict("Appointment history needs review before taking new bookings. Contact support.");
  const busy: CalendarInterval[] = [];
  for (const row of rows) {
    if (row.id === excludeId) continue;
    if (row.startAt && row.endAt) busy.push({ startAt: row.startAt, endAt: row.endAt, bufferMinutes: row.bufferMinutes });
    else {
      const legacy = legacyBusyInterval(row, date, zone);
      if (legacy) busy.push(legacy);
    }
  }
  const day = localDateWindowToUtc({ date, timeZone: zone });
  // Imported external events are busy-time snapshots, not an outbound sync.
  // Provider failure never rewrites a successful native appointment.
  const imported = await tx.select({ startAt: schema.calendarEvents.startTime, endAt: schema.calendarEvents.endTime })
    .from(schema.calendarEvents).where(and(eq(schema.calendarEvents.userId, userId),
      sql`coalesce(${schema.calendarEvents.status}, '') not in ('cancelled', 'canceled')`,
      sql`${schema.calendarEvents.startTime} < ${day.endTime}::timestamptz`,
      sql`${schema.calendarEvents.endTime} > ${day.startTime}::timestamptz`)).limit(5001);
  if (imported.length > 5000) throw AppError.conflict("Too many calendar events to verify availability. Contact support.");
  for (const row of imported) if (row.startAt && row.endAt) busy.push({ startAt: row.startAt, endAt: row.endAt });
  return busy;
}

export async function getNativeCalendarAvailability(userId: string, input: { date: string }) {
  calendarValidation(() => parseIsoLocalDate(input.date));
  return tenantStore.run(userId, () => drizzle.transaction(async (tx) => {
    await lockCalendar(tx, userId);
    const settings = await settingsFrom(tx, userId);
    if (!settings.enabled) throw AppError.conflict("Booking is paused. Enable booking in Calendar first.");
    const busy = await busyIntervals(tx, userId, input.date, settings.time_zone);
    const slots: Array<{ date: string; time: string; start_at: string; end_at: string }> = [];
    const now = new Date();
    for (let minute = 0; minute < 1440; minute += 15) {
      try {
        const slot = nativeAppointmentInterval(settings, { date: input.date, time: minuteClock(minute) }, now);
        if (!busy.some((interval) => intervalsOverlap(slot, interval))) slots.push({ date: slot.date, time: slot.time, start_at: slot.startAt.toISOString(), end_at: slot.endAt.toISOString() });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        if (error.status !== 400 && error.status !== 409) throw error;
      }
    }
    return { time_zone: settings.time_zone, duration_minutes: settings.duration_minutes, booking_mode: settings.booking_mode, slots };
  }));
}

export type NativeAppointmentInput = {
  agentId?: string | null;
  callId?: string | null;
  date: string;
  time: string;
  timeZone?: string;
  customerName: string;
  serviceType?: string;
  phoneNumber?: string | null;
  notes?: string | null;
  requestKey: string;
};

function text(value: unknown, label: string, max: number, required = false): string | null {
  if (value == null && !required) return null;
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) {
    throw AppError.badRequest(`${label} must be ${required ? "1–" : "at most "}${max} characters.`);
  }
  return value.trim() || null;
}

function bookingInput(input: NativeAppointmentInput) {
  const requestKey = text(input.requestKey, "Booking request key", 200, true)!;
  if (!/^[\x21-\x7e]+$/.test(requestKey)) throw AppError.badRequest("Invalid booking request key.");
  const normalized = {
    agentId: text(input.agentId, "Bot ID", 200), callId: text(input.callId, "Call ID", 200),
    date: text(input.date, "Date", 10, true)!, time: text(input.time, "Time", 8, true)!,
    timeZone: text(input.timeZone, "Timezone", 100),
    customerName: text(input.customerName, "Customer name", 200, true)!,
    serviceType: text(input.serviceType, "Appointment type", 100),
    phoneNumber: text(input.phoneNumber, "Phone number", 50), notes: text(input.notes, "Notes", 2000),
  };
  return { ...normalized, requestKey, fingerprint: createHash("sha256").update(JSON.stringify(normalized)).digest("hex") };
}

export async function bookNativeAppointment(userId: string, input: NativeAppointmentInput): Promise<Appointment> {
  const clean = bookingInput(input);
  const result = await tenantStore.run(userId, () => drizzle.transaction(async (tx) => {
    await lockCalendar(tx, userId);
    await assertOwnedAgent(tx, userId, clean.agentId);
    const [prior] = await tx.select().from(schema.appointments).where(and(eq(schema.appointments.userId, userId), eq(schema.appointments.bookingRequestKey, clean.requestKey))).limit(1);
    if (prior) {
      if (prior.bookingFingerprint !== clean.fingerprint) throw AppError.conflict("This booking request was already used with different details. Refresh before trying again.");
      return prior;
    }
    const settings = await settingsFrom(tx, userId);
    const interval = nativeAppointmentInterval(settings, { date: clean.date, time: clean.time, timeZone: clean.timeZone ?? undefined });
    const busy = await busyIntervals(tx, userId, interval.date, settings.time_zone);
    if (busy.some((row) => intervalsOverlap(interval, row))) throw AppError.conflict("That time is no longer available. Choose another time.");
    const [row] = await tx.insert(schema.appointments).values({
      userId, agentId: clean.agentId, callId: clean.callId, date: interval.date, time: interval.time,
      customerName: clean.customerName, serviceType: clean.serviceType ?? settings.appointment_name,
      notes: clean.notes, phoneNumber: clean.phoneNumber, status: settings.booking_mode === "approval" ? "Requested" : "Scheduled",
      startAt: interval.startAt, endAt: interval.endAt, timeZone: settings.time_zone, bufferMinutes: settings.buffer_minutes,
      bookingSource: "native", bookingRequestKey: clean.requestKey, bookingFingerprint: clean.fingerprint,
    }).returning();
    await audit(tx, userId, "calendar.appointment_created", row.id, row.status!);
    return row;
  }));
  invalidateDashboard(userId);
  return result;
}

export async function updateCalendarAppointment(userId: string, id: string, input: Record<string, unknown>): Promise<Appointment> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) throw AppError.badRequest("Invalid appointment ID.");
  const result = await tenantStore.run(userId, () => drizzle.transaction(async (tx) => {
    await lockCalendar(tx, userId);
    const [prior] = await tx.select().from(schema.appointments).where(and(eq(schema.appointments.userId, userId), eq(schema.appointments.id, id))).limit(1);
    if (!prior) throw AppError.notFound("Appointment not found.");
    const updates: Partial<typeof schema.appointments.$inferInsert> = {};
    if (input.status !== undefined) {
      if (typeof input.status !== "string" || !APPOINTMENT_STATUSES.includes(input.status)) throw AppError.badRequest("Invalid appointment status.");
      updates.status = input.status;
    }
    if (input.customer_name !== undefined) updates.customerName = text(input.customer_name, "Customer name", 200, true);
    if (input.service_type !== undefined) updates.serviceType = text(input.service_type, "Appointment type", 100, true);
    if (input.notes !== undefined) updates.notes = text(input.notes, "Notes", 2000);
    if (input.phone_number !== undefined) updates.phoneNumber = text(input.phone_number, "Phone number", 50);
    if (input.agent_id !== undefined) {
      updates.agentId = text(input.agent_id, "Bot ID", 200);
      await assertOwnedAgent(tx, userId, updates.agentId);
    }
    const moved = input.date !== undefined || input.time !== undefined;
    const reactivated = updates.status && OCCUPIED_APPOINTMENT_STATUSES.includes(updates.status) && !OCCUPIED_APPOINTMENT_STATUSES.includes(prior.status ?? "");
    if (moved || reactivated) {
      const settings = await settingsFrom(tx, userId);
      const interval = nativeAppointmentInterval(settings, {
        date: text(input.date ?? prior.date, "Date", 10, true)!, time: text(input.time ?? prior.time, "Time", 8, true)!,
      });
      const busy = await busyIntervals(tx, userId, interval.date, settings.time_zone, id);
      if (busy.some((row) => intervalsOverlap(interval, row))) throw AppError.conflict("That time is no longer available. Choose another time.");
      Object.assign(updates, { date: interval.date, time: interval.time, startAt: interval.startAt, endAt: interval.endAt, timeZone: settings.time_zone, bufferMinutes: settings.buffer_minutes, bookingSource: "native" });
    } else if (prior.status === "Requested" && updates.status === "Confirmed") {
      if (!prior.startAt || !prior.endAt || prior.startAt.getTime() <= Date.now()) throw AppError.conflict("This request is no longer in the future. Reschedule it before confirming.");
      const busy = await busyIntervals(tx, userId, prior.date!, prior.timeZone!, id);
      if (busy.some((row) => intervalsOverlap({ startAt: prior.startAt!, endAt: prior.endAt!, bufferMinutes: prior.bufferMinutes }, row))) throw AppError.conflict("That time is no longer available. Reschedule before confirming.");
    }
    if (!Object.keys(updates).length) throw AppError.badRequest("No valid fields to update.");
    const [row] = await tx.update(schema.appointments).set(updates).where(and(eq(schema.appointments.userId, userId), eq(schema.appointments.id, id))).returning();
    await audit(tx, userId, "calendar.appointment_updated", id, row.status ?? "Scheduled");
    return row;
  }));
  invalidateDashboard(userId);
  return result;
}

/** Preserve native retry receipts: cancellation frees the slot without deleting its identity. */
export async function cancelCalendarAppointment(userId: string, id: string): Promise<void> {
  await updateCalendarAppointment(userId, id, { status: "Cancelled" });
}
