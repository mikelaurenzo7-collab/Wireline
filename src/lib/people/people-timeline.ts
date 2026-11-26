import { and, desc, eq, gte, isNotNull, sql, type SQL } from "drizzle-orm";

import * as schema from "../../db/schema";
import { personIdentifiers } from "../../db/people-schema";
import { AppError } from "../api-error";
import { drizzle } from "../server-context";
import {
  emailDisplayName,
  normalizePersonEmail,
  normalizePersonPhone,
  phoneDigitCandidates,
  phoneTail,
} from "./identifiers";
import {
  identifiersFor,
  isUuid,
  listPersonEvents,
  personFamilyIds,
  resolveCanonicalPersonId,
  runPeopleInTenant,
  type PersonEventView,
} from "./people-service";

/**
 * The People timeline is a read-time union over the channel tables, joined
 * through the person's identifiers (and those of everyone merged into them).
 * Channel rows remain the receipts; nothing is copied. Each source is bounded
 * so one busy number cannot make the page slow.
 */

export const TIMELINE_LIMIT = 50;
const PREVIEW_MAX = 280;

export type TimelineSource = "call" | "sms" | "email" | "appointment" | "event";

export type TimelineItem = {
  /** Stable across pages: `${source}:${rowId}`. */
  id: string;
  source: TimelineSource;
  at: string;
  direction: "inbound" | "outbound" | null;
  title: string;
  preview: string | null;
  agentId: string | null;
  demo: boolean;
  /** The receipt this item came from, for linking into its channel view. */
  ref: { kind: TimelineSource; id: string };
  event?: Pick<PersonEventView, "kind" | "actor" | "body" | "data">;
};

