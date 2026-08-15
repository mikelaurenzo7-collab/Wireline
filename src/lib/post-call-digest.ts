/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
/**
 * Post-call operating system — what fires after every completed Vapi call.
 *
 * Mandatory internal work:
 *   1. Classify and persist the outcome and campaign attribution.
 *   2. Write one idempotent structured post-call note tied to the call log.
 *   3. Update outbound lead state, activation, CRM, QA, learning, and action extraction.
 *
 * User-controlled external work:
 *   4. Append the structured result to a selected Google Sheet / Excel workbook.
 *   5. Queue a polished artifact only when the Account Holder explicitly enabled it.
 *   6. Send owner digest and optional CSAT when configured.
 *
 * Raw files are not retained here. Optional artifact jobs must write the generated
 * file to the tenant's selected connected destination and retain only metadata/linkage.
 */

import { and, eq, sql } from "drizzle-orm";

import { BRAND } from "../constants/brand-colors";
import * as schema from "../db/schema";
import { withAccountDeletionFence } from "./account-deletion-fence";
import { executeAction } from "./action-engine";
import { CRMService } from "./crm-service";
import { sendEmail } from "./email-service";
import { type JobRow, writeTransactionConfig } from "./job-queue";
import { isLaunchHardBlocked } from "./launch-readiness";
import {
  getPostCallOutputPreferences,
  shouldGeneratePostCallArtifact,
  type PostCallOutputPreferences,
} from "./post-call-output-preferences";
import { requiresSalesApprovalForIntegration } from "./sales-integration-policy";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { maybePublishCallRecap } from "./shareable-artifact/publish-call-recap";
import { sanitizePhone } from "./vapi-helpers";
import { emitServerProductEventOnce } from "./product-event-server";
import { ProviderSpendPausedError } from "./provider-spend-job-pause";

export type CallOutcomeTag =
  "booked" | "qualified" | "followup" | "dnc" | "unreachable" | "info" | "other";

export function classifyCallOutcome(input: {
  summary?: string | null;
  sentiment?: string | null;
  intentLabel?: string | null;
  durationSeconds?: number | null;
  endedReason?: string | null;
}): CallOutcomeTag {
  const ended = (input.endedReason || "").toLowerCase();
  if (
    ended.includes("silence-timed-out") ||
    ended.includes("voicemail") ||
    ended.includes("machine-detected") ||
    ended.includes("customer-busy") ||
    ended.includes("no-answer") ||
    ended.includes("customer-did-not-answer")
  ) {
    return "unreachable";
  }
  const s = `${input.summary || ""} ${input.intentLabel || ""}`.toLowerCase();
  if (/\b(unsubscribe|stop|do not call|remove me|dnc)\b/.test(s)) return "dnc";
  if (/\b(voicemail|no answer|busy|wrong number|disconnected)\b/.test(s)) return "unreachable";
  if ((input.durationSeconds ?? 0) < 8) return "unreachable";
  if (/\b(booked|scheduled|appointment|demo confirmed|meeting set)\b/.test(s)) return "booked";
  if (/\b(qualified|interested|hot lead|budget|good fit)\b/.test(s)) return "qualified";
  if (/\b(callback|follow.?up|call.?back|reach out later|next week)\b/.test(s)) return "followup";
  if (/\b(question|info|how does|pricing|what is)\b/.test(s)) return "info";
  return "other";
}

async function resolveCampaignSource(
  userId: string,
  dialedNumber: string | null | undefined,
): Promise<string | null> {
  if (!dialedNumber) return null;
  const e164 = sanitizePhone(dialedNumber) || dialedNumber;
  const [row] = await drizzle
    .select({ campaignLabel: schema.phoneNumbers.campaignLabel })
    .from(schema.phoneNumbers)
    .where(and(eq(schema.phoneNumbers.phoneNumber, e164), eq(schema.phoneNumbers.userId, userId)))
    .limit(1);
  return row?.campaignLabel || null;
}

export interface CallContext {
  userId: string;
  callLogId: bigint | number | string;
  agentId?: string | null;
  dialedNumber?: string | null;
  customerNumber?: string | null;
  customerName?: string | null;
  agentName?: string | null;
  direction?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  transcript?: string | null;
  sentiment?: string | null;
  intentLabel?: string | null;
  endedReason?: string | null;
  vapiCallType?: string | null;
  demo?: boolean;
  vapiCallId?: string | null;
}

type JsonCallContext = Pick<
  CallContext,
  "userId" | "dialedNumber" | "customerName" | "agentName" | "vapiCallType"
> & { callLogId: string };

export type PostCallDigestCoreResult = {
  outcomeTag: CallOutcomeTag;
  campaignSource: string | null;
  noteRecorded: boolean;
  spreadsheetDestinations: string[];
  artifactQueued: boolean;
  crmLogged: boolean;
  crmQueuedForApproval: boolean;
  recapUrl: string | null;
};

type PostCallDeliveryProgress = {
  core?: { state: "completed"; result: PostCallDigestCoreResult };
  effects?: Partial<{
    googleSheets: PostCallEffectProgress<{ written: boolean }>;
    microsoftExcel: PostCallEffectProgress<{ written: boolean }>;
    artifact: PostCallEffectProgress<{ queued: boolean }>;
    crm: PostCallEffectProgress<{ logged: boolean; queuedForApproval: boolean }>;
    recap: PostCallEffectProgress<{ url: string | null }>;
    autoQa: PostCallEffectProgress<{ queued: boolean }>;
    mobilePush: PostCallEffectProgress<{ sent: number; devices: number }>;
  }>;
  email?: {
    state: "accepted" | "suppressed" | "skipped";
    providerId?: string;
    reason?: string;
  };
  csat?: {
    state:
      | "attempting"
      | "accepted"
      | "skipped"
      | "provider_rejected"
      | "provider_ambiguous"
      | "provider_failed";
    providerSid?: string;
    reason?: string;
    reservationAttempt?: number;
  };
};

type PostCallEffectProgress<T> =
  { state: "attempting" } | { state: "completed"; result: T; reason?: string };

