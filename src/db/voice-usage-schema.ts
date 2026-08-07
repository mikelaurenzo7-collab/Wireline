import { decimal, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Durable per-provider-call accounting checkpoint.
 *
 * `wireline_quota_usage` is an aggregate and therefore cannot itself prove
 * whether one provider call has already contributed to the monthly counter.
 * This table is the missing idempotency boundary: one row per tenant + provider
 * call records the exact overage band assigned to that call and whether the
 * Runtime Balance debit was durably completed.
 */
export const voiceUsageEvents = pgTable(
  "wireline_voice_usage_events",
  {
    userId: uuid("user_id").notNull(),
    providerCallId: text("provider_call_id").notNull(),
    periodKey: text("period_key").notNull(),
    billableMinutes: integer("billable_minutes").notNull(),
    incrementalOverageMinutes: integer("incremental_overage_minutes").notNull().default(0),
    overageCostUsd: decimal("overage_cost_usd", { precision: 12, scale: 2 }).notNull().default("0"),
    countedAt: timestamp("counted_at", { withTimezone: true }).notNull().defaultNow(),
    chargedAt: timestamp("charged_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.providerCallId] }),
  }),
);