function preview(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length > PREVIEW_MAX ? `${compact.slice(0, PREVIEW_MAX - 1)}…` : compact;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Postgres keeps microseconds; a JavaScript Date keeps milliseconds. Times
 * leave the database as exact UTC text so a page cursor never drops a row
 * written in the same millisecond as the last one shown.
 */
export function exactIso(column: unknown): SQL<string> {
  return sql<string>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

const CURSOR_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

/** A cursor is exact UTC text from a previous page; anything else starts over. */
export function parseTimeCursor(value: unknown): string | null {
  return typeof value === "string" && CURSOR_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function olderThan(column: unknown, before: string): SQL {
  return sql`${column} < ${before}::timestamptz`;
}

function digitsOf(column: unknown): SQL {
  return sql`regexp_replace(coalesce(${column}, ''), '[^0-9]', '', 'g')`;
}

/**
 * Match a free-text phone column against E.164 identifiers. The tail clause
 * lets the existing last-ten-digit indexes do the work; the exact-digit clause
 * keeps different country codes apart.
 */
function phoneMatch(column: unknown, phones: string[]): SQL | null {
  if (!phones.length) return null;
  const tails = [...new Set(phones.map(phoneTail))];
  const candidates = [...new Set(phones.flatMap(phoneDigitCandidates))];
  return sql`(right(${digitsOf(column)}, 10) IN (${sql.join(
    tails.map((tail) => sql`${tail}`),
    sql`, `,
  )}) AND ${digitsOf(column)} IN (${sql.join(
    candidates.map((digits) => sql`${digits}`),
    sql`, `,
  )}))`;
}

/** Inbox rows store "Name <address>" or a bare address. */
function emailAddressOf(column: unknown): SQL {
  return sql`lower(btrim(coalesce(substring(${column} from '<\\s*([^<>[:space:]]+)\\s*>'), ${column}, '')))`;
}

function emailMatch(column: unknown, emails: string[]): SQL | null {
  if (!emails.length) return null;
  return sql`${emailAddressOf(column)} IN (${sql.join(
    emails.map((email) => sql`${email}`),
    sql`, `,
  )})`;
}

function callTitle(direction: string | null, outcome: string | null): string {
  if (outcome === "voicemail") return "Voicemail";
  if (direction === "outbound") return "Outbound call";
  if (direction === "inbound") return "Inbound call";
  return "Call";
}

function eventTitle(event: PersonEventView): string {
  switch (event.kind) {
    case "created":
      return "Added to People";
    case "note":
      return event.actor === "bot" ? "Bot note" : "Note";
    case "interaction":
      return "Interaction";
    case "field_change":
      return event.body ?? "Details updated";
    case "identifier_added":
      return `Added ${event.data.kind === "email" ? "email" : "phone"} ${String(event.data.value ?? "")}`.trim();
    case "identifier_removed":
      return `Removed ${event.data.kind === "email" ? "email" : "phone"} ${String(event.data.value ?? "")}`.trim();
    case "merged":
      return event.data.sourceId
        ? "Merged a duplicate into this person"
        : "Merged into another person";
    case "unmerged":
      return event.data.sourceId ? "Unmerged a duplicate" : "Unmerged";
    default:
      return "Update";
  }
}

export type TimelinePage = { items: TimelineItem[]; nextCursor: string | null };

export async function getPersonTimeline(
  userId: string,
  personId: string,
  options: { before?: unknown; limit?: unknown } = {},
): Promise<TimelinePage> {
  if (!isUuid(personId)) throw new AppError(404, "PERSON_NOT_FOUND", "That person wasn't found.");
  const limitRaw = Number(options.limit ?? TIMELINE_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), TIMELINE_LIMIT)
    : TIMELINE_LIMIT;
  const before = parseTimeCursor(options.before);

  return runPeopleInTenant(userId, async () => {
    const [exists] = await drizzle
      .select({ id: schema.people.id })
      .from(schema.people)
      .where(and(eq(schema.people.userId, userId), eq(schema.people.id, personId)))
      .limit(1);
    if (!exists) throw new AppError(404, "PERSON_NOT_FOUND", "That person wasn't found.");
    const canonical = await resolveCanonicalPersonId(drizzle, userId, personId);
    const family = await personFamilyIds(drizzle, userId, canonical);
    const identifiers = await identifiersFor(drizzle, userId, family);
    const phones = identifiers.filter((row) => row.kind === "phone").map((row) => row.value);
    const emails = identifiers.filter((row) => row.kind === "email").map((row) => row.value);
    const perSource = limit + 1;

    const [calls, texts, emailThreads, bookings, events] = await Promise.all([
      loadCalls(userId, phones, before, perSource),
      loadTexts(userId, phones, before, perSource),
      loadEmailThreads(userId, emails, before, perSource),
      loadAppointments(userId, phones, before, perSource),
      listPersonEvents(drizzle, userId, family, before, perSource),
    ]);

    const items: TimelineItem[] = [
      ...calls,
      ...texts,
      ...emailThreads,
      ...bookings,
      ...events.map((event): TimelineItem => ({
        id: `event:${event.id}`,
        source: "event",
        at: event.createdAt,
        direction: null,
        title: eventTitle(event),
        preview: event.kind === "note" || event.kind === "interaction" ? preview(event.body) : null,
        agentId: event.agentId,
        demo: false,
        ref: { kind: "event", id: event.id },
        event: { kind: event.kind, actor: event.actor, body: event.body, data: event.data },
      })),
    ].sort((a, b) => (a.at === b.at ? b.id.localeCompare(a.id) : b.at.localeCompare(a.at)));

    const page = items.slice(0, limit);
    const last = page[page.length - 1];
    return { items: page, nextCursor: items.length > limit && last ? last.at : null };
  });
}

async function loadCalls(
  userId: string,
  phones: string[],
  before: string | null,
  limit: number,
): Promise<TimelineItem[]> {
  const match = phoneMatch(schema.callLogs.customerNumber, phones);
  if (!match) return [];
  const filters = [eq(schema.callLogs.userId, userId), match];
  if (before) filters.push(olderThan(schema.callLogs.createdAt, before));
  const rows = await drizzle
    .select({
      id: schema.callLogs.id,
      direction: schema.callLogs.direction,
      outcomeTag: schema.callLogs.outcomeTag,
      summary: schema.callLogs.summary,
      durationSeconds: schema.callLogs.durationSeconds,
      agentId: schema.callLogs.agentId,
      demo: schema.callLogs.demo,
      at: exactIso(schema.callLogs.createdAt),
    })
    .from(schema.callLogs)
    .where(and(...filters))
    .orderBy(desc(schema.callLogs.createdAt))
    .limit(limit);
  return rows.flatMap((row): TimelineItem[] => {
    const at = row.at;
    if (!at) return [];
    const minutes =
      typeof row.durationSeconds === "number" && row.durationSeconds > 0
        ? `${Math.max(1, Math.round(row.durationSeconds / 60))} min`
        : null;
    const direction =
      row.direction === "inbound" || row.direction === "outbound" ? row.direction : null;
    return [
      {
        id: `call:${String(row.id)}`,
        source: "call",
        at,
        direction,
        title: [callTitle(row.direction, row.outcomeTag), minutes].filter(Boolean).join(" · "),
        preview: preview(row.summary),
        agentId: row.agentId,
        demo: Boolean(row.demo),
        ref: { kind: "call", id: String(row.id) },
      },
    ];
  });
}

async function loadTexts(
  userId: string,
  phones: string[],
  before: string | null,
  limit: number,
): Promise<TimelineItem[]> {
  const match = phoneMatch(schema.smsThreads.customerNumber, phones);
  if (!match) return [];
  const filters = [
    eq(schema.smsMessages.userId, userId),
    eq(schema.smsThreads.userId, userId),
    match,
  ];
  if (before) filters.push(olderThan(schema.smsMessages.createdAt, before));
  const rows = await drizzle
    .select({
      id: schema.smsMessages.id,
      threadId: schema.smsMessages.threadId,
      direction: schema.smsMessages.direction,
      body: schema.smsMessages.body,
      agentId: schema.smsMessages.agentId,
      threadAgentId: schema.smsThreads.agentId,
      at: exactIso(schema.smsMessages.createdAt),
    })
    .from(schema.smsMessages)
    .innerJoin(schema.smsThreads, eq(schema.smsMessages.threadId, schema.smsThreads.id))
    .where(and(...filters))
    .orderBy(desc(schema.smsMessages.createdAt))
    .limit(limit);
  return rows.flatMap((row): TimelineItem[] => {
    const at = row.at;
    if (!at || !row.threadId) return [];
    const inbound = row.direction === "in";
    return [
      {
        id: `sms:${String(row.id)}`,
        source: "sms",
        at,
        direction: inbound ? "inbound" : "outbound",
        title: inbound ? "Text received" : "Text sent",
        preview: preview(row.body),
        agentId: row.agentId ?? row.threadAgentId ?? null,
        demo: false,
        ref: { kind: "sms", id: row.threadId },
      },
    ];
  });
}

async function loadEmailThreads(
  userId: string,
  emails: string[],
  before: string | null,
  limit: number,
): Promise<TimelineItem[]> {
  const match = emailMatch(schema.emailThreads.customerEmail, emails);
  if (!match) return [];
  const filters = [
    eq(schema.emailThreads.userId, userId),
    isNotNull(schema.emailThreads.lastMessageAt),
    match,
  ];
  if (before) filters.push(olderThan(schema.emailThreads.lastMessageAt, before));
  const rows = await drizzle
    .select({
      id: schema.emailThreads.id,
      subject: schema.emailThreads.subject,
      summary: schema.emailThreads.summary,
      agentId: schema.emailThreads.agentId,
      at: exactIso(schema.emailThreads.lastMessageAt),
    })
    .from(schema.emailThreads)
    .where(and(...filters))
    .orderBy(desc(schema.emailThreads.lastMessageAt))
    .limit(limit);
  return rows.flatMap((row): TimelineItem[] => {
    const at = row.at;
    if (!at) return [];
    return [
      {
        id: `email:${row.id}`,
        source: "email",
        at,
        direction: null,
        title: row.subject?.trim() ? `Email: ${row.subject.trim().slice(0, 120)}` : "Email",
        preview: preview(row.summary),
        agentId: row.agentId,
        demo: false,
        ref: { kind: "email", id: row.id },
      },
    ];
  });
}

async function loadAppointments(
  userId: string,
  phones: string[],
  before: string | null,
  limit: number,
): Promise<TimelineItem[]> {
  const match = phoneMatch(schema.appointments.phoneNumber, phones);
  if (!match) return [];
  const filters = [eq(schema.appointments.userId, userId), match];
  if (before) filters.push(olderThan(schema.appointments.createdAt, before));
  const rows = await drizzle
    .select({
      id: schema.appointments.id,
      serviceType: schema.appointments.serviceType,
      status: schema.appointments.status,
      notes: schema.appointments.notes,
      startAt: schema.appointments.startAt,
      date: schema.appointments.date,
      time: schema.appointments.time,
      agentId: schema.appointments.agentId,
      demo: schema.appointments.demo,
      at: exactIso(schema.appointments.createdAt),
    })
    .from(schema.appointments)
    .where(and(...filters))
    .orderBy(desc(schema.appointments.createdAt))
    .limit(limit);
  return rows.flatMap((row): TimelineItem[] => {
    const at = row.at;
    if (!at) return [];
    const when = iso(row.startAt) ?? ([row.date, row.time].filter(Boolean).join(" ") || null);
    const label = row.serviceType?.trim() ? row.serviceType.trim().slice(0, 80) : "Appointment";
    return [
      {
        id: `appointment:${row.id}`,
        source: "appointment",
        at,
        direction: null,
        title: `Booked: ${label}${row.status ? ` (${row.status})` : ""}`,
        preview: preview([when ? `For ${when}` : null, row.notes].filter(Boolean).join(". ")),
        agentId: row.agentId,
        demo: Boolean(row.demo),
        ref: { kind: "appointment", id: row.id },
      },
    ];
  });
}

/* ── Recent contacts not yet in People ───────────────────────────── */

export const SUGGESTION_WINDOW_DAYS = 90;
export const SUGGESTION_LIMIT = 25;
const SUGGESTION_SCAN = 400;

export type PeopleSuggestion = {
  kind: "phone" | "email";
  value: string;
  nameHint: string | null;
  lastSeenAt: string;
  sources: Array<"call" | "sms" | "email" | "appointment">;
  count: number;
};

/**
 * Phones and emails the business talked to recently that no person holds.
 * The owner decides whether to save each one; nothing is created here.
 */
export async function listPeopleSuggestions(
  userId: string,
  options: { now?: Date } = {},
): Promise<PeopleSuggestion[]> {
  const since = new Date(
    (options.now ?? new Date()).getTime() - SUGGESTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  return runPeopleInTenant(userId, async () => {
    const [calls, texts, emails, bookings] = await Promise.all([
      drizzle
        .select({
          value: schema.callLogs.customerNumber,
          at: sql<Date>`max(${schema.callLogs.createdAt})`,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.callLogs)
        .where(
          and(
            eq(schema.callLogs.userId, userId),
            gte(schema.callLogs.createdAt, since),
            isNotNull(schema.callLogs.customerNumber),
          ),
        )
        .groupBy(schema.callLogs.customerNumber)
        .orderBy(desc(sql`max(${schema.callLogs.createdAt})`))
        .limit(SUGGESTION_SCAN),
      drizzle
        .select({
          value: schema.smsThreads.customerNumber,
          at: sql<Date>`max(${schema.smsThreads.lastMessageAt})`,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.smsThreads)
        .where(
          and(eq(schema.smsThreads.userId, userId), gte(schema.smsThreads.lastMessageAt, since)),
        )
        .groupBy(schema.smsThreads.customerNumber)
        .orderBy(desc(sql`max(${schema.smsThreads.lastMessageAt})`))
        .limit(SUGGESTION_SCAN),
      drizzle
        .select({
          value: schema.emailThreads.customerEmail,
          at: sql<Date>`max(${schema.emailThreads.lastMessageAt})`,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.emailThreads)
        .where(
          and(
            eq(schema.emailThreads.userId, userId),
            gte(schema.emailThreads.lastMessageAt, since),
            isNotNull(schema.emailThreads.customerEmail),
          ),
        )
        .groupBy(schema.emailThreads.customerEmail)
        .orderBy(desc(sql`max(${schema.emailThreads.lastMessageAt})`))
        .limit(SUGGESTION_SCAN),
      drizzle
        .select({
          value: schema.appointments.phoneNumber,
          name: sql<string | null>`max(${schema.appointments.customerName})`,
          at: sql<Date>`max(${schema.appointments.createdAt})`,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.userId, userId),
            gte(schema.appointments.createdAt, since),
            isNotNull(schema.appointments.phoneNumber),
          ),
        )
        .groupBy(schema.appointments.phoneNumber)
        .orderBy(desc(sql`max(${schema.appointments.createdAt})`))
        .limit(SUGGESTION_SCAN),
    ]);

    const merged = new Map<string, PeopleSuggestion>();
    const add = (
      kind: "phone" | "email",
      value: string | null,
      source: PeopleSuggestion["sources"][number],
      at: Date | string | null,
      count: number,
      nameHint: string | null,
    ) => {
      const seenAt = iso(at);
      if (!value || !seenAt) return;
      const key = `${kind}:${value}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          kind,
          value,
          nameHint,
          lastSeenAt: seenAt,
          sources: [source],
          count: Number(count) || 1,
        });
        return;
      }
      if (!existing.sources.includes(source)) existing.sources.push(source);
      existing.count += Number(count) || 1;
      if (seenAt > existing.lastSeenAt) existing.lastSeenAt = seenAt;
      existing.nameHint ??= nameHint;
    };
    for (const row of calls)
      add("phone", normalizePersonPhone(row.value), "call", row.at, row.count, null);
    for (const row of texts)
      add("phone", normalizePersonPhone(row.value), "sms", row.at, row.count, null);
    for (const row of bookings) {
      add(
        "phone",
        normalizePersonPhone(row.value),
        "appointment",
        row.at,
        row.count,
        row.name?.trim() ? row.name.trim().slice(0, 120) : null,
      );
    }
    for (const row of emails) {
      add(
        "email",
        normalizePersonEmail(row.value),
        "email",
        row.at,
        row.count,
        emailDisplayName(row.value),
      );
    }
    if (!merged.size) return [];

    const known = await drizzle
      .select({ kind: personIdentifiers.kind, value: personIdentifiers.value })
      .from(personIdentifiers)
      .where(
        and(
          eq(personIdentifiers.userId, userId),
          sql`(${personIdentifiers.kind} || ':' || ${personIdentifiers.value}) IN (${sql.join(
            [...merged.keys()].map((key) => sql`${key}`),
            sql`, `,
          )})`,
        ),
      );
    for (const row of known) merged.delete(`${row.kind}:${row.value}`);

    return [...merged.values()]
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, SUGGESTION_LIMIT);
  });
}