type PostCallEffectResultMap = {
  googleSheets: { written: boolean };
  microsoftExcel: { written: boolean };
  artifact: { queued: boolean };
  crm: { logged: boolean; queuedForApproval: boolean };
  recap: { url: string | null };
  autoQa: { queued: boolean };
  mobilePush: { sent: number; devices: number };
};

type PostCallEffectName = keyof PostCallEffectResultMap;

export type PostCallEffectDecision = "claim" | "retry" | "reuse" | "reconcile_without_replay";

/**
 * Provider APIs used by optional post-call integrations do not all expose an
 * idempotency key. A durable pre-provider claim makes each individual effect
 * at-most-once, while a completed result is safely reusable across email/CSAT
 * retries. An interrupted provider claim is reconciled conservatively instead
 * of replaying a possibly accepted operation. Local child-job enqueues opt into
 * retry only when a database uniqueness key makes replay idempotent.
 */
export function decidePostCallEffect(
  progress: { state?: string } | null | undefined,
  options: { retrySafe?: boolean } = {},
): PostCallEffectDecision {
  if (progress?.state === "completed") return "reuse";
  if (progress?.state === "attempting" && options.retrySafe) return "retry";
  if (progress?.state === "attempting") return "reconcile_without_replay";
  return "claim";
}

/** Execute the three durable boundaries of one post-call effect attempt. */
export async function executePostCallEffectAttempt<T>(input: {
  checkpointAttempting: () => Promise<void>;
  perform: () => Promise<T>;
  checkpointCompleted: (result: T) => Promise<void>;
}): Promise<T> {
  await input.checkpointAttempting();
  const result = await input.perform();
  await input.checkpointCompleted(result);
  return result;
}

export function classifyPostCallCsatFailure(result: {
  code?: string;
  providerOutcomeAmbiguous?: boolean;
}): "provider_rejected" | "provider_ambiguous" {
  return result.providerOutcomeAmbiguous || result.code === "SMS_PROVIDER_OUTCOME_AMBIGUOUS"
    ? "provider_ambiguous"
    : "provider_rejected";
}

type PostCallCsatRetryProgress = Pick<
  NonNullable<PostCallDeliveryProgress["csat"]>,
  "state" | "reason"
> | null;

/**
 * Resolve a worker interruption around the CSAT provider boundary before a new
 * send is allowed. An `attempting` phase alone is ambiguous: provider
 * acceptance may have committed while the worker lost its response. The exact
 * attempt-scoped refund ledger entry is the only safe replay proof.
 */
export async function runAfterPostCallCsatRetryGate<T>(input: {
  progress: PostCallCsatRetryProgress;
  hasDurableRefund: () => Promise<boolean>;
  checkpointRetryable: () => Promise<void>;
  perform: () => Promise<T>;
}): Promise<T> {
  if (input.progress?.state === "attempting") {
    if (!(await input.hasDurableRefund())) {
      throw new Error(
        `Post-call CSAT requires provider reconciliation after an at-most-once attempt: ${input.progress.reason || input.progress.state}`,
      );
    }
    // If this checkpoint fails, no provider work starts. The next durable retry
    // reads the same refund proof and safely repeats only this transition.
    await input.checkpointRetryable();
  } else if (
    input.progress?.state === "provider_ambiguous" ||
    input.progress?.state === "provider_failed"
  ) {
    throw new Error(
      `Post-call CSAT requires provider reconciliation after an at-most-once attempt: ${input.progress.reason || input.progress.state}`,
    );
  }

  return input.perform();
}

function jsonCallContext(ctx: CallContext): JsonCallContext {
  // Call logs remain the authoritative copy of transcript, summary, caller
  // number, outcome, and duration. Keep only the few provider labels absent
  // from that table so the queue does not become a second transcript archive.
  return {
    userId: ctx.userId,
    callLogId: String(ctx.callLogId),
    dialedNumber: ctx.dialedNumber || null,
    customerName: ctx.customerName || null,
    agentName: ctx.agentName || null,
    vapiCallType: ctx.vapiCallType || null,
  };
}

function jobOwnerId(job: JobRow): string {
  const shaped = job as unknown as { userId?: string; user_id?: string };
  return String(shaped.userId || shaped.user_id || "");
}

function jobAttempt(job: JobRow): number {
  return Number((job as unknown as { attempts?: number }).attempts || 0);
}

class PostCallTerminalStop extends Error {
  constructor(readonly reason: string) {
    super(`Post-call delivery stopped terminally: ${reason}`);
    this.name = "PostCallTerminalStop";
  }
}

async function withPostCallExternalFence<T>(
  ctx: Pick<CallContext, "userId" | "callLogId">,
  perform: () => Promise<T>,
): Promise<T> {
  let callLogId: bigint;
  try {
    callLogId = BigInt(ctx.callLogId as any);
  } catch {
    throw new Error(`Post-call external fence received an invalid callLogId: ${ctx.callLogId}`);
  }

  return drizzle.transaction(
    (tx) =>
      withAccountDeletionFence(tx, ctx.userId, async () => {
        const [eligible] = await tx
          .select({ id: schema.callLogs.id })
          .from(schema.callLogs)
          .innerJoin(schema.users, eq(schema.users.id, schema.callLogs.userId))
          .where(
            and(
              eq(schema.callLogs.id, callLogId),
              eq(schema.callLogs.userId, ctx.userId),
              sql`NOT EXISTS (
                SELECT 1
                FROM ${schema.deletionQueue}
                WHERE ${schema.deletionQueue.userId} = ${ctx.userId}
                  AND (
                    ${schema.deletionQueue.status} = 'purging'
                    OR (
                      ${schema.deletionQueue.status} = 'pending'
                      AND (
                        ${schema.deletionQueue.scheduledPurgeAt} IS NULL
                        OR ${schema.deletionQueue.scheduledPurgeAt} <= now()
                      )
                    )
                  )
              )`,
            ),
          )
          .limit(1);
        if (!eligible) throw new PostCallTerminalStop("account_or_call_erased_or_purge_due");
        return perform();
      }),
    writeTransactionConfig(),
  );
}

/**
 * Enqueue exactly one durable post-call workflow for a tenant call. Migration
 * 0150 is the concurrency boundary; onConflictDoNothing makes every webhook
 * redelivery adopt the index winner without turning duplicate delivery into a
 * failed Vapi job.
 */
