// GDPR account-deletion helpers.
//
// `purgeAccount` performs the irreversible hard-delete cascade across every
// tenant-owned Wireline table, then removes the local Wireline auth row. It is
// invoked from the delayed `purge_deleted_account` job after the 30-day grace
// period. All normal callers should use POST /api/account/delete instead.

import { eq, sql } from "drizzle-orm";
import { drizzle, tenantStore } from "./server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "./server-utils";

type AccountDeletionTarget = {
  table: string;
  /** Columns that directly contain the Wireline user UUID. */
  userColumns?: readonly string[];
  /** Columns that contain an organization owned by the deleting user. */
  organizationColumns?: readonly string[];
};

/**
 * Child tables precede parents so the purge remains valid even where a foreign
 * key is not configured with ON DELETE CASCADE. Keep this registry synchronized
 * with every public `wireline_*` table that stores tenant-owned data.
 *
 * Global ledgers/catalogs are intentionally excluded:
 * - wireline_stripe_events (global Stripe idempotency ledger)
 * - wireline_mcp_oauth_clients (platform OAuth client registry)
 * - wireline_demo_call_events (public showcase telemetry)
 */
export const ACCOUNT_DELETION_TARGETS: ReadonlyArray<AccountDeletionTarget> = [
  { table: "wireline_audit_log", userColumns: ["user_id"] },
  { table: "wireline_signal_presence", userColumns: ["user_id"] },
  { table: "wireline_follow_up_tasks", userColumns: ["user_id"] },
  { table: "wireline_webhook_deliveries", userColumns: ["user_id"] },
  { table: "wireline_webhook_health", userColumns: ["user_id"] },
  { table: "wireline_webhooks", userColumns: ["user_id"] },
  { table: "wireline_intake_keys", userColumns: ["user_id"] },
  { table: "wireline_agent_lessons", userColumns: ["user_id"] },
  { table: "wireline_directives", userColumns: ["user_id"] },
  { table: "wireline_knowledge", userColumns: ["user_id"] },
  { table: "wireline_personality", userColumns: ["user_id"] },
  { table: "wireline_email_messages", userColumns: ["user_id"] },
  { table: "wireline_email_threads", userColumns: ["user_id"] },
  { table: "wireline_email_accounts", userColumns: ["user_id"] },
  { table: "wireline_sms_messages", userColumns: ["user_id"] },
  { table: "wireline_sms_threads", userColumns: ["user_id"] },
  { table: "wireline_call_logs", userColumns: ["user_id"] },
  // Shareable call-recap / weekly-review artifacts (published URLs). Must purge
  // with the account so transcript/summary content cannot outlive deletion.
  { table: "wireline_recap_artifacts", userColumns: ["user_id"] },
  { table: "wireline_call_reliability_staging", userColumns: ["user_id"] },
  { table: "wireline_appointments", userColumns: ["user_id"] },
  { table: "wireline_lead_dossiers", userColumns: ["user_id"] },
  {
    table: "wireline_outbound_leads",
    userColumns: ["user_id"],
    organizationColumns: ["organization_id"],
  },
  {
    table: "wireline_outbound_campaigns",
    userColumns: ["user_id"],
    organizationColumns: ["organization_id"],
  },
  { table: "wireline_dnc_list", userColumns: ["user_id"] },
  { table: "wireline_phone_numbers", userColumns: ["user_id"] },
  { table: "wireline_agent_conversation_messages", userColumns: ["user_id"] },
  { table: "wireline_agent_team_members", userColumns: ["user_id"] },
  { table: "wireline_call_queues", userColumns: ["user_id"] },
  { table: "wireline_agent_teams", userColumns: ["user_id"] },
  { table: "wireline_cadence_runs", userColumns: ["user_id"] },
  { table: "wireline_cadences", userColumns: ["user_id"] },
  { table: "wireline_supervisor_subscriptions", userColumns: ["user_id"] },
  { table: "wireline_mobile_devices", userColumns: ["user_id"] },
  { table: "wireline_credit_ledger", userColumns: ["user_id"] },
  { table: "wireline_consent_log", userColumns: ["user_id"] },
  { table: "wireline_goals", userColumns: ["user_id"] },
  { table: "wireline_quota_usage", userColumns: ["user_id"] },
  { table: "wireline_quota_limits", userColumns: ["user_id"] },
  { table: "wireline_spend_alerts", userColumns: ["user_id"] },
  { table: "wireline_spend_budgets", userColumns: ["user_id"] },
  { table: "wireline_password_reset_tokens", userColumns: ["user_id"] },
  { table: "wireline_email_verification_tokens", userColumns: ["user_id"] },
  { table: "wireline_mcp_access_tokens", userColumns: ["user_id"] },
  { table: "wireline_mcp_oauth_codes", userColumns: ["user_id"] },
  { table: "wireline_mcp_refresh_tokens", userColumns: ["user_id"] },
  { table: "wireline_oauth_pending_codes", userColumns: ["user_id"] },
  { table: "wireline_browser_handoffs", userColumns: ["user_id"] },
  { table: "wireline_design_integrations", userColumns: ["user_id"] },
  { table: "wireline_design_profiles", userColumns: ["user_id"] },
  { table: "wireline_director_conversation_messages", userColumns: ["user_id"] },
  { table: "wireline_director_artifacts", userColumns: ["user_id"] },
  { table: "wireline_director_artifact_objects", userColumns: ["user_id"] },
  { table: "wireline_director_profile", userColumns: ["user_id"] },
  { table: "wireline_subscriptions", userColumns: ["user_id"] },
  { table: "wireline_onboarding_progress", userColumns: ["user_id"] },
  { table: "wireline_user_preferences", userColumns: ["user_id"] },
  { table: "wireline_calendar_events", userColumns: ["user_id"] },
  { table: "wireline_calendar_accounts", userColumns: ["user_id"] },
  { table: "wireline_crm_connections", userColumns: ["user_id"] },
  {
    table: "wireline_team_members",
    userColumns: ["user_id", "tenant_id"],
  },
  {
    table: "wireline_memberships",
    userColumns: ["user_id"],
    organizationColumns: ["organization_id"],
  },
  { table: "wireline_jobs", userColumns: ["user_id"] },
  {
    table: "wireline_settings",
    userColumns: ["user_id"],
    organizationColumns: ["organization_id"],
  },
  {
    table: "wireline_agents",
    userColumns: ["user_id"],
    organizationColumns: ["organization_id"],
  },
  { table: "wireline_accounts", userColumns: ["user_id"] },
  // Legacy production backup still contains training data and must not outlive
  // the account merely because it is no longer part of the active schema.
  { table: "wireline_training_backup_20260609", userColumns: ["user_id"] },
  // Delete organizations only when the account being deleted owns them. A user
  // who is merely a member loses their membership above without deleting the
  // workspace or another owner's data.
  { table: "wireline_organizations", userColumns: ["owner_id"] },
  // The queue contains IP/user-agent data, so the terminal purge removes it too.
  // The worker has already loaded the row and tolerates its final status update
  // affecting zero rows.
  { table: "wireline_deletion_queue", userColumns: ["user_id"] },
];

