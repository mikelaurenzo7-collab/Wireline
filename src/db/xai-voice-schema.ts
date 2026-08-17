import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { agents, users } from "./schema-base";

/**
 * Durable binding between a Wireline/Twilio number and xAI Direct SIP.
 *
 * Legacy Vapi identifiers remain on their historical tables during the
 * certification window so rollback evidence is preserved. New native call
 * routing never overloads those fields: xAI registration ids, Twilio trunk
 * ownership, and the encrypted Standard Webhooks signing secret live here.
 *
 * External identifiers are nullable while `status = provisioning`. This lets
 * Wireline claim the number before any non-idempotent carrier/provider call and
 * persist each returned identifier immediately instead of risking loss of the
 * one-time xAI signing secret during a partial failure. A short-lived claim
 * token prevents two requests from provisioning the same tenant line at once.
 */
export const xaiPhoneBindings = pgTable(
  "wireline_xai_phone_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    phoneNumber: text("phone_number").notNull(),
    twilioPhoneNumberSid: text("twilio_phone_number_sid"),
    twilioSipTrunkSid: text("twilio_sip_trunk_sid"),
    xaiPhoneNumberId: text("xai_phone_number_id"),
    xaiWebhookId: text("xai_webhook_id"),
    webhookSecretEncrypted: text("webhook_secret_encrypted"),
    webhookSecretLastFour: text("webhook_secret_last_four"),
    status: text("status", {
      enum: ["provisioning", "active", "error", "retired"],
    })
      .notNull()
      .default("provisioning"),
    provisioningToken: uuid("provisioning_token"),
    provisioningClaimedAt: timestamp("provisioning_claimed_at", { withTimezone: true }),
    lastError: text("last_error"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_xai_phone_bindings_user").on(table.userId),
    agentIdx: index("idx_xai_phone_bindings_agent").on(table.agentId),
    phoneUnique: uniqueIndex("uq_xai_phone_bindings_phone").on(table.phoneNumber),
    twilioPhoneUnique: uniqueIndex("uq_xai_phone_bindings_twilio_phone").on(
      table.twilioPhoneNumberSid,
    ),
    xaiPhoneUnique: uniqueIndex("uq_xai_phone_bindings_xai_phone").on(table.xaiPhoneNumberId),
    xaiWebhookUnique: uniqueIndex("uq_xai_phone_bindings_xai_webhook").on(table.xaiWebhookId),
  }),
);

export type XAIPhoneBinding = typeof xaiPhoneBindings.$inferSelect;
export type NewXAIPhoneBinding = typeof xaiPhoneBindings.$inferInsert;
