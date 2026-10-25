import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./schema-base";
import type { UsageReportAttempt } from "../lib/usage-billing-ledger";
import type { UsageTierId } from "../lib/usage-billing-catalog";

export const USAGE_METER_EVENT_STATUSES = [
  "admitted",
  "pending",
  "reported",
  "skipped",
  "reconciliation_required",
] as const;
export type UsageMeterEventStatus = (typeof USAGE_METER_EVENT_STATUSES)[number];

/**
 * Usage billing ledger (migration 0187).
 *
 * One row per billable unit of work: a completed call, a handled email or a
 * finished cloud computer task. `idempotency_key` is unique, so a retried call
 * settlement or webhook redelivery can never count the same work twice, and the
 * same key is the Stripe meter event `identifier`; automatic retries stay
 * within its documented retention window. `billable_quantity` reserves the
 * prepared request and records the amount reported after the
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
    reportAttempt: jsonb("report_attempt").$type<UsageReportAttempt>(),
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
      sql`meter IN ('call_minutes', 'emails_handled', 'computer_minutes', 'sms_segments')`,
    ),
    statusCheck: check(
      "wireline_usage_meter_events_status_check",
      sql`status IN ('admitted', 'pending', 'reported', 'skipped', 'reconciliation_required')`,
    ),
    quantityCheck: check("wireline_usage_meter_events_quantity_check", sql`quantity >= 0`),
  }),
);

/** Immutable period identity and add-ons; only the current period's owner cap can change. */
export const usageBillingPeriods = pgTable(
  "wireline_usage_billing_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodKey: text("period_key").notNull(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    tier: text("tier").$type<UsageTierId>().notNull().default("starter"),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    monthlyCapUsd: numeric("monthly_cap_usd", { precision: 10, scale: 2 }).notNull(),
    numberAddons: integer("number_addons").notNull(),
    emailAddressAddons: integer("email_address_addons").notNull(),
    blockedReason: text("blocked_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userPeriodUnique: uniqueIndex("uq_usage_billing_periods_user_period").on(
      table.userId,
      table.periodKey,
    ),
    periodCheck: check("wireline_usage_billing_periods_period_check", sql`ends_at > starts_at`),
    tierCheck: check(
      "wireline_usage_billing_periods_tier_check",
      sql`tier IN ('starter', 'lite', 'standard', 'plus')`,
    ),
    capCheck: check(
      "wireline_usage_billing_periods_cap_check",
      sql`monthly_cap_usd > 0 AND monthly_cap_usd <= 25000`,
    ),
    addonsCheck: check(
      "wireline_usage_billing_periods_addons_check",
      sql`number_addons BETWEEN 0 AND 500 AND email_address_addons BETWEEN 0 AND 500`,
    ),
  }),
);

/**
 * Owner spend control for usage billing (migration 0187): the monthly cap and
 * the highest alert threshold already sent for the current period.
 */
export const usageSpendControls = pgTable(
  "wireline_usage_spend_controls",
  {
    tier: text("tier").$type<UsageTierId>().notNull().default("starter"),
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
    tierCheck: check(
      "wireline_usage_spend_controls_tier_check",
      sql`tier IN ('starter', 'lite', 'standard', 'plus')`,
    ),
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
