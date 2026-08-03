import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Security-critical columns and operation tables added by migration 0120.
 *
 * The main schema remains intentionally large and is generated independently.
 * Keeping these additive overlays isolated lets security routes use typed
 * Drizzle queries while the migration remains backward-compatible with the
 * currently deployed application.
 */
export const sessionUsers = pgTable("wireline_users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  sessionRevokedBefore: timestamp("session_revoked_before", {
    withTimezone: true,
  }).notNull(),
});

export const secureTeamMembers = pgTable("wireline_team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  tenantId: uuid("tenant_id"),
  email: text("email"),
  role: text("role").default("member"),
  invitedBy: uuid("invited_by"),
  invitationTokenHash: text("invitation_token_hash"),
  invitationExpiresAt: timestamp("invitation_expires_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const outboundDialReservations = pgTable("wireline_outbound_dial_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  phoneE164: text("phone_e164").notNull(),
  operationKey: text("operation_key").notNull(),
  status: text("status").notNull().default("reserved"),
  callId: text("call_id"),
  failureCode: text("failure_code"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const checkoutOperations = pgTable("wireline_checkout_operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  planId: text("plan_id").notNull(),
  billingInterval: text("billing_interval").notNull(),
  status: text("status").notNull().default("creating"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  checkoutUrl: text("checkout_url"),
  failureCode: text("failure_code"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
