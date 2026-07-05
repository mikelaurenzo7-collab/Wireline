/* eslint-disable @typescript-eslint/no-explicit-any -- audit metadata and aggregate stats are stored as Postgres jsonb. */
// src/lib/audit-logger.ts
import type { VercelPgDatabase } from "drizzle-orm/vercel-postgres";
import * as schema from "../db/schema";
import type { AuditEventType, AuditSeverity } from "../types/audit";
import { log } from "./server-context";
import { normalizeUuid } from "./uuid";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmailCandidate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return EMAIL_RE.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

export class AuditLogger {
  private failureCount = 0;

  constructor(private drizzle: VercelPgDatabase<typeof schema>) {}

  private async log(data: {
    eventType: AuditEventType;
    userId?: string;
    action: string;
    severity?: AuditSeverity;
    actorEmail?: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, any>;
    ip?: string;
    userAgent?: string;
    provider?: string;
    model?: string;
    costUsd?: number;
    latencyMs?: number;
    requestId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    // Validate required fields
    if (!data.action || !data.eventType) {
      log.error("[AuditLogger] Missing required fields", {
        action: data.action,
        eventType: data.eventType,
      });
      return { success: false, error: "Missing required fields" };
    }

    const normalizedUserId = normalizeUuid(data.userId);
    const suppliedUserIdentifier =
      data.userId && !normalizedUserId ? String(data.userId).trim().slice(0, 320) : undefined;
    const actorEmail =
      data.actorEmail ?? normalizeEmailCandidate(suppliedUserIdentifier) ?? undefined;
    const metadata = suppliedUserIdentifier
      ? { ...(data.metadata ?? {}), supplied_user_identifier: suppliedUserIdentifier }
      : data.metadata;

    const record = {
      eventType: data.eventType,
      userId: normalizedUserId,
      action: data.action,
      severity: data.severity || "info",
      actorEmail,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      metadata,
      ipAddress: data.ip,
      userAgent: data.userAgent,
      provider: data.provider,
      model: data.model,
      costUsd: data.costUsd ? String(data.costUsd) : undefined, // decimal as string
      latencyMs: data.latencyMs,
      requestId: data.requestId,
    };

    try {
      await this.drizzle.insert(schema.auditLog).values(record as any);
    } catch (error: any) {
      this.failureCount++;
      // Drizzle wraps pg errors; the cause carries the actual Postgres
      // message (constraint, RLS policy, connection), which is what an
      // operator needs to act on.
      const cause = error.cause instanceof Error ? error.cause.message : (error.cause ?? undefined);
      log.error("[AuditLogger] Failed to log event", {
        eventType: data.eventType,
        error: error.message,
        cause,
        totalFailures: this.failureCount,
      });
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  public getStats() {
    return { failureCount: this.failureCount };
  }

  async logAuth(
    action: "login" | "logout" | "failed_login" | "password_reset",
    params: {
      userId?: string;
      email?: string;
      ip?: string;
      userAgent?: string;
      reason?: string;
      requestId?: string;
    },
  ) {
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      login: "auth.login",
      logout: "auth.logout",
      failed_login: "auth.failed_login",
      password_reset: "auth.password_reset",
    };

    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity: action === "failed_login" ? "warning" : "info",
      actorEmail: params.email,
      ip: params.ip,
      userAgent: params.userAgent,
      metadata: params.reason ? { reason: params.reason } : undefined,
      requestId: params.requestId,
    });
  }

