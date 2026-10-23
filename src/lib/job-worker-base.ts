/* eslint-disable @typescript-eslint/no-explicit-any -- job and webhook payloads are stored as Postgres jsonb. */
import { log, drizzle, tenantStore } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import * as claudeBrain from "./ai-brains";
import { getErrorMessage } from "./server-utils";
import { startWorker, type JobRow, enqueue, writeTransactionConfig } from "./job-queue";
import { executeAction } from "./action-engine";
import { ActionItemSchema } from "./action-types";
import {
  postCallFollowUpAction,
  sendEmailDraftAlreadyDelivered,
  toolAuditResultText,
} from "./post-call-follow-up";
import { buildCallCompletedOutcome, dispatchWebhook } from "./webhook-helpers";
import { apolloReadyForUser, searchLeads as apolloSearch } from "./apollo-service";
import { LEAD_STATUS } from "./outbound-status";
import {
  claimTerminalAccountPurge,
  purgeAccount,
  releaseExternalResourcesForPurge,
} from "./account-deletion";
import { acquireAccountDeletionFence, runTerminalDeletionSequence } from "./account-deletion-fence";
import { getCanonicalAppUrl } from "./app-url";
import { assertJobPayloadOwner } from "./job-owner";

async function persistJobResult(jobId: string, result: Record<string, unknown>): Promise<void> {
  await drizzle
    .update(schema.jobs)
    .set({ result, updatedAt: new Date() })
    .where(eq(schema.jobs.id, jobId));
}

/**
 * Queue one follow-up extraction per enrichment job. `enqueue` reports a
 * failure instead of throwing, so it is raised here for the queue to retry.
 */
async function enqueueActionExtractionOnce(
  enrichmentJob: JobRow,
  p: {
    userId: string;
    agentId: string;
    callId: string;
    summary?: string;
    transcript?: string;
    customerNumber?: string;
  },
): Promise<void> {
  const [prior] = await drizzle
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, p.userId),
        eq(schema.jobs.type, "v2a_action_extraction"),
        sql`${schema.jobs.payload}->>'enrichmentJobId' = ${enrichmentJob.id}`,
      ),
    )
    .limit(1);
  if (prior) return;
  const queued = await enqueue(drizzle, {
    userId: p.userId,
    type: "v2a_action_extraction",
    payload: {
      userId: p.userId,
      agentId: p.agentId,
      callId: p.callId,
      summary: p.summary,
      transcript: p.transcript,
      customerNumber: p.customerNumber,
      enrichmentJobId: enrichmentJob.id,
    },
  });
  if (!queued.ok) throw new Error(`Failed to enqueue V2A extraction: ${queued.error}`);
}

/** Completed live send_email results for this provider call, if the audit recorded them. */
async function completedSendEmailResults(userId: string, callId: string): Promise<string[]> {
  if (!userId || !callId) return [];
  const rows = await drizzle
    .select({ metadata: schema.auditLog.metadata })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.userId, userId),
        eq(schema.auditLog.action, "agent_tool.send_email"),
        eq(schema.auditLog.eventType, "voice.tool_call"),
        sql`${schema.auditLog.metadata}->>'callId' = ${callId}`,
        sql`${schema.auditLog.metadata}->>'status' = 'completed'`,
      ),
    );
  return rows.map((row) => toolAuditResultText(row.metadata)).filter(Boolean);
}

/**
 * Global job handler.
 * Dispatches jobs from the wireline_jobs table.
 */
