import { pgTable, text, timestamp, integer, decimal, boolean, uuid, bigint, jsonb, unique } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// 0. IDENTITY & ACCOUNTS
export const users = pgTable('wireline_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash'),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  isAdmin: boolean('is_admin').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 1. SETTINGS & BILLING
export const settings = pgTable('wireline_settings', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').unique(),
  subscriptionStatus: text('subscription_status').default('active'),
  maxAgents: integer('max_agents').default(3),
  vapiPrivateKey: text('vapi_private_key'),
  vapiPhoneNumberId: text('vapi_phone_number_id'),
  retentionDays: integer('retention_days').default(365),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  voiceLlmProvider: text('voice_llm_provider').default('google'),
  voiceLlmModel: text('voice_llm_model').default('gemini-1.5-flash'),
  dailyBriefEnabled: boolean('daily_brief_enabled').default(false).notNull(),
  dailyBriefSendAt: text('daily_brief_send_at').default('13:00').notNull(),
  dailyBriefRecipient: text('daily_brief_recipient'),
  dailyBriefLastSentAt: timestamp('daily_brief_last_sent_at', { withTimezone: true }),
  dailyBriefLastError: text('daily_brief_last_error'),
  businessName: text('business_name'),
  crmType: text('crm_type'),
  twilioMessagingEnabled: boolean('twilio_messaging_enabled').default(false),
  twilioLookupEnabled: boolean('twilio_lookup_enabled').default(false),
  twilioManagerAlertsEnabled: boolean('twilio_manager_alerts_enabled').default(false),
  twilioMessagingServiceSid: text('twilio_messaging_service_sid'),
  twilioSmsFromNumber: text('twilio_sms_from_number'),
  twilioWhatsappFromNumber: text('twilio_whatsapp_from_number'),
  twilioManagerAlertNumber: text('twilio_manager_alert_number'),
  vapiPhoneInboundAgentId: text('vapi_phone_inbound_agent_id'),
  prospectingEnabled: boolean('prospecting_enabled').default(false),
  targetTitles: jsonb('target_titles'),
  targetIndustries: jsonb('target_industries'),
  targetStates: jsonb('target_states'),
  targetEmployeeRanges: jsonb('target_employee_ranges'),
  brandName: text('brand_name'),
  brandLogoUrl: text('brand_logo_url'),
  primaryColor: text('primary_color'),
  aiTier: text('ai_tier').default('starter'),
});

