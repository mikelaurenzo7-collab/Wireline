/**
 * Canonical Drizzle/runtime schema entrypoint.
 * Latest committed migration: `drizzle/migrations/0149_retention_purge_fails_closed.sql`.
 *
 * `schema-base.ts` preserves the existing table graph. The three runtime
 * mirrors below are declared explicitly here because migrations 0130, 0133,
 * and 0134 changed their database-owned defaults and classification fields.
 * Explicit exports override the same names from `export *` so callers and
 * Drizzle Kit observe the current migrated definitions. `voice-usage-schema.ts` (migration 0135)
 * is re-exported so Drizzle Kit sees `wireline_voice_usage_events` — without
 * it, `drizzle-kit generate` would emit a DROP for the idempotency table.
 */
export * from "./schema-base";
export * from "./voice-usage-schema";
export * from "./resend-webhook-schema";

import {
  bigint,
  boolean,
  decimal,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./schema-base";

export const settings = pgTable("wireline_settings", {
  id: text("id").primaryKey(),
  // FK with cascade so deleting a user removes their settings row in
  // the same transaction — no orphans, no manual cleanup. The unique
  // constraint stays: one settings row per user.
  userId: uuid("user_id")
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  subscriptionStatus: text("subscription_status").default("pending_activation"),
  accountEnvironment: text("account_environment", {
    enum: ["production", "test", "demo"],
  })
    .default("production")
    .notNull(),
  /**
   * Wall-clock end of the 14-day soft trial that fires at signup.
   * NULL on grandfathered accounts created before the trial gate
   * shipped — those tenants stay on "active" forever.
   *
   * When subscriptionStatus = "trialing" and now() > trialEndsAt,
   * the daily sweep flips status to "trial_expired" and routes that
   * cost real money (outbound dial, new agent creation) return 402
   * with an upgrade payload.
   */
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  /**
   * Outbound-call counter scoped to the trial window. Increments on
   * every successful POST /api/outbound/dial + /bulk during
   * subscriptionStatus = "trialing". Capped at 25 by the trial-gate
   * middleware. Reset to 0 when status flips to "active" via Stripe.
   */
  trialOutboundCount: integer("trial_outbound_count").default(0),
  maxAgents: integer("max_agents").default(3),
  // Additional agents purchased à la carte beyond the plan's included
  // max_agents. When this is N, the Account Holder can deploy
  // (plan.max_agents + N) agents. Mutated only via the
  // /api/billing/extra-agents endpoint which also adjusts the Stripe
  // subscription item quantity for billing. Defaults to 0.
  extraAgents: integer("extra_agents").default(0).notNull(),
  /** Explicit ops/enterprise grant for photoreal live video streaming. */
  liveVideoAddonEnabled: boolean("live_video_addon_enabled").default(false).notNull(),
  vapiPrivateKey: text("vapi_private_key"),
  vapiPhoneNumberId: text("vapi_phone_number_id"),
  retentionDays: integer("retention_days").default(365),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  voiceLlmProvider: text("voice_llm_provider").default("openai"),
  voiceLlmModel: text("voice_llm_model").default("gpt-4o"),
  dailyBriefEnabled: boolean("daily_brief_enabled").default(false).notNull(),
  dailyBriefSendAt: text("daily_brief_send_at").default("13:00").notNull(),
  dailyBriefRecipient: text("daily_brief_recipient"),
  dailyBriefLastSentAt: timestamp("daily_brief_last_sent_at", {
    withTimezone: true,
  }),
  dailyBriefLastError: text("daily_brief_last_error"),
  /** Durable cron lease; see migration 0140. */
  dailyBriefDispatchClaimedAt: timestamp("daily_brief_dispatch_claimed_at", {
    withTimezone: true,
  }),
  /** At-most-once latch for the current day's non-idempotent Gmail delivery. */
  dailyBriefLastAttemptAt: timestamp("daily_brief_last_attempt_at", {
    withTimezone: true,
  }),
  businessName: text("business_name"),
  /** Industry / vertical label for template overlays and Director context. */
  businessType: text("business_type"),
  /** Primary offer or product line — surfaced in Director Assistants planning. */
  primaryProduct: text("primary_product"),
  /** Tenant-wide operating hours (JSON) for template {{operatingHours}} substitution. */
  businessHours: jsonb("business_hours"),
  crmType: text("crm_type"),
  twilioMessagingEnabled: boolean("twilio_messaging_enabled").default(false),
  twilioLookupEnabled: boolean("twilio_lookup_enabled").default(false),
  twilioManagerAlertsEnabled: boolean("twilio_manager_alerts_enabled").default(false),
  twilioMessagingServiceSid: text("twilio_messaging_service_sid"),
  twilioSmsFromNumber: text("twilio_sms_from_number"),
  twilioWhatsappFromNumber: text("twilio_whatsapp_from_number"),
  twilioManagerAlertNumber: text("twilio_manager_alert_number"),
  vapiPhoneInboundAgentId: text("vapi_phone_inbound_agent_id"),
  // Account Holder's personal callback number (E.164). When they "take" a live call
  // from the Wireline app, the agent warm-transfers the caller here. iOS can't
  // read the device's own number, so the user sets this once.
  handoffPhone: text("handoff_phone"),
  prospectingEnabled: boolean("prospecting_enabled").default(false),
  targetTitles: jsonb("target_titles"),
  targetIndustries: jsonb("target_industries"),
  targetStates: jsonb("target_states"),
  targetEmployeeRanges: jsonb("target_employee_ranges"),
  brandName: text("brand_name"),
  brandLogoUrl: text("brand_logo_url"),
  primaryColor: text("primary_color"),
  signupPlanInterest: text("signup_plan_interest"),
  signupBillingInterval: text("signup_billing_interval"),
  signupWedge: text("signup_wedge"),
  acquisitionSource: text("acquisition_source"),
  acquisitionMedium: text("acquisition_medium"),
  acquisitionCampaign: text("acquisition_campaign"),
  aiTier: text("ai_tier").default("starter"),
  /**
   * Tenant-wide default autonomy. Per-agent autonomy in `agents.autonomyLevel`
   * overrides this when set to anything other than "inherit". Values:
   * "auto" — execute actions immediately; "draft" — queue for human review;
   * "supervised" — auto-execute high-confidence, draft the rest.
   */
  autonomyLevel: text("autonomy_level").default("draft"),
  /** Opt-in: send a 1-question CSAT SMS after completed calls. */
  csatSmsEnabled: boolean("csat_sms_enabled").default(false),
  /**
   * First useful production call — north-star activation timestamp.
   * Set once by tenant-activation when a non-demo phone call clears quality bar.
   */
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  firstActivationCallId: bigint("first_activation_call_id", { mode: "bigint" }),
  timeToActivationSeconds: integer("time_to_activation_seconds"),
  activationChannel: text("activation_channel"),
  /**
   * Workspace brand — carried into shareable recap and (future) proposal
   * artifacts. Only affects the surface of published pages; the underlying
   * Letterpress structure stays owned by Wireline. See
   * `src/lib/shareable-artifact/brand.ts` and the migration
   * `0102_shareable_recap_artifacts.sql`.
   */
  workspaceDisplayName: text("workspace_display_name"),
  workspaceAccentHex: text("workspace_accent_hex"),
  workspaceTheme: text("workspace_theme").default("obsidian").notNull(),
  workspaceLogoUrl: text("workspace_logo_url"),
  workspaceContactLine: text("workspace_contact_line"),
  workspaceWirelineCreditVisible: boolean("workspace_wireline_credit_visible")
    .default(true)
    .notNull(),
});

// 1.0.1 SHAREABLE RECAP ARTIFACTS are defined in schema-base.ts.

export const spendBudgets = pgTable("wireline_spend_budgets", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  monthlyLimitUsd: decimal("monthly_limit_usd", {
    precision: 12,
    scale: 2,
  })
    .default("1.50")
    .notNull(),
  hardCap: boolean("hard_cap").default(true).notNull(),
  warnThresholdPct: integer("warn_threshold_pct").default(80).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  managedDefault: boolean("managed_default").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Canonical billing mirror, including the provenance columns introduced by
 * migration 0130. Keeping these fields on the primary runtime definition lets
 * every entitlement writer state why non-Stripe access exists in the same
 * atomic upsert that activates it.
 */
export const subscriptions = pgTable("wireline_subscriptions", {
  userId: uuid("user_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  plan: text("plan"),
  status: text("status"),
  entitlementSource: text("entitlement_source", {
    enum: ["stripe", "demo", "manual", "migration"],
  })
    .notNull()
    .default("manual"),
  grantReason: text("grant_reason"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 1.2.1 SPEND ALERTS are defined in schema-base.ts.