export async function handleJob(job: JobRow): Promise<void> {
  if (job.type === "post_call_digest") {
    const { handlePostCallDigestJob } = await import("./post-call-digest");
    await handlePostCallDigestJob(job);
    return;
  }

  if (job.type === "missed_call_owner_alert") {
    const { handleMissedCallAlertJob } = await import("./voice/missed-calls");
    await handleMissedCallAlertJob(job);
    return;
  }

  if (job.type === "post_call_enrichment") {
    const p = job.payload as {
      agentId: string;
      userId: string;
      callId: string;
      agentName?: string;
      archetype?: string;
      role?: string;
      customerNumber?: string;
      durationSeconds?: number;
      summary?: string;
      transcript?: string;
      useFlash?: boolean;
    };

    const transcript = p.transcript;
    if (!transcript?.trim()) return;

    // Follow-up drafts are the only post-call model work. Sales scores and
    // lessons are not shown to customers and are not applied to the live prompt.
    await enqueueActionExtractionOnce(job, p);

    const [logRow] = await drizzle
      .select({
        direction: schema.callLogs.direction,
        customerNumber: schema.callLogs.customerNumber,
      })
      .from(schema.callLogs)
      .where(eq(schema.callLogs.vapiCallId, p.callId))
      .limit(1);
    const direction =
      logRow?.direction === "outbound" ? ("outbound" as const) : ("inbound" as const);
    const payload = buildCallCompletedOutcome({
      vapi_call_id: p.callId,
      agent_id: p.agentId,
      customer_number: logRow?.customerNumber || p.customerNumber || null,
      direction,
      duration_seconds: p.durationSeconds,
      enrichment_source: "async_post_call_job",
      enrichment: null,
    });
    dispatchWebhook(p.userId, "call.completed", payload).catch((e: unknown) =>
      log.error("webhook dispatch failed", {
        userId: p.userId,
        event: "call.completed",
        error: getErrorMessage(e),
      }),
    );
  }

  if (job.type === "v2a_action_extraction") {
    const p = job.payload as {
      userId: string;
      agentId?: string;
      callId: string;
      transcript: string;
      summary: string;
      customerNumber?: string;
    };

    const actions = await claudeBrain.extractActions({
      transcript: p.transcript,
      summary: p.summary,
      customerNumber: p.customerNumber,
    });

    const completedEmailSends = await completedSendEmailResults(p.userId, p.callId);
    let skippedDuplicateEmails = 0;
    for (const action of actions.map(postCallFollowUpAction)) {
      if (sendEmailDraftAlreadyDelivered(action, completedEmailSends)) {
        skippedDuplicateEmails += 1;
        continue;
      }
      await enqueue(drizzle, {
        userId: p.userId,
        type: "execute_action",
        payload: {
          userId: p.userId,
          action: p.agentId ? { ...action, agentId: p.agentId } : action,
          context: { sourceId: p.callId, sourceType: "phone_call" },
          // Read from a transcript after the call: the owner approves every one.
          autonomy: "draft",
        },
      });
    }
    log.info("V2A extraction complete", {
      userId: p.userId,
      callId: p.callId,
      actionsCount: actions.length,
      skippedDuplicateEmails,
    });
  }

  if (job.type === "execute_action") {
    const p = job.payload as {
      userId: string;
      action: any;
      context: { sourceId: string; sourceType: string };
      autonomy?: "draft";
    };

    const parsed = ActionItemSchema.safeParse(p.action);
    if (!parsed.success) {
      log.error("Invalid action payload", { userId: p.userId, error: parsed.error });
      return;
    }

    await executeAction(
      p.userId,
      parsed.data,
      p.context,
      p.autonomy === "draft" ? "draft" : undefined,
    );
  }

  if (job.type === "adaptive_optimization") {
    const p = job.payload as {
      agentId: string;
      userId?: string;
      callId: string;
      score: number;
      breakdown: any;
    };
    assertJobPayloadOwner(job, p);
    if (
      typeof p.agentId !== "string" ||
      !p.agentId.trim() ||
      p.agentId.length > 200 ||
      typeof p.callId !== "string" ||
      !/^[1-9]\d{0,18}$/.test(p.callId) ||
      BigInt(p.callId) > 9_223_372_036_854_775_807n ||
      typeof p.score !== "number" ||
      !Number.isFinite(p.score) ||
      p.score < 0 ||
      p.score > 100
    )
      throw new Error("Adaptive optimization job contains an invalid call or Bot identity.");

    log.info("adaptive_optimization skipped, lessons are not applied to the live prompt", {
      jobId: job.id,
      agentId: p.agentId,
    });
    return;
  }

  if (job.type === "purge_old_data") {
    const p = job.payload as { user_id: string; retention_days?: number };
    if (!p.user_id) {
      log.warn("purge_old_data job missing user_id", { jobId: job.id });
      return;
    }
    // Match the settings API's published 90-day floor even for old or malformed
    // job payloads. Financial admission receipts must survive their 31-day window.
    const retentionDays =
      typeof p.retention_days === "number" && Number.isFinite(p.retention_days)
        ? Math.max(90, Math.trunc(p.retention_days))
        : 365;
    try {
      // Use parameterized query to prevent SQL injection
      const result = await drizzle.execute(
        sql`SELECT wireline_purge_old_data(${p.user_id}, ${retentionDays})`,
      );

      // Recovery credentials are hashed and time-bounded, but retaining expired
      // rows indefinitely still creates unnecessary security and privacy debt.
      // The per-tenant retention job already runs regularly, so clean both token
      // stores here after their expiry instead of waiting for account deletion.
      // Keep these deletes sequential so one maintenance job never fans out
      // tenant-scoped pool connections.
      const expiredBefore = new Date();
      const expiredEmailTokens = await drizzle
        .delete(schema.emailVerificationTokens)
        .where(
          and(
            eq(schema.emailVerificationTokens.userId, p.user_id),
            lt(schema.emailVerificationTokens.expiresAt, expiredBefore),
          ),
        )
        .returning({ id: schema.emailVerificationTokens.id });
      const expiredPasswordTokens = await drizzle
        .delete(schema.passwordResetTokens)
        .where(
          and(
            eq(schema.passwordResetTokens.userId, p.user_id),
            lt(schema.passwordResetTokens.expiresAt, expiredBefore),
          ),
        )
        .returning({ id: schema.passwordResetTokens.id });
      log.info("purge_old_data job completed", {
        jobId: job.id,
        user_id: p.user_id,
        retention_days: retentionDays,
        expired_email_tokens_deleted: expiredEmailTokens.length,
        expired_password_tokens_deleted: expiredPasswordTokens.length,
        result,
      });
    } catch (error: any) {
      log.error("purge_old_data job failed", {
        jobId: job.id,
        user_id: p.user_id,
        error: error.message,
      });
      throw new Error(error.message);
    }
  }

  if (job.type === "purge_deleted_account") {
    const p = job.payload as { user_id: string; queue_id?: string };
    if (!p.user_id) {
      log.warn("purge_deleted_account job missing user_id", { jobId: job.id });
      return;
    }

    const sequence = await runTerminalDeletionSequence({
      establishTerminalState: async () => {
        const claim = await claimTerminalAccountPurge(
          { userId: p.user_id, ...(p.queue_id ? { queueId: p.queue_id } : {}) },
          { db: drizzle },
        );
        if (!claim.ready) {
          if (claim.reason === "account_operation_in_flight") {
            const runAt = new Date(Math.max(claim.retryAt.getTime() + 1_000, Date.now() + 30_000));
            await tenantStore.run(p.user_id, () =>
              drizzle.transaction(async (tx) => {
                await acquireAccountDeletionFence(tx, p.user_id);
                const [waiting] = await tx
                  .select({ id: schema.jobs.id })
                  .from(schema.jobs)
                  .where(
                    and(
                      eq(schema.jobs.userId, p.user_id),
                      eq(schema.jobs.type, "purge_deleted_account"),
                      eq(schema.jobs.status, "pending"),
                    ),
                  )
                  .limit(1);
                if (!waiting) {
                  await tx.insert(schema.jobs).values({
                    userId: p.user_id,
                    type: "purge_deleted_account",
                    status: "pending",
                    payload: {
                      user_id: p.user_id,
                      ...(p.queue_id ? { queue_id: p.queue_id } : {}),
                    },
                    runAt,
                    maxAttempts: 3,
                  });
                }
              }, writeTransactionConfig()),
            );
            log.info("purge_deleted_account rescheduled after active account operation", {
              jobId: job.id,
              user_id: p.user_id,
              retry_at: runAt.toISOString(),
            });
            return null;
          }
          log.info("purge_deleted_account skipped, terminal claim unavailable", {
            jobId: job.id,
            user_id: p.user_id,
            reason: claim.reason,
          });
          return null;
        }
        log.info("purge_deleted_account terminal state established", {
          jobId: job.id,
          user_id: p.user_id,
          resumed: claim.resumed,
        });
        return claim.queueRow;
      },
      // The durable `purging` commit above drains earlier post-call work and
      // prevents any later provider delivery before teardown starts.
      releaseExternalResources: async () => {
        const release = await releaseExternalResourcesForPurge(p.user_id, { db: drizzle, log });
        log.info("purge_deleted_account external release", {
          jobId: job.id,
          user_id: p.user_id,
          subscriptions_canceled: release.subscriptionsCanceled,
          checkout_sessions_expired: release.checkoutSessionsExpired,
          stripe_customers_deleted: release.stripeCustomersDeleted,
          realtime_calls_hung_up: release.realtimeCallsHungUp,
          twilio_calls_hung_up: release.twilioCallsHungUp,
          openai_sip_calls_hung_up: release.openaiSipCallsHungUp,
          numbers_released: release.numbersReleased,
          number_errors: release.numberErrors.length,
          oauth_attempted: release.oauthAttempted,
          oauth_revoked: release.oauthRevoked,
          managed_agentmail_accounts_reconciled: release.managedAgentMailAccountsReconciled,
          managed_agentmail_inboxes_deleted: release.managedAgentMailInboxesDeleted,
        });
        return release;
      },
      purgeLocalAccount: async (queueRow) => {
        const result = await purgeAccount(p.user_id, { db: drizzle, log });
        if (!result.ok) {
          log.error("purge_deleted_account failed", {
            jobId: job.id,
            user_id: p.user_id,
            error: result.error,
          });
          throw new Error(result.error ?? "account purge failed");
        }

        // The local purge normally deletes this PII-bearing row. This update
        // documents terminal state for schemas where the row is retained.
        await drizzle
          .update(schema.deletionQueue)
          .set({ status: "purged", purgedAt: new Date() })
          .where(eq(schema.deletionQueue.id, queueRow.id));
        return result;
      },
    });

    if (!sequence.started) return;
    log.info("purge_deleted_account completed", {
      jobId: job.id,
      user_id: p.user_id,
      tables_touched: sequence.purge.tablesTouched.length,
    });
  }

  if (job.type === "proactive_lead_enrichment") {
    // Unreachable by design: job-worker.ts intercepts this type before the
    // base handler and runs the tenant-scoped replacement. Keeping a hard
    // throw here means removing the intercept cannot silently revive the
    // phone-only cross-tenant history reads that caused #879.
    throw new Error(
      "proactive_lead_enrichment must be handled by the tenant-safe intercept in job-worker.ts",
    );
  }

  if (job.type === "autonomous_prospecting") {
    const p = job.payload as { userId?: string };
    const userId = assertJobPayloadOwner(job, p);
    const [settings] = await drizzle
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1);

    if (!settings?.prospectingEnabled) {
      log.info("Prospecting disabled for user", { userId });
      await persistJobResult(job.id, {
        skipped: true,
        reason: "prospecting_disabled",
        leadsFound: 0,
        leadsAdded: 0,
      });
      return;
    }

    const apolloReady = await apolloReadyForUser(userId);
    log.info("Starting autonomous prospecting", {
      userId,
      titles: settings.targetTitles,
      apolloReady,
    });

    if (!apolloReady) {
      await persistJobResult(job.id, {
        skipped: true,
        reason: "apollo_not_configured",
        leadsFound: 0,
        leadsAdded: 0,
        hint: "Connect Apollo in Settings → Integrations or set APOLLO_API_KEY on the platform.",
      });
      return;
    }

    const leads = await apolloSearch(
      {
        titles: (settings.targetTitles as string[]) || [],
        industries: (settings.targetIndustries as string[]) || [],
        states: (settings.targetStates as string[]) || [],
        employee_ranges: (settings.targetEmployeeRanges as string[]) || [],
        limit: 10,
      },
      userId,
    );

    let added = 0;
    for (const lead of leads) {
      try {
        const customerName =
          `${lead.first_name} ${lead.last_name}`.trim() || lead.company || "Lead";
        const phoneIdentity = lead.phone.replace(/\D+/g, "");
        const idempotencyKey = `apollo:${lead.apollo_id || phoneIdentity}`;
        await drizzle.insert(schema.outboundLeads).values({
          userId,
          customerName,
          customerNumber: lead.phone,
          phoneNumber: lead.phone,
          email: lead.email,
          status: LEAD_STATUS.PENDING,
          source: "apollo",
          idempotencyKey,
          context: `Sourced via Apollo Lead Hunt for ${lead.title || "a decision-maker"} role at ${lead.company || "the matched company"}.`,
          metadata: {
            source: "apollo_lead_hunt",
            call_purpose: "marketing_or_sales",
            has_express_written_consent: false,
            lead_hunt: {
              provider: "apollo",
              apollo_id: lead.apollo_id || null,
              title: lead.title || null,
              company: lead.company || null,
              phone_source: lead.phone_source || null,
              linkedin_url: lead.linkedin_url || null,
              city: lead.city || null,
              state: lead.state || null,
              review_status: "pending",
            },
          },
        });
        added++;
      } catch (error: any) {
        const errorCode = error?.code || error?.cause?.code;
        if (errorCode !== "23505") {
          log.warn("Lead Hunt could not stage an Apollo result", {
            userId,
            errorCode: typeof errorCode === "string" ? errorCode : "unknown",
          });
        }
      }
    }

    await persistJobResult(job.id, {
      leadsFound: leads.length,
      leadsAdded: added,
      reviewPending: added,
      apolloReady: true,
    });

    log.info("Autonomous prospecting complete", {
      userId,
      leadsFound: leads.length,
      leadsAdded: added,
    });
  }

  if (job.type === "knowledge_from_url") {
    const p = job.payload as {
      userId: string;
      url: string;
      agentContext?: string;
      maxEntries?: number;
      maxPages?: number;
    };
    if (!claudeBrain.isBrainAvailable()) {
      throw new Error("Claude is not configured, cannot crawl URL for knowledge.");
    }
    const result = await claudeBrain.knowledgeFromUrl({
      url: p.url,
      agentContext: p.agentContext,
      maxEntries: p.maxEntries ?? 12,
      maxPages: p.maxPages ?? 5,
    });
    await persistJobResult(job.id, result as unknown as Record<string, unknown>);
  }

  if (job.type === "vapi_webhook") {
    await persistJobResult(job.id, {
      retired: true,
      reason: "legacy_voice_provider_removed",
    });
    return;
  }

  if (job.type === "campaign_dial") {
    const p = job.payload as { userId: string; campaignId?: string };
    if (!p.userId || !p.campaignId) {
      log.error("campaign_dial job missing campaignId", { jobId: job.id, payload: p });
      throw new Error("campaign_dial job requires userId and campaignId");
    }
    const { CampaignDialerService } = await import("../services/campaign-dialer");
    const dialer = new CampaignDialerService();
    await dialer.processCampaignById(p.userId, p.campaignId);
  }

  if (job.type === "cadence_tick") {
    const { tickDueCadenceRuns } = await import("./cadence-engine");
    const summary = await tickDueCadenceRuns({ limit: 100 });
    log.info("cadence_tick processed", summary);
  }

  if (job.type === "callback_tick") {
    const { tickDueCallbacks } = await import("./callback-engine");
    const summary = await tickDueCallbacks({ limit: 25 });
    if (summary.processed > 0) log.info("callback_tick processed", { ...summary });
  }

  if (job.type === "auto_qa_score") {
    const p = job.payload as { callLogId: number | string; userId?: string };
    const userId = assertJobPayloadOwner(job, p);
    log.info("auto_qa_score skipped, sales rubric is not part of the call report", {
      callLogId: p.callLogId,
      userId,
    });
    return;
  }

  if (job.type === "sweep_orphan_supervisor_subs") {
    // Delete any supervisor_subscriptions row that violates the
    // ownership invariant the route enforces at insert time: the
    // subscription's user_id MUST match the user_id of the call_log row
    // the call_id points at. Catches both:
    //   - rows whose call_id doesn't reference any call at all
    //     (audit probes, dev testing)
    //   - rows whose call_id points at ANOTHER tenant's call (the
    //     cross-tenant snoop case the route now blocks)
    // The NOT EXISTS subquery requires both call_id match AND user_id
    // match — single-table same-row check.
    try {
      const result: any = await drizzle.execute(sql`
        DELETE FROM wireline_supervisor_subscriptions s
        WHERE NOT EXISTS (
          SELECT 1
          FROM wireline_call_logs c
          WHERE c.vapi_call_id = s.call_id
            AND c.user_id = s.user_id
        )
        RETURNING s.id
      `);
      const deleted = (result?.rowCount ?? result?.rows?.length ?? 0) | 0;
      log.info("sweep_orphan_supervisor_subs completed", { deleted });
    } catch (err: any) {
      // Re-throw after logging so the outer claim/fail/retry loop in
      // job-queue marks the job failed and dead-letters/retries it.
      // Without the throw, the job silently completes successfully
      // even when the DELETE crashed, masking real DB issues from the
      // queue health metrics.
      log.error("sweep_orphan_supervisor_subs failed", { error: err?.message });
      throw err;
    }
  }

  if (job.type === "reclaim_canceled_numbers") {
    // Daily platform sweep: release carrier numbers held by workspaces whose
    // Stripe subscription has been canceled past the grace window. All safety
    // rules (canceled-only, 30-day grace, dual truth-source agreement, per-run
    // cap, fresh re-verify per release) live in number-reclamation.ts.
    try {
      const { runNumberReclamation } = await import("./number-reclamation");
      const summary = await runNumberReclamation();
      log.info("reclaim_canceled_numbers completed", { ...summary });
    } catch (err: any) {
      // Re-throw so the queue marks the job failed and retries — a silent
      // success here would hide a recurring platform money leak.
      log.error("reclaim_canceled_numbers failed", { error: err?.message });
      throw err;
    }
  }

  if (job.type === "trial_ending_soon_email") {
    const p = job.payload as { userId: string; daysLeft: number };
    try {
      const [userRow] = await drizzle
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, p.userId))
        .limit(1);
      if (!userRow?.email) return;
      const appUrl = getCanonicalAppUrl();
      const { sendTrialEndingSoonEmail } = await import("./email-service");
      const result = await sendTrialEndingSoonEmail({
        userId: p.userId,
        to: userRow.email,
        daysLeft: p.daysLeft ?? 3,
        checkoutUrl: `${appUrl}/pricing`,
        idempotencyKey: `trial-ending-soon/${job.id}`,
      });
      if (!result.ok) {
        if (result.disposition === "suppressed") {
          log.info("trial_ending_soon_email suppressed", {
            userId: p.userId,
            reason: result.error,
          });
          return;
        }
        throw new Error(result.error || "Trial-ending email was not accepted");
      } else {
        log.info("trial_ending_soon_email sent", { userId: p.userId, daysLeft: p.daysLeft });
      }
    } catch (err: any) {
      log.error("trial_ending_soon_email job failed", { userId: p.userId, error: err?.message });
      throw err;
    }
  }

  if (job.type === "margin_at_risk_alert") {
    const { countAtRiskTenants, listAtRiskTenants } = await import("./tenant-economics");
    const { sendEmail } = await import("./email-service");
    const count = await countAtRiskTenants();
    if (count === 0) return;
    const top = await listAtRiskTenants(5);
    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail) throw new Error("OWNER_EMAIL is required for margin-at-risk alerts");
    const lines = top
      .map(
        (t) =>
          `• ${t.user_id.slice(0, 8)}… plan=${t.plan_id ?? "N/A"} margin=${t.gross_margin_pct ?? "n/a"}% overage=${t.overage_minutes}m`,
      )
      .join("\n");
    const result = await sendEmail({
      to: ownerEmail,
      subject: `[BotBound] ${count} tenant(s) at margin risk`,
      text: `${count} tenant(s) are below the margin safety threshold this month.\n\n${lines}`,
      html: `<p>${count} tenant(s) are below the margin safety threshold this month.</p><pre>${lines}</pre>`,
      idempotencyKey: `margin-at-risk/${job.id}`,
    });
    if (!result.ok) {
      throw new Error(result.error || "Margin-at-risk alert was not accepted");
    }
  }
}

/**
 * Initializes the background job worker.
 * Returns a stop function.
 */
export function initJobWorker(opts?: { dbReady?: boolean }) {
  if (process.env.VERCEL === "1") return null;
  if (opts?.dbReady === false) {
    log.warn("job worker skipped, database not connected");
    return null;
  }

  return startWorker(drizzle, handleJob, {
    pollIntervalMs: 10_000,
    onError: (err) =>
      log.error("job worker poll failed", {
        error: err.message,
        hint: "Check POSTGRES_URL and that wireline_jobs exists",
      }),
  });
}
