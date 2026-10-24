import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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

import { VOICE_ASSET_CONSENT_VERSION } from "../lib/voice-clone-contract";
import { users } from "./schema-base";

export { VOICE_ASSET_CONSENT_VERSION } from "../lib/voice-clone-contract";

export const VOICE_ASSET_STATUSES = ["pending_review", "approved", "revoked", "deleted"] as const;
export type VoiceAssetStatus = (typeof VOICE_ASSET_STATUSES)[number];
export const VOICE_ASSET_ENGINE_ID = "chatterbox-nano" as const;
export const VOICE_ASSET_MODEL_REVISION = "71ccd1d0081b430592cea481f4307e764e07bc64" as const;
export const VOICE_ASSET_SOURCE_REVISION = "5de7a54aa4e5e2baadb0182dde554908b48b85c2" as const;
export const VOICE_ASSET_QUALITY_CHECK_VERSION = "voice-reference-quality-v1-2026-10-17" as const;

/**
 * Customer-preview lane contract. The lane is default-off and canary-gated; a
 * customer reference is only ever used for `private_preview`. Retention is
 * bounded independently of the platform-admin pilot so customer recordings
 * cannot outlive their stated window.
 */
export const VOICE_CLONE_RETENTION_POLICY_VERSION = "voice-clone-retention-v1-2026-10-24" as const;
export const VOICE_CLONE_RETENTION_DAYS_DEFAULT = 30;
export const VOICE_CLONE_RETENTION_DAYS_MIN = 1;
export const VOICE_CLONE_RETENTION_DAYS_MAX = 365;
export const VOICE_CLONE_DELETED_REASONS = ["user_deleted", "retention_expired"] as const;
export type VoiceCloneDeletedReason = (typeof VOICE_CLONE_DELETED_REASONS)[number];

/** Append-only state evidence for the customer lane. No update/delete from tenants. */
export const VOICE_CLONE_EVENT_KINDS = [
  "created",
  "reviewed",
  "preview",
  "deleted",
  "expired",
] as const;
export type VoiceCloneEventKind = (typeof VOICE_CLONE_EVENT_KINDS)[number];

/**
 * A tenant-owned, consented reference for private in-house voice previews.
 * secretEncrypted contains only a tenant/asset-bound vref1 envelope. Approval
 * never grants PSTN use; this foundation permits private_preview exclusively.
 * Raw reference audio, generated speech and public storage URLs are not columns.
 */