/** Backward-compatible table-name export used by tests and operator tooling. */
export const ACCOUNT_DELETION_TABLES: ReadonlyArray<string> = ACCOUNT_DELETION_TARGETS.map(
  ({ table }) => table,
);

type ExecuteResult = { rows?: Array<{ table_exists?: boolean }> };

async function tableExists(
  tx: { execute: PurgeAccountDeps["db"]["execute"] },
  table: string,
): Promise<boolean> {
  const res = (await tx.execute(
    sql`SELECT to_regclass(${table}) IS NOT NULL AS table_exists`,
  )) as ExecuteResult;
  return Boolean(res.rows?.[0]?.table_exists);
}

export interface PurgeAccountDeps {
  db: typeof drizzle;
  log: {
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

export interface PurgeAccountResult {
  ok: boolean;
  tablesTouched: string[];
  error?: string;
  authRemoved: boolean;
}

export interface ExternalReleaseSummary {
  subscriptionsCanceled: number;
  numbersReleased: number;
  /** Non-fatal number-release failures (carrier orphans, retried out-of-band). */
  numberErrors: string[];
}

/** Stripe "already gone" errors — treat as success, not a reason to retry. */
function isStripeAlreadyGone(err: unknown): boolean {
  const code = (err as { code?: string; statusCode?: number } | null)?.code;
  const status = (err as { statusCode?: number } | null)?.statusCode;
  return code === "resource_missing" || status === 404;
}

/**
 * Releases the tenant's PAID external resources before the local hard-delete.
 *
 * The DB purge alone left two money leaks: the Stripe subscription kept billing
 * a customer whose account no longer existed, and provisioned Twilio/Vapi
 * numbers stayed rented (and callable) with no owner. This runs first, from the
 * `purge_deleted_account` job, so both are torn down at the carrier/Stripe level
 * while we still hold the ids — after `purgeAccount` deletes the rows, they are
 * unrecoverable.
 *
 * Stripe cancellation is treated as blocking: on a real Stripe error (not an
 * already-canceled subscription) this THROWS so the job retries rather than
 * purging the ids and orphaning a live, still-billing subscription. Number
 * release is best-effort — a carrier hiccup is a recoverable cost, not a reason
 * to indefinitely block a GDPR deletion — so those failures are collected and
 * logged, never thrown.
 */
export async function releaseExternalResourcesForPurge(
  userId: string,
  deps: PurgeAccountDeps,
): Promise<ExternalReleaseSummary> {
  // Escape any ambient tenant context (see purgeAccount below) so the reads
  // that discover Stripe/Twilio ids always see the TARGET user's rows.
  return tenantStore.exit(() => releaseExternalResourcesOutsideTenantContext(userId, deps));
}

async function releaseExternalResourcesOutsideTenantContext(
  userId: string,
  deps: PurgeAccountDeps,
): Promise<ExternalReleaseSummary> {
  const { db, log } = deps;
  const numberErrors: string[] = [];
  let subscriptionsCanceled = 0;
  let numbersReleased = 0;

  // 1. Cancel every active Stripe subscription on the customer — the plan row
  //    AND any add-on that shares the customer (e.g. the live-video add-on is a
  //    separate subscription untracked by wireline_subscriptions).
  const [sub] = await db
    .select({
      stripeCustomerId: schema.subscriptions.stripeCustomerId,
      stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  if (sub?.stripeCustomerId || sub?.stripeSubscriptionId) {
    const { stripe, stripeAvailable } = await import("./stripe-helpers");
    if (!stripeAvailable()) {
      // The whole point of this function is to never purge the ids of a
      // possibly-still-billing subscription. Silently skipping here when the
      // Stripe key is absent/misconfigured would do exactly that during a
      // config incident — throw instead so the purge job retries and the
      // deletion completes once billing config is restored.
      throw new Error(
        "Stripe is not configured but the account holds Stripe ids — deferring purge so a live subscription is not orphaned.",
      );
    }
    const ids = new Set<string>();
    if (sub.stripeCustomerId) {
      // status:"all" then filter — "active" alone misses trialing/past_due/
      // unpaid subscriptions, each of which is still a live billing
      // relationship that must be torn down on account deletion.
      const all = await stripe.subscriptions.list({
        customer: sub.stripeCustomerId,
        status: "all",
        limit: 100,
      });
      for (const s of all.data) {
        if (s.status !== "canceled" && s.status !== "incomplete_expired") ids.add(s.id);
      }
    }
    if (sub.stripeSubscriptionId) ids.add(sub.stripeSubscriptionId);
    for (const id of ids) {
      try {
        await stripe.subscriptions.cancel(id);
        subscriptionsCanceled++;
      } catch (err) {
        if (isStripeAlreadyGone(err)) continue;
        log.error("purge subscription cancel failed — deferring purge", {
          userId,
          subscriptionId: id,
          error: getErrorMessage(err),
        });
        throw err;
      }
    }
  }

  // 2. Release provisioned numbers at the carrier (Vapi/Twilio) and drop the DB
  //    row. Best-effort: collect failures rather than blocking the purge.
  const numbers = await db
    .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.userId, userId));

  if (numbers.length) {
    const { releaseTenantNumber } = await import("./phone-provisioning");
    for (const { phoneNumber } of numbers) {
      const res = await releaseTenantNumber(userId, phoneNumber).catch((err) => ({
        ok: false as const,
        error: getErrorMessage(err),
      }));
      if (res.ok) {
        numbersReleased++;
      } else {
        numberErrors.push(`${phoneNumber}: ${res.error ?? "unknown"}`);
        log.warn("purge number release failed — carrier may retain the number", {
          userId,
          phoneNumber,
          error: res.error,
        });
      }
    }
  }

  return { subscriptionsCanceled, numbersReleased, numberErrors };
}

/**
 * Hard-deletes a user across every tenant-owned Wireline table and removes the
 * local auth record. Idempotent: subsequent runs simply find no rows to delete.
 */
export async function purgeAccount(
  userId: string,
  deps: PurgeAccountDeps,
): Promise<PurgeAccountResult> {
  // The purge must delete the TARGET user's rows regardless of who triggered
  // it. The manual jobs sweep and POST /api/jobs/:id/run execute job handlers
  // inside the caller's AsyncLocalStorage tenant scope, where every query runs
  // as wireline_server under RLS — deletes would silently affect zero rows
  // (or fail outright on deliberately-ungranted tables like
  // wireline_oauth_pending_codes) while still reporting a completed purge.
  // Running outside tenant context restores the cron-path behavior (worker
  // role, explicit ownership predicates below) on every invocation path.
  return tenantStore.exit(() => purgeAccountOutsideTenantContext(userId, deps));
}

async function purgeAccountOutsideTenantContext(
  userId: string,
  deps: PurgeAccountDeps,
): Promise<PurgeAccountResult> {
  const { db, log } = deps;
  const tablesTouched: string[] = [];

  try {
    return await db.transaction(async (tx) => {
      for (const target of ACCOUNT_DELETION_TARGETS) {
        if (!(await tableExists(tx, target.table))) {
          log.warn("account purge skipped missing table", { table: target.table, userId });
          continue;
        }

        const predicates = [
          ...(target.userColumns || []).map((column) => sql`${sql.raw(column)} = ${userId}`),
          ...(target.organizationColumns || []).map(
            (column) =>
              sql`${sql.raw(column)} IN (
                SELECT id FROM wireline_organizations WHERE owner_id = ${userId}
              )`,
          ),
        ];

        if (predicates.length === 0) {
          log.error("account purge target has no ownership predicate", {
            table: target.table,
            userId,
          });
          throw new Error(`Unsafe account purge target: ${target.table}`);
        }

        await tx.execute(
          sql`DELETE FROM ${sql.raw(target.table)} WHERE ${sql.join(predicates, sql` OR `)}`,
        );
        tablesTouched.push(target.table);
      }

      await tx.execute(sql`DELETE FROM wireline_users WHERE id = ${userId}`);
      return { ok: true, tablesTouched, authRemoved: true };
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("account purge transaction failed", { error: message, userId });
    return { ok: false, tablesTouched, authRemoved: false, error: message };
  }
}

/** Shared 30-day reversible grace window. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export function computeScheduledPurgeAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}
