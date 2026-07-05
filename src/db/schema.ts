/* eslint-disable @typescript-eslint/no-explicit-any -- Drizzle's $type<...>()
 * inference flows through generic .$type<T>() column callbacks where the
 * shape is known by us but expressed as `any` in Drizzle's column-builder
 * signatures (jsonb payloads, generated columns). Casting to the underlying
 * runtime shape via `any` is the upstream-blessed escape hatch — see
 * https://orm.drizzle.team for the typed-jsonb pattern. */
import {
  pgTable,
  text,
  timestamp,
  integer,
  decimal,
  boolean,
  uuid,
  bigint,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
// Index support via sql`` for Drizzle ORM 0.33 compatibility
//
// Schema version: latest migration is `drizzle/migrations/0059_add_accounts.sql`.
// After editing this file run `npm run db:generate` and review the new SQL before deploy.

// 0. IDENTITY & ACCOUNTS

/**
 * A user can own one or two accounts — a personal account (single agent,
 * streamlined UI) and/or a business account (Assistants, command centre, SDR
 * pipeline). The first account type created at signup becomes the
 * "primary" account. Agents, settings, and billing scope to an account,
 * not directly to a user.
 */
export const accounts = pgTable(
  "wireline_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["personal", "business"] }).notNull(),
    label: text("label"),
    isPrimary: boolean("is_primary").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userTypeIdx: sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_user_type ON wireline_accounts USING btree (user_id, type)`,
  }),
);

export const users = pgTable("wireline_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash"),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  isAdmin: boolean("is_admin").default(false),
  /**
   * Set when the user clicks the verification link we email them at
   * signup. NULL means "unverified" — the trial gate refuses spend
   * actions (outbound dial, new agent creation, Stripe checkout)
   * until this is set. Existing users from before the verification
   * gate shipped are backfilled to their createdAt (auto-verified)
   * by the migration so they don't suddenly hit a paywall.
   */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Single-use password-reset tokens with 1-hour TTL. The token itself is
// only stored hashed (sha256) so a DB leak doesn't enable account takeover.
export const passwordResetTokens = pgTable("wireline_password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  requestedIp: text("requested_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/**
 * Single-use email-verification tokens with 24-hour TTL. Same hashed-
 * storage pattern as password-reset tokens. Owned by a user; the
 * email-service generates the plaintext token, stores only the sha256,
 * and emails the plaintext to the user. They click the link, we look
 * up by hash, verify expiry + usedAt, then set users.emailVerifiedAt
 * and mark the token as used.
 *
 * Resend is rate-limited (1 token per minute per user) at the route
 * layer to prevent abuse.
 */
export const emailVerificationTokens = pgTable("wireline_email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 1. SETTINGS & BILLING
export const settings = pgTable("wireline_settings", {
  id: text("id").primaryKey(),
  // FK with cascade so deleting a user removes their settings row in
  // the same transaction — no orphans, no manual cleanup. The unique
  // constraint stays: one settings row per user.
  userId: uuid("user_id")
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  subscriptionStatus: text("subscription_status").default("active"),
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
  voiceLlmProvider: text("voice_llm_provider").default("anthropic"),
  voiceLlmModel: text("voice_llm_model").default("claude-sonnet-4-6"),
  dailyBriefEnabled: boolean("daily_brief_enabled").default(false).notNull(),
  dailyBriefSendAt: text("daily_brief_send_at").default("13:00").notNull(),
  dailyBriefRecipient: text("daily_brief_recipient"),
  dailyBriefLastSentAt: timestamp("daily_brief_last_sent_at", { withTimezone: true }),
  dailyBriefLastError: text("daily_brief_last_error"),
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
});

// 1.1 USER PREFERENCES
export const userPreferences = pgTable("wireline_user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tourCompleted: boolean("tour_completed").default(false),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  helpEnabled: boolean("help_enabled").default(true),
  keyboardShortcutsEnabled: boolean("keyboard_shortcuts_enabled").default(true),
  preferences: jsonb("preferences").default({}),
  persona: text("persona"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 1.2 SPEND BUDGETS
export const spendBudgets = pgTable("wireline_spend_budgets", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  monthlyLimitUsd: decimal("monthly_limit_usd", { precision: 12, scale: 2 }).default("0"),
  hardCap: boolean("hard_cap").default(false),
  warnThresholdPct: integer("warn_threshold_pct").default(80),
  enabled: boolean("enabled").default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 1.2.1 SPEND ALERTS
export const spendAlerts = pgTable(
  "wireline_spend_alerts",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    thresholdPct: integer("threshold_pct"),
    period: text("period"),
    firedAt: timestamp("fired_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_spend_alerts_user ON wireline_spend_alerts USING btree (user_id)`,
  }),
);