export const voiceAssets = pgTable(
  "wireline_voice_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    engineId: text("engine_id").notNull().default(VOICE_ASSET_ENGINE_ID),
    modelRevision: text("model_revision").notNull().default(VOICE_ASSET_MODEL_REVISION),
    sourceRevision: text("source_revision").notNull().default(VOICE_ASSET_SOURCE_REVISION),
    intendedUse: text("intended_use").notNull().default("private_preview"),
    secretEncrypted: text("secret_encrypted"),
    sourceSha256: text("source_sha256").notNull(),
    sourceMimeType: text("source_mime_type").notNull().default("audio/wav"),
    sourceSizeBytes: integer("source_size_bytes").notNull(),
    sourceSampleRateHz: integer("source_sample_rate_hz").notNull(),
    sourceSampleCount: integer("source_sample_count").notNull(),
    sourceDurationSeconds: doublePrecision("source_duration_seconds").notNull(),
    consentVersion: text("consent_version").notNull(),
    consentAcceptedAt: timestamp("consent_accepted_at", { withTimezone: true }).notNull(),
    consentAcceptedBy: uuid("consent_accepted_by").notNull(),
    status: text("status").$type<VoiceAssetStatus>().notNull().default("pending_review"),
    version: integer("version").notNull().default(1),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Historical actor ID, not a restrictive cross-tenant user FK. */
    reviewedBy: uuid("reviewed_by"),
    reviewedSourceSha256: text("reviewed_source_sha256"),
    qualityCheckVersion: text("quality_check_version"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Customer-lane retention evidence; NULL for the platform-admin pilot. */
    retentionPolicyVersion: text("retention_policy_version"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastPreviewAt: timestamp("last_preview_at", { withTimezone: true }),
    deletedReason: text("deleted_reason").$type<VoiceCloneDeletedReason | null>(),
    /** True only for customer-lane references; internal/admin pilot rows stay false. */
    customerVisible: boolean("customer_visible").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userStatusCreatedIdx: index("idx_voice_assets_user_status_created").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    oneActiveSource: uniqueIndex("uq_voice_assets_active_source")
      .on(table.userId, table.sourceSha256)
      .where(sql`${table.status} IN ('pending_review', 'approved')`),
    expiryDueIdx: index("idx_voice_assets_expiry_due")
      .on(table.expiresAt)
      .where(sql`${table.deletedAt} IS NULL`),
    nameCheck: check(
      "wireline_voice_assets_name_check",
      sql`char_length(btrim(${table.name})) BETWEEN 1 AND 80`,
    ),
    engineCheck: check(
      "wireline_voice_assets_engine_check",
      sql`${table.engineId} = 'chatterbox-nano' AND ${table.modelRevision} = '71ccd1d0081b430592cea481f4307e764e07bc64' AND ${table.sourceRevision} = '5de7a54aa4e5e2baadb0182dde554908b48b85c2'`,
    ),
    purposeCheck: check(
      "wireline_voice_assets_purpose_check",
      sql`${table.intendedUse} = 'private_preview'`,
    ),
    statusCheck: check(
      "wireline_voice_assets_status_check",
      sql`${table.status} IN ('pending_review', 'approved', 'revoked', 'deleted') AND ${table.version} >= 1`,
    ),
    sourceCheck: check(
      "wireline_voice_assets_source_check",
      sql`${table.sourceSha256} ~ '^[0-9a-f]{64}$' AND ${table.sourceMimeType} = 'audio/wav' AND ${table.sourceSizeBytes} BETWEEN 44 AND 2000000 AND ${table.sourceSampleRateHz} IN (16000, 22050, 24000, 44100, 48000) AND ${table.sourceSampleCount} BETWEEN ${table.sourceSampleRateHz} * 6 AND ${table.sourceSampleRateHz} * 20 AND ${table.sourceSizeBytes} >= 44 + ${table.sourceSampleCount} * 2 AND ${table.sourceDurationSeconds} BETWEEN 6 AND 20 AND abs(${table.sourceDurationSeconds} - ${table.sourceSampleCount}::double precision / ${table.sourceSampleRateHz}) < 0.000001`,
    ),
    consentCheck: check(
      "wireline_voice_assets_consent_check",
      sql`${table.consentVersion} = ${VOICE_ASSET_CONSENT_VERSION} AND ${table.consentAcceptedBy} = ${table.userId}`.inlineParams(),
    ),
    approvalCheck: check(
      "wireline_voice_assets_approval_check",
      sql`${table.status} <> 'approved' OR (${table.reviewedAt} IS NOT NULL AND ${table.reviewedBy} IS NOT NULL AND ${table.reviewedSourceSha256} IS NOT NULL AND ${table.qualityCheckVersion} IS NOT NULL AND ${table.reviewedSourceSha256} = ${table.sourceSha256} AND ${table.qualityCheckVersion} = 'voice-reference-quality-v1-2026-10-17')`,
    ),
    lifecycleCheck: check(
      "wireline_voice_assets_lifecycle_check",
      sql`(${table.status} = 'deleted' AND ${table.secretEncrypted} IS NULL AND ${table.revokedAt} IS NOT NULL AND ${table.deletedAt} IS NOT NULL) OR (${table.status} <> 'deleted' AND ${table.secretEncrypted} IS NOT NULL AND char_length(${table.secretEncrypted}) BETWEEN 100 AND 2666731 AND ${table.secretEncrypted} ~ '^vref1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$' AND ${table.deletedAt} IS NULL AND ((${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL) OR (${table.status} IN ('pending_review', 'approved') AND ${table.revokedAt} IS NULL)))`,
    ),
    retentionCheck: check(
      "wireline_voice_assets_retention_check",
      sql`(${table.retentionPolicyVersion} IS NULL AND ${table.expiresAt} IS NULL) OR (${table.retentionPolicyVersion} = ${VOICE_CLONE_RETENTION_POLICY_VERSION} AND ${table.expiresAt} IS NOT NULL AND ${table.expiresAt} > ${table.createdAt})`.inlineParams(),
    ),
    deletedReasonCheck: check(
      "wireline_voice_assets_deleted_reason_check",
      sql`${table.deletedReason} IS NULL OR (${table.deletedReason} IN ('user_deleted', 'retention_expired') AND ${table.status} = 'deleted')`,
    ),
    customerVisibleCheck: check(
      "wireline_voice_assets_customer_visible_check",
      sql`${table.customerVisible} = false OR (${table.retentionPolicyVersion} IS NOT NULL AND ${table.expiresAt} IS NOT NULL)`,
    ),
    lastPreviewCheck: check(
      "wireline_voice_assets_last_preview_check",
      sql`${table.lastPreviewAt} IS NULL OR ${table.lastPreviewAt} >= ${table.createdAt}`,
    ),
  }),
).enableRLS();

