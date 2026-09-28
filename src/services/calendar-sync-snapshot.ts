import { and, eq, gt, lt, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { drizzle, tenantStore } from "../lib/server-context";
import { localDateTimeToUtcIso, localDateWindowToUtc } from "../lib/calendar-time";

export type ImportedCalendarEvent = {
  externalEventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  status: string;
};

export function importedCalendarInterval(start: string, end: string) {
  if (![start, end].every((value) => /(?:Z|[+-]\d{2}:\d{2})$/i.test(value))) {
    throw new Error("Calendar event timezone is missing.");
  }
  const startTime = new Date(start);
  const endTime = new Date(end);
  if (
    !Number.isFinite(startTime.getTime()) ||
    !Number.isFinite(endTime.getTime()) ||
    endTime <= startTime
  ) {
    throw new Error("Calendar event contains an invalid time interval.");
  }
  return { startTime, endTime };
}

export function googleAllDayInterval(startDate: string, endDate: string, timeZone: string) {
  if (!timeZone.trim()) throw new Error("Google all-day event calendar timezone is missing.");
  return importedCalendarInterval(
    localDateWindowToUtc({ date: startDate, timeZone }).startTime,
    localDateWindowToUtc({ date: endDate, timeZone }).startTime,
  );
}

export function googleTimedInstant(
  value: { dateTime?: string | null; timeZone?: string | null } | undefined,
): string {
  const raw = value?.dateTime || "";
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) return raw;
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):(\d{2})(\.\d+)?$/.exec(raw);
  if (!local || !value?.timeZone || Number(local[3]) > 59) {
    throw new Error("Google calendar event timezone or time is missing.");
  }
  const minute = localDateTimeToUtcIso({
    date: local[1],
    time: local[2],
    timeZone: value.timeZone,
  });
  return new Date(
    new Date(minute).getTime() + (Number(local[3]) + Number(local[4] || 0)) * 1000,
  ).toISOString();
}

/** Call only after every page was read and validated. Never replace a partial inventory. */
export async function replaceCalendarSnapshot(input: {
  userId: string;
  accountId: string;
  timeMin: string;
  timeMax: string;
  events: ImportedCalendarEvent[];
}): Promise<void> {
  const range = importedCalendarInterval(input.timeMin, input.timeMax);
  await tenantStore.run(input.userId, () =>
    drizzle.transaction(async (tx) => {
      // Serialize cache replacement with native booking and availability reads.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`native-calendar:${input.userId}`}, 0))`,
      );
      await tx
        .delete(schema.calendarEvents)
        .where(
          and(
            eq(schema.calendarEvents.userId, input.userId),
            eq(schema.calendarEvents.accountId, input.accountId),
            lt(schema.calendarEvents.startTime, range.endTime),
            gt(schema.calendarEvents.endTime, range.startTime),
          ),
        );
      for (const event of input.events) {
        await tx
          .insert(schema.calendarEvents)
          .values({
            ...event,
            userId: input.userId,
            accountId: input.accountId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [schema.calendarEvents.accountId, schema.calendarEvents.externalEventId],
            set: { ...event, updatedAt: new Date() },
          });
      }
    }),
  );
}
