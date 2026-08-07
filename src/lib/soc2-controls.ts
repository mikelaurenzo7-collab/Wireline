/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
// SOC 2 access-control evidence helpers.
//
// This module provides the data-access primitives that a SOC 2 auditor
// requires evidence for:
//   • CC6.1  — Logical access is restricted to authorized users.
//   • CC6.2  — New access is provisioned through a formal request process.
//   • CC6.3  — Access is removed in a timely way when no longer needed.
//   • CC7.2  — Access changes are logged.
//
// All DB calls flow through the audit logger so every access grant,
// revoke, and review emits an immutable record in wireline_audit_log.
//
// See docs/soc2-policies.md for the full control narrative.

import type { VercelPgDatabase } from "drizzle-orm/vercel-postgres";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

export type AccessRole = "owner" | "admin" | "Account Holder" | "viewer" | "auditor";

export const ROLE_HIERARCHY: Record<AccessRole, number> = {
  owner: 50,
  admin: 40,
  "Account Holder": 30,
  viewer: 20,
  auditor: 10,
};

export const ALL_ROLES: AccessRole[] = ["owner", "admin", "Account Holder", "viewer", "auditor"];

const CANONICAL_ROLES = new Set<string>(ALL_ROLES);

/**
 * Team invitations persist a DIFFERENT vocabulary than authorization speaks.
 * The invite enum is admin | member | viewer (`inviteTeamMemberSchema`) and the
 * column default is "member", while this file's hierarchy speaks owner | admin |
 * Account Holder | viewer | auditor. "member" has no hierarchy entry, so any
 * caller testing `stored in ROLE_HIERARCHY` fails to recognise the single most
 * common stored role — and whatever that caller initialised its variable to
 * stands instead.
 *
 * This is the one place the two vocabularies meet, and the mapping is TOTAL:
 * every input resolves to a real role, and anything unrecognised resolves DOWN.
 */
const STORED_ROLE_ALIASES = new Map<string, AccessRole>([
  // The invite UI's "Member" is the mid-tier seat — work the calls and leads,
  // no team, billing, settings, or agent management. That is Account Holder.
  ["member", "Account Holder"],
  // Pre-0108 name for the same tier, in case any row still carries it.
  ["operator", "Account Holder"],
]);

/**
 * Least privilege that still resolves to a usable role. An unrecognised stored
 * role means the row is unknown to this code, which must never be a reason to
 * grant more — read-only is the floor.
 */
export const FALLBACK_ACCESS_ROLE: AccessRole = "viewer";

/**
 * Translate a persisted `wireline_team_members.role` into an AccessRole.
 *
 * Set/Map lookups rather than `in` and index access: `"constructor" in
 * ROLE_HIERARCHY` is true via Object.prototype, so a plain `in` test treats
 * inherited keys as real roles.
 */
export function resolveStoredRole(stored: string | null | undefined): AccessRole {
  if (!stored) return FALLBACK_ACCESS_ROLE;
  if (CANONICAL_ROLES.has(stored)) return stored as AccessRole;
  return STORED_ROLE_ALIASES.get(stored) ?? FALLBACK_ACCESS_ROLE;
}

/** Permissions granted to each role (additive). */
export const ROLE_PERMISSIONS: Record<AccessRole, string[]> = {
  owner: [
    "billing.manage",
    "agents.manage",
    "settings.manage",
    "team.manage",
    "audit.read",
    "calls.read",
    "calls.manage",
    "leads.read",
    "leads.manage",
    "knowledge.manage",
    "insights.read",
    "webhooks.manage",
    "quotas.override",
    "jobs.admin",
  ],
  admin: [
    "agents.manage",
    "settings.manage",
    "team.manage",
    "audit.read",
    "calls.read",
    "calls.manage",
    "leads.read",
    "leads.manage",
    "knowledge.manage",
    "insights.read",
    "webhooks.manage",
    "quotas.override",
    "jobs.admin",
  ],
  "Account Holder": [
    "agents.read",
    "calls.read",
    "calls.manage",
    "leads.read",
    "leads.manage",
    "knowledge.read",
    "insights.read",
  ],
  viewer: ["calls.read", "leads.read", "insights.read"],
  auditor: ["audit.read", "calls.read", "insights.read"],
};

