import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./schema-base";

export const USAGE_METER_EVENT_STATUSES = ["pending", "reported", "skipped"] as const;
export type UsageMeterEventStatus = (typeof USAGE_METER_EVENT_STATUSES)[number];

/**
 * Usage billing ledger (migration 0187).
 *
 * One row per billable unit of work: a completed call, a handled email or a
 * finished cloud computer task. `idempotency_key` is unique, so a retried call
 * settlement or webhook redelivery can never count the same work twice, and the
 * same key is the Stripe meter event `identifier`, so Stripe dedupes a repeated
 * report too. `billable_quantity` is what was actually reported after the
 * spend-cap clamp; the owner is never billed past the cap they set.
 */
export const usageMeterEvents = pgTable(
  "wireline_usage_meter_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodKey: text("period_key").notNull(),
    meter: text("meter").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    billableQuantity: numeric("billable_quantity", { precision: 14, scale: 4 }),
    status: text("status").$type<UsageMeterEventStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idempotencyKeyUnique: uniqueIndex("uq_usage_meter_events_idempotency_key").on(
      table.idempotencyKey,
    ),
    userPeriodIdx: index("idx_usage_meter_events_user_period").on(
      table.userId,
      table.periodKey,
      table.meter,
    ),
    pendingIdx: index("idx_usage_meter_events_pending")
      .on(table.createdAt)
      .where(sql`status = 'pending'`),
    meterCheck: check(
      "wireline_usage_meter_events_meter_check",
      sql`meter IN ('call_minutes', 'emails_handled', 'computer_minutes')`,
    ),
    statusCheck: check(
      "wireline_usage_meter_events_status_check",
      sql`status IN ('pending', 'reported', 'skipped')`,
    ),
    quantityCheck: check("wireline_usage_meter_events_quantity_check", sql`quantity >= 0`),
  }),
);

/**
 * Owner spend control for usage billing (migration 0187): the monthly cap and
 * the highest alert threshold already sent for the current period.
 */
export const usageSpendControls = pgTable(
  "wireline_usage_spend_controls",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    monthlyCapUsd: numeric("monthly_cap_usd", { precision: 10, scale: 2 })
      .notNull()
      .default("100.00"),
    alertPeriodKey: text("alert_period_key"),
    alertLevelPct: integer("alert_level_pct").notNull().default(0),
    /** Add-on quantities mirrored from the Stripe subscription items. */
    numberAddons: integer("number_addons").notNull().default(0),
    emailAddressAddons: integer("email_address_addons").notNull().default(0),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  () => ({
    capCheck: check(
      "wireline_usage_spend_controls_cap_check",
      sql`monthly_cap_usd > 0 AND monthly_cap_usd <= 25000`,
    ),
    alertCheck: check(
      "wireline_usage_spend_controls_alert_check",
      sql`alert_level_pct IN (0, 50, 80, 100)`,
    ),
    addonsCheck: check(
      "wireline_usage_spend_controls_addons_check",
      sql`number_addons BETWEEN 0 AND 500 AND email_address_addons BETWEEN 0 AND 500`,
    ),
  }),
);
