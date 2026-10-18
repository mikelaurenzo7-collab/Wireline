import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * One row per BotBound number registered with xAI Grok Voice (migration 0181).
 * Platform-owned: read and written only outside tenant context. Both secrets
 * are secret-vault envelopes, never plaintext.
 */
export const xaiPhoneRegistrations = pgTable(
  "wireline_xai_phone_registrations",
  {
    phoneNumber: text("phone_number").primaryKey(),
    xaiPhoneNumberId: text("xai_phone_number_id").notNull(),
    xaiWebhookId: text("xai_webhook_id").notNull(),
    webhookSecretEncrypted: text("webhook_secret_encrypted").notNull(),
    sipUsername: text("sip_username").notNull(),
    sipPasswordEncrypted: text("sip_password_encrypted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerIdUnique: uniqueIndex("uq_xai_phone_registrations_provider_id").on(
      table.xaiPhoneNumberId,
    ),
  }),
);

export type XAIPhoneRegistration = typeof xaiPhoneRegistrations.$inferSelect;