export async function enqueuePostCallDigest(
  ctx: CallContext,
): Promise<{ jobId: string; deduplicated: boolean }> {
  const payload = jsonCallContext(ctx);
  const [created] = await drizzle
    .insert(schema.jobs)
    .values({
      userId: ctx.userId,
      type: "post_call_digest",
      status: "pending",
      payload,
      attempts: 0,
      maxAttempts: 5,
      runAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: schema.jobs.id });
  if (created) return { jobId: created.id, deduplicated: false };

  const [existing] = await drizzle
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, ctx.userId),
        eq(schema.jobs.type, "post_call_digest"),
        sql`${schema.jobs.payload}->>'callLogId' = ${payload.callLogId}`,
      ),
    )
    .limit(1);
  if (!existing) {
    throw new Error("Post-call digest enqueue conflicted without an adoptable queue row.");
  }
  return { jobId: existing.id, deduplicated: true };
}

async function ensureStructuredPostCallNote(
  ctx: CallContext,
  outcomeTag: CallOutcomeTag,
  campaignSource: string | null,
): Promise<boolean> {
  const sourceId = String(ctx.callLogId);
  return drizzle.transaction(async (tx) => {
    // Queue claims are attempt-fenced, but stale recovery can briefly overlap
    // an old and new worker. Serialize the read/insert per tenant call so that
    // overlap cannot create two internal notes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.userId}:${sourceId}`}))`);
    const [existing] = await tx
      .select({ id: schema.followUpTasks.id })
      .from(schema.followUpTasks)
      .where(
        and(
          eq(schema.followUpTasks.userId, ctx.userId),
          eq(schema.followUpTasks.sourceType, "call_log"),
          eq(schema.followUpTasks.sourceId, sourceId),
          eq(schema.followUpTasks.taskType, "post_call_note"),
        ),
      )
      .limit(1);
    if (existing) return true;

    const nextAction = nextActionFromOutcome(outcomeTag);
    await tx.insert(schema.followUpTasks).values({
      userId: ctx.userId,
      agentId: ctx.agentId || null,
      sourceType: "call_log",
      sourceId,
      targetChannel: "internal",
      taskType: "post_call_note",
      status: "completed",
      priority: outcomeTag === "qualified" || outcomeTag === "booked" ? "high" : "medium",
      description: `${outcomeTag.toUpperCase()} · ${ctx.customerName || ctx.customerNumber || "Caller"}`,
      resolutionNotes: ctx.summary || "No provider summary was captured.",
      customerInfo: {
        name: ctx.customerName || null,
        phone: ctx.customerNumber || null,
      },
      payload: {
        outcome: outcomeTag,
        summary: ctx.summary || null,
        next_action: nextAction,
        sentiment: ctx.sentiment || null,
        intent: ctx.intentLabel || null,
        campaign_source: campaignSource,
        direction: ctx.direction || null,
        duration_seconds: ctx.durationSeconds || 0,
        provider_call_id: ctx.vapiCallId || null,
        transcript_available: Boolean(ctx.transcript),
      },
    });
    return true;
  });
}

