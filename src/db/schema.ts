import { pgTable, text, timestamp, integer, decimal, boolean, uuid, bigint, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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