// 1.3 DELETION QUEUE
export const deletionQueue = pgTable(
  "wireline_deletion_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow(),
    scheduledPurgeAt: timestamp("scheduled_purge_at", { withTimezone: true }),
    status: text("status").default("pending"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_deletion_queue_user ON wireline_deletion_queue USING btree (user_id)`,
  }),
);

// 2. Assistants INVENTORY (AGENTS)
export const agents = pgTable(
  "wireline_agents",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    /** Scopes the agent to a specific account. NULL for legacy agents
     *  created before account separation — backfilled lazily on first
     *  account-scoped request. */
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    voiceId: text("voice_id"),
    voiceIdInbound: text("voice_id_inbound"),
    voiceIdOutbound: text("voice_id_outbound"),
    /**
     * Secondary voice for mid-call language swap. When set, the Vapi
     * webhook listens for `language-change-detected` events and hands
     * the live call off to a clone of this assistant with the secondary
     * voiceId active — so the caller hears a native-sounding speaker
     * the instant the transcriber flips from `en` to a non-English
     * locale (typically Spanish for our customers).
     *
     * Optional. Only meaningful when a primary voiceId is already set.
     * NULL → no swap; caller continues with the primary voice.
     *
     * Implementation notes (Vapi API surface, May 2026 docs):
     *   - Vapi PATCH /call/{id} does NOT mutate voice config on a live
     *     call (only `name` is mutable). We instead use the call-control
     *     `handoff` payload to swap voices, which adds ~500ms of dead
     *     air during the handoff but is the only seamless path Vapi
     *     supports today.
     *   - Pattern source: ElevenLabs multi-voice cookbook —
     *     https://elevenlabs.io/docs/eleven-agents/customization/voice/multi-voice-support
     */
    secondaryVoiceId: text("secondary_voice_id"),
    voiceProvider: text("voice_provider").default("11labs"),
    /** PSTN line voice when studio voice uses presenter lip-sync. */
    phoneVoiceId: text("phone_voice_id"),
    phoneVoiceProvider: text("phone_voice_provider"),
    firstMessage: text("first_message"),
    archetype: text("archetype").default("Receptionist"),
    ambientNoise: text("ambient_noise").default("off"),
    websiteUrl: text("website_url"),
    transferPhone: text("transfer_phone"),
    emailAutoRespond: boolean("email_auto_respond").default(true),
    emailAgentTone: text("email_agent_tone").default("Professional"),
    emailSignature: text("email_signature"),
    channel: text("channel").default("voice"),
    role: text("role").default("customer_service"),
    enabledTools: jsonb("enabled_tools"),
    autonomyLevel: text("autonomy_level").default("inherit"),
    channels: text("channels").array(),
    slackChannelId: text("slack_channel_id"),
    autoZoomLink: boolean("auto_zoom_link").default(false),
    businessHours: jsonb("business_hours"),
    timezone: text("timezone").default("UTC"),
    /**
     * Personality vibe layered on top of the agent's role + archetype.
     * Drives a single short directive block injected into the system
     * prompt at runtime. Defaults to "warm" — the trustworthy + warm
     * receptionist tone every vertical can wear. Account Holders bump to
     * "playful" for retail / agencies / SaaS where memorability beats
     * formality, or to "authoritative" for medical / legal / financial
     * intake where the caller needs to feel they're in capable hands.
     * Voice (Adam · Deep) stays consistent across vibes — vibe shifts
     * the SCRIPT, not the voice.
     */
    personalityVibe: text("personality_vibe").default("warm"),
    /**
     * Account Holder-authored system prompt that fully REPLACES the
     * auto-composed base identity prompt at call time. When set and
     * non-empty, the Vapi assistant factory uses this text as the base
     * identity block instead of the generated "## IDENTITY & MISSION"
     * prompt (or the Wireline persona overlay), then still appends the
     * call-specific dynamic blocks (caller profile, intel, sentiment,
     * lead, flow, personality, directives, knowledge, lessons, date)
     * AND runs the result through buildAgentRuntimeContext, so the
     * compliance / escalation / do-not-discuss / voice-consistency
     * guardrails can never be silently dropped.
     *
     * NULL (the default) → fall back to the auto-composed prompt,
     * preserving existing behaviour for every agent that hasn't been
     * overridden. Surfaced as the "System prompt" textarea in
     * AssistantSettings → AgentConfigPanel with a "Use auto-composed prompt"
     * reset that sets this back to NULL.
     */
    systemPromptOverride: text("system_prompt_override"),
    complianceMode: text("compliance_mode").default("standard"),
    disallowedTopics: text("disallowed_topics").array(),
    escalationKeywords: text("escalation_keywords").array(),
    /**
     * Per-agent escalation routing. When set, the `escalate_to_human`
     * tool routes here INSTEAD of the tenant-wide
     * `wireline_settings.twilio_manager_alert_number`. Lets account holders
     * route sales escalations to the sales manager and support
     * escalations to the support lead without splitting tenants.
     *
     * - escalationPhone : SMS destination (E.164 format)
     * - escalationEmail : Email destination for non-instant escalations
     *                     (delivered via Resend on the same job that
     *                     posts to Slack + SMS)
     *
     * If BOTH are NULL the handler falls back to the tenant defaults,
     * preserving existing behaviour for accounts that haven't migrated.
     */
    escalationPhone: text("escalation_phone"),
    escalationEmail: text("escalation_email"),
    /**
     * Warm-transfer toggle. When TRUE and escalation_phone is set, the
     * `escalate_to_human` tool returns a Vapi `destination` so the LIVE
     * caller is transferred to escalation_phone in real time instead of
     * just queueing an async SMS/email alert. The product-defining
     * "AI receptionist that warm-transfers to a human" promise.
     */
    escalationHandoffEnabled: boolean("escalation_handoff_enabled").default(false),
    businessVariables: jsonb("business_variables"),
    flowConfig: jsonb("flow_config"),
    outOfHoursMessage: text("out_of_hours_message"),
    kpiFocus: text("kpi_focus"),
    isBusinessAgent: boolean("is_business_agent").default(false).notNull(),
    // Per-archetype silence tolerance for Vapi calls. NULL → factory uses
    // archetype default (Receptionist 5s, SDR 2s, etc.).
    silenceTimeoutSeconds: integer("silence_timeout_seconds"),
    /**
     * Per-agent ElevenLabs speaking rate multiplier. Range 0.7 – 1.2,
     * default 1.0 (normal pace). Account Holders slow agents down for elderly
     * customers (0.85) or speed them up for impatient callers (1.1).
     * Surfaced as a slider in AssistantSettings → Voice and wired into the
     * Vapi assistant voice block as `voice.speed` when the provider is
     * 11labs.
     *
     * Stored as numeric (Postgres `numeric`) for exact arithmetic; the
     * voice factory coerces via Number() before passing to Vapi.
     *
     * Docs: https://elevenlabs.io/docs/eleven-agents/customization/voice/speed-control
     */
    voiceSpeed: decimal("voice_speed", { precision: 3, scale: 2 }).default("1.0"),
    /**
     * Per-agent reasoning-model override (customization-first Agent Studio).
     *
     * NULL on any of these → the agent inherits the tenant default
     * (settings.voice_llm_provider / voice_llm_model) and the archetype's
     * temperature, exactly as before. When set, the voice factory routes the
     * live call through this provider/model instead. Values are validated +
     * normalized by resolveVapiVoiceModelSelection() against the Vapi-native
     * provider set (anthropic | google | openai | xai | openrouter), so a bad
     * value can never reach Vapi — it falls back to the tenant default.
     *
     * llm_temperature is clamped to a safe range in the factory so a per-agent
     * override can't destabilize the live tier. See VOICE_MODEL_CATALOG.
     */
    llmProvider: text("llm_provider"),
    llmModel: text("llm_model"),
    llmTemperature: decimal("llm_temperature", { precision: 3, scale: 2 }),
    /**
     * ElevenLabs voice fine-tuning — quality knobs account holders with cloned
     * voices need to dial in their exact sound. All four map 1:1 to the
     * ElevenLabs voice settings payload Vapi forwards to ElevenLabs at
     * synthesis time. Defaults match ElevenLabs's documented defaults so
     * a NULL/missing row sounds identical to "no fine-tuning".
     *
     *   stability         (0..1, default 0.5)  — voice consistency. Low =
     *                      expressive/emotional, high = monotone/consistent.
     *   similarity_boost  (0..1, default 0.75) — how closely TTS hugs the
     *                      source voice. Most impact on cloned voices.
     *   style             (0..1, default 0.0)  — style exaggeration. >0
     *                      adds latency but more character.
     *   speaker_boost     (bool, default true) — boosts perceived loudness/
     *                      presence; off for "intimate" voices.
     *
     * Surfaced as the Voice fine-tuning panel in AssistantSettings → carrier
     * signal parameters. Numerics stored as `numeric(3,2)` (returned as a
     * string by pg) — the factory coerces + clamps to [0,1] before send.
     *
     * Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert#request.body.voice_settings
     */
    voiceStability: decimal("voice_stability", { precision: 3, scale: 2 }).default("0.5"),
    voiceSimilarityBoost: decimal("voice_similarity_boost", {
      precision: 3,
      scale: 2,
    }).default("0.75"),
    voiceStyle: decimal("voice_style", { precision: 3, scale: 2 }).default("0.0"),
    voiceSpeakerBoost: boolean("voice_speaker_boost").default(true),
    /**
     * Live video presenter (LiveAvatar LITE). Provider stays internal; UI reads
     * Wireline surface labels from lib/agent-identity. avatar_id is the
     * LiveAvatar catalog UUID. consent_status gates custom avatars.
     */
    videoPresenterProvider: text("video_presenter_provider"),
    videoPresenterAvatarId: text("video_presenter_avatar_id"),
    videoPresenterConsentStatus: text("video_presenter_consent_status").default("not_started"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX idx_agents_user_id ON wireline_agents USING btree (user_id)`,
    createdAtIdx: sql`CREATE INDEX idx_agents_created_at ON wireline_agents USING btree (created_at)`,
  }),
);

// 2.1 COGNITIVE ENGINE (TRAINING DATA)
export const directives = pgTable(
  "wireline_directives",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    priority: integer("priority").default(5),
  },
  () => ({
    agentUserPriorityIdx: sql`CREATE INDEX IF NOT EXISTS idx_directives_agent_user_priority ON wireline_directives USING btree (agent_id, user_id, priority DESC)`,
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_directives_user_id ON wireline_directives USING btree (user_id)`,
  }),
);

export const knowledge = pgTable(
  "wireline_knowledge",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    agentUserIdx: sql`CREATE INDEX IF NOT EXISTS idx_knowledge_agent_user ON wireline_knowledge USING btree (agent_id, user_id)`,
    userCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_knowledge_user_created ON wireline_knowledge USING btree (user_id, created_at DESC)`,
  }),
);

