import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { agents, users } from "./schema-base";

/**
 * Durable binding between a Wireline/Twilio number and xAI Direct SIP.
 *
 * Legacy Vapi identifiers remain on their historical tables during the
 * certification window so rollback evidence is preserved. New native call
 * routing never overloads those fields: xAI registration ids, Twilio trunk
 * ownership, and the encrypted Standard Webhooks signing secret live here.
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
    twilioPhoneNumberSid: text("twilio_phone_number_sid").notNull(),
    twilioSipTrunkSid: text("twilio_sip_trunk_sid").notNull(),
    xaiPhoneNumberId: text("xai_phone_number_id").notNull(),
    xaiWebhookId: text("xai_webhook_id").notNull(),
    webhookSecretEncrypted: text("webhook_secret_encrypted").notNull(),
    webhookSecretLastFour: text("webhook_secret_last_four").notNull(),
    status: text("status", {
      enum: ["provisioning", "active", "error", "retired"],
    })
      .notNull()
      .default("provisioning"),
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
