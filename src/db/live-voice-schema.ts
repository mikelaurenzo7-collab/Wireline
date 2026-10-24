import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./schema-base";

/**
 * Live cloned voices (migration 0186). A customer records a consented
 * reference in BotBound; the reference is uploaded once to the clone engine
 * chosen by eligibility (xAI or ElevenLabs) and only the engine's voice id is
 * kept here. BotBound never stores
 * the raw reference audio for this lane, so deleting the row plus the provider
 * voice removes every copy BotBound controls.
 *
 * Bots point at a clone through `businessVariables.wirelineLiveCustomVoice`
 * ({ cloneId }); live calls re-check status here at call start so a deleted
 * clone can never speak again.
 */
export const LIVE_VOICE_CONSENT_VERSION = "live-voice-clone-consent-v1-2026-10-24" as const;
export const LIVE_VOICE_STATUSES = ["ready", "deleted"] as const;
export type LiveVoiceStatus = (typeof LIVE_VOICE_STATUSES)[number];
export const LIVE_VOICE_CONSENT_SCOPES = ["self", "authorized_speaker"] as const;
export type LiveVoiceConsentScope = (typeof LIVE_VOICE_CONSENT_SCOPES)[number];
export const LIVE_VOICE_GENDERS = ["female", "male"] as const;
export type LiveVoiceGender = (typeof LIVE_VOICE_GENDERS)[number];
export const LIVE_VOICE_DELETED_REASONS = [
  "user_deleted",
  "provider_missing",
  "retention_expired",
] as const;
export const LIVE_VOICE_PROVIDERS = ["xai", "elevenlabs"] as const;
export type LiveVoiceProvider = (typeof LIVE_VOICE_PROVIDERS)[number];
export type LiveVoiceDeletedReason = (typeof LIVE_VOICE_DELETED_REASONS)[number];

export const liveVoices = pgTable(
  "wireline_live_voices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Clone engine that holds the voice (see src/lib/voice/clone-engines.ts). */
    provider: text("provider").$type<LiveVoiceProvider>().notNull().default("xai"),
    providerVoiceId: text("provider_voice_id"),
    status: text("status").$type<LiveVoiceStatus>().notNull().default("ready"),
    consentVersion: text("consent_version").notNull(),
    consentScope: text("consent_scope").$type<LiveVoiceConsentScope>().notNull(),
    consentAcceptedAt: timestamp("consent_accepted_at", { withTimezone: true }).notNull(),
    consentAcceptedBy: uuid("consent_accepted_by").notNull(),
    sourceSha256: text("source_sha256").notNull(),
    sourceDurationSeconds: doublePrecision("source_duration_seconds").notNull(),
    qualityScore: integer("quality_score"),
    /** Matches the stock fallback voice to the speaker if a clone misbehaves mid-call. */
    voiceGender: text("voice_gender").$type<LiveVoiceGender | null>(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** Speaker's residence as declared at consent: `US-XX` or `INTL`. Drives engine and law. */
    speakerJurisdiction: text("speaker_jurisdiction").notNull(),
    /** Written biometric release (required for US-IL): version, typed legal name, time. */
    biometricReleaseVersion: text("biometric_release_version"),
    biometricReleaseSignedName: text("biometric_release_signed_name"),
    biometricReleaseAcceptedAt: timestamp("biometric_release_accepted_at", { withTimezone: true }),
    /** Published destruction schedule; NULL keeps the voice until the owner deletes it. */
    retentionPolicyVersion: text("retention_policy_version"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedReason: text("deleted_reason").$type<LiveVoiceDeletedReason | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userStatusCreatedIdx: index("idx_live_voices_user_status_created").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    providerVoiceUnique: uniqueIndex("uq_live_voices_provider_voice")
      .on(table.provider, table.providerVoiceId)
      .where(sql`${table.providerVoiceId} IS NOT NULL`),
    nameCheck: check(
      "wireline_live_voices_name_check",
      sql`char_length(btrim(${table.name})) BETWEEN 1 AND 80`,
    ),
    providerCheck: check(
      "wireline_live_voices_provider_check",
      sql`${table.provider} IN ('xai', 'elevenlabs')`,
    ),
    voiceIdCheck: check(
      "wireline_live_voices_voice_id_check",
      sql`${table.providerVoiceId} IS NULL OR ${table.providerVoiceId} ~ '^[A-Za-z0-9_-]{4,128}$'`,
    ),
    statusCheck: check(
      "wireline_live_voices_status_check",
      sql`(${table.status} = 'ready' AND ${table.providerVoiceId} IS NOT NULL AND ${table.deletedAt} IS NULL AND ${table.deletedReason} IS NULL) OR (${table.status} = 'deleted' AND ${table.deletedAt} IS NOT NULL AND ${table.deletedReason} IN ('user_deleted', 'provider_missing', 'retention_expired'))`,
    ),
    consentCheck: check(
      "wireline_live_voices_consent_check",
      sql`${table.consentVersion} = 'live-voice-clone-consent-v1-2026-10-24' AND ${table.consentScope} IN ('self', 'authorized_speaker') AND ${table.consentAcceptedBy} = ${table.userId}`,
    ),
    sourceCheck: check(
      "wireline_live_voices_source_check",
      sql`${table.sourceSha256} ~ '^[0-9a-f]{64}$' AND ${table.sourceDurationSeconds} BETWEEN 10 AND 120`,
    ),
    qualityCheck: check(
      "wireline_live_voices_quality_check",
      sql`${table.qualityScore} IS NULL OR ${table.qualityScore} BETWEEN 0 AND 100`,
    ),
    jurisdictionCheck: check(
      "wireline_live_voices_jurisdiction_check",
      sql`${table.speakerJurisdiction} = 'INTL' OR ${table.speakerJurisdiction} ~ '^US-[A-Z]{2}$'`,
    ),
    biometricReleaseCheck: check(
      "wireline_live_voices_biometric_release_check",
      sql`${table.speakerJurisdiction} <> 'US-IL' OR (${table.biometricReleaseVersion} = 'biometric-release-v1-2026-10-24' AND char_length(${table.biometricReleaseSignedName}) BETWEEN 3 AND 120 AND ${table.biometricReleaseAcceptedAt} IS NOT NULL AND ${table.retentionPolicyVersion} = 'biometric-retention-v1-2026-10-24' AND ${table.expiresAt} IS NOT NULL)`,
    ),
    retentionCheck: check(
      "wireline_live_voices_retention_check",
      sql`(${table.retentionPolicyVersion} IS NULL AND ${table.expiresAt} IS NULL) OR (${table.retentionPolicyVersion} = 'biometric-retention-v1-2026-10-24' AND ${table.expiresAt} IS NOT NULL AND ${table.expiresAt} > ${table.createdAt})`,
    ),
    expiryDueIdx: index("idx_live_voices_expiry_due")
      .on(table.expiresAt)
      .where(sql`${table.status} = 'ready' AND ${table.expiresAt} IS NOT NULL`),
    genderCheck: check(
      "wireline_live_voices_gender_check",
      sql`${table.voiceGender} IS NULL OR ${table.voiceGender} IN ('female', 'male')`,
    ),
  }),
).enableRLS();

export type LiveVoice = typeof liveVoices.$inferSelect;
export type NewLiveVoice = typeof liveVoices.$inferInsert;