export const personality = pgTable(
  "wireline_personality",
  {
    agentId: text("agent_id")
      .primaryKey()
      .references(() => agents.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    content: text("content").notNull(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_personality_user_id ON wireline_personality USING btree (user_id)`,
  }),
);

export const agentLessons = pgTable(
  "wireline_agent_lessons",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    lesson: text("lesson").notNull(),
    sourceCallId: text("source_call_id"),
    source: text("source"),
    /** pending | approved | rejected — only approved lessons inject into runtime. */
    lessonStatus: text("lesson_status").default("approved"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t: any) => ({
    unq: unique().on(t.agentId, t.lesson),
    agentCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_agent_lessons_agent_created ON wireline_agent_lessons USING btree (agent_id, created_at DESC)`,
  }),
);

// Per-tenant cloned voices — voice_id is the ElevenLabs UUID, name
// is the Account Holder-given label, preview_url is the ElevenLabs-hosted
// MP3 sample. Pluggable directly into Vapi assistant configs (Vapi
// accepts any ElevenLabs voice_id when the API key on file has
// access to it).
export const clonedVoices = pgTable(
  "wireline_cloned_voices",
  {
    voiceId: text("voice_id").primaryKey(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    status: text("status").default("completed").notNull(), // 'processing' | 'completed' | 'failed'
    previewUrl: text("preview_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  () => ({
    userCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_cloned_voices_user_created ON wireline_cloned_voices USING btree (user_id, created_at DESC)`,
  }),
);

// Per-tenant pronunciation dictionaries for ElevenLabs TTS.
// Account Holders in regulated verticals (medical, legal, real estate) need
// industry jargon pronounced correctly — "HVAC" should say "H-V-A-C",
// not "h-vack"; "ACL" should be spelled out; "deposition" might need
// an IPA phoneme override. ElevenLabs exposes this via their
// Pronunciation Dictionary API; once created, the returned
// pronunciation_dictionary_id + version_id are stored here and
// attached to Vapi assistants via voice.eleven_labs
// .pronunciation_dictionary_locators on every assistant build.
//
// `entries` shape (jsonb array):
//   [{ from: "HVAC",  to: "H-V-A-C",        kind: "alias" },
//    { from: "ACL",   to: "ˈeɪ siː ɛl",     kind: "phoneme" }]
// Validated route-side before we sync to ElevenLabs.
//
// `active` lets account holders toggle a dictionary off without deleting it
// (e.g. seasonal vocabularies, A/B testing legal vs medical jargon
// across the same Assistants).
export const pronunciationDictionaries = pgTable(
  "wireline_pronunciation_dictionaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    entries: jsonb("entries")
      .notNull()
      .default(sql`'[]'::jsonb`),
    // ElevenLabs assigns these on every successful add-from-rules call.
    // Null until the first successful sync — the row exists locally as
    // a draft until then. Versioned because ElevenLabs treats every
    // edit as a new version: we always store the latest.
    elevenlabsDictionaryId: text("elevenlabs_dictionary_id"),
    elevenlabsVersionId: text("elevenlabs_version_id"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  () => ({
    userIdx: sql`CREATE INDEX IF NOT EXISTS idx_pronunciation_dicts_user ON wireline_pronunciation_dictionaries USING btree (user_id, created_at DESC)`,
  }),
);

// Per-agent Account Holder chat thread. Persistent, ongoing — distinct from
// /train which is structural agent configuration. Think of this as the
// private DM channel the Account Holder has with each AI agent: ongoing
// direction, coaching, "how did the calls go this week?", file-attached
// context. Memory is the thread itself plus the agent's flow + recent
// call summaries injected as context at LLM time.
//
// One thread per (userId, agentId). When the Account Holder sends, we store
// a row with role="Account Holder". Claude reads thread history + agent
// config + recent calls, replies, and we store the reply with
// role="agent". Soft-delete on agent delete via cascade.
export const agentConversationMessages = pgTable(
  "wireline_agent_conversation_messages",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    agentId: text("agent_id")
      .references(() => agents.id, { onDelete: "cascade" })
      .notNull(),
    // role is one of "Account Holder" | "agent" — DB-level CHECK constraint
    // lives in the migration (this Drizzle version doesn't expose .$type()).
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** Claude's adaptive thinking/reasoning text for this message (nullable). */
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  () => ({
    userAgentIdx: sql`CREATE INDEX IF NOT EXISTS idx_agent_conv_user_agent ON wireline_agent_conversation_messages USING btree (user_id, agent_id, created_at DESC)`,
  }),
);

// Director chat — the account-level strategist thread.
//
// Unlike agentConversationMessages (one thread per agent), the Director is a
// single per-USER thread. It's always available — even before the Account Holder
// owns any agents — and acts as the manager that helps plan, set up, and
// coach the Assistants. role is "Account Holder" | "director". No agent FK: the Director
// exists at the account level, so its history survives agent deletions.
export const directorConversationMessages = pgTable(
  "wireline_director_conversation_messages",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    /** director = Assistants chat; painter = Wireline Design studio (/design). */
    threadKey: text("thread_key").notNull().default("director"),
    // role is one of "Account Holder" | "director" — DB-level CHECK constraint
    // lives in the migration (this Drizzle version doesn't expose .$type()).
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** Claude's adaptive thinking/reasoning text for this message (nullable). */
    reasoning: text("reasoning"),
    /** Structured reply payload — proposals, suggestions, creative approvals, etc. */
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  () => ({
    userIdx: sql`CREATE INDEX IF NOT EXISTS idx_director_conv_user ON wireline_director_conversation_messages USING btree (user_id, created_at DESC)`,
    userThreadIdx: sql`CREATE INDEX IF NOT EXISTS idx_director_conv_user_thread_created ON wireline_director_conversation_messages USING btree (user_id, thread_key, created_at DESC)`,
  }),
);

// Director artifacts — persisted generated files and their backing objects.
//
// Storage model:
// 1) wireline_director_artifact_objects stores the raw base64 payload keyed by
//    object_key (our object-store abstraction).
// 2) wireline_director_artifacts stores per-thread/version metadata and points
//    at the object key for signed delivery.
export const directorArtifactObjects = pgTable(
  "wireline_director_artifact_objects",
  {
    objectKey: text("object_key").primaryKey(),
    userId: uuid("user_id").notNull(),
    mimeType: text("mime_type").notNull(),
    base64Data: text("base64_data").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  () => ({
    userIdx: sql`CREATE INDEX IF NOT EXISTS idx_director_artifact_objects_user_created ON wireline_director_artifact_objects USING btree (user_id, created_at DESC)`,
  }),
);

export const directorArtifacts = pgTable(
  "wireline_director_artifacts",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    threadKey: text("thread_key").notNull().default("director"),
    messageId: bigint("message_id", { mode: "bigint" }),
    toolName: text("tool_name").notNull(),
    artifactType: text("artifact_type").notNull(),
    name: text("name").notNull(),
    objectKey: text("object_key").notNull(),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  () => ({
    userThreadIdx: sql`CREATE INDEX IF NOT EXISTS idx_director_artifacts_user_thread_created ON wireline_director_artifacts USING btree (user_id, thread_key, created_at DESC)`,
    objectIdx: sql`CREATE INDEX IF NOT EXISTS idx_director_artifacts_object ON wireline_director_artifacts USING btree (object_key)`,
  }),
);

// 2.2 COMMITMENTS & LOGISTICS
export const appointments = pgTable(
  "wireline_appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    agentId: text("agent_id").references(() => agents.id),
    callId: text("call_id"),
    date: text("date"),
    time: text("time"),
    customerName: text("customer_name"),
    serviceType: text("service_type"),
    status: text("status").default("Scheduled"),
    notes: text("notes"),
    phoneNumber: text("phone_number"),
    // True when the row was inserted by /api/admin/seed-demo-account so
    // the UI can render a "DEMO" pill and account holders won't mistake the
    // seeded showcase rows for real customer activity.
    demo: boolean("demo").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON wireline_appointments USING btree (user_id)`,
    userPhoneTailIdx: sql`CREATE INDEX IF NOT EXISTS idx_appointments_user_phone_tail ON wireline_appointments (user_id, right(regexp_replace(phone_number, '[^0-9]', '', 'g'), 10))`,
    userCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_appointments_user_created ON wireline_appointments USING btree (user_id, created_at)`,
    createdAtIdx: sql`CREATE INDEX IF NOT EXISTS idx_appointments_created_at ON wireline_appointments USING btree (created_at)`,
    statusIdx: sql`CREATE INDEX IF NOT EXISTS idx_appointments_status ON wireline_appointments USING btree (status)`,
    userStatusIdx: sql`CREATE INDEX IF NOT EXISTS idx_appointments_user_status ON wireline_appointments USING btree (user_id, status)`,
  }),
);

// 3. SIGNAL ARCHIVES (CALL LOGS)
export const callLogs = pgTable(
  "wireline_call_logs",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    vapiCallId: text("vapi_call_id").unique(),
    agentId: text("agent_id").references(() => agents.id),
    direction: text("direction"),
    customerNumber: text("customer_number"),
    durationSeconds: integer("duration_seconds"),
    cost: decimal("cost", { precision: 10, scale: 4 }),
    summary: text("summary"),
    transcript: text("transcript"),
    recordingUrl: text("recording_url"),
    leadScore: integer("lead_score").default(0),
    intentLabel: text("intent_label").default("none"),
    sentiment: text("sentiment").default("neutral"),
    coachingNote: text("coaching_note"),
    qaScore: integer("qa_score"),
    qaBreakdown: jsonb("qa_breakdown"),
    /** Post-call CSAT score (1-5) from the caller's SMS reply. */
    csatScore: integer("csat_score"),
    // Single-word outcome bucket the post-call digest uses for the email
    // subject + Insights breakdown: booked | qualified | followup | dnc |
    // unreachable | info | other.
    outcomeTag: text("outcome_tag"),
    // Campaign attribution — denormalized from phoneNumbers.campaignLabel at
    // write time so /insights queries don't need a join.
    campaignSource: text("campaign_source"),
    // True when the row was inserted by /api/admin/seed-demo-account so
    // the UI can render a "DEMO" pill and account holders won't mistake seeded
    // showcase activity for real call traffic.
    demo: boolean("demo").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),

    // Voice observability — per-call telemetry for TTFT, STT/TTS health, pipeline latency.
    // Written by voice webhooks + recordVoiceMetrics(); queried by GET /api/insights/latency
    // and GET /api/health/voice-status (see src/lib/voice-observability.ts).
    ttftMs: integer("ttft_ms"), // Time-to-first-token (target: <900ms, alert: >1.2s)
    ttfAudioMs: integer("ttf_audio_ms"), // Time-to-first-audio (full pipeline)
    sttError: boolean("stt_error").default(false), // Speech-to-text failed/timeout
    ttsError: boolean("tts_error").default(false), // Text-to-speech failed/interrupted
    pipelineError: text("pipeline_error"), // High-level error classification: stt|tts|llm|connection|unknown
    latencyP50Ms: integer("latency_p50_ms"), // Provider-reported p50 latency (if available)
    latencyP95Ms: integer("latency_p95_ms"), // Provider-reported p95 latency (if available)
    /** Vapi call end reason — distinct from pipeline_error (see voice-reliability dashboard). */
    endedReason: text("ended_reason"),
    toolCallsTotal: integer("tool_calls_total").default(0),
    toolCallsFailed: integer("tool_calls_failed").default(0),
    escalationAttempted: boolean("escalation_attempted").default(false),
    escalationSucceeded: boolean("escalation_succeeded").default(false),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_user_id ON wireline_call_logs USING btree (user_id)`,
    userCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_user_created ON wireline_call_logs USING btree (user_id, created_at)`,
    agentIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_agent_id ON wireline_call_logs USING btree (agent_id)`,
    agentCustomerCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_agent_customer_created ON wireline_call_logs (agent_id, customer_number, created_at DESC)`,
    createdAtIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON wireline_call_logs USING btree (created_at)`,
    userOutcomeIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_user_outcome ON wireline_call_logs USING btree (user_id, outcome_tag) WHERE outcome_tag IS NOT NULL`,
    userCampaignIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_user_campaign ON wireline_call_logs USING btree (user_id, campaign_source) WHERE campaign_source IS NOT NULL`,
    // Voice observability indexes — used by computeVoiceHealthWindow() + latency trends
    ttftIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_ttft ON wireline_call_logs USING btree (ttft_ms) WHERE ttft_ms IS NOT NULL`,
    demoCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_demo_created ON wireline_call_logs USING btree (demo, created_at) WHERE demo = true`,
    pipelineErrorIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_pipeline_error ON wireline_call_logs USING btree (pipeline_error) WHERE pipeline_error IS NOT NULL`,
    endedReasonIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_ended_reason ON wireline_call_logs USING btree (ended_reason) WHERE ended_reason IS NOT NULL`,
    userPhoneTailIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_logs_user_phone_tail ON wireline_call_logs (user_id, right(regexp_replace(customer_number, '[^0-9]', '', 'g'), 10))`,
  }),
);

/** Live-call staging for tool/escalation counters before end-of-call-report writes callLogs. */
export const callReliabilityStaging = pgTable(
  "wireline_call_reliability_staging",
  {
    vapiCallId: text("vapi_call_id").primaryKey(),
    userId: uuid("user_id").notNull(),
    toolCallsTotal: integer("tool_calls_total").default(0).notNull(),
    toolCallsFailed: integer("tool_calls_failed").default(0).notNull(),
    escalationAttempted: boolean("escalation_attempted").default(false).notNull(),
    escalationSucceeded: boolean("escalation_succeeded").default(false).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_reliability_staging_user ON wireline_call_reliability_staging USING btree (user_id)`,
  }),
);

/** Inbound provider webhook outcomes — powers webhook failure rate on voice reliability dashboard. */
export const webhookHealth = pgTable(
  "wireline_webhook_health",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id"),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    outcome: text("outcome").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_webhook_health_user_created ON wireline_webhook_health USING btree (user_id, created_at)`,
    providerCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_webhook_health_provider_created ON wireline_webhook_health USING btree (provider, created_at)`,
  }),
);

// 3.1 OMNICHANNEL RELAY (EMAIL)
export const emailAccounts = pgTable(
  "wireline_email_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    emailAddress: text("email_address").unique().notNull(),
    provider: text("provider").default("google"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: bigint("expires_at", { mode: "bigint" }),
    /**
     * Space-delimited scope string returned by the OAuth provider on the most
     * recent token grant. Consumed by `computeIntegrationHealth` to detect
     * accounts that need a re-consent for calendar.events / Calendars.ReadWrite.
     */
    oauthGrantedScopes: text("oauth_granted_scopes"),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON wireline_email_accounts USING btree (user_id)`,
  }),
);

