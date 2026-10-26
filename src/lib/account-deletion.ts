// GDPR account-deletion helpers.
//
// `purgeAccount` performs the irreversible hard-delete cascade across every
// tenant-owned Wireline table, then removes the local Wireline auth row. It is
// invoked from the delayed `purge_deleted_account` job after the 30-day grace
// period. All normal callers should use POST /api/account/delete instead.

import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { drizzle, tenantStore } from "./server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "./server-utils";
import { acquireAccountDeletionFence } from "./account-deletion-fence";

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
 * - wireline_orphan_carrier_resources (platform cleanup ledger that must
 *   outlive the deleted tenant until carrier teardown completes)
 */
export const ACCOUNT_DELETION_TARGETS: ReadonlyArray<AccountDeletionTarget> = [
  // Append-only customer voice-clone ledger. Tenant access can only INSERT/
  // SELECT; the guard trigger permits erasure only from this terminal purge,
  // which runs outside tenant context. Delete evidence before its references.
  { table: "wireline_voice_clone_events", userColumns: ["user_id"] },
  // Private reference audio is encrypted and must disappear with its tenant.
  { table: "wireline_voice_assets", userColumns: ["user_id"] },
  // Live cloned voices keep only provider voice ids; provider-side voices are
  // deleted first by deleteLiveVoicesForAccount (best effort, logged).
  { table: "wireline_live_voices", userColumns: ["user_id"] },
  // Usage billing ledger and spend controls. Stripe keeps the invoice record.
  { table: "wireline_usage_meter_events", userColumns: ["user_id"] },
  { table: "wireline_usage_billing_periods", userColumns: ["user_id"] },
  { table: "wireline_usage_spend_controls", userColumns: ["user_id"] },
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
  { table: "wireline_tenant_email_suppressions", userColumns: ["user_id"] },
  { table: "wireline_email_accounts", userColumns: ["user_id"] },
  { table: "wireline_sms_messages", userColumns: ["user_id"] },
  { table: "wireline_sms_send_operations", userColumns: ["user_id"] },
  { table: "wireline_sms_threads", userColumns: ["user_id"] },
  { table: "wireline_call_logs", userColumns: ["user_id"] },
  { table: "wireline_outbound_dial_reservations", userColumns: ["user_id"] },
  // Shareable call-recap / weekly-review artifacts (published URLs). Must purge
  // with the account so transcript/summary content cannot outlive deletion.
  { table: "wireline_recap_artifacts", userColumns: ["user_id"] },
  { table: "wireline_call_reliability_staging", userColumns: ["user_id"] },
  { table: "wireline_appointments", userColumns: ["user_id"] },
  // Cloud computer task ledger (goal, activity log, final report). References
  // wireline_agents, so it purges before the Bot rows.
  { table: "wireline_computer_tasks", userColumns: ["user_id"] },
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
  { table: "wireline_contact_outbound_consent", userColumns: ["user_id"] },
  { table: "wireline_outbound_purpose_audit", userColumns: ["user_id"] },
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
  { table: "wireline_voice_usage_events", userColumns: ["user_id"] },
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
  { table: "wireline_checkout_operations", userColumns: ["user_id"] },
  { table: "wireline_account_operation_leases", userColumns: ["user_id"] },
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

type ExecuteResult = {
  rows?: Array<{ table_exists?: boolean; function_exists?: boolean }>;
};

async function tableExists(
  tx: { execute: PurgeAccountDeps["db"]["execute"] },
  table: string,
): Promise<boolean> {
  const res = (await tx.execute(
    sql`SELECT to_regclass(${table}) IS NOT NULL AS table_exists`,
  )) as ExecuteResult;
  return Boolean(res.rows?.[0]?.table_exists);
}

async function functionExists(
  tx: { execute: PurgeAccountDeps["db"]["execute"] },
  signature: string,
): Promise<boolean> {
  const res = (await tx.execute(
    sql`SELECT to_regprocedure(${signature}) IS NOT NULL AS function_exists`,
  )) as ExecuteResult;
  return Boolean(res.rows?.[0]?.function_exists);
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

/**
 * Stable, pseudonymous correlation for a terminal erasure receipt.
 *
 * Wireline user ids are random UUIDs, so a one-way digest does not expose an
 * email, phone number, or other customer identifier. The versioned domain
 * separator also prevents this value from being confused with a raw UUID hash
 * used by another subsystem.
 */
export function accountDeletionReceiptId(userId: string): string {
  return createHash("sha256")
    .update(`botbound:account-deletion-receipt:v1:${userId}`, "utf8")
    .digest("hex");
}

export interface TerminalAccountPurgeQueueRow {
  id: string;
  userId: string;
  status: "purging";
  scheduledPurgeAt: Date | null;
  ip: string | null;
}

export type TerminalAccountPurgeClaim =
  | { ready: true; resumed: boolean; queueRow: TerminalAccountPurgeQueueRow }
  | { ready: false; reason: "account_operation_in_flight"; retryAt: Date }
  | {
      ready: false;
      reason: "queue_row_missing" | "queue_state_changed" | "grace_period_active";
    };

/**
 * Establish the irreversible deletion state before provider teardown begins.
 *
 * The advisory lock drains any post-call provider boundary that started before
 * the grace period elapsed. Committing `purging` then makes every later
 * post-call eligibility check stop terminally, even though Stripe/carrier/OpenAI
 * teardown necessarily runs outside this short database transaction.
 *
 * `purging` is intentionally resumable: a worker crash after this commit must
 * retry provider cleanup/local erasure without reopening customer delivery.
 */
export async function claimTerminalAccountPurge(
  input: { userId: string; queueId?: string },
  deps: Pick<PurgeAccountDeps, "db">,
): Promise<TerminalAccountPurgeClaim> {
  return tenantStore.run(input.userId, () =>
    deps.db.transaction(async (tx) => {
      await acquireAccountDeletionFence(tx, input.userId);

      const [activeOperation] = await tx
        .select({ expiresAt: schema.accountOperationLeases.expiresAt })
        .from(schema.accountOperationLeases)
        .where(
          and(
            eq(schema.accountOperationLeases.userId, input.userId),
            sql`${schema.accountOperationLeases.expiresAt} > now()`,
          ),
        )
        .orderBy(schema.accountOperationLeases.expiresAt)
        .limit(1);
      if (activeOperation) {
        return {
          ready: false,
          reason: "account_operation_in_flight",
          retryAt: activeOperation.expiresAt,
        } as const;
      }

      const [existing] = await tx
        .select({
          id: schema.deletionQueue.id,
          userId: schema.deletionQueue.userId,
          status: schema.deletionQueue.status,
          scheduledPurgeAt: schema.deletionQueue.scheduledPurgeAt,
          ip: schema.deletionQueue.ip,
        })
        .from(schema.deletionQueue)
        .where(
          and(
            eq(schema.deletionQueue.userId, input.userId),
            input.queueId
              ? eq(schema.deletionQueue.id, input.queueId)
              : inArray(schema.deletionQueue.status, ["pending", "purging"]),
          ),
        )
        .orderBy(desc(schema.deletionQueue.requestedAt))
        .limit(1);

      if (!existing) return { ready: false, reason: "queue_row_missing" } as const;
      if (existing.status === "purging") {
        return {
          ready: true,
          resumed: true,
          queueRow: { ...existing, status: "purging" },
        } as const;
      }
      if (existing.status !== "pending") {
        return { ready: false, reason: "queue_state_changed" } as const;
      }
      if (existing.scheduledPurgeAt && existing.scheduledPurgeAt.getTime() > Date.now()) {
        return { ready: false, reason: "grace_period_active" } as const;
      }

      const [claimed] = await tx
        .update(schema.deletionQueue)
        .set({ status: "purging" })
        .where(
          and(
            eq(schema.deletionQueue.id, existing.id),
            eq(schema.deletionQueue.userId, input.userId),
            eq(schema.deletionQueue.status, "pending"),
            sql`(
              ${schema.deletionQueue.scheduledPurgeAt} IS NULL
              OR ${schema.deletionQueue.scheduledPurgeAt} <= now()
            )`,
          ),
        )
        .returning({
          id: schema.deletionQueue.id,
          userId: schema.deletionQueue.userId,
          status: schema.deletionQueue.status,
          scheduledPurgeAt: schema.deletionQueue.scheduledPurgeAt,
          ip: schema.deletionQueue.ip,
        });

      if (!claimed) {
        return {
          ready: false,
          reason:
            existing.scheduledPurgeAt && existing.scheduledPurgeAt.getTime() > Date.now()
              ? "grace_period_active"
              : "queue_state_changed",
        } as const;
      }
      return {
        ready: true,
        resumed: false,
        queueRow: { ...claimed, status: "purging" },
      } as const;
    }),
  );
}

export interface ExternalReleaseSummary {
  subscriptionsCanceled: number;
  checkoutSessionsExpired: number;
  stripeCustomersDeleted: number;
  realtimeCallsHungUp: number;
  twilioCallsHungUp: number;
  openaiSipCallsHungUp: number;
  openaiSipHangupObligationsReconciled: number;
  nativePurchaseClaimsReconciled: number;
  numbersReleased: number;
  /** Non-fatal number-release failures (carrier orphans, retried out-of-band). */
  numberErrors: string[];
  /** Best-effort OAuth provider revoke counts (never blocks purge). */
  oauthRevoked: number;
  oauthAttempted: number;
  /** Managed AgentMail ownership pointers reconciled before local erasure. */
  managedAgentMailAccountsReconciled: number;
  /** BotBound-owned AgentMail inboxes deleted or already absent. */
  managedAgentMailInboxesDeleted: number;
}

/**
 * Stripe "already gone / nothing to do" errors — treat as success, not a reason
 * to retry. Besides a missing resource (404), canceling a subscription that is
 * already canceled returns a 400 invalid_request_error ("A canceled
 * subscription can only update its cancellation_details."). That is the desired
 * end state, so it must not throw and permanently defer the account purge.
 */
function isStripeAlreadyGone(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: number; message?: string } | null;
  if (e?.code === "resource_missing" || e?.statusCode === 404) return true;
  if (e?.statusCode === 400 && typeof e?.message === "string") {
    const m = e.message.toLowerCase();
    if (m.includes("canceled") || m.includes("cancelled")) return true;
  }
  return false;
}

/**
 * Releases the tenant's PAID external resources before the local hard-delete.
 *
 * The DB purge alone left two money leaks: the Stripe subscription kept billing
 * a customer whose account no longer existed, and provisioned Twilio
 * numbers stayed rented (and callable) with no owner. This runs first, from the
 * `purge_deleted_account` job, so both are torn down at the carrier/Stripe level
 * while we still hold the ids — after `purgeAccount` deletes the rows, they are
 * unrecoverable.
 *
 * Stripe cancellation is treated as blocking: on a real Stripe error (not an
 * already-canceled subscription) this THROWS so the job retries rather than
 * purging the ids and orphaning a live, still-billing subscription. Number
 * release remains best-effort for GDPR latency, but a failed release must be
 * durably handed to the platform orphan ledger before the tenant rows vanish.
 * If that handoff fails, the purge is deferred instead of losing the only
 * carrier ownership identifiers. Provider call artifacts are also removed here
 * while their call-log identifiers are still recoverable; those failures defer
 * the purge because there is no separate durable provider-artifact ledger.
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
  let checkoutSessionsExpired = 0;
  let stripeCustomersDeleted = 0;
  let realtimeCallsHungUp = 0;
  let twilioCallsHungUp = 0;
  let openaiSipCallsHungUp = 0;
  let openaiSipHangupObligationsReconciled = 0;
  let nativePurchaseClaimsReconciled = 0;
  let numbersReleased = 0;
  let oauthRevoked = 0;
  let oauthAttempted = 0;
  let managedAgentMailAccountsReconciled = 0;
  let managedAgentMailInboxesDeleted = 0;

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

  const { expireOpenCheckoutSessionsForDeletion } = await import("./account-deletion-billing");
  const checkoutClosure = await expireOpenCheckoutSessionsForDeletion(userId);
  if (!checkoutClosure.confirmed) {
    throw new Error(
      "Open Stripe Checkout Sessions could not be closed; deferring purge so no payable URL outlives the account.",
    );
  }
  checkoutSessionsExpired = checkoutClosure.expired;

  if (sub?.stripeCustomerId || sub?.stripeSubscriptionId) {
    const { stripe, stripeAvailable } = await import("./stripe-helpers");
    if (!stripeAvailable()) {
      // The whole point of this function is to never purge the ids of a
      // possibly-still-billing subscription. Silently skipping here when the
      // Stripe key is absent/misconfigured would do exactly that during a
      // config incident — throw instead so the purge job retries and the
      // deletion completes once billing config is restored.
      throw new Error(
        "Stripe is not configured but the account holds Stripe ids, deferring purge so a live subscription is not orphaned.",
      );
    }
    const ids = new Set<string>();
    if (sub.stripeCustomerId) {
      // status:"all" then filter — "active" alone misses trialing/past_due/
      // unpaid subscriptions, each of which is still a live billing
      // relationship that must be torn down on account deletion.
      const terminal = new Set<string>();
      for await (const s of stripe.subscriptions.list({
        customer: sub.stripeCustomerId,
        status: "all",
        limit: 100,
      })) {
        if (s.status === "canceled" || s.status === "incomplete_expired") terminal.add(s.id);
        else ids.add(s.id);
      }
      // The locally-stored id is retained on the row even after the webhook
      // marks the subscription canceled, so re-adding it unconditionally would
      // cancel an already-canceled subscription on the COMMON deletion flow
      // (cancel_at_period_end → period ends → canceled). Skip it when the live
      // list already observed it terminal; isStripeAlreadyGone still covers the
      // case where the list didn't include it.
      if (sub.stripeSubscriptionId && !terminal.has(sub.stripeSubscriptionId)) {
        ids.add(sub.stripeSubscriptionId);
      }
    } else if (sub.stripeSubscriptionId) {
      ids.add(sub.stripeSubscriptionId);
    }
    for (const id of ids) {
      try {
        await stripe.subscriptions.cancel(id);
        subscriptionsCanceled++;
      } catch (err) {
        if (isStripeAlreadyGone(err)) continue;
        log.error("purge subscription cancel failed, deferring purge", {
          userId,
          subscriptionId: id,
          error: getErrorMessage(err),
        });
        throw err;
      }
    }
  }

  if (checkoutClosure.customerIds.length) {
    const { stripe, stripeAvailable } = await import("./stripe-helpers");
    if (!stripeAvailable()) {
      throw new Error("Stripe customer erasure is unavailable; deferring account purge.");
    }
    for (const customerId of checkoutClosure.customerIds) {
      try {
        await stripe.customers.del(customerId);
        stripeCustomersDeleted++;
      } catch (error) {
        if (!isStripeAlreadyGone(error)) throw error;
      }
    }
  }

  // 1.5 A Realtime call created immediately before the deletion deadline owns
  // a future tenant job that is the only authoritative server-side hangup. The
  // terminal claim drained any running handler and blocks new call admission;
  // execute every remaining non-done hangup now, before the generic table sweep
  // deletes its only provider call id. Provider failure defers the purge.
  const realtimeHangupJobs = await db
    .select({ id: schema.jobs.id, payload: schema.jobs.payload })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, userId),
        eq(schema.jobs.type, "openai_realtime_hangup"),
        sql`${schema.jobs.status} IS DISTINCT FROM 'done'`,
      ),
    );
  if (realtimeHangupJobs.length) {
    const { hangupOpenAIRealtimeCall } = await import("./voice/openai-realtime-call-control");
    for (const job of realtimeHangupJobs) {
      const payload =
        job.payload && typeof job.payload === "object"
          ? (job.payload as Record<string, unknown>)
          : {};
      const callId = typeof payload.callId === "string" ? payload.callId : "";
      if (!callId) {
        throw new Error(
          `OpenAI Realtime hangup job ${job.id} has no call id; deferring purge for reconciliation.`,
        );
      }
      await hangupOpenAIRealtimeCall({
        callId,
        keyPurpose: payload.keyPurpose === "chatgpt_demo" ? "chatgpt_demo" : "runtime",
        keySource:
          payload.keySource === "chatgpt_demo" || payload.keySource === "runtime"
            ? payload.keySource
            : undefined,
        expectedKeyFingerprint:
          typeof payload.keyFingerprint === "string" ? payload.keyFingerprint : undefined,
      });
      realtimeCallsHungUp++;
    }
  }

  // A failed SIP hangup is retained on its terminal digest after presence has
  // been removed. The digest's deletion fence can finish that job without
  // replaying it once purge is due, so include done jobs here as well. Never
  // erase this last provider pointer before termination is confirmed.
  const sipHangupObligations = await db
    .select({ id: schema.jobs.id, payload: schema.jobs.payload })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, userId),
        eq(schema.jobs.type, "post_call_digest"),
        sql`${schema.jobs.payload}->'finalization' ? 'providerHangupRequired'`,
        sql`${schema.jobs.result}->'finalization'->>'state' IS DISTINCT FROM 'completed'`,
      ),
    );
  if (sipHangupObligations.length) {
    const { confirmOpenAISipHangupRecovery } = await import("./voice/openai-sip-session");
    for (const job of sipHangupObligations) {
      const payload = job.payload as Record<string, unknown> | null;
      const finalization = payload?.finalization as Record<string, unknown> | null;
      if (finalization?.providerHangupRequired === false) continue;
      const callId = typeof finalization?.callId === "string" ? finalization.callId.trim() : "";
      const callLogId = typeof payload?.callLogId === "string" ? payload.callLogId : "";
      if (
        payload?.userId !== userId ||
        finalization?.provider !== "openai_sip" ||
        finalization.providerHangupRequired !== true ||
        finalization.terminalStateReady !== true ||
        !callId ||
        !/^[1-9]\d*$/.test(callLogId)
      ) {
        throw new Error(
          `OpenAI SIP hangup obligation ${job.id} is invalid; deferring account purge.`,
        );
      }
      // This helper rechecks the owned terminal call under the REFER lock and
      // skips confirmed transfers. Provider errors deliberately defer erasure.
      await confirmOpenAISipHangupRecovery({ userId, callLogId, callId });
      openaiSipHangupObligationsReconciled++;
    }
  }

  const activeOpenAISipSessions = await db
    .select({ presenceId: schema.signalPresence.id })
    .from(schema.signalPresence)
    .where(
      and(
        eq(schema.signalPresence.userId, userId),
        sql`${schema.signalPresence.id} LIKE 'openai:%'`,
      ),
    );
  if (activeOpenAISipSessions.length) {
    const { hangupOpenAISipCall } = await import("./voice/openai-sip-session");
    for (const row of activeOpenAISipSessions) {
      const callId = row.presenceId.slice("openai:".length);
      if (!callId) continue;
      await hangupOpenAISipCall(callId);
      openaiSipCallsHungUp++;
    }
  }

  // Native outbound placement persists the Twilio CallSid on the lead before
  // its customer-facing success response. Calls can still be queued/ringing/
  // in-progress when the deletion deadline arrives, so terminate every
  // non-terminal tenant pointer before phone-number release and local erasure.
  const activeCarrierCalls = await db
    .select({ callSid: schema.outboundLeads.callId })
    .from(schema.outboundLeads)
    .where(
      and(
        eq(schema.outboundLeads.userId, userId),
        inArray(schema.outboundLeads.status, ["Queued", "Dialing", "Connected"]),
        sql`${schema.outboundLeads.callId} ~ '^CA[0-9a-fA-F]{32}$'`,
      ),
    );
  if (activeCarrierCalls.length) {
    const { getTwilioClient } = await import("./twilio-service");
    const client = getTwilioClient();
    if (!client) {
      throw new Error("Twilio call cleanup is unavailable; deferring account purge.");
    }
    const terminalStatuses = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);
    for (const row of activeCarrierCalls) {
      const callSid = String(row.callSid || "").trim();
      if (!callSid) continue;
      try {
        const call = await client.calls(callSid).fetch();
        if (!terminalStatuses.has(String(call.status || "").toLowerCase())) {
          await client.calls(callSid).update({ status: "completed" });
          twilioCallsHungUp++;
        }
      } catch (error) {
        const carrierError = error as { status?: unknown; statusCode?: unknown } | null;
        const status = Number(carrierError?.status ?? carrierError?.statusCode);
        if (status !== 404) throw error;
      }
    }
  }

  // A provider-operation lease is a bounded admission/drain mechanism, not
  // proof that a timed-out Twilio purchase was rejected. Before normal number
  // teardown, authoritatively list every durable pre-provider purchase claim
  // by its exact E.164 + non-PII friendly name and release any accepted rental.
  // Any provider or ledger failure defers the terminal purge.
  const { reconcileNativeTwilioPurchaseClaimsForTerminalDeletion } =
    await import("./orphan-carrier-retry");
  const nativePurchaseClaimReconciliation =
    await reconcileNativeTwilioPurchaseClaimsForTerminalDeletion(userId);
  nativePurchaseClaimsReconciled = nativePurchaseClaimReconciliation.attempted;

  // 2. Release provisioned numbers at the carrier (Twilio). A
  //    carrier failure does not block GDPR erasure by itself, but the platform
  //    must durably retain the ownership/provider identifiers before hard-delete.
  const numbers = await db
    .select({
      phoneNumber: schema.phoneNumbers.phoneNumber,
      vapiNumberId: schema.phoneNumbers.vapiNumberId,
    })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.userId, userId));

  if (numbers.length) {
    const { releaseNativeTenantNumber } = await import("./voice/native-phone-release");
    for (const { phoneNumber, vapiNumberId } of numbers) {
      // Native carrier claim/retirement functions deliberately require the tenant
      // GUC even when the surrounding deletion coordinator is running as the
      // root worker. Re-enter only for this ownership-bound provider teardown;
      // the discovery and final purge remain outside every ambient tenant.
      const res = await tenantStore
        .run(userId, () =>
          releaseNativeTenantNumber(userId, phoneNumber, { terminalCleanup: true }),
        )
        .catch((err) => ({
          ok: false as const,
          error: getErrorMessage(err),
        }));
      if (res.ok) {
        numbersReleased++;
      } else {
        const errorText = res.error ?? "unknown";
        numberErrors.push(`${phoneNumber}: ${errorText}`);
        log.warn("purge number release failed, handing off to orphan ledger", {
          userId,
          phoneNumber,
          error: errorText,
        });

        try {
          await db.execute(sql`
            INSERT INTO public.wireline_orphan_carrier_resources (
              former_user_id,
              phone_number,
              vapi_number_id,
              last_error,
              status
            )
            VALUES (
              ${userId}::uuid,
              ${phoneNumber},
              ${vapiNumberId ?? null},
              ${errorText},
              'pending'
            )
            ON CONFLICT (former_user_id, phone_number) WHERE status = 'pending'
            DO UPDATE SET
              vapi_number_id = EXCLUDED.vapi_number_id,
              last_error = EXCLUDED.last_error,
              created_at = now(),
              resolved_at = NULL
          `);
        } catch (ledgerErr) {
          log.error("orphan carrier handoff failed, deferring account purge", {
            userId,
            phoneNumber,
            error: getErrorMessage(ledgerErr),
          });
          throw ledgerErr;
        }
      }
    }
  }

  // 2.5 Erase provider-owned call data while the local call rows still retain
  //     the identifiers required to address it. If provider cleanup fails, the
  //     purge must retry rather than destroy the only remaining cleanup pointers.
  const callArtifactPointers = await db
    .select({
      providerCallId: schema.callLogs.vapiCallId,
      recordingUrl: schema.callLogs.recordingUrl,
    })
    .from(schema.callLogs)
    .where(eq(schema.callLogs.userId, userId));

  if (callArtifactPointers.length) {
    const { eraseProviderCallArtifacts } = await import("./provider-call-erasure");
    try {
      await eraseProviderCallArtifacts(callArtifactPointers);
    } catch (err) {
      log.error("provider call-data deletion failed, deferring account purge", {
        userId,
        error: getErrorMessage(err),
      });
      throw err;
    }
  }

  // 2.9 Permanently erase BotBound-owned AgentMail inboxes while the local
  //      managed marker, encrypted sentinel, and exact address still exist.
  //      Provider inventory/delete failures are blocking: deleting the local
  //      pointer first would strand messages and attachments in AgentMail.
  //      BYO/legacy tenant-owned AgentMail accounts do not carry the exact
  //      managed marker and are intentionally excluded.
  const agentMailAccounts = await db
    .select({
      provider: schema.emailAccounts.provider,
      emailAddress: schema.emailAccounts.emailAddress,
      accessToken: schema.emailAccounts.accessToken,
      oauthGrantedScopes: schema.emailAccounts.oauthGrantedScopes,
    })
    .from(schema.emailAccounts)
    .where(eq(schema.emailAccounts.userId, userId));

  if (agentMailAccounts.length) {
    const { eraseManagedAgentMailInboxesForPurge } = await import("./agentmail-mail");
    try {
      const erased = await eraseManagedAgentMailInboxesForPurge(agentMailAccounts);
      managedAgentMailAccountsReconciled = erased.managedAccountsReconciled;
      managedAgentMailInboxesDeleted = erased.inboxesDeleted;
    } catch (err) {
      log.error("managed AgentMail inbox deletion failed, deferring account purge", {
        userId,
        error: getErrorMessage(err),
      });
      throw err;
    }
  }

  // 3. Best-effort revoke of provider OAuth grants while encrypted tokens still
  //    exist. Never throws — a provider outage must not block GDPR erasure.
  try {
    const { revokeAllOAuthGrantsForUser } = await import("./oauth-provider-revocation");
    const oauth = await revokeAllOAuthGrantsForUser(userId);
    oauthAttempted = oauth.attempted;
    oauthRevoked = oauth.revoked;
    if (oauth.errors.length) {
      log.warn("purge oauth revoke incomplete", {
        userId,
        attempted: oauth.attempted,
        revoked: oauth.revoked,
        errors: oauth.errors.slice(0, 12),
      });
    }
  } catch (err) {
    log.warn("purge oauth revoke failed, continuing with local erasure", {
      userId,
      error: getErrorMessage(err),
    });
  }

  // Each Bot's knowledge index holds a copy of what the Bot was taught. Delete
  // it before the Bot rows (and so the index ids) are erased.
  try {
    const indexed = await db
      .select({ index: schema.agents.knowledgeIndex })
      .from(schema.agents)
      .where(and(eq(schema.agents.userId, userId), isNotNull(schema.agents.knowledgeIndex)));
    if (indexed.length) {
      const { deleteKnowledgeIndex } = await import("./knowledge-index");
      const { parseKnowledgeIndexState } = await import("./knowledge-index-search");
      for (const row of indexed) await deleteKnowledgeIndex(parseKnowledgeIndexState(row.index));
    }
  } catch (err) {
    log.warn("purge knowledge index cleanup failed, continuing with local erasure", {
      userId,
      error: getErrorMessage(err),
    });
  }

  // Cloned voices live at the realtime voice provider. Delete them while the
  // provider ids still exist; a failure defers the purge (voiceprints are
  // biometric data and have no separate orphan ledger). Already-missing
  // voices count as deleted.
  {
    const { deleteProviderLiveVoicesForAccount } = await import("./voice/live-voice-service");
    try {
      await deleteProviderLiveVoicesForAccount(db, userId);
    } catch (err) {
      log.error("cloned voice deletion failed, deferring account purge", {
        userId,
        error: getErrorMessage(err),
      });
      throw err;
    }
  }

  return {
    subscriptionsCanceled,
    checkoutSessionsExpired,
    stripeCustomersDeleted,
    realtimeCallsHungUp,
    twilioCallsHungUp,
    openaiSipCallsHungUp,
    openaiSipHangupObligationsReconciled,
    nativePurchaseClaimsReconciled,
    numbersReleased,
    numberErrors,
    oauthRevoked,
    oauthAttempted,
    managedAgentMailAccountsReconciled,
    managedAgentMailInboxesDeleted,
  };
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
      // A post-call worker may already hold a transcript/phone snapshot. The
      // shared advisory barrier makes purge wait for any in-flight provider
      // boundary, while a worker arriving after this lock waits for erasure and
      // then observes that the user/call no longer exists.
      await acquireAccountDeletionFence(tx, userId);
      // During a rolling release, application code can briefly run against the
      // pre-0172 schema. Scrub its retired provider ledger while the legacy
      // function exists; once 0172 has removed both, skip the obsolete call.
      if (await functionExists(tx, "public.wireline_scrub_xai_phone_bindings_for_purge(uuid)")) {
        await tx.execute(
          sql`SELECT public.wireline_scrub_xai_phone_bindings_for_purge(${userId}::uuid)`,
        );
      }
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
      // Migration 0157 permits NULL only for server-owned system events. Write
      // the pseudonymous receipt inside this same transaction: if the receipt
      // cannot be retained, the destructive purge rolls back rather than
      // claiming an erasure that has no durable terminal evidence.
      await tx
        .insert(schema.auditLog)
        .values({
          userId: null,
          action: "account.purge.completed",
          eventType: "account.deletion.completed",
          severity: "info",
          resourceType: "account_deletion_receipt",
          resourceId: accountDeletionReceiptId(userId),
          metadata: {
            receipt_version: 1,
            auth_removed: true,
            tables_touched: [...tablesTouched],
          },
        })
        .onConflictDoNothing();
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