  async logAgentOperation(
    action: "created" | "updated" | "deleted" | "training_updated",
    params: {
      userId: string;
      agentId: string;
      agentName?: string;
      metadata?: Record<string, any>;
      ip?: string;
    },
  ) {
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      created: "agent.created",
      updated: "agent.updated",
      deleted: "agent.deleted",
      training_updated: "agent.training_updated",
    };

    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity: "info",
      resourceType: "agent",
      resourceId: params.agentId,
      metadata: { agent_name: params.agentName, ...params.metadata },
      ip: params.ip,
    });
  }

  async logSecurity(
    action: "rate_limit_exceeded" | "unauthorized_access" | "suspicious_activity",
    params: {
      userId?: string;
      resource?: string;
      ip?: string;
      userAgent?: string;
      metadata?: Record<string, any>;
      requestId?: string;
    },
  ) {
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      rate_limit_exceeded: "security.rate_limit_exceeded",
      unauthorized_access: "security.unauthorized_access",
      suspicious_activity: "security.suspicious_activity",
    };

    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity: "critical",
      metadata: { resource: params.resource, ...params.metadata },
      ip: params.ip,
      userAgent: params.userAgent,
      requestId: params.requestId,
    });
  }

  async logSettings(
    action: "updated" | "api_key_rotated",
    params: {
      userId: string;
      changes?: Record<string, any>;
      ip?: string;
    },
  ) {
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      updated: "settings.updated",
      api_key_rotated: "security.api_key_rotated",
    };

    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity: "info",
      resourceType: "settings",
      metadata: params.changes,
      ip: params.ip,
    });
  }

  async logDataOperation(
    action: "export" | "import" | "bulk_delete",
    params: {
      userId: string;
      resourceType: string;
      recordCount: number;
      ip?: string;
    },
  ) {
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      export: "data.export",
      import: "data.import",
      bulk_delete: "data.bulk_delete",
    };

    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity: action === "bulk_delete" ? "warning" : "info",
      resourceType: params.resourceType,
      metadata: { record_count: params.recordCount },
      ip: params.ip,
    });
  }

  /**
   * Log a knowledge / settings modification event. Used by surfaces that
   * mutate cross-agent knowledge (Google Drive ingest, manual KB edits)
   * which the legacy code reaches via the convenience name
   * `logDataModification`.
   */
  async logDataModification(
    eventType: AuditEventType,
    params: {
      userId?: string;
      resource?: string;
      metadata?: Record<string, any>;
      ip?: string;
    },
  ) {
    return await this.log({
      eventType,
      userId: params.userId,
      action: eventType,
      severity: "info",
      resourceType: params.resource,
      metadata: params.metadata,
      ip: params.ip,
    });
  }

  /**
   * Log a billing-related event (Stripe webhook, checkout, portal open).
   * Captures the Stripe subscription / customer ID and the plan tier
   * for SOC 2 CC1.4 (system-of-record auth trail for paid features).
   */
  async logBilling(
    action:
      | "subscription_created"
      | "subscription_updated"
      | "subscription_cancelled"
      | "payment_succeeded"
      | "payment_failed"
      | "checkout_started"
      | "portal_opened",
    params: {
      userId?: string;
      subscriptionId?: string;
      customerId?: string;
      plan?: string;
      amountCents?: number;
      ip?: string;
      metadata?: Record<string, any>;
    },
  ) {
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      subscription_created: "billing.subscription_created",
      subscription_updated: "billing.subscription_updated",
      subscription_cancelled: "billing.subscription_cancelled",
      payment_succeeded: "billing.payment_succeeded",
      payment_failed: "billing.payment_failed",
      checkout_started: "billing.checkout_started",
      portal_opened: "billing.portal_opened",
    };
    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity:
        action === "payment_failed" || action === "subscription_cancelled" ? "warning" : "info",
      resourceType: "billing",
      resourceId: params.subscriptionId,
      metadata: {
        customer_id: params.customerId,
        plan: params.plan,
        amount_cents: params.amountCents,
        ...params.metadata,
      },
      ip: params.ip,
    });
  }

  /**
   * Log intake-key lifecycle (the keys that authenticate inbound lead
   * webhooks). These keys grant write access to /api/intake/lead so
   * their creation/rotation/deletion is security-relevant.
   */
  async logIntakeKey(
    action: "created" | "updated" | "deleted",
    params: {
      userId: string;
      keyId: string;
      keyPrefix?: string;
      keyName?: string;
      ip?: string;
    },
  ) {
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      created: "security.intake_key_created",
      updated: "security.intake_key_updated",
      deleted: "security.intake_key_deleted",
    };
    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity: action === "deleted" ? "warning" : "info",
      resourceType: "intake_key",
      resourceId: params.keyId,
      metadata: { key_prefix: params.keyPrefix, key_name: params.keyName },
      ip: params.ip,
    });
  }

  /**
   * Log webhook CRUD. The signing secret is encrypted at rest (see
   * src/lib/secret-vault.ts) and is NEVER logged here — only the
   * webhook URL, event filter set, and active flag.
   */
  async logWebhook(
    action: "created" | "updated" | "deleted" | "tested",
    params: {
      userId: string;
      webhookId: string;
      url?: string;
      events?: string[];
      active?: boolean;
      ip?: string;
    },
  ) {
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      created: "api.webhook_created",
      updated: "api.webhook_updated",
      deleted: "api.webhook_deleted",
      tested: "api.webhook_tested",
    };
    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity: "info",
      resourceType: "webhook",
      resourceId: params.webhookId,
      metadata: { url: params.url, events: params.events, active: params.active },
      ip: params.ip,
    });
  }

  /**
   * Log DNC (Do-Not-Call) list mutations — required for TCPA/DNC
   * compliance evidence. Tracks how many numbers were added/removed
   * and the source ("manual", "csv_import", "complaint", etc).
   */
  async logDnc(
    action: "added" | "removed",
    params: {
      userId: string;
      count: number;
      source?: string;
      ip?: string;
      metadata?: Record<string, any>;
    },
  ) {
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      added: "dnc.added",
      removed: "dnc.removed",
    };
    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity: "info",
      resourceType: "dnc_list",
      metadata: { count: params.count, source: params.source, ...params.metadata },
      ip: params.ip,
    });
  }

  /**
   * Log quota-override administrative changes (Item 1) and refusals.
   */
  async logQuotaOverride(
    action: "set" | "denied",
    params: {
      userId?: string;
      targetUserId?: string;
      changes?: Record<string, any>;
      role?: string;
      ip?: string;
    },
  ) {
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      set: "quota.override_set",
      denied: "quota.override_denied",
    };
    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity: action === "denied" ? "critical" : "warning",
      resourceType: "quota",
      resourceId: params.targetUserId,
      metadata: { changes: params.changes, role: params.role },
      ip: params.ip,
    });
  }

  /**
   * Log job-queue sweep activity — both successful sweeps (with the
   * count of jobs processed) and denials (for would-be tenants who
   * lacked admin/owner role).
   */
  async logJobSweep(
    action: "started" | "completed" | "denied",
    params: {
      userId?: string;
      mode?: "cron" | "manual";
      processed?: number;
      role?: string;
      ip?: string;
    },
  ) {
    const eventTypeMap: Record<typeof action, AuditEventType> = {
      started: "jobs.sweep_started",
      completed: "jobs.sweep_completed",
      denied: "jobs.sweep_denied",
    };
    return await this.log({
      eventType: eventTypeMap[action],
      userId: params.userId,
      action,
      severity: action === "denied" ? "critical" : "info",
      resourceType: "job_queue",
      metadata: { mode: params.mode, processed: params.processed, role: params.role },
      ip: params.ip,
    });
  }

  /**
   * Log account self-deletion. This is irreversible so it carries
   * critical severity and is emitted BEFORE the auth row is removed.
   */
  async logAccountDeletion(params: { userId: string; tablesTouched: string[]; ip?: string }) {
    return await this.log({
      eventType: "data.account_deleted",
      userId: params.userId,
      action: "account_deleted",
      severity: "critical",
      resourceType: "user_account",
      resourceId: params.userId,
      metadata: { tables_touched: params.tablesTouched.length, tables: params.tablesTouched },
      ip: params.ip,
    });
  }

  /**
   * Log a GDPR account-deletion REQUEST (soft-delete; reversible during the
   * 30-day grace period via /api/account/cancel-deletion).
   */
  async logAccountDeletionRequested(params: {
    userId: string;
    scheduledPurgeAt: string;
    ip?: string;
  }) {
    return await this.log({
      eventType: "data.account_deletion_requested",
      userId: params.userId,
      action: "account_deletion_requested",
      severity: "warning",
      resourceType: "user_account",
      resourceId: params.userId,
      metadata: { scheduled_purge_at: params.scheduledPurgeAt },
      ip: params.ip,
    });
  }

  /**
   * Log a GDPR account-deletion cancellation (within the grace period).
   */
  async logAccountDeletionCancelled(params: { userId: string; ip?: string }) {
    return await this.log({
      eventType: "data.account_deletion_cancelled",
      userId: params.userId,
      action: "account_deletion_cancelled",
      severity: "info",
      resourceType: "user_account",
      resourceId: params.userId,
      ip: params.ip,
    });
  }
}