export const calendarAccounts = pgTable(
  "wireline_calendar_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    /**
     * Mirrors `wireline_email_accounts.email_address` so the same OAuth
     * grant lands in both tables. Used as the conflict target for the
     * upsert in `/api/oauth/{google,microsoft}/callback`.
     */
    emailAddress: text("email_address"),
    provider: text("provider").default("google"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: bigint("expires_at", { mode: "bigint" }),
    oauthGrantedScopes: text("oauth_granted_scopes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t: any) => ({
    userEmailUniq: unique("wireline_calendar_accounts_user_id_email_address_key").on(
      t.userId,
      t.emailAddress,
    ),
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_calendar_accounts_user_id ON wireline_calendar_accounts USING btree (user_id)`,
  }),
);

export const calendarEvents = pgTable(
  "wireline_calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => calendarAccounts.id, { onDelete: "cascade" }),
    externalEventId: text("external_event_id").notNull(),
    title: text("title"),
    startTime: timestamp("start_time", { withTimezone: true }),
    endTime: timestamp("end_time", { withTimezone: true }),
    status: text("status").default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t: any) => ({
    accountEventUniq: unique().on(t.accountId, t.externalEventId),
    userStartTimeIdx: sql`CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start ON wireline_calendar_events USING btree (user_id, start_time DESC)`,
  }),
);

export const emailThreads = pgTable(
  "wireline_email_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    accountId: uuid("account_id").references(() => emailAccounts.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    threadId: text("thread_id").unique(),
    customerEmail: text("customer_email"),
    subject: text("subject"),
    status: text("status").default("open"),
    summary: text("summary"),
    leadScore: integer("lead_score").default(0),
    intentLabel: text("intent_label").default("none"),
    read: boolean("read").default(false).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_email_threads_user_id ON wireline_email_threads USING btree (user_id)`,
    leadScoreIdx: sql`CREATE INDEX IF NOT EXISTS idx_email_threads_lead_score ON wireline_email_threads USING btree (lead_score)`,
    userLeadScoreIdx: sql`CREATE INDEX IF NOT EXISTS idx_email_threads_user_lead_score ON wireline_email_threads USING btree (user_id, lead_score)`,
    userReadIdx: sql`CREATE INDEX IF NOT EXISTS idx_email_threads_user_read ON wireline_email_threads USING btree (user_id, read)`,
    createdAtIdx: sql`CREATE INDEX IF NOT EXISTS idx_email_threads_created_at ON wireline_email_threads USING btree (created_at)`,
  }),
);