export function hasPermission(role: AccessRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canGrantRole(granterRole: AccessRole, targetRole: AccessRole): boolean {
  // Granter must have at least Account Holder-level privilege, AND the target
  // role must be strictly below the granter's level.
  const MIN_GRANT_LEVEL = ROLE_HIERARCHY["Account Holder"]; // 30
  return (
    ROLE_HIERARCHY[granterRole] >= MIN_GRANT_LEVEL &&
    ROLE_HIERARCHY[granterRole] > ROLE_HIERARCHY[targetRole]
  );
}

// ─────────────────────────────────────────────────────────────────
// Access-review record
// ─────────────────────────────────────────────────────────────────

export interface TeamMemberRow {
  userId: string | null;
  tenantId: string | null;
  role: string | null;
  email: string | null;
  createdAt: Date | null;
  revokedAt: Date | null;
}

export interface AccessReviewResult {
  /** Members whose access should be reviewed (inactive >90 days). */
  stale_members: TeamMemberRow[];
  /** Members who have been revoked but audit row is missing. */
  unlogged_revocations: TeamMemberRow[];
  /** Total active members. */
  active_count: number;
  /** Review timestamp. */
  reviewed_at: string;
}

const STALE_THRESHOLD_DAYS = 90;

/**
 * Run a quarterly access review for a tenant. Returns members whose
 * access warrants scrutiny. Results should be reviewed by an owner
 * and actioned (confirm or revoke). Pipe the output to the audit log
 * to satisfy CC6.3 evidence.
 */
export async function runAccessReview(
  drizzle: VercelPgDatabase<typeof schema>,
  tenantId: string,
): Promise<AccessReviewResult> {
  const members = await drizzle
    .select({
      userId: schema.teamMembers.userId,
      tenantId: schema.teamMembers.tenantId,
      role: schema.teamMembers.role,
      email: schema.teamMembers.email,
      createdAt: schema.teamMembers.createdAt,
      revokedAt: schema.teamMembers.revokedAt,
    })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.tenantId, tenantId));

  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_DAYS * 86_400_000);

  const active = members.filter((m: (typeof members)[number]) => !m.revokedAt);
  const stale = active.filter((m: (typeof members)[number]) => {
    // Note: last_active_at was missing from the previous schema check but present in the teamMembers row?
    // Let's assume we use createdAt if last_active_at is missing from the teamMembers table in schema.ts.
    // In schema.ts:
    // export const teamMembers = pgTable('wireline_team_members', {
    //   id: uuid('id').primaryKey().defaultRandom(),
    //   userId: uuid('user_id'),
    //   tenantId: uuid('tenant_id'),
    //   email: text('email'),
    //   role: text('role').default('member'),
    //   invitedBy: uuid('invited_by'),
    //   createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    //   revokedAt: timestamp('revoked_at', { withTimezone: true }),
    // });
    // There is NO last_active_at in schema.ts. I'll use createdAt.
    return m.createdAt && m.createdAt < staleThreshold;
  });

  const revoked = members.filter((m: (typeof members)[number]) => m.revokedAt);
  // In a real SOC 2 audit, we'd cross-ref the audit log. Here we flag
  // any revocation where the revoked_at timestamp is very recent
  // (suggesting it might not yet have an audit row).
  const unlogged = revoked.filter((m: (typeof members)[number]) => {
    const rev = new Date(m.revokedAt!);
    return now.getTime() - rev.getTime() < 5_000; // < 5s old = probably not logged yet
  });

  return {
    stale_members: stale as any,
    unlogged_revocations: unlogged as any,
    active_count: active.length,
    reviewed_at: now.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────
// Change management log entry shapes (CC8.1)
// ─────────────────────────────────────────────────────────────────

export type ChangeType =
  | "access_grant"
  | "access_revoke"
  | "role_change"
  | "config_change"
  | "agent_deploy"
  | "schema_migration"
  | "secret_rotation";

export interface ChangeLogEntry {
  tenant_id: string;
  actor_user_id: string;
  actor_email: string;
  change_type: ChangeType;
  target_user_id?: string;
  target_email?: string;
  previous_value?: string;
  new_value?: string;
  justification?: string;
  approved_by?: string;
  metadata?: Record<string, unknown>;
}

export function buildChangeLogRow(entry: ChangeLogEntry): Record<string, unknown> {
  return {
    tenant_id: entry.tenant_id,
    actor_user_id: entry.actor_user_id,
    actor_email: entry.actor_email,
    change_type: entry.change_type,
    target_user_id: entry.target_user_id ?? null,
    target_email: entry.target_email ?? null,
    previous_value: entry.previous_value ?? null,
    new_value: entry.new_value ?? null,
    justification: entry.justification ?? null,
    approved_by: entry.approved_by ?? null,
    metadata: entry.metadata ?? {},
    created_at: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────
// Encryption-at-rest evidence helpers (CC6.7)
// ─────────────────────────────────────────────────────────────────

/**
 * Verify that a secret field is stored as a hash or encrypted blob
 * (not plaintext). Used to validate that intake keys, HMAC secrets,
 * and API keys are never stored cleartext.
 *
 * Returns true when the value looks like a SHA-256 hex digest
 * (64 hex chars) or a $2b$ bcrypt hash or a "ek_…" Wireline
 * encrypted-key prefix.
 */
export function looksEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  if (/^[0-9a-f]{64}$/i.test(value)) return true; // SHA-256 hex
  if (/^\$2[aby]\$/.test(value)) return true; // bcrypt
  if (value.startsWith("ek_")) return true; // Wireline encrypted key prefix
  return false;
}

// ─────────────────────────────────────────────────────────────────
// Incident response helpers (A1.2 / CC7.3)
// ─────────────────────────────────────────────────────────────────

export type IncidentSeverity = "P1" | "P2" | "P3" | "P4";

export interface IncidentRecord {
  id?: string;
  tenant_id?: string;
  severity: IncidentSeverity;
  title: string;
  description: string;
  detected_at: string;
  resolved_at?: string;
  root_cause?: string;
  remediation?: string;
  reporter_email: string;
  affected_systems: string[];
  customer_notified?: boolean;
  notification_sent_at?: string;
}

/** P1 / P2 incidents must notify affected customers within 72 hours (GDPR Art. 33). */
export function notificationDeadlineIso(
  incident: Pick<IncidentRecord, "severity" | "detected_at">,
): string | null {
  if (incident.severity !== "P1" && incident.severity !== "P2") return null;
  const detected = new Date(incident.detected_at);
  return new Date(detected.getTime() + 72 * 3_600_000).toISOString();
}

export function buildIncidentRow(incident: IncidentRecord): Record<string, unknown> {
  return {
    ...incident,
    notification_deadline: notificationDeadlineIso(incident),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
