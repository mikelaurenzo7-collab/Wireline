import { and, desc, eq, gte, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { OUTBOUND_RELATIONSHIP_WINDOW_MS } from "./outbound-call-purpose";
import { drizzle } from "./server-context";

export type DerivedRelationship = {
  kind: "returning_contact";
  source: "call" | "sms";
  sourceId: string;
  at: string;
};

type RelationshipHit = {
  id: string;
  at: Date;
};

export type RelationshipDeps = {
  loadInboundCall?: (userId: string, phoneTail: string, since: Date) => Promise<RelationshipHit | null>;
  loadInboundSms?: (userId: string, phoneTail: string, since: Date) => Promise<RelationshipHit | null>;
  now?: () => Date;
};

export function phoneTail10(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 ? national : null;
}

function tailEquals(column: unknown, tail: string) {
  return sql`right(regexp_replace(${column}, '[^0-9]', '', 'g'), 10) = ${tail}`;
}

async function loadInboundCall(
  userId: string,
  phoneTail: string,
  since: Date,
): Promise<RelationshipHit | null> {
  const [row] = await drizzle
    .select({
      id: schema.callLogs.id,
      at: schema.callLogs.createdAt,
    })
    .from(schema.callLogs)
    .where(
      and(
        eq(schema.callLogs.userId, userId),
        eq(schema.callLogs.direction, "inbound"),
        gte(schema.callLogs.createdAt, since),
        tailEquals(schema.callLogs.customerNumber, phoneTail),
      ),
    )
    .orderBy(desc(schema.callLogs.createdAt))
    .limit(1);
  if (!row?.at) return null;
  return { id: String(row.id), at: row.at };
}

async function loadInboundSms(
  userId: string,
  phoneTail: string,
  since: Date,
): Promise<RelationshipHit | null> {
  const [row] = await drizzle
    .select({
      id: schema.smsMessages.id,
      at: schema.smsMessages.createdAt,
    })
    .from(schema.smsMessages)
    .innerJoin(schema.smsThreads, eq(schema.smsMessages.threadId, schema.smsThreads.id))
    .where(
      and(
        eq(schema.smsMessages.userId, userId),
        eq(schema.smsThreads.userId, userId),
        eq(schema.smsMessages.direction, "in"),
        gte(schema.smsMessages.createdAt, since),
        tailEquals(schema.smsThreads.customerNumber, phoneTail),
      ),
    )
    .orderBy(desc(schema.smsMessages.createdAt))
    .limit(1);
  if (!row?.at) return null;
  return { id: String(row.id), at: row.at };
}

/**
 * Server-derived returning relationship. Another tenant's logs never match
 * because both queries filter on user id. The result can only loosen a
 * sales label. It never creates a sales obligation.
 */
export async function deriveRelationship(
  userId: string,
  phone: string,
  deps: RelationshipDeps = {},
): Promise<DerivedRelationship | null> {
  const tail = phoneTail10(phone);
  if (!tail) return null;
  const now = deps.now?.() ?? new Date();
  const since = new Date(now.getTime() - OUTBOUND_RELATIONSHIP_WINDOW_MS);
  const [call, sms] = await Promise.all([
    (deps.loadInboundCall || loadInboundCall)(userId, tail, since),
    (deps.loadInboundSms || loadInboundSms)(userId, tail, since),
  ]);
  const candidates = [call, sms].filter((hit): hit is RelationshipHit => Boolean(hit?.at));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.at.getTime() - a.at.getTime());
  const newest = candidates[0];
  const source: "call" | "sms" = newest === call ? "call" : "sms";
  return {
    kind: "returning_contact",
    source,
    sourceId: newest.id,
    at: newest.at.toISOString(),
  };
}

export function isWithinRelationshipWindow(
  createdAt: unknown,
  nowMs: number = Date.now(),
): boolean {
  if (!(createdAt instanceof Date)) return false;
  const createdAtMs = createdAt.getTime();
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - createdAtMs;
  return ageMs >= 0 && ageMs <= OUTBOUND_RELATIONSHIP_WINDOW_MS;
}