export const emailMessages = pgTable(
  "wireline_email_messages",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    threadId: uuid("thread_id").references(() => emailThreads.id, { onDelete: "cascade" }),
    googleMessageId: text("google_message_id").unique(),
    role: text("role"), // 'user' or 'ai'
    content: text("content"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    threadIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_email_messages_thread_id ON wireline_email_messages USING btree (thread_id)`,
    threadCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_email_messages_thread_created ON wireline_email_messages USING btree (thread_id, created_at DESC)`,
  }),
);

// 3.1b SMS THREADS + MESSAGES — two-way text conversations.
// Mirrors the email_threads/email_messages shape so the SmsThreads UI
// can reuse the same inbox layout. One thread per (user, customer phone)
// pair; messages append in time order. Inbound writes from the Twilio
// webhook; outbound writes from twilio-service.sendTenantMessage.
export const smsThreads = pgTable(
  "wireline_sms_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    customerNumber: text("customer_number").notNull(),
    status: text("status").default("open"),
    summary: text("summary"),
    unreadCount: integer("unread_count").default(0).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userCustomerUnique: sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_threads_user_customer ON wireline_sms_threads (user_id, customer_number)`,
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_sms_threads_user_id ON wireline_sms_threads (user_id)`,
    lastMessageIdx: sql`CREATE INDEX IF NOT EXISTS idx_sms_threads_last_message ON wireline_sms_threads (last_message_at DESC)`,
  }),
);

export const smsMessages = pgTable(
  "wireline_sms_messages",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    threadId: uuid("thread_id").references(() => smsThreads.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // 'in' or 'out'
    body: text("body").notNull(),
    twilioSid: text("twilio_sid"),
    /** Optional agent that authored an outbound message. Null for inbound + Account Holder replies. */
    agentId: text("agent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    threadCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_sms_messages_thread_created ON wireline_sms_messages (thread_id, created_at)`,
  }),
);

// 3.1c AGENT TEAMS + CALL QUEUES — call-center scaffolding.
// Distinct from the human-team RBAC concept in wireline_team_members
// (workspace user invites). These tables group AI AGENTS into teams
// for call-center routing — one tenant has many agent teams (e.g.
// "Inbound Support", "Outbound Sales"). Each agent team optionally
// overrides the platform Twilio sender. Call queues sit one level
// deeper: when a customer dials a queue's number, we route to the
// least-busy agent in that queue's team.
export const agentTeams = pgTable(
  "wireline_agent_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    /** Per-team SMS sender — overrides settings.twilio_sms_from_number for agents in this team. */
    smsFromNumber: text("sms_from_number"),
    /** Optional manager email — destination for escalations from this team. */
    managerEmail: text("manager_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_agent_teams_user_id ON wireline_agent_teams (user_id)`,
  }),
);

export const agentTeamMembers = pgTable(
  "wireline_agent_team_members",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    // Tenant scoping. agent_team_members was historically scoped only via the
    // team_id FK, but as soon as a route queries it directly (without joining
    // through wireline_agent_teams) RLS has nothing to enforce. Carry the
    // owning user_id on the row so the standard
    //   user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    // policy applies (see migration 0026).
    userId: uuid("user_id").notNull(),
    teamId: uuid("team_id").references(() => agentTeams.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    /** "member" or "lead" — leads get first routing preference. */
    role: text("role").default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    teamAgentUnique: sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_team_members_team_agent ON wireline_agent_team_members (team_id, agent_id)`,
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_agent_team_members_user_id ON wireline_agent_team_members (user_id)`,
  }),
);

export const callQueues = pgTable(
  "wireline_call_queues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    teamId: uuid("team_id").references(() => agentTeams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** vapi_number_id this queue answers on. */
    vapiNumberId: text("vapi_number_id"),
    /** Max seconds before overflow_action triggers. */
    maxWaitSeconds: integer("max_wait_seconds").default(60),
    /** "voicemail" | "transfer" | "queue" — what happens when no agent is free. */
    overflowAction: text("overflow_action").default("voicemail"),
    /** Phone number to transfer to when overflow_action='transfer'. */
    overflowTransferTo: text("overflow_transfer_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_queues_user_id ON wireline_call_queues (user_id)`,
    vapiNumberIdx: sql`CREATE INDEX IF NOT EXISTS idx_call_queues_vapi_number ON wireline_call_queues (vapi_number_id)`,
  }),
);

/**
 * Multi-touch outbound cadences. A cadence is a sequence of steps (call /
 * sms / email) with delays between them. Account Holders define one once; the
 * sentinel job worker ticks through it for every lead enrolled.
 *
 * Example steps payload:
 *   [
 *     { type: "call",  delayHours: 0  },
 *     { type: "sms",   delayHours: 24, template: "Hi {{name}}, following up on our call..." },
 *     { type: "email", delayHours: 72, template: "..." },
 *     { type: "call",  delayHours: 168 }
 *   ]
 */
export const cadences = pgTable(
  "wireline_cadences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    agentId: text("agent_id"),
    steps: jsonb("steps").notNull(),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_cadences_user_id ON wireline_cadences (user_id)`,
  }),
);

/**
 * Per-lead cadence execution state. One row per (lead, cadence) enrollment.
 * Sentinel scans this table for rows where next_due_at <= now() AND status =
 * 'active', executes the step, advances the counter, schedules next.
 */
export const cadenceRuns = pgTable(
  "wireline_cadence_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    cadenceId: uuid("cadence_id").notNull(),
    leadId: bigint("lead_id", { mode: "bigint" }).notNull(),
    currentStep: integer("current_step").default(0).notNull(),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),
    status: text("status").default("active"),
    lastResult: text("last_result"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    dueIdx: sql`CREATE INDEX IF NOT EXISTS idx_cadence_runs_due ON wireline_cadence_runs (status, next_due_at) WHERE status = 'active'`,
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_cadence_runs_user_id ON wireline_cadence_runs (user_id)`,
    leadIdx: sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_cadence_runs_lead_unique ON wireline_cadence_runs (lead_id, cadence_id)`,
  }),
);

/**
 * Live call supervisor subscriptions — supervisor clicks "Listen in" or
 * "Whisper" on a live call in /cockpit, we capture the intent here. V1 is
 * a bookmark + later audit; V2 wires Vapi's WebRTC streaming for real-time
 * audio.
 */
export const supervisorSubscriptions = pgTable(
  "wireline_supervisor_subscriptions",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    callId: text("call_id").notNull(),
    mode: text("mode").default("listen"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    callIdx: sql`CREATE INDEX IF NOT EXISTS idx_supervisor_subs_call ON wireline_supervisor_subscriptions (call_id)`,
    userIdx: sql`CREATE INDEX IF NOT EXISTS idx_supervisor_subs_user ON wireline_supervisor_subscriptions (user_id)`,
  }),
);

// 3.2 Assistants HANDOFF (TASKS)
export const followUpTasks = pgTable(
  "wireline_follow_up_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    targetChannel: text("target_channel"),
    agentId: text("agent_id").references(() => agents.id),
    customerInfo: jsonb("customer_info"),
    /**
     * Action payload for "draft" autonomy items — the proposed email body,
     * SMS text, contract envelope IDs, prospect search parameters, etc.
     * The AI Action Engine writes here and ActionFeed reads via
     * `action.payload.<field>`. Distinct from `customerInfo`, which is
     * who the action is for; `payload` is what the action will do.
     */
    payload: jsonb("payload"),
    taskType: text("task_type"),
    description: text("description"),
    status: text("status").default("pending"),
    priority: text("priority").default("medium"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_fleet_tasks_user_id ON wireline_follow_up_tasks USING btree (user_id)`,
    statusIdx: sql`CREATE INDEX IF NOT EXISTS idx_fleet_tasks_status ON wireline_follow_up_tasks USING btree (status)`,
    userStatusIdx: sql`CREATE INDEX IF NOT EXISTS idx_fleet_tasks_user_status ON wireline_follow_up_tasks USING btree (user_id, status)`,
    createdAtIdx: sql`CREATE INDEX IF NOT EXISTS idx_fleet_tasks_created_at ON wireline_follow_up_tasks USING btree (created_at)`,
  }),
);