function spreadsheetDetails(
  ctx: CallContext,
  outcomeTag: CallOutcomeTag,
  campaignSource: string | null,
): string {
  return [
    ctx.summary || "No summary captured.",
    `Next: ${nextActionFromOutcome(outcomeTag)}`,
    ctx.sentiment ? `Sentiment: ${ctx.sentiment}` : null,
    ctx.intentLabel ? `Intent: ${ctx.intentLabel}` : null,
    campaignSource ? `Campaign: ${campaignSource}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function writeGoogleSheetsOutput(
  ctx: CallContext,
  outcomeTag: CallOutcomeTag,
  campaignSource: string | null,
): Promise<boolean> {
  const caller = ctx.customerName || ctx.customerNumber || "Unknown caller";
  const details = spreadsheetDetails(ctx, outcomeTag, campaignSource);
  const durationMinutes = Math.max(1, Math.ceil((ctx.durationSeconds || 0) / 60));
  try {
    const { logToGoogleSheets } = await import("./google-sheets-service");
    return await logToGoogleSheets({
      userId: ctx.userId,
      caller,
      outcome: outcomeTag,
      details,
      agentName: ctx.agentName || undefined,
      durationMinutes,
    });
  } catch (err: any) {
    log.warn("post-call digest: Google Sheets export failed", { error: err?.message });
    return false;
  }
}

async function writeMicrosoftExcelOutput(
  ctx: CallContext,
  outcomeTag: CallOutcomeTag,
  campaignSource: string | null,
): Promise<boolean> {
  const caller = ctx.customerName || ctx.customerNumber || "Unknown caller";
  const details = spreadsheetDetails(ctx, outcomeTag, campaignSource);
  try {
    const { logToExcel } = await import("./microsoft-graph-service");
    return await logToExcel({ userId: ctx.userId, caller, outcome: outcomeTag, details });
  } catch (err: any) {
    log.warn("post-call digest: Microsoft Excel export failed", { error: err?.message });
    return false;
  }
}

type PostCallChildJobType = "post_call_artifact" | "auto_qa_score";

/**
 * Retry-safe child enqueue. The partial unique index in migration 0150 makes a
 * lost response after commit adopt the existing child row instead of creating
 * a duplicate artifact or QA run.
 */
async function enqueuePostCallChildJob(input: {
  parentJob: JobRow;
  userId: string;
  type: PostCallChildJobType;
  payload: Record<string, unknown>;
}): Promise<void> {
  const payload = { ...input.payload, postCallDigestJobId: input.parentJob.id };
  const [created] = await drizzle
    .insert(schema.jobs)
    .values({
      userId: input.userId,
      type: input.type,
      status: "pending",
      payload,
      attempts: 0,
      maxAttempts: 5,
      runAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: schema.jobs.id });
  if (created) return;

  const [existing] = await drizzle
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, input.userId),
        eq(schema.jobs.type, input.type),
        sql`${schema.jobs.payload}->>'postCallDigestJobId' = ${input.parentJob.id}`,
      ),
    )
    .limit(1);
  if (!existing) {
    throw new Error(`Post-call ${input.type} enqueue conflicted without an adoptable child job.`);
  }
}

async function queueSelectedArtifact(
  job: JobRow,
  ctx: CallContext,
  outcomeTag: CallOutcomeTag,
  campaignSource: string | null,
  preferences: PostCallOutputPreferences,
): Promise<boolean> {
  if (!shouldGeneratePostCallArtifact(preferences)) return false;
  await enqueuePostCallChildJob({
    parentJob: job,
    userId: ctx.userId,
    type: "post_call_artifact",
    payload: {
      userId: ctx.userId,
      callLogId: String(ctx.callLogId),
      providerCallId: ctx.vapiCallId || null,
      agentId: ctx.agentId || null,
      agentName: ctx.agentName || null,
      customerName: ctx.customerName || null,
      customerNumber: ctx.customerNumber || null,
      direction: ctx.direction || null,
      durationSeconds: ctx.durationSeconds || 0,
      outcomeTag,
      summary: ctx.summary || null,
      transcript: ctx.transcript || null,
      sentiment: ctx.sentiment || null,
      intentLabel: ctx.intentLabel || null,
      campaignSource,
      format: preferences.artifact_format,
      destination: preferences.artifact_destination,
    },
  });
  return true;
}

export async function runPostCallDigest(ctx: CallContext): Promise<PostCallDigestCoreResult> {
  const outcomeTag = classifyCallOutcome({
    summary: ctx.summary,
    sentiment: ctx.sentiment,
    intentLabel: ctx.intentLabel,
    durationSeconds: ctx.durationSeconds,
    endedReason: ctx.endedReason,
  });
  const campaignSource = await resolveCampaignSource(ctx.userId, ctx.dialedNumber);

  let callLogIdBig: bigint;
  try {
    callLogIdBig = BigInt(ctx.callLogId as any);
  } catch {
    throw new Error(`Post-call digest received an invalid callLogId: ${String(ctx.callLogId)}`);
  }

  const [persistedCall] = await drizzle
    .update(schema.callLogs)
    .set({ outcomeTag, campaignSource })
    .where(and(eq(schema.callLogs.id, callLogIdBig), eq(schema.callLogs.userId, ctx.userId)))
    .returning({ id: schema.callLogs.id });
  if (!persistedCall) {
    throw new PostCallTerminalStop("call_erased_before_core_checkpoint");
  }
  emitServerProductEventOnce({
    event: "outcome_recorded",
    userId: ctx.userId,
    agentId: ctx.agentId ?? undefined,
    metadata: {
      call_log_id: callLogIdBig.toString(),
      outcome: outcomeTag,
      direction: ctx.direction ?? null,
    },
  });

  const noteRecorded = await ensureStructuredPostCallNote(ctx, outcomeTag, campaignSource);

  // Keep tenant-local state in the replay-safe core. Every operation here is
  // idempotent (or internally fail-soft) and can be retried if the core
  // checkpoint itself is interrupted.
  if (ctx.direction === "outbound") {
    try {
      const { updateLeadStatusOnCallEnd } = await import("./outbound-call-tracking");
      await updateLeadStatusOnCallEnd(
        ctx.userId,
        ctx.customerNumber || "",
        outcomeTag,
        ctx.vapiCallId,
      );
    } catch (err: any) {
      log.warn("post-call digest: lead status update failed", { error: err?.message });
    }
  }

  try {
    const { maybeRecordTenantActivation } = await import("./tenant-activation");
    await maybeRecordTenantActivation({
      userId: ctx.userId,
      callLogId: callLogIdBig,
      call: {
        demo: ctx.demo,
        vapiCallType: ctx.vapiCallType,
        direction: ctx.direction,
        customerNumber: ctx.customerNumber,
        durationSeconds: ctx.durationSeconds,
        transcript: ctx.transcript,
        summary: ctx.summary,
        sentiment: ctx.sentiment,
        intentLabel: ctx.intentLabel,
        endedReason: ctx.endedReason,
        outcomeTag,
        agentId: ctx.agentId ?? null,
      },
    });
  } catch (err: any) {
    log.warn("post-call digest: activation check failed", { error: err?.message });
  }

  log.info("Post-call replay-safe core completed", {
    userId: ctx.userId,
    callLogId: String(ctx.callLogId),
    outcomeTag,
    campaignSource,
    noteRecorded,
  });

  return {
    outcomeTag,
    campaignSource,
    noteRecorded,
    spreadsheetDestinations: [],
    artifactQueued: false,
    crmLogged: false,
    crmQueuedForApproval: false,
    recapUrl: null,
  };
}

async function syncPostCallCrm(
  ctx: CallContext,
  outcomeTag: CallOutcomeTag,
): Promise<{ logged: boolean; queuedForApproval: boolean }> {
  try {
    const [settings] = await drizzle
      .select({
        crmType: schema.settings.crmType,
        autonomyLevel: schema.settings.autonomyLevel,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, ctx.userId))
      .limit(1);

    let agentRole: string | null = null;
    if (ctx.agentId) {
      const [agent] = await drizzle
        .select({ role: schema.agents.role })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, ctx.agentId), eq(schema.agents.userId, ctx.userId)))
        .limit(1);
      agentRole = agent?.role ?? null;
    }

    if (settings?.crmType !== "hubspot" && settings?.crmType !== "salesforce") {
      return { logged: false, queuedForApproval: false };
    }

    const crmPayload = {
      subject: `${ctx.direction === "outbound" ? "Outbound" : "Inbound"} call — ${outcomeTag}`,
      description: ctx.summary || "(no summary)",
      to_number: ctx.customerNumber || "",
      duration_minutes: Math.round((ctx.durationSeconds || 0) / 60),
      outcome: outcomeTag,
      crm_type: settings.crmType,
    };

    if (
      requiresSalesApprovalForIntegration({
        agentRole,
        autonomyLevel: settings.autonomyLevel,
        actionType: "update_crm_lead",
      })
    ) {
      const queued = await executeAction(
        ctx.userId,
        {
          type: "update_crm_lead",
          priority: "medium",
          payload: crmPayload,
          agentId: ctx.agentId || undefined,
          reasoning: `Post-call CRM note for ${outcomeTag} outcome`,
        },
        { sourceId: String(ctx.callLogId), sourceType: "call_log" },
        "draft",
      );
      return { logged: false, queuedForApproval: !!(queued.success && queued.queued) };
    }

    const crm = new CRMService(ctx.userId);
    const logId = await crm.logCall({
      crmType: settings.crmType,
      subject: crmPayload.subject,
      description: crmPayload.description,
      to_number: crmPayload.to_number,
      duration_minutes: crmPayload.duration_minutes,
      outcome: outcomeTag,
    });
    return { logged: !!logId, queuedForApproval: false };
  } catch (err: any) {
    log.warn("post-call digest: CRM log failed", { error: err?.message });
    return { logged: false, queuedForApproval: false };
  }
}

async function publishPostCallRecap(
  ctx: CallContext,
  core: PostCallDigestCoreResult,
): Promise<string | null> {
  try {
    const recap = await maybePublishCallRecap({
      userId: ctx.userId,
      agentId: ctx.agentId ?? null,
      agentName: ctx.agentName ?? null,
      callLogId: ctx.callLogId,
      customerName: ctx.customerName ?? null,
      customerNumber: ctx.customerNumber ?? null,
      direction: ctx.direction ?? null,
      durationSeconds: ctx.durationSeconds ?? null,
      summary: ctx.summary ?? null,
      transcript: ctx.transcript ?? null,
      sentiment: ctx.sentiment ?? null,
      intentLabel: ctx.intentLabel ?? null,
      outcomeTag: core.outcomeTag,
      campaignSource: core.campaignSource,
      startedAtIso: new Date().toISOString(),
    });
    return recap?.url ?? null;
  } catch (err: any) {
    log.warn("post-call digest: recap publish failed", { error: err?.message });
    return null;
  }
}

async function queuePostCallAutoQa(job: JobRow, ctx: CallContext): Promise<boolean> {
  await enqueuePostCallChildJob({
    parentJob: job,
    userId: ctx.userId,
    type: "auto_qa_score",
    payload: { callLogId: String(ctx.callLogId), userId: ctx.userId },
  });
  return true;
}

async function sendPostCallMobilePush(
  ctx: CallContext,
): Promise<{ sent: number; devices: number }> {
  try {
    const { notifyCallRecap } = await import("./mobile-push");
    return await notifyCallRecap(ctx.userId, {
      callId: ctx.vapiCallId || String(ctx.callLogId),
      agentName: ctx.agentName || null,
      fromNumber: ctx.customerNumber || null,
      summary: ctx.summary || null,
    });
  } catch (err: any) {
    log.warn("post-call digest: mobile recap push failed", { error: err?.message });
    return { sent: 0, devices: 0 };
  }
}

function asProgress(value: unknown): PostCallDeliveryProgress {
  return value && typeof value === "object" ? (value as PostCallDeliveryProgress) : {};
}

async function readPostCallProgress(
  job: JobRow,
  userId: string,
): Promise<PostCallDeliveryProgress> {
  const [row] = await drizzle
    .select({ result: schema.jobs.result })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.userId, userId)))
    .limit(1);
  if (!row) throw new PostCallTerminalStop("queue_row_erased");
  return asProgress(row.result);
}

async function checkpointPostCallProgress(
  job: JobRow,
  userId: string,
  patch: Partial<PostCallDeliveryProgress>,
): Promise<PostCallDeliveryProgress> {
  const current = await readPostCallProgress(job, userId);
  const next = { ...current, ...patch };
  const [updated] = await drizzle
    .update(schema.jobs)
    .set({ result: next, updatedAt: new Date() })
    .where(
      and(
        eq(schema.jobs.id, job.id),
        eq(schema.jobs.userId, userId),
        eq(schema.jobs.status, "running"),
        eq(schema.jobs.attempts, jobAttempt(job)),
      ),
    )
    .returning({ id: schema.jobs.id });
  if (!updated) {
    throw new Error("Post-call digest progress write lost its active worker attempt fence.");
  }
  return next;
}

async function runClaimedPostCallEffect<K extends PostCallEffectName>(
  job: JobRow,
  ctx: CallContext,
  progress: PostCallDeliveryProgress,
  effect: K,
  fallback: PostCallEffectResultMap[K],
  perform: () => Promise<PostCallEffectResultMap[K]>,
  options: { retrySafe?: boolean } = {},
): Promise<{ progress: PostCallDeliveryProgress; result: PostCallEffectResultMap[K] }> {
  const userId = ctx.userId;
  const existing = progress.effects?.[effect] as
    PostCallEffectProgress<PostCallEffectResultMap[K]> | undefined;
  const decision = decidePostCallEffect(existing, options);
  if (decision === "reuse" && existing?.state === "completed") {
    return { progress, result: existing.result };
  }

  if (decision === "reconcile_without_replay") {
    log.warn("Post-call optional effect was interrupted after its at-most-once claim", {
      jobId: job.id,
      userId,
      effect,
    });
    const effects = {
      ...progress.effects,
      [effect]: {
        state: "completed" as const,
        result: fallback,
        reason: "worker_interrupted_after_claim",
      },
    };
    const reconciled = await checkpointPostCallProgress(job, userId, { effects });
    return { progress: reconciled, result: fallback };
  }

  return withPostCallExternalFence(ctx, async () => {
    let result!: PostCallEffectResultMap[K];
    await executePostCallEffectAttempt({
      // Claim only after the deletion fence is acquired and the live user/call
      // check succeeds. A lock/query/checkpoint failure is therefore a definite
      // pre-provider failure and remains safely retryable.
      checkpointAttempting: async () => {
        progress = await checkpointPostCallProgress(job, userId, {
          effects: {
            ...progress.effects,
            [effect]: { state: "attempting" as const },
          },
        });
      },
      perform: async () => {
        result = await perform();
        return result;
      },
      checkpointCompleted: async (completed) => {
        progress = await checkpointPostCallProgress(job, userId, {
          effects: {
            ...progress.effects,
            [effect]: { state: "completed" as const, result: completed },
          },
        });
      },
    });
    return { progress, result };
  });
}

async function authoritativeCallContext(job: JobRow): Promise<CallContext> {
  const ownerId = jobOwnerId(job);
  const payload = job.payload as unknown as Partial<JsonCallContext>;
  if (!ownerId || payload.userId !== ownerId) {
    throw new Error("Post-call digest job is missing a valid tenant owner.");
  }

  let callLogId: bigint;
  try {
    callLogId = BigInt(String(payload.callLogId || ""));
  } catch {
    throw new Error("Post-call digest job contains an invalid callLogId.");
  }

  const [call] = await drizzle
    .select({
      id: schema.callLogs.id,
      agentId: schema.callLogs.agentId,
      agentName: schema.agents.name,
      customerNumber: schema.callLogs.customerNumber,
      direction: schema.callLogs.direction,
      durationSeconds: schema.callLogs.durationSeconds,
      summary: schema.callLogs.summary,
      transcript: schema.callLogs.transcript,
      sentiment: schema.callLogs.sentiment,
      intentLabel: schema.callLogs.intentLabel,
      endedReason: schema.callLogs.endedReason,
      demo: schema.callLogs.demo,
      vapiCallId: schema.callLogs.vapiCallId,
    })
    .from(schema.callLogs)
    .leftJoin(
      schema.agents,
      and(eq(schema.callLogs.agentId, schema.agents.id), eq(schema.agents.userId, ownerId)),
    )
    .where(and(eq(schema.callLogs.id, callLogId), eq(schema.callLogs.userId, ownerId)))
    .limit(1);
  if (!call) throw new PostCallTerminalStop("account_or_call_erased");

  return {
    userId: ownerId,
    callLogId: call.id,
    agentId: call.agentId,
    dialedNumber: payload.dialedNumber || null,
    customerNumber: call.customerNumber,
    customerName: payload.customerName || null,
    agentName: call.agentName || payload.agentName || null,
    direction: call.direction,
    durationSeconds: call.durationSeconds,
    summary: call.summary,
    transcript: call.transcript,
    sentiment: call.sentiment,
    intentLabel: call.intentLabel,
    endedReason: call.endedReason,
    vapiCallType: payload.vapiCallType || null,
    demo: call.demo,
    vapiCallId: call.vapiCallId,
  };
}

async function deliverOwnerDigest(
  job: JobRow,
  ctx: CallContext,
  core: PostCallDigestCoreResult,
  progress: PostCallDeliveryProgress,
): Promise<PostCallDeliveryProgress> {
  if (progress.email) return progress;

  return withPostCallExternalFence(ctx, async () => {
    const recipient = await pickAccountHolderEmail(ctx.userId);
    if (!recipient) {
      return checkpointPostCallProgress(job, ctx.userId, {
        email: { state: "skipped", reason: "no_account_holder_email" },
      });
    }

    const view = {
      ...ctx,
      outcomeTag: core.outcomeTag,
      campaignSource: core.campaignSource,
      crmLogged: core.crmLogged,
      crmQueuedForApproval: core.crmQueuedForApproval,
      recapUrl: core.recapUrl,
    };
    const subject = `[Wireline · ${core.outcomeTag.toUpperCase()}] ${ctx.agentName || "Agent"} → ${ctx.customerName || ctx.customerNumber || "caller"}`;
    const sent = await sendEmail({
      to: recipient,
      subject,
      text: renderDigestEmailText(view),
      // This is already escaped, branded HTML. Passing it directly avoids the
      // connected-mailbox plain-text wrapper that rendered tags to customers.
      html: renderDigestEmail(view),
      idempotencyKey: `post-call-digest/${job.id}`,
    });
    if (sent.disposition === "suppressed") {
      return checkpointPostCallProgress(job, ctx.userId, {
        email: { state: "suppressed", reason: sent.error || "provider_suppressed" },
      });
    }
    if (!sent.ok) {
      throw new Error(sent.error || "Post-call owner email was not accepted by Resend.");
    }
    return checkpointPostCallProgress(job, ctx.userId, {
      email: { state: "accepted", ...(sent.id ? { providerId: sent.id } : {}) },
    });
  });
}

async function deliverPostCallCsat(
  job: JobRow,
  ctx: CallContext,
  core: PostCallDigestCoreResult,
  progress: PostCallDeliveryProgress,
): Promise<PostCallDeliveryProgress> {
  if (progress.csat?.state === "accepted" || progress.csat?.state === "skipped") {
    return progress;
  }

  if (
    !ctx.customerNumber ||
    core.outcomeTag === "unreachable" ||
    core.outcomeTag === "dnc" ||
    (ctx.durationSeconds ?? 0) <= 30
  ) {
    return checkpointPostCallProgress(job, ctx.userId, {
      csat: { state: "skipped", reason: "call_not_eligible" },
    });
  }
  const customerNumber = ctx.customerNumber;

  return withPostCallExternalFence(ctx, async () => {
    const idempotencyKey = `post-call-csat/${job.id}`;
    const reservationAttempt = Math.max(1, jobAttempt(job));
    const interruptedAttempt =
      progress.csat?.reservationAttempt ?? Math.max(1, reservationAttempt - 1);
    const [{ hasDurableTenantMessageAttemptRefund }, csatService] = await Promise.all([
      import("./twilio-service"),
      import("./csat-service"),
    ]);
    return runAfterPostCallCsatRetryGate({
      progress: progress.csat ?? null,
      hasDurableRefund: () =>
        hasDurableTenantMessageAttemptRefund({
          userId: ctx.userId,
          idempotencyKey,
          reservationAttempt: interruptedAttempt,
          channel: "sms",
        }),
      checkpointRetryable: async () => {
        await checkpointPostCallProgress(job, ctx.userId, {
          csat: {
            state: "provider_rejected",
            reason: "durable_refund_proves_provider_did_not_accept",
            reservationAttempt: interruptedAttempt,
          },
        });
      },
      perform: async () => {
        const prepared = await csatService.preparePostCallCsatSms({
          userId: ctx.userId,
          customerNumber,
          agentName: ctx.agentName,
          callLogId: String(ctx.callLogId),
        });
        if (!prepared.ready) {
          return checkpointPostCallProgress(job, ctx.userId, {
            csat: { state: "skipped", reason: prepared.reason },
          });
        }

        await csatService.reconcilePriorPostCallCsatReservations(prepared.message, {
          idempotencyKey,
          currentAttempt: reservationAttempt,
        });

        let providerAttemptClaimed = false;
        let result: Awaited<ReturnType<typeof csatService.sendPreparedPostCallCsatSms>>;
        try {
          result = await csatService.sendPreparedPostCallCsatSms(prepared.message, {
            idempotencyKey,
            reservationAttempt,
            beforeProviderAttempt: async () => {
              await checkpointPostCallProgress(job, ctx.userId, {
                csat: { state: "attempting", reservationAttempt },
              });
              providerAttemptClaimed = true;
            },
          });
        } catch (error) {
          if (providerAttemptClaimed) {
            await checkpointPostCallProgress(job, ctx.userId, {
              csat: {
                state: "provider_ambiguous",
                reason: getErrorMessage(error),
                reservationAttempt,
              },
            }).catch((checkpointError) =>
              log.error("Post-call CSAT failure checkpoint failed", {
                jobId: job.id,
                error: getErrorMessage(checkpointError),
              }),
            );
          }
          throw error;
        }

        if (!result.sent) {
          if (!providerAttemptClaimed) {
            return checkpointPostCallProgress(job, ctx.userId, {
              csat: { state: "skipped", reason: result.reason || "provider_not_started" },
            });
          }
          const state = classifyPostCallCsatFailure(result);
          await checkpointPostCallProgress(job, ctx.userId, {
            csat: {
              state,
              reason: result.reason || "provider_send_failed",
              reservationAttempt,
            },
          });
          throw new Error(result.reason || "Twilio did not accept the post-call CSAT SMS.");
        }
        if (!providerAttemptClaimed) {
          throw new Error("Twilio accepted CSAT without the durable at-most-once claim.");
        }
        return checkpointPostCallProgress(job, ctx.userId, {
          csat: {
            state: "accepted",
            ...(result.providerSid ? { providerSid: result.providerSid } : {}),
            reservationAttempt,
          },
        });
      },
    });
  });
}

async function handleActivePostCallDigestJob(job: JobRow): Promise<void> {
  const ctx = await authoritativeCallContext(job);
  let progress = await readPostCallProgress(job, ctx.userId);
  let core = progress.core?.result || null;
  if (!core) {
    core = await withPostCallExternalFence(ctx, () => runPostCallDigest(ctx));
    progress = await checkpointPostCallProgress(job, ctx.userId, {
      core: { state: "completed", result: core },
    });
  }
  const coreBase = core;

  // Outcome, notes, activation prerequisites, and local classifications must
  // continue during a launch hold. Pause only the customer-facing providers,
  // and do so attempt-neutrally through the queue's typed settlement path.
  if (isLaunchHardBlocked()) {
    throw new ProviderSpendPausedError("post_call_digest_notifications");
  }

  const outputPreferences = await getPostCallOutputPreferences(ctx.userId);

  const googleSheets = await runClaimedPostCallEffect(
    job,
    ctx,
    progress,
    "googleSheets",
    { written: false },
    async () => ({
      written:
        outputPreferences.spreadsheet_destination === "google_sheets" ||
        outputPreferences.spreadsheet_destination === "both"
          ? await writeGoogleSheetsOutput(ctx, coreBase.outcomeTag, coreBase.campaignSource)
          : false,
    }),
  );
  progress = googleSheets.progress;
  const spreadsheetDestinations: string[] = googleSheets.result.written ? ["google_sheets"] : [];

  const microsoftExcel = await runClaimedPostCallEffect(
    job,
    ctx,
    progress,
    "microsoftExcel",
    { written: false },
    async () => ({
      written:
        outputPreferences.spreadsheet_destination === "microsoft_excel" ||
        outputPreferences.spreadsheet_destination === "both"
          ? await writeMicrosoftExcelOutput(ctx, coreBase.outcomeTag, coreBase.campaignSource)
          : false,
    }),
  );
  progress = microsoftExcel.progress;
  if (microsoftExcel.result.written) spreadsheetDestinations.push("microsoft_excel");

  const artifact = await runClaimedPostCallEffect(
    job,
    ctx,
    progress,
    "artifact",
    { queued: false },
    async () => ({
      queued: await queueSelectedArtifact(
        job,
        ctx,
        coreBase.outcomeTag,
        coreBase.campaignSource,
        outputPreferences,
      ),
    }),
    { retrySafe: true },
  );
  progress = artifact.progress;

  const crm = await runClaimedPostCallEffect(
    job,
    ctx,
    progress,
    "crm",
    { logged: false, queuedForApproval: false },
    () => syncPostCallCrm(ctx, coreBase.outcomeTag),
  );
  progress = crm.progress;

  const recap = await runClaimedPostCallEffect(
    job,
    ctx,
    progress,
    "recap",
    { url: null },
    async () => ({ url: await publishPostCallRecap(ctx, coreBase) }),
  );
  progress = recap.progress;

  const autoQa = await runClaimedPostCallEffect(
    job,
    ctx,
    progress,
    "autoQa",
    { queued: false },
    async () => ({ queued: await queuePostCallAutoQa(job, ctx) }),
    { retrySafe: true },
  );
  progress = autoQa.progress;

  const mobilePush = await runClaimedPostCallEffect(
    job,
    ctx,
    progress,
    "mobilePush",
    { sent: 0, devices: 0 },
    () => sendPostCallMobilePush(ctx),
  );
  progress = mobilePush.progress;

  core = {
    ...coreBase,
    spreadsheetDestinations,
    artifactQueued: artifact.result.queued,
    crmLogged: crm.result.logged,
    crmQueuedForApproval: crm.result.queuedForApproval,
    recapUrl: recap.result.url,
  };
  // This aggregate checkpoint is safe to retry: every optional effect has its
  // own completed/attempting record, so a late database error cannot replay a
  // Sheets append, CRM write, recap publish, QA enqueue, or push notification.
  progress = await checkpointPostCallProgress(job, ctx.userId, {
    core: { state: "completed", result: core },
  });

  progress = await deliverOwnerDigest(job, ctx, core, progress);
  progress = await deliverPostCallCsat(job, ctx, core, progress);
  log.info("Post-call customer follow-up completed", {
    jobId: job.id,
    userId: ctx.userId,
    callLogId: String(ctx.callLogId),
    email: progress.email?.state || "unknown",
    csat: progress.csat?.state || "unknown",
  });
}

/** Durable worker entrypoint; every unexpected failure reaches queue retry/dead-letter. */
export async function handlePostCallDigestJob(job: JobRow): Promise<void> {
  try {
    await handleActivePostCallDigestJob(job);
  } catch (error) {
    if (error instanceof PostCallTerminalStop) {
      log.info("Post-call delivery stopped at the account-deletion fence", {
        jobId: job.id,
        userId: jobOwnerId(job),
        reason: error.reason,
      });
      return;
    }
    throw error;
  }
}

export async function resolveAccountHolderEmail(
  connectedMailbox: () => Promise<string | null | undefined>,
  loginEmail: () => Promise<string | null | undefined>,
): Promise<string | null> {
  const connected = (await connectedMailbox())?.trim();
  if (connected) return connected;
  return (await loginEmail())?.trim() || null;
}

export async function pickAccountHolderEmail(userId: string): Promise<string | null> {
  return resolveAccountHolderEmail(
    async () => {
      const [acct] = await drizzle
        .select({ emailAddress: schema.emailAccounts.emailAddress })
        .from(schema.emailAccounts)
        .where(eq(schema.emailAccounts.userId, userId))
        .limit(1);
      return acct?.emailAddress;
    },
    async () => {
      // A connected mailbox is optional. The authentication email is the
      // durable account-holder identity and keeps first-call digests working
      // before OAuth.
      const [user] = await drizzle
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      return user?.email;
    },
  );
}

function crmDigestStatusLine(crmLogged: boolean, crmQueuedForApproval: boolean): string {
  if (crmLogged) return "Logged to your CRM.";
  if (crmQueuedForApproval) return "CRM note queued for approval in your Approval Inbox.";
  return "No CRM connected — connect HubSpot or Salesforce to auto-log.";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderDigestEmail(d: {
  agentName?: string | null;
  customerName?: string | null;
  customerNumber?: string | null;
  direction?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  sentiment?: string | null;
  outcomeTag: string;
  campaignSource: string | null;
  crmLogged: boolean;
  crmQueuedForApproval?: boolean;
  recapUrl?: string | null;
}): string {
  const dur = Math.round((d.durationSeconds || 0) / 60);
  const next = nextActionFromOutcome(d.outcomeTag);
  const identity = `${d.outcomeTag.toUpperCase()} — ${d.agentName || "Agent"} → ${d.customerName || d.customerNumber || "caller"}`;
  const metadata = `${d.direction || "Call"} · ${dur} min · ${d.sentiment || "neutral"} sentiment${d.campaignSource ? ` · Campaign: ${d.campaignSource}` : ""}`;
  const recapBlock = d.recapUrl
    ? `<p style="margin:0 0 24px;">
        <a href="${escapeHtml(d.recapUrl)}" style="display:inline-block;background:${BRAND.colors.primary};color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;letter-spacing:0.02em;">Open the recap →</a>
        <span style="display:block;margin-top:8px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8B87A0;">Shareable Wireline recap · private link</span>
      </p>`
    : "";
  return [
    `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;line-height:1.55;color:#1a1a1a;">`,
    `<p style="font-size:11px;text-transform:uppercase;letter-spacing:.3em;color:${BRAND.colors.primary};margin:0 0 4px;">Wireline · Post-call digest</p>`,
    `<h2 style="margin:0 0 8px;font-size:22px;font-style:italic;font-weight:500;">${escapeHtml(identity)}</h2>`,
    `<p style="margin:0 0 16px;font-size:13px;color:#666;">${escapeHtml(metadata)}</p>`,
    `<div style="background:#f7f7f9;border-radius:12px;padding:14px 16px;margin:0 0 16px;font-size:14px;">${escapeHtml(d.summary || "(no summary captured)").replace(/\n/g, "<br/>")}</div>`,
    recapBlock,
    `<p style="margin:0 0 6px;font-size:13px;"><strong>Next action:</strong> ${escapeHtml(next)}</p>`,
    `<p style="margin:0 0 16px;font-size:12px;color:#666;">${escapeHtml(crmDigestStatusLine(d.crmLogged, d.crmQueuedForApproval ?? false))}</p>`,
    `<p style="margin:24px 0 0;font-size:12px;color:#888;">Open the call <a href="https://trywireline.com/phone?tab=logs" style="color:${BRAND.colors.primary};text-decoration:none;">in Wireline →</a></p>`,
    `</div>`,
  ].join("");
}

