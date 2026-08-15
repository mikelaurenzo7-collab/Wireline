/* eslint-disable @typescript-eslint/no-explicit-any -- job and webhook payloads are stored as Postgres jsonb. */
import { log, quotaTracker, auditLogger, drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import * as claudeBrain from "./ai-brains";
import * as geminiBrain from "./gemini-brain";
import { getErrorMessage } from "./server-utils";
import { startWorker, type JobRow, enqueue } from "./job-queue";
import { executeAction } from "./action-engine";
import { ActionItemSchema } from "./action-types";
import { persistRuntimeAuditRecords } from "../middleware/audit-middleware";
import { buildCallCompletedOutcome, dispatchWebhook } from "./webhook-helpers";
import { CRMService } from "./crm-service";
import { apolloPlatformConfigured, searchLeads as apolloSearch } from "./apollo-service";
import { purgeAccount, releaseExternalResourcesForPurge } from "./account-deletion";
import { QA_SCORE_SOURCE_RUBRIC, qaRubricShouldRun } from "./qa-score-provenance";

type SupportedCrmType = "salesforce" | "hubspot";

function truncateForCrm(text: string | undefined, max = 1_500): string {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function buildCrmCallDescription(input: {
  agentName?: string;
  direction: "inbound" | "outbound";
  customerNumber?: string | null;
  durationSeconds?: number;
  summary?: string;
  leadScore?: number;
  intentLabel?: string;
  sentiment?: string;
}): string {
  const lines = [
    input.agentName ? `Agent: ${input.agentName}` : null,
    `Direction: ${input.direction}`,
    input.customerNumber ? `Customer number: ${input.customerNumber}` : null,
    typeof input.durationSeconds === "number" ? `Duration: ${input.durationSeconds}s` : null,
    input.intentLabel ? `Intent: ${input.intentLabel}` : null,
    input.sentiment ? `Sentiment: ${input.sentiment}` : null,
    typeof input.leadScore === "number" ? `Lead score: ${input.leadScore}` : null,
    input.summary ? `Summary: ${truncateForCrm(input.summary)}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

async function syncCallActivityToCrm(input: {
  userId: string;
  crmType?: string | null;
  agentName?: string;
  callId: string;
  direction: "inbound" | "outbound";
  customerNumber?: string | null;
  durationSeconds?: number;
  summary?: string;
  leadScore?: number;
  intentLabel?: string;
  sentiment?: string;
}) {
  if (!input.crmType || (input.crmType !== "salesforce" && input.crmType !== "hubspot")) return;
  if (!input.customerNumber) return;

  const crm = new CRMService(input.userId);
  const subjectSuffix = input.intentLabel ? ` - ${truncateForCrm(input.intentLabel, 80)}` : "";
  const activityId = await crm.logCall({
    crmType: input.crmType as SupportedCrmType,
    subject: `Wireline ${input.direction} call${subjectSuffix}`,
    description: buildCrmCallDescription(input),
    to_number: input.customerNumber,
    duration_minutes: input.durationSeconds
      ? Math.max(1, Math.round(input.durationSeconds / 60))
      : 0,
    outcome: input.intentLabel || "completed",
  });

  if (activityId) {
    log.info("Post-call CRM sync succeeded", {
      userId: input.userId,
      crmType: input.crmType,
      callId: input.callId,
      activityId,
    });

    if (input.leadScore != null) {
      void crm
        .syncEnrichedLead({
          customerNumber: input.customerNumber,
          leadScore: input.leadScore,
        })
        .catch((e) =>
          log.warn("Post-call lead score CRM sync failed", { error: getErrorMessage(e) }),
        );
    }

    return;
  }

  log.warn("Post-call CRM sync skipped or failed", {
    userId: input.userId,
    crmType: input.crmType,
    callId: input.callId,
  });
}

async function persistJobResult(jobId: string, result: Record<string, unknown>): Promise<void> {
  await drizzle
    .update(schema.jobs)
    .set({ result, updatedAt: new Date() })
    .where(eq(schema.jobs.id, jobId));
}

/**
 * Global job handler.
 * Dispatches jobs from the wireline_jobs table.
 */
export async function handleJob(job: JobRow): Promise<void> {
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

    // Check user tier for model selection
    const [settings] = await drizzle
      .select({ aiTier: schema.settings.aiTier, crmType: schema.settings.crmType })
      .from(schema.settings)
      .where(eq(schema.settings.userId, p.userId))
      .limit(1);
    const useFlash = p.useFlash || settings?.aiTier === "starter";

    let result;
    let records: any[] = [];

    if (useFlash) {
      log.info("Using Gemini Flash for post-call enrichment", {
        userId: p.userId,
        callId: p.callId,
      });
      const capture = await claudeBrain.withAuditCapture(() =>
        geminiBrain.postCallAnalysis({
          transcript: p.transcript!,
          summary: p.summary || "",
        }),
      );
      result = capture.result;
      records = capture.records;
    } else {
      if (!claudeBrain.isBrainAvailable() || !p.transcript) return;
      const capture = await claudeBrain.withAuditCapture(() =>
        claudeBrain.postCallAnalysis({
          agentName: p.agentName || "Wireline Agent",
          archetype: p.archetype || "Receptionist",
          role: p.role,
          customerNumber: p.customerNumber,
          durationSeconds: p.durationSeconds ?? 0,
          summary: p.summary || "",
          transcript: p.transcript!,
        }),
      );
      result = capture.result;
      records = capture.records;
    }

    await drizzle
      .update(schema.callLogs)
      .set({
        leadScore: result.lead_score,
        intentLabel: result.intent_label,
        sentiment: result.sentiment,
        coachingNote: result.coaching_note,
      })
      .where(eq(schema.callLogs.vapiCallId, p.callId));

    if (result.lesson?.trim()) {
      await drizzle
        .insert(schema.agentLessons)
        .values({
          agentId: p.agentId,
          userId: p.userId,
          lesson: result.lesson.trim(),
          sourceCallId: p.callId,
          source: "phone_call",
        })
        .onConflictDoNothing({
          target: [schema.agentLessons.agentId, schema.agentLessons.lesson],
        });
    }

    if (records.length) {
      await persistRuntimeAuditRecords({
        userId: p.userId,
        action: "jobs.post_call_enrichment",
        records,
        requestMeta: { vapi_call_id: p.callId, agent_id: p.agentId },
      }).catch((e: unknown) =>
        log.warn("post_call audit persist failed", { error: getErrorMessage(e) }),
      );
    } else {
      const tokenCount = Math.ceil(((p.transcript?.length ?? 0) + (p.summary?.length ?? 0)) / 4);
      await quotaTracker
        .checkAndIncrement(p.userId, "claude_tokens_daily", Math.max(1, tokenCount))
        .catch((e: unknown) => {
          log.warn("quota token increment failed — usage may be under-counted", {
            user_id: p.userId,
            error: getErrorMessage(e),
          });
        });
    }

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
    const enrichment = {
      lead_score: result.lead_score,
      intent_label: result.intent_label,
      sentiment: result.sentiment,
      coaching_note: result.coaching_note,
      lesson_extracted: !!(result.lesson && result.lesson.trim()),
    };
    const payload = buildCallCompletedOutcome({
      vapi_call_id: p.callId,
      agent_id: p.agentId,
      customer_number: logRow?.customerNumber || p.customerNumber || null,
      direction,
      duration_seconds: p.durationSeconds,
      enrichment_source: "async_post_call_job",
      enrichment,
    });
    await syncCallActivityToCrm({
      userId: p.userId,
      crmType: settings?.crmType,
      agentName: p.agentName,
      callId: p.callId,
      direction,
      customerNumber: payload.customer_number,
      durationSeconds: p.durationSeconds,
      summary: p.summary,
      leadScore: result.lead_score,
      intentLabel: result.intent_label,
      sentiment: result.sentiment,
    }).catch((e: unknown) =>
      log.warn("post_call CRM sync failed", {
        userId: p.userId,
        callId: p.callId,
        error: getErrorMessage(e),
      }),
    );
    dispatchWebhook(p.userId, "call.completed", payload).catch((e: unknown) =>
      log.error("webhook dispatch failed", {
        userId: p.userId,
        event: "call.completed",
        error: getErrorMessage(e),
      }),
    );
    if (typeof result.lead_score === "number" && result.lead_score >= 70) {
      dispatchWebhook(p.userId, "lead.hot", {
        vapi_call_id: p.callId,
        lead_score: result.lead_score,
        customer_number: payload.customer_number,
      }).catch((e: unknown) =>
        log.error("webhook dispatch failed", {
          userId: p.userId,
          event: "lead.hot",
          error: getErrorMessage(e),
        }),
      );
    }
    const intent = (result.intent_label || "").toLowerCase();
    if (intent === "escalation" || intent === "escalate") {
      dispatchWebhook(p.userId, "call.escalated", {
        vapi_call_id: p.callId,
        intent_label: result.intent_label,
        customer_number: payload.customer_number,
      }).catch((e: unknown) =>
        log.error("webhook dispatch failed", {
          userId: p.userId,
          event: "call.escalated",
          error: getErrorMessage(e),
        }),
      );
    }

    // Automatically enqueue action extraction after enrichment
    await enqueue(drizzle, {
      userId: p.userId,
      type: "v2a_action_extraction",
      payload: {
        userId: p.userId,
        callId: p.callId,
        summary: p.summary,
        transcript: p.transcript,
        customerNumber: p.customerNumber,
      },
    }).catch((e) => log.error("Failed to enqueue V2A extraction", { error: getErrorMessage(e) }));
  }

  if (job.type === "v2a_action_extraction") {
    const p = job.payload as {
      userId: string;
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

    for (const action of actions) {
      await enqueue(drizzle, {
        userId: p.userId,
        type: "execute_action",
        payload: {
          userId: p.userId,
          action,
          context: { sourceId: p.callId, sourceType: "phone_call" },
        },
      });
    }
    log.info("V2A extraction complete", {
      userId: p.userId,
      callId: p.callId,
      actionsCount: actions.length,
    });
  }

  if (job.type === "execute_action") {
    const p = job.payload as {
      userId: string;
      action: any;
      context: { sourceId: string; sourceType: string };
    };

    const parsed = ActionItemSchema.safeParse(p.action);
    if (!parsed.success) {
      log.error("Invalid action payload", { userId: p.userId, error: parsed.error });
      return;
    }

    await executeAction(p.userId, parsed.data, p.context);
  }

  if (job.type === "adaptive_optimization") {
    const p = job.payload as {
      agentId: string;
      userId: string;
      callId: string;
      score: number;
      breakdown: any;
    };

    const [call] = await drizzle
      .select({ transcript: schema.callLogs.transcript })
      .from(schema.callLogs)
      .where(eq(schema.callLogs.id, BigInt(p.callId)))
      .limit(1);
    if (!call?.transcript) return;

    const lesson = await claudeBrain.synthesizeLesson({
      transcript: call.transcript,
      score: p.score,
      breakdown: p.breakdown,
    });

    if (lesson) {
      await drizzle
        .insert(schema.agentLessons)
        .values({
          agentId: p.agentId,
          userId: p.userId,
          lesson: lesson,
          sourceCallId: p.callId,
          source: "adaptive_tuning",
        })
        .onConflictDoNothing({
          target: [schema.agentLessons.agentId, schema.agentLessons.lesson],
        });
      log.info("Adaptive optimization: new lesson synthesized", { agentId: p.agentId, lesson });
    }
  }

  if (job.type === "purge_old_data") {
    const p = job.payload as { user_id: string; retention_days?: number };
    if (!p.user_id) {
      log.warn("purge_old_data job missing user_id", { jobId: job.id });
      return;
    }
    const retentionDays = typeof p.retention_days === "number" ? p.retention_days : 365;
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

    // Guard: the queue row must still be 'pending' AND past its
    // scheduled_purge_at. If the user cancelled in the grace window, skip.
    let queueRow: any = null;
    if (p.queue_id) {
      const [data] = await drizzle
        .select()
        .from(schema.deletionQueue)
        .where(eq(schema.deletionQueue.id, p.queue_id))
        .limit(1);
      queueRow = data;
    } else {
      const [data] = await drizzle
        .select()
        .from(schema.deletionQueue)
        .where(
          and(
            eq(schema.deletionQueue.userId, p.user_id),
            eq(schema.deletionQueue.status, "pending"),
          ),
        )
        .limit(1);
      queueRow = data;
    }

    if (!queueRow || queueRow.status !== "pending") {
      log.info("purge_deleted_account skipped — no pending queue row", {
        jobId: job.id,
        user_id: p.user_id,
      });
      return;
    }
    if (new Date(queueRow.scheduledPurgeAt).getTime() > Date.now()) {
      log.info("purge_deleted_account skipped — still within grace window", {
        jobId: job.id,
        user_id: p.user_id,
        scheduled_purge_at: queueRow.scheduledPurgeAt,
      });
      return;
    }

    // Tear down PAID external resources (Stripe subscriptions, Twilio/Vapi
    // numbers) BEFORE the irreversible row purge — once purgeAccount deletes
    // wireline_subscriptions/wireline_phone_numbers we lose the ids forever.
    // A hard Stripe failure throws here so the job retries instead of purging
    // a still-billing subscription; number-release failures are logged only.
    const release = await releaseExternalResourcesForPurge(p.user_id, { db: drizzle, log });
    log.info("purge_deleted_account external release", {
      jobId: job.id,
      user_id: p.user_id,
      subscriptions_canceled: release.subscriptionsCanceled,
      numbers_released: release.numbersReleased,
      number_errors: release.numberErrors.length,
      oauth_attempted: release.oauthAttempted,
      oauth_revoked: release.oauthRevoked,
    });

    const result = await purgeAccount(p.user_id, { db: drizzle, log });
    if (!result.ok) {
      log.error("purge_deleted_account failed", {
        jobId: job.id,
        user_id: p.user_id,
        error: result.error,
      });
      throw new Error(result.error ?? "account purge failed");
    }

    // Audit BEFORE marking the queue row purged so the audit row is still
    // owned by a (now-deleted) user — historical record of the action.
    void auditLogger
      .logAccountDeletion({
        userId: p.user_id,
        tablesTouched: result.tablesTouched,
        ip: queueRow.ip ?? undefined,
      })
      .catch(() => {});

    // Mark the queue row purged. The FK ON DELETE CASCADE from auth.users
    // would have already removed it when the auth row was deleted, so this
    // update may affect zero rows — that's fine.
    await drizzle
      .update(schema.deletionQueue)
      .set({ status: "purged", purgedAt: new Date() })
      .where(eq(schema.deletionQueue.id, queueRow.id));

    log.info("purge_deleted_account completed", {
      jobId: job.id,
      user_id: p.user_id,
      tables_touched: result.tablesTouched.length,
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
    const p = job.payload as { userId: string };
    const [settings] = await drizzle
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.userId, p.userId))
      .limit(1);

    if (!settings?.prospectingEnabled) {
      log.info("Prospecting disabled for user", { userId: p.userId });
      await persistJobResult(job.id, {
        skipped: true,
        reason: "prospecting_disabled",
        leadsFound: 0,
        leadsAdded: 0,
      });
      return;
    }

    const apolloReady = apolloPlatformConfigured();
    log.info("Starting autonomous prospecting", {
      userId: p.userId,
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
      p.userId,
    );

    let added = 0;
    for (const lead of leads) {
      try {
        await drizzle.insert(schema.outboundLeads).values({
          userId: p.userId,
          customerName: `${lead.first_name} ${lead.last_name}`,
          customerNumber: lead.phone,
          email: lead.email,
          status: "New",
          context: `Autonomously sourced via Apollo Intelligence for ${lead.title} role at ${lead.company}.`,
        });
        added++;
      } catch {
        void 0; /* ignore duplicate lead / constraint violations */
      }
    }

    await persistJobResult(job.id, {
      leadsFound: leads.length,
      leadsAdded: added,
      apolloReady: true,
    });

    log.info("Autonomous prospecting complete", {
      userId: p.userId,
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
      throw new Error("Claude is not configured — cannot crawl URL for knowledge.");
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
    const { processVapiWebhookJob } = await import("./vapi-webhook-queue");
    const result = await processVapiWebhookJob(job);
    await persistJobResult(job.id, {
      webhookType: result.webhookType,
      vapiCallId: result.vapiCallId ?? null,
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
    const p = job.payload as { callLogId: number | string; userId: string };
    if (!claudeBrain.isBrainAvailable()) {
      log.warn("auto_qa_score skipped — claude unavailable", { callLogId: p.callLogId });
      return;
    }

    // Safe-parse the callLogId — BigInt() throws on malformed input which
    // would crash the worker. Skip the job cleanly instead.
    let callLogIdBig: bigint;
    try {
      callLogIdBig = BigInt(p.callLogId as any);
    } catch {
      log.warn("auto_qa_score skipped — unparseable callLogId", { callLogId: p.callLogId });
      return;
    }

    const [call] = await drizzle
      .select({
        id: schema.callLogs.id,
        agentId: schema.callLogs.agentId,
        summary: schema.callLogs.summary,
        transcript: schema.callLogs.transcript,
        sentiment: schema.callLogs.sentiment,
        direction: schema.callLogs.direction,
        durationSeconds: schema.callLogs.durationSeconds,
        qaScore: schema.callLogs.qaScore,
        qaBreakdown: schema.callLogs.qaBreakdown,
        agentRole: schema.agents.role,
      })
      .from(schema.callLogs)
      .leftJoin(schema.agents, eq(schema.callLogs.agentId, schema.agents.id))
      .where(eq(schema.callLogs.id, callLogIdBig))
      .limit(1);

    if (!call || !call.transcript) {
      log.info("auto_qa_score skipped — no call or transcript", { callLogId: p.callLogId });
      return;
    }

    // Idempotency: skip only if the RUBRIC has already scored this call (e.g.
    // Vapi retried end-of-call-report and the job ran twice).
    //
    // This used to test `call.qaScore != null`, which was always true: the Vapi
    // end-of-call handler writes a provisional heuristic score on every single
    // call before this job is even enqueued. So the guard fired every time, the
    // five-dimension rubric never ran once, the score account holders read as a
    // quality assessment was a regex over the coaching note, and the
    // `adaptive_optimization` job that low rubric scores chain into — the whole
    // agent-learning loop — was unreachable.
    if (!qaRubricShouldRun(call.qaBreakdown)) {
      log.info("auto_qa_score skipped — rubric already scored", { callLogId: p.callLogId });
      return;
    }

    // Cost gate: skip auto-QA on calls under 30s — those are almost always
    // unreachable / voicemail / wrong-number and carry no coachable
    // signal. Saves a Claude call per dead-call without losing learning.
    if ((call.durationSeconds || 0) < 30) {
      log.info("auto_qa_score skipped — call too short for useful coaching", {
        callLogId: p.callLogId,
        durationSeconds: call.durationSeconds,
      });
      return;
    }

    try {
      const breakdown = await claudeBrain.qaScore({
        direction: (call.direction || "inbound") as "inbound" | "outbound",
        agentRole: call.agentRole || undefined,
        summary: call.summary || "",
        transcript: call.transcript || "",
        sentiment: call.sentiment || "neutral",
        durationSeconds: call.durationSeconds || 0,
      });
      const QA_DIMS = ["greeting", "discovery", "solution", "objection", "closing"] as const;
      const score = Math.min(
        100,
        Math.max(
          0,
          QA_DIMS.reduce((s, d) => s + (Number((breakdown as any)[d]) || 0), 0),
        ),
      );

      const updates: any = {
        qaScore: score,
        // Stamped so the guard above can tell a completed rubric from the
        // provisional heuristic the end-of-call handler leaves behind.
        qaBreakdown: { ...(breakdown as any), source: QA_SCORE_SOURCE_RUBRIC },
      };
      if ((breakdown as any)?.coaching_note)
        updates.coachingNote = (breakdown as any).coaching_note;
      await drizzle
        .update(schema.callLogs)
        .set(updates)
        .where(eq(schema.callLogs.id, callLogIdBig));

      if (score < 60 && call.agentId) {
        await enqueue(drizzle, {
          userId: p.userId,
          type: "adaptive_optimization",
          payload: { agentId: call.agentId, callId: String(call.id), score, breakdown },
        });
      }

      log.info("auto_qa_score completed", { callLogId: p.callLogId, score });
    } catch (err: any) {
      log.error("auto_qa_score failed", { callLogId: p.callLogId, error: err?.message });
      // Re-throw so the queue actually retries. Swallowing marked the job done
      // on the first Claude hiccup, and with it went the call's QA score, its
      // coaching note, and the adaptive_optimization job that low scores chain
      // into — the whole agent-learning loop, silently, with no dead letter to
      // notice. The rubric-provenance guard above makes a retry that lands
      // after a late success a no-op, so this is safe to hand back to the
      // existing backoff and dead-letter path.
      throw err;
    }
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
      const appUrl = (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
      const { sendTrialEndingSoonEmail } = await import("./email-service");
      const result = await sendTrialEndingSoonEmail({
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

  if (job.type === "demo_line_canary") {
    const { runDemoLineCanary } = await import("./demo-line-canary");
    const result = await runDemoLineCanary();
    await drizzle
      .update(schema.jobs)
      .set({
        result: { allHealthy: result.allHealthy, timestamp: result.timestamp },
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id));
    log.info("demo_line_canary job completed", {
      jobId: job.id,
      allHealthy: result.allHealthy,
      alertSent: result.alertSent,
      unhealthy: result.lines.filter((l) => !l.numberOk || !l.assistantOk).length,
    });
    if (!result.allHealthy && !result.alertSent) {
      // If alert failed to send, let the job retry
      throw new Error("Canary detected failures but could not deliver alert");
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
          `• ${t.user_id.slice(0, 8)}… plan=${t.plan_id ?? "—"} margin=${t.gross_margin_pct ?? "n/a"}% overage=${t.overage_minutes}m`,
      )
      .join("\n");
    const result = await sendEmail({
      to: ownerEmail,
      subject: `[Wireline] ${count} tenant(s) at margin risk`,
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
    log.warn("job worker skipped — database not connected");
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