// 3.3 NETWORK LINKS (PHONE NUMBERS)
export const phoneNumbers = pgTable(
  "wireline_phone_numbers",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    phoneNumber: text("phone_number").unique().notNull(),
    vapiNumberId: text("vapi_number_id"),
    agentId: text("agent_id").references(() => agents.id),
    // Marketing-campaign label so /insights can break down "calls from X ad".
    // Free-form ("Google Ads — Spring '26", "LinkedIn — Founder Pitch", etc.).
    campaignLabel: text("campaign_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_phone_numbers_user_id ON wireline_phone_numbers USING btree (user_id)`,
    agentIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_phone_numbers_agent_id ON wireline_phone_numbers USING btree (agent_id)`,
    vapiNumberIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_phone_numbers_vapi_number_id ON wireline_phone_numbers (vapi_number_id) WHERE vapi_number_id IS NOT NULL`,
  }),
);

// 3.4 OUTBOUND SIGNAL (LEADS & CAMPAIGNS)
export const outboundCampaigns = pgTable(
  "wireline_outbound_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    goal: text("goal"),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    status: text("status").default("draft"),
    callWindowStart: text("call_window_start").default("09:00"),
    callWindowEnd: text("call_window_end").default("17:00"),
    maxAttempts: integer("max_attempts").default(3),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON wireline_outbound_campaigns USING btree (user_id)`,
    userCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_campaigns_user_created ON wireline_outbound_campaigns USING btree (user_id, created_at)`,
    statusIdx: sql`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON wireline_outbound_campaigns USING btree (status)`,
    agentIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_campaigns_agent_id ON wireline_outbound_campaigns USING btree (agent_id)`,
  }),
);

/**
 * Outbound Leads - Lead state machine:
 *   Pending -> Queued -> Dialing -> Connected -> (Completed | Voicemail-Left
 *     | Callback-Scheduled | Failed)
 *   Terminal states: Completed, Failed, Blocked-DNC, Max-Attempts
 *   Sticky retry states (preserved by tools): Voicemail-Left, Callback-Scheduled
 */
export const outboundLeads = pgTable(
  "wireline_outbound_leads",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    agentId: text("agent_id").references(() => agents.id),
    campaignId: uuid("campaign_id").references(() => outboundCampaigns.id, {
      onDelete: "set null",
    }),
    phoneNumber: text("phone_number"),
    customerNumber: text("customer_number"),
    customerName: text("customer_name"),
    email: text("email"),
    context: text("context"),
    // Status values: Pending, Queued, Dialing, Connected, Completed,
    // Voicemail-Left, Callback-Scheduled, Failed, Blocked-DNC, Max-Attempts
    status: text("status").default("Pending"),
    callId: text("call_id"),
    lastCalledAt: timestamp("last_called_at", { withTimezone: true }),
    /**
     * When the agent or Account Holder scheduled the next outreach attempt. Drives
     * `/api/callbacks` and the "Upcoming Callbacks" pane in OutboundDialer.
     */
    callbackScheduledAt: timestamp("callback_scheduled_at", { withTimezone: true }),
    /**
     * Short free-text summary of the most recent contact attempt. Surfaced
     * in the callbacks UI and written by the AI Action Engine `update_crm`
     * handler.
     */
    lastContactSummary: text("last_contact_summary"),
    attempts: integer("attempts").default(0),
    source: text("source").default("manual"),
    // Pipeline kanban stage. Independent of `status` (which tracks dial state)
    // — this tracks deal progression: cold → contacted → qualified → demo →
    // won | lost. UI groups leads by this column on /pipeline.
    pipelineStage: text("pipeline_stage").default("cold"),
    // Marketing campaign attribution — set by csv-upload or auto-derived from
    // the inbound number's campaignLabel.
    campaignSource: text("campaign_source"),
    metadata: jsonb("metadata"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    // True when the lead was inserted by /api/admin/seed-demo-account. UI
    // surfaces a "DEMO" pill on these rows so account holders don't mistake the
    // showcase pipeline for real customer leads. /api/admin/demo-data
    // (DELETE) wipes every row where demo=true scoped to the tenant.
    demo: boolean("demo").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_leads_user_id ON wireline_outbound_leads USING btree (user_id)`,
    campaignIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON wireline_outbound_leads USING btree (campaign_id)`,
    statusIdx: sql`CREATE INDEX IF NOT EXISTS idx_leads_status ON wireline_outbound_leads USING btree (status)`,
    userCampaignIdx: sql`CREATE INDEX IF NOT EXISTS idx_leads_user_campaign ON wireline_outbound_leads USING btree (user_id, campaign_id)`,
    userStatusIdx: sql`CREATE INDEX IF NOT EXISTS idx_leads_user_status ON wireline_outbound_leads USING btree (user_id, status)`,
    callbackIdx: sql`CREATE INDEX IF NOT EXISTS idx_leads_callback_scheduled_at ON wireline_outbound_leads USING btree (user_id, callback_scheduled_at) WHERE callback_scheduled_at IS NOT NULL`,
    createdAtIdx: sql`CREATE INDEX IF NOT EXISTS idx_leads_created_at ON wireline_outbound_leads USING btree (created_at)`,
    userCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_leads_user_created ON wireline_outbound_leads USING btree (user_id, created_at DESC)`,
    statusNextAttemptIdx: sql`CREATE INDEX IF NOT EXISTS idx_leads_status_next_attempt ON wireline_outbound_leads USING btree (status, callback_scheduled_at) WHERE status IN ('Pending', 'Retry')`,
    userCustomerNumberIdx: sql`CREATE INDEX IF NOT EXISTS idx_leads_user_customer_number ON wireline_outbound_leads USING btree (user_id, customer_number)`,
    userIdempotencyUniqueIdx: sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_leads_user_idempotency ON wireline_outbound_leads (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`,
    userPhoneTailIdx: sql`CREATE INDEX IF NOT EXISTS idx_outbound_leads_user_phone_tail ON wireline_outbound_leads (user_id, right(regexp_replace(phone_number, '[^0-9]', '', 'g'), 10))`,
  }),
);

// 3.5 REAL-TIME SIGNAL PRESENCE
export const signalPresence = pgTable(
  "wireline_signal_presence",
  {
    id: text("id").primaryKey(), // call_id
    userId: uuid("user_id").notNull(),
    agentId: text("agent_id").references(() => agents.id),
    customerNumber: text("customer_number"),
    status: text("status"),
    label: text("label").default("Live · Active"),
    type: text("type").default("voice"),
    // Vapi live-call control URL (monitor.controlUrl) captured from the
    // webhook. Lets the Account Holder transfer/take an in-progress call from the
    // mobile app without raw Twilio access. NULL until Vapi reports it.
    controlUrl: text("control_url"),
    // Vapi monitor.listenUrl — live PCM for in-call presenter lip-sync.
    listenUrl: text("listen_url"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_signal_presence_user_id ON wireline_signal_presence USING btree (user_id)`,
    agentIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_signal_presence_agent_id ON wireline_signal_presence USING btree (agent_id)`,
  }),
);

// 3.6 INTAKE KEYS (API ACCESS)
export const intakeKeys = pgTable(
  "wireline_intake_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    defaultAgentId: text("default_agent_id"),
    autoDial: boolean("auto_dial").default(false),
    active: boolean("active").default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    useCount: integer("use_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_intake_keys_user_id ON wireline_intake_keys USING btree (user_id)`,
  }),
);