// 1.1 USER PREFERENCES
export const userPreferences = pgTable('wireline_user_preferences', {
  userId: uuid('user_id').primaryKey(),
  tourCompleted: boolean('tour_completed').default(false),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  helpEnabled: boolean('help_enabled').default(true),
  keyboardShortcutsEnabled: boolean('keyboard_shortcuts_enabled').default(true),
  preferences: jsonb('preferences').default({}),
  persona: text('persona'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 1.2 SPEND BUDGETS
export const spendBudgets = pgTable('wireline_spend_budgets', {
  userId: uuid('user_id').primaryKey(),
  monthlyLimitUsd: decimal('monthly_limit_usd', { precision: 12, scale: 2 }).default('0'),
  hardCap: boolean('hard_cap').default(false),
  warnThresholdPct: integer('warn_threshold_pct').default(80),
  enabled: boolean('enabled').default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 1.2.1 SPEND ALERTS
export const spendAlerts = pgTable('wireline_spend_alerts', {
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id'),
  thresholdPct: integer('threshold_pct'),
  period: text('period'),
  firedAt: timestamp('fired_at', { withTimezone: true }).defaultNow(),
});

// 1.3 DELETION QUEUE
export const deletionQueue = pgTable('wireline_deletion_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow(),
  scheduledPurgeAt: timestamp('scheduled_purge_at', { withTimezone: true }),
  status: text('status').default('pending'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  purgedAt: timestamp('purged_at', { withTimezone: true }),
  ip: text('ip'),
  userAgent: text('user_agent'),
});

// 2. FLEET INVENTORY (AGENTS)
export const agents = pgTable('wireline_agents', {
  id: text('id').primaryKey(),
  userId: uuid('user_id'),
  name: text('name').notNull(),
  voiceId: text('voice_id'),
  voiceIdInbound: text('voice_id_inbound'),
  voiceIdOutbound: text('voice_id_outbound'),
  voiceProvider: text('voice_provider').default('11labs'),
  firstMessage: text('first_message'),
  archetype: text('archetype').default('Receptionist'),
  ambientNoise: text('ambient_noise').default('off'),
  websiteUrl: text('website_url'),
  transferPhone: text('transfer_phone'),
  emailAutoRespond: boolean('email_auto_respond').default(true),
  emailAgentTone: text('email_agent_tone').default('Professional'),
  emailSignature: text('email_signature'),
  channel: text('channel').default('voice'),
  role: text('role').default('customer_service'),
  enabledTools: jsonb('enabled_tools'),
  autonomyLevel: text('autonomy_level').default('inherit'),
  channels: text('channels').array(),
  slackChannelId: text('slack_channel_id'),
  autoZoomLink: boolean('auto_zoom_link').default(false),
  businessHours: jsonb('business_hours'),
  timezone: text('timezone').default('UTC'),
  complianceMode: text('compliance_mode').default('standard'),
  disallowedTopics: text('disallowed_topics').array(),
  escalationKeywords: text('escalation_keywords').array(),
  businessVariables: jsonb('business_variables'),
  outOfHoursMessage: text('out_of_hours_message'),
  kpiFocus: text('kpi_focus'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 2.1 COGNITIVE ENGINE (TRAINING DATA)
export const directives = pgTable('wireline_directives', {
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id'),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  priority: integer('priority').default(5),
});

export const knowledge = pgTable('wireline_knowledge', {
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id'),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const personality = pgTable('wireline_personality', {
  agentId: text('agent_id').primaryKey().references(() => agents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id'),
  content: text('content').notNull(),
});

export const agentLessons = pgTable('wireline_agent_lessons', {
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id'),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  lesson: text('lesson').notNull(),
  sourceCallId: text('source_call_id'),
  source: text('source'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  unq: unique().on(t.agentId, t.lesson),
}));

// 2.2 COMMITMENTS & LOGISTICS
export const appointments = pgTable('wireline_appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  agentId: text('agent_id').references(() => agents.id),
  callId: text('call_id'),
  date: text('date'),
  time: text('time'),
  customerName: text('customer_name'),
  serviceType: text('service_type'),
  status: text('status').default('Scheduled'),
  notes: text('notes'),
  phoneNumber: text('phone_number'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 3. SIGNAL ARCHIVES (CALL LOGS)
export const callLogs = pgTable('wireline_call_logs', {
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id'),
  vapiCallId: text('vapi_call_id').unique(),
  agentId: text('agent_id').references(() => agents.id),
  direction: text('direction'),
  customerNumber: text('customer_number'),
  durationSeconds: integer('duration_seconds'),
  cost: decimal('cost', { precision: 10, scale: 4 }),
  summary: text('summary'),
  transcript: text('transcript'),
  recordingUrl: text('recording_url'),
  leadScore: integer('lead_score').default(0),
  intentLabel: text('intent_label').default('none'),
  sentiment: text('sentiment').default('neutral'),
  coachingNote: text('coaching_note'),
  qaScore: integer('qa_score'),
  qaBreakdown: jsonb('qa_breakdown'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 3.1 OMNICHANNEL RELAY (EMAIL)
export const emailAccounts = pgTable('wireline_email_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  emailAddress: text('email_address').unique().notNull(),
  provider: text('provider').default('google'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: bigint('expires_at', { mode: 'bigint' }),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const calendarAccounts = pgTable('wireline_calendar_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  provider: text('provider').default('google'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: bigint('expires_at', { mode: 'bigint' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const emailThreads = pgTable('wireline_email_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  accountId: uuid('account_id').references(() => emailAccounts.id, { onDelete: 'cascade' }),
  threadId: text('thread_id').unique(),
  customerEmail: text('customer_email'),
  subject: text('subject'),
  status: text('status').default('open'),
  summary: text('summary'),
  leadScore: integer('lead_score').default(0),
  intentLabel: text('intent_label').default('none'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const emailMessages = pgTable('wireline_email_messages', {
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id'),
  threadId: uuid('thread_id').references(() => emailThreads.id, { onDelete: 'cascade' }),
  googleMessageId: text('google_message_id').unique(),
  role: text('role'), // 'user' or 'ai'
  content: text('content'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 3.2 FLEET HANDOFF (TASKS)
export const fleetTasks = pgTable('wireline_fleet_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  targetChannel: text('target_channel'),
  agentId: text('agent_id').references(() => agents.id),
  customerInfo: jsonb('customer_info'),
  taskType: text('task_type'),
  description: text('description'),
  status: text('status').default('pending'),
  priority: text('priority').default('medium'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 3.3 NETWORK LINKS (PHONE NUMBERS)
export const phoneNumbers = pgTable('wireline_phone_numbers', {
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id'),
  phoneNumber: text('phone_number').unique().notNull(),
  vapiNumberId: text('vapi_number_id'),
  agentId: text('agent_id').references(() => agents.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 3.4 OUTBOUND SIGNAL (LEADS & CAMPAIGNS)
export const outboundCampaigns = pgTable('wireline_outbound_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  name: text('name').notNull(),
  goal: text('goal'),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  status: text('status').default('draft'),
  callWindowStart: text('call_window_start').default('09:00'),
  callWindowEnd: text('call_window_end').default('17:00'),
  maxAttempts: integer('max_attempts').default(3),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const outboundLeads = pgTable('wireline_outbound_leads', {
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id'),
  agentId: text('agent_id').references(() => agents.id),
  campaignId: uuid('campaign_id').references(() => outboundCampaigns.id, { onDelete: 'set null' }),
  phoneNumber: text('phone_number'),
  customerNumber: text('customer_number'),
  customerName: text('customer_name'),
  email: text('email'),
  context: text('context'),
  status: text('status').default('Pending'),
  callId: text('call_id'),
  lastCalledAt: timestamp('last_called_at', { withTimezone: true }),
  attempts: integer('attempts').default(0),
  source: text('source').default('manual'),
  metadata: jsonb('metadata'),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 3.5 REAL-TIME SIGNAL PRESENCE
export const signalPresence = pgTable('wireline_signal_presence', {
  id: text('id').primaryKey(), // call_id
  userId: uuid('user_id'),
  agentId: text('agent_id').references(() => agents.id),
  customerNumber: text('customer_number'),
  status: text('status'),
  label: text('label').default('Live · Active'),
  type: text('type').default('voice'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
});

// 3.6 INTAKE KEYS (API ACCESS)
export const intakeKeys = pgTable('wireline_intake_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  defaultAgentId: text('default_agent_id'),
  autoDial: boolean('auto_dial').default(false),
  active: boolean('active').default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  useCount: integer('use_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 4. AUDIT LOG (AI SPEND & COMPLIANCE)
export const auditLog = pgTable('wireline_audit_log', {
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id'),
  action: text('action').notNull(),
  provider: text('provider'),
  model: text('model'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cacheReadTokens: integer('cache_read_tokens').default(0),
  cacheCreateTokens: integer('cache_create_tokens').default(0),
  costUsd: decimal('cost_usd', { precision: 12, scale: 6 }).default('0'),
  latencyMs: integer('latency_ms'),
  metadata: jsonb('metadata'),
  eventType: text('event_type').notNull().default('ai.api_call'),
  severity: text('severity').notNull().default('info'),
  actorEmail: text('actor_email'),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 4.1 WEBHOOKS
export const webhooks = pgTable('wireline_webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  name: text('name').notNull(),
  url: text('url').notNull(),
  events: text('events').array().notNull().default(sql`'{}'::text[]`),
  secret: text('secret'),
  secretEncrypted: text('secret_encrypted'),
  secretLastFour: text('secret_last_four'),
  active: boolean('active').default(true),
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  lastStatus: integer('last_status'),
  lastError: text('last_error'),
  deliveryCount: integer('delivery_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const webhookDeliveries = pgTable('wireline_webhook_deliveries', {
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  webhookId: uuid('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  payload: jsonb('payload').notNull(),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  status: text('status').notNull().default('pending'),
  lastStatusCode: integer('last_status_code'),
  lastError: text('last_error'),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 4.2 COMPLIANCE (DNC LIST)
export const dncList = pgTable('wireline_dnc_list', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  phone: text('phone').notNull(),
  phoneRaw: text('phone_raw'),
  reason: text('reason'),
  source: text('source').default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 4.2.1 CONSENT LOG (COMPLIANCE LEDGER)
export const consentLog = pgTable('wireline_consent_log', {
  id: bigint('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  callId: text('call_id'),
  customerNumber: text('customer_number'),
  event: text('event').notNull(),
  ruleVersion: text('rule_version'),
  rule: text('rule'),
  state: text('state'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 4.3 ONBOARDING & PROGRESS
export const onboardingProgress = pgTable('wireline_onboarding_progress', {
  userId: uuid('user_id'),
  stepId: text('step_id'),
  completed: boolean('completed').default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata'),
}, (t) => ({
  pk: sql`PRIMARY KEY (${t.userId}, ${t.stepId})`,
}));

// 4.4 BILLING CACHE
export const subscriptions = pgTable('wireline_subscriptions', {
  userId: uuid('user_id').primaryKey(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: text('plan'),
  status: text('status'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const stripeEvents = pgTable('wireline_stripe_events', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow(),
});

// 4.5 TEAM & RBAC
export const teamMembers = pgTable('wireline_team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  tenantId: uuid('tenant_id'),
  email: text('email'),
  role: text('role').default('member'),
  invitedBy: uuid('invited_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// 4.6 QUOTAS
export const quotaLimits = pgTable('wireline_quota_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  dimension: text('dimension').notNull(),
  value: bigint('value', { mode: 'bigint' }).notNull(),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const quotaUsage = pgTable('wireline_quota_usage', {
  userId: uuid('user_id').notNull(),
  dimension: text('dimension').notNull(),
  periodKey: text('period_key').notNull(),
  used: bigint('used', { mode: 'bigint' }).default(sql`0`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  pk: sql`PRIMARY KEY (${t.userId}, ${t.dimension}, ${t.periodKey})`,
}));

export const crmConnections = pgTable('wireline_crm_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  provider: text('provider').notNull(), // 'hubspot', 'salesforce', 'slack'
  crmType: text('crm_type'),           // legacy alias/extra info
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  portalId: text('portal_id'),
  instanceUrl: text('instance_url'),
  metadata: jsonb('metadata'),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 4.8 BACKGROUND JOBS
export const jobs = pgTable('wireline_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull(),
  status: text('status').default('pending'),
  payload: jsonb('payload'),
  result: jsonb('result'),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const leadDossiers = pgTable('wireline_lead_dossiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  leadId: bigint('lead_id', { mode: 'bigint' }).references(() => outboundLeads.id, { onDelete: 'cascade' }),
  customerNumber: text('customer_number'),
  fullName: text('full_name'),
  jobTitle: text('job_title'),
  company: text('company'),
  linkedInUrl: text('linkedin_url'),
  content: text('content'),
  metadata: jsonb('metadata'),
  interactionSummary: text('interaction_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  unq: unique().on(t.userId, t.customerNumber),
}));

// Relations
export const agentRelations = relations(agents, ({ many }) => ({
  callLogs: many(callLogs),
}));

export const callLogRelations = relations(callLogs, ({ one }) => ({
  agent: one(agents, {
    fields: [callLogs.agentId],
    references: [agents.id],
  }),
}));
