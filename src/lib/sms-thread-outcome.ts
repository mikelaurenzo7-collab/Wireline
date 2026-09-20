import { sql, type AnyColumn } from "drizzle-orm";

/** Evaluate against the row being updated, never a pre-delivery snapshot. */
export function smsOutcomeAfterMessage(status: AnyColumn) {
  return sql<string>`case when ${status} in ('waiting', 'escalated', 'booked', 'resolved', 'routing_conflict') then ${status} else 'open' end`;
}