// 3.7 MOBILE DEVICES (Wireline — APNs / PushKit VoIP push targets)
//
// One row per registered iOS device per user. The native Wireline app
// registers its PushKit VoIP token here after sign-in so the backend can
// wake the device with a CallKit-reportable VoIP push when an inbound call
// arrives (see src/lib/apns-push.ts). The separate alert token is used for
// non-call notifications (e.g. mid-call tool dispatch). FK cascade removes
// rows when the user is deleted; the (user_id, device_id) unique key makes
// token refresh an idempotent upsert.
export const mobileDevices = pgTable(
  "wireline_mobile_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    apnsVoipToken: text("apns_voip_token"),
    apnsAlertToken: text("apns_alert_token"),
    // Android FCM registration token. One token per device handles both the
    // wake (high-priority data message → ConnectionService incoming call) and
    // alert (recap / device-action) shapes, unlike APNs' split voip/alert pair.
    fcmToken: text("fcm_token"),
    platform: text("platform").default("ios").notNull(),
    appVersion: text("app_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t: any) => ({
    userDeviceUnique: unique("wireline_mobile_devices_user_device_key").on(t.userId, t.deviceId),
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_mobile_devices_user_id ON wireline_mobile_devices USING btree (user_id)`,
  }),
);

// 3.8 PREPAID CREDIT WALLET (Wireline)
//
// Append-only ledger of USD credit movements. Positive deltas are top-ups
// (purchased on the WEB via Stripe — never in-app, to stay clear of Apple's
// IAP rules; the iOS app is read-only on billing). Negative deltas are debits
// that absorb voice-minute overage before Stripe metering kicks in. Balance is
// the sum of deltas; balance_after is denormalized per row for audit + fast
// reads. Existing tenants simply have no rows (balance 0) and bill exactly as
// before.
export const creditLedger = pgTable(
  "wireline_credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deltaUsd: decimal("delta_usd", { precision: 12, scale: 4 }).notNull(),
    balanceAfterUsd: decimal("balance_after_usd", { precision: 12, scale: 4 }).notNull(),
    entryKind: text("entry_kind").notNull().default("adjustment"),
    reason: text("reason").notNull(),
    customerReason: text("customer_reason"),
    refType: text("ref_type"),
    refId: text("ref_id"),
    idempotencyKey: text("idempotency_key"),
    source: text("source").notNull().default("wireline"),
    provider: text("provider"),
    providerEventId: text("provider_event_id"),
    providerObjectId: text("provider_object_id"),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t: any) => ({
    userIdx: sql`CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON wireline_credit_ledger (user_id, created_at DESC)`,
    idempotencyIdx: sql`CREATE UNIQUE INDEX IF NOT EXISTS wireline_credit_ledger_idempotency_key ON wireline_credit_ledger (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`,
    providerIdx: sql`CREATE INDEX IF NOT EXISTS idx_credit_ledger_provider ON wireline_credit_ledger (provider, provider_event_id, provider_object_id) WHERE provider IS NOT NULL`,
    // Idempotent top-ups/debits: a given (user, ref_type, ref_id) lands once.
    refUnique: unique("wireline_credit_ledger_ref_key").on(t.userId, t.refType, t.refId),
  }),
);

// 4. AUDIT LOG (AI SPEND & COMPLIANCE)
export const auditLog = pgTable(
  "wireline_audit_log",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    // Nullable in the DB (see migration 0075): system security events —
    // failed logins, unauthenticated rate-limit hits, cron auth rejections —
    // legitimately carry no user id. `actor_email` captures the pre-auth
    // identity when we have one.
    userId: uuid("user_id"),
    action: text("action").notNull(),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    cacheReadTokens: integer("cache_read_tokens").default(0),
    cacheCreateTokens: integer("cache_create_tokens").default(0),
    costUsd: decimal("cost_usd", { precision: 12, scale: 6 }).default("0"),
    latencyMs: integer("latency_ms"),
    metadata: jsonb("metadata"),
    eventType: text("event_type").notNull().default("ai.api_call"),
    severity: text("severity").notNull().default("info"),
    actorEmail: text("actor_email"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON wireline_audit_log USING btree (user_id)`,
    eventTypeIdx: sql`CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON wireline_audit_log USING btree (event_type)`,
    userCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON wireline_audit_log USING btree (user_id, created_at)`,
    createdAtIdx: sql`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON wireline_audit_log USING btree (created_at)`,
  }),
);

// 4.1 WEBHOOKS
export const webhooks = pgTable(
  "wireline_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    events: text("events")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    secret: text("secret"),
    secretEncrypted: text("secret_encrypted"),
    secretLastFour: text("secret_last_four"),
    active: boolean("active").default(true),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
    deliveryCount: integer("delivery_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON wireline_webhooks USING btree (user_id)`,
  }),
);

export const webhookDeliveries = pgTable(
  "wireline_webhook_deliveries",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    status: text("status").notNull().default("pending"),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_user_id ON wireline_webhook_deliveries USING btree (user_id)`,
    webhookIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON wireline_webhook_deliveries USING btree (webhook_id)`,
    statusIdx: sql`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON wireline_webhook_deliveries USING btree (status)`,
    nextAttemptIdx: sql`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_attempt ON wireline_webhook_deliveries USING btree (next_attempt_at) WHERE status = 'pending'`,
  }),
);

