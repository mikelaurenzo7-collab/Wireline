import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Provider-level delivery suppression; separate from user unsubscribe preference. */
export const emailDeliverySuppressions = pgTable("wireline_email_delivery_suppressions", {
  email: text("email").primaryKey(),
  provider: text("provider").notNull().default("resend"),
  reason: text("reason").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Privacy-bounded receipt ledger for authenticated Resend webhook deliveries. */
export const resendWebhookEvents = pgTable("wireline_resend_webhook_events", {
  webhookId: text("webhook_id").primaryKey(),
  eventType: text("event_type").notNull(),
  emailId: text("email_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recipientCount: integer("recipient_count").notNull().default(0),
  suppressionCount: integer("suppression_count").notNull().default(0),
  detailCode: text("detail_code"),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