/**
 * Append-only customer-lane ledger. Every lifecycle change and every completed
 * preview appends one row; there is deliberately no update path. Terminal
 * account deletion erases these rows outside tenant context, and tenant access
 * holds SELECT/INSERT grants only. `asset_id` is intentionally not a foreign
 * key so the evidence outlives the soft-deleted reference it describes.
 */
export const voiceCloneEvents = pgTable(
  "wireline_voice_clone_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id"),
    kind: text("kind").$type<VoiceCloneEventKind>().notNull(),
    sourceSha256: text("source_sha256").notNull(),
    /** Reserved/committed allowance in integer USD micros; preview events only. */
    reservedUsdMicros: bigint("reserved_usd_micros", { mode: "number" }),
    committedUsdMicros: bigint("committed_usd_micros", { mode: "number" }),
    engineId: text("engine_id").notNull().default(VOICE_ASSET_ENGINE_ID),
    modelRevision: text("model_revision").notNull().default(VOICE_ASSET_MODEL_REVISION),
    sourceRevision: text("source_revision").notNull().default(VOICE_ASSET_SOURCE_REVISION),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index("idx_voice_clone_events_user_created").on(table.userId, table.createdAt),
    kindCheck: check(
      "wireline_voice_clone_events_kind_check",
      sql`${table.kind} IN ('created', 'reviewed', 'preview', 'deleted', 'expired')`,
    ),
    sourceCheck: check(
      "wireline_voice_clone_events_source_check",
      sql`${table.sourceSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    amountsCheck: check(
      "wireline_voice_clone_events_amounts_check",
      sql`(${table.reservedUsdMicros} IS NULL OR ${table.reservedUsdMicros} >= 0) AND (${table.committedUsdMicros} IS NULL OR ${table.committedUsdMicros} >= 0) AND (${table.kind} = 'preview' OR (${table.reservedUsdMicros} IS NULL AND ${table.committedUsdMicros} IS NULL)) AND (${table.kind} <> 'preview' OR (${table.reservedUsdMicros} IS NOT NULL AND ${table.committedUsdMicros} IS NOT NULL AND ${table.committedUsdMicros} <= ${table.reservedUsdMicros}))`,
    ),
    engineCheck: check(
      "wireline_voice_clone_events_engine_check",
      sql`${table.engineId} = 'chatterbox-nano' AND ${table.modelRevision} = '71ccd1d0081b430592cea481f4307e764e07bc64' AND ${table.sourceRevision} = '5de7a54aa4e5e2baadb0182dde554908b48b85c2'`,
    ),
  }),
).enableRLS();

export type VoiceAsset = typeof voiceAssets.$inferSelect;
export type NewVoiceAsset = typeof voiceAssets.$inferInsert;
export type VoiceCloneEvent = typeof voiceCloneEvents.$inferSelect;
export type NewVoiceCloneEvent = typeof voiceCloneEvents.$inferInsert;