export function renderDigestEmailText(d: {
  agentName?: string | null;
  customerName?: string | null;
  customerNumber?: string | null;
  direction?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  sentiment?: string | null;
  outcomeTag: string;
  campaignSource: string | null;
  crmLogged: boolean;
  crmQueuedForApproval?: boolean;
  recapUrl?: string | null;
}): string {
  const durationMinutes = Math.round((d.durationSeconds || 0) / 60);
  return [
    "Wireline · Post-call digest",
    "",
    `${d.outcomeTag.toUpperCase()} — ${d.agentName || "Agent"} → ${d.customerName || d.customerNumber || "caller"}`,
    `${d.direction || "Call"} · ${durationMinutes} min · ${d.sentiment || "neutral"} sentiment${d.campaignSource ? ` · Campaign: ${d.campaignSource}` : ""}`,
    "",
    d.summary || "(no summary captured)",
    "",
    `Next action: ${nextActionFromOutcome(d.outcomeTag)}`,
    crmDigestStatusLine(d.crmLogged, d.crmQueuedForApproval ?? false),
    d.recapUrl ? `Recap: ${d.recapUrl}` : null,
    "Open the call: https://trywireline.com/phone?tab=logs",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function nextActionFromOutcome(tag: string): string {
  switch (tag) {
    case "booked":
      return "Verify the calendar confirmation, attach prep notes, and assign the meeting owner.";
    case "qualified":
      return "Route to the closer or schedule a demo within 48 hours while intent is current.";
    case "followup":
      return "Create or confirm the promised callback and preserve the reason and timing.";
    case "dnc":
      return "Confirm the number is suppressed from all future outreach.";
    case "unreachable":
      return "Review retry policy and voicemail settings before another attempt.";
    case "info":
      return "Review the unanswered question and add verified guidance to the agent's Training tab.";
    default:
      return "Review the transcript, confirm the outcome, and assign any required follow-up.";
  }
}