// 4.2 COMPLIANCE (DNC LIST)
export const dncList = pgTable(
  "wireline_dnc_list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    phone: text("phone").notNull(),
    phoneRaw: text("phone_raw"),
    reason: text("reason"),
    source: text("source").default("manual"),
    // True when the row was inserted by /api/admin/seed-demo-account.
    demo: boolean("demo").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_dnc_list_user_id ON wireline_dnc_list USING btree (user_id)`,
    phoneIdx: sql`CREATE INDEX IF NOT EXISTS idx_dnc_list_phone ON wireline_dnc_list USING btree (phone)`,
    userPhoneIdx: sql`CREATE INDEX IF NOT EXISTS idx_dnc_list_user_phone ON wireline_dnc_list USING btree (user_id, phone)`,
  }),
);

// 4.2.1 CONSENT LOG (COMPLIANCE LEDGER)
export const consentLog = pgTable(
  "wireline_consent_log",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    userId: uuid("user_id").notNull(),
    callId: text("call_id"),
    customerNumber: text("customer_number"),
    event: text("event").notNull(),
    ruleVersion: text("rule_version"),
    rule: text("rule"),
    state: text("state"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userCreatedIdx: sql`CREATE INDEX IF NOT EXISTS idx_consent_log_user_created ON wireline_consent_log USING btree (user_id, created_at DESC)`,
  }),
);

// 4.2.2 EMAIL SUPPRESSION LIST (CAN-SPAM / RFC 8058 one-click unsubscribe)
// Global, email-keyed opt-out list for commercial / relationship-marketing
// email. Checked before sending such mail; written by /api/email/unsubscribe.
// Intentionally NOT tenant-scoped — an opt-out is honored across all accounts.
export const emailSuppressions = pgTable("wireline_email_suppressions", {
  email: text("email").primaryKey(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/** Public demo-line acquisition funnel events (showcase calls → recap → signup). */
export const demoCallEvents = pgTable(
  "wireline_demo_call_events",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    dialedNumber: text("dialed_number").notNull(),
    showcaseAgent: text("showcase_agent"),
    callerNumberHash: text("caller_number_hash"),
    source: text("source"),
    intentVertical: text("intent_vertical"),
    recapSentAt: timestamp("recap_sent_at", { withTimezone: true }),
    signupUserId: uuid("signup_user_id"),
    callLogId: bigint("call_log_id", { mode: "bigint" }),
    vapiCallId: text("vapi_call_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    createdIdx: sql`CREATE INDEX IF NOT EXISTS idx_demo_call_events_created ON wireline_demo_call_events USING btree (created_at)`,
    agentIdx: sql`CREATE INDEX IF NOT EXISTS idx_demo_call_events_agent ON wireline_demo_call_events USING btree (showcase_agent) WHERE showcase_agent IS NOT NULL`,
    sourceIdx: sql`CREATE INDEX IF NOT EXISTS idx_demo_call_events_source ON wireline_demo_call_events USING btree (source) WHERE source IS NOT NULL`,
  }),
);

// 4.3 ONBOARDING & PROGRESS
export const onboardingProgress = pgTable(
  "wireline_onboarding_progress",
  {
    userId: uuid("user_id").notNull(),
    stepId: text("step_id"),
    completed: boolean("completed").default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
  },
  (t: any) => ({
    pk: sql`PRIMARY KEY (${t.userId}, ${t.stepId})`,
  }),
);

// 4.4 BILLING CACHE
export const subscriptions = pgTable("wireline_subscriptions", {
  userId: uuid("user_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan"),
  status: text("status"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const stripeEvents = pgTable("wireline_stripe_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow(),
});

// 4.5 TEAM & RBAC
export const teamMembers = pgTable(
  "wireline_team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id"),
    tenantId: uuid("tenant_id"),
    email: text("email"),
    role: text("role").default("member"),
    invitedBy: uuid("invited_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  () => ({
    tenantIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_team_members_tenant ON wireline_team_members USING btree (tenant_id)`,
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_team_members_user ON wireline_team_members USING btree (user_id)`,
  }),
);

// 4.6 QUOTAS
export const quotaLimits = pgTable(
  "wireline_quota_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    dimension: text("dimension").notNull(),
    value: bigint("value", { mode: "bigint" }).notNull(),
    enabled: boolean("enabled").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    userIdIdx: sql`CREATE INDEX IF NOT EXISTS idx_quota_limits_user ON wireline_quota_limits USING btree (user_id)`,
  }),
);

export const quotaUsage = pgTable(
  "wireline_quota_usage",
  {
    userId: uuid("user_id").notNull(),
    dimension: text("dimension").notNull(),
    periodKey: text("period_key").notNull(),
    used: bigint("used", { mode: "bigint" }).default(sql`0`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t: any) => ({
    pk: sql`PRIMARY KEY (${t.userId}, ${t.dimension}, ${t.periodKey})`,
  }),
);

export const crmConnections = pgTable(
  "wireline_crm_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    provider: text("provider").notNull(), // 'hubspot', 'salesforce', 'slack', 'x', 'zoom', …
    crmType: text("crm_type"), // legacy alias/extra info
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    portalId: text("portal_id"),
    instanceUrl: text("instance_url"),
    /**
     * Human-readable account label written by the OAuth callbacks: the
     * Salesforce/HubSpot owner email, the Slack workspace name, or the
     * Zoom account type. Surfaced by GET /api/oauth/crm/status so the
     * Account Holder can confirm which workspace/account is connected without
     * re-running the OAuth flow.
     */
    connectedEmail: text("connected_email"),
    metadata: jsonb("metadata"),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t: any) => ({
    /**
     * Reconnecting the same provider for the same tenant must update the
     * existing row, not create a duplicate. The OAuth callbacks pass
     * `(user_id, provider)` as the conflict target on every upsert.
     */
    userProviderUniq: unique("wireline_crm_connections_user_id_provider_key").on(
      t.userId,
      t.provider,
    ),
  }),
);

// 4.8 BACKGROUND JOBS
export const jobs = pgTable(
  "wireline_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    type: text("type").notNull(),
    status: text("status").default("pending"),
    payload: jsonb("payload"),
    result: jsonb("result"),
    error: text("error"),
    attempts: integer("attempts").default(0),
    maxAttempts: integer("max_attempts").default(5),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Terminal completion timestamp (mirrors job-queue `finishedAt` updates). */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  () => ({
    statusRunAtIdx: sql`CREATE INDEX IF NOT EXISTS idx_jobs_status_run_at ON wireline_jobs USING btree (status, run_at)`,
    userStatusIdx: sql`CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON wireline_jobs USING btree (user_id, status)`,
  }),
);

export type Job = typeof jobs.$inferSelect;

export const leadDossiers = pgTable(
  "wireline_lead_dossiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    leadId: bigint("lead_id", { mode: "bigint" }).references(() => outboundLeads.id, {
      onDelete: "cascade",
    }),
    customerNumber: text("customer_number"),
    /**
     * Best-known email for the customer. Used by `/api/contacts/:number` to
     * stitch the outbound history to the omnichannel email inbox.
     */
    customerEmail: text("customer_email"),
    fullName: text("full_name"),
    jobTitle: text("job_title"),
    company: text("company"),
    linkedInUrl: text("linkedin_url"),
    content: text("content"),
    metadata: jsonb("metadata"),
    interactionSummary: text("interaction_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t: any) => ({
    unq: unique().on(t.userId, t.customerNumber),
    customerEmailIdx: sql`CREATE INDEX IF NOT EXISTS idx_lead_dossiers_user_email ON wireline_lead_dossiers USING btree (user_id, customer_email) WHERE customer_email IS NOT NULL`,
    userPhoneTailIdx: sql`CREATE INDEX IF NOT EXISTS idx_lead_dossiers_user_phone_tail ON wireline_lead_dossiers (user_id, right(regexp_replace(customer_number, '[^0-9]', '', 'g'), 10))`,
  }),
);

// 4.9 PERFORMANCE GOALS
//
// Account Holder-set monthly Assistants targets — e.g. "book 40 appointments this
// month". One row per (user_id, metric); POST /api/goals upserts on that
// pair. Nothing about progress is stored here: the /api/goals route
// computes the live actual from call logs + appointments scoped to the
// current calendar month every read, so a goal is always measured against
// fresh data. `metric` is one of the GoalMetric ids in src/lib/goals.ts
// (calls_handled | appointments_booked | qualified_leads | voice_minutes).
export const goals = pgTable(
  "wireline_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    metric: text("metric").notNull(),
    // Monthly target — always a positive integer (validated route-side).
    target: integer("target").notNull(),
    // Optional Account Holder label shown above the goal card.
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t: any) => ({
    // One goal per metric per tenant — the POST upsert conflict target.
    userMetricUniq: unique("wireline_goals_user_id_metric_key").on(t.userId, t.metric),
    userIdx: sql`CREATE INDEX IF NOT EXISTS idx_goals_user ON wireline_goals USING btree (user_id)`,
  }),
);

export type Goal = typeof goals.$inferSelect;

/**
 * Short-lived OAuth bridge codes for the sign-in flow.
 *
 * Persisted (instead of held in an in-process Map) so the redirect
 * from /api/auth/google/callback can land on a different Vercel
 * function instance than /api/auth/oauth/exchange and still find
 * the row. Rows live ~60s and are deleted on read.
 */
/** Tenant design system profile — blurb, notes, and asset manifest for Wireline Design. */
export const designProfiles = pgTable("wireline_design_profiles", {
  userId: uuid("user_id").primaryKey().notNull(),
  companyBlurb: text("company_blurb").notNull().default(""),
  styleNotes: text("style_notes").notNull().default(""),
  assetManifest: jsonb("asset_manifest").notNull().default([]),
  tokenManifest: jsonb("token_manifest").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DesignProfile = typeof designProfiles.$inferSelect;

/** OAuth connections for Wireline Design export lanes (Figma, Canva, GitHub). */
export const designIntegrations = pgTable(
  "wireline_design_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    provider: text("provider").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    connectedAccount: text("connected_account"),
    metadata: jsonb("metadata").notNull().default({}),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t: any) => ({
    userProviderUniq: unique("wireline_design_integrations_user_id_provider_key").on(
      t.userId,
      t.provider,
    ),
  }),
);

export type DesignIntegration = typeof designIntegrations.$inferSelect;

export const oauthPendingCodes = pgTable("wireline_oauth_pending_codes", {
  codeHash: text("code_hash").primaryKey(),
  userId: uuid("user_id").notNull(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  isOwner: boolean("is_owner").notNull().default(false),
  /** HMAC of the browser bridge-state cookie; plaintext is never stored. */
  bridgeStateHash: text("bridge_state_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Relations
export const accountRelations = relations(accounts, ({ one, many }: any) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  agents: many(agents),
}));

export const agentRelations = relations(agents, ({ one, many }: any) => ({
  account: one(accounts, { fields: [agents.accountId], references: [accounts.id] }),
  callLogs: many(callLogs),
}));

export const callLogRelations = relations(callLogs, ({ one }: any) => ({
  agent: one(agents, {
    fields: [callLogs.agentId],
    references: [agents.id],
  }),
}));
