/**
 * Live-call reliability capture — staging tool/escalation counters and
 * inbound webhook health events before end-of-call-report finalizes callLogs.
 */
import { sql } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";

export type WebhookHealthOutcome = "success" | "rejected" | "error";

const PIPELINE_FAILURE_VALUES = new Set(["stt", "tts", "llm", "connection", "unknown"]);

/** True when pipeline_error holds a real pipeline failure (not a Vapi hangup reason). */
export function isPipelineFailure(pipelineError: string | null | undefined): boolean {
  if (!pipelineError) return false;
  return PIPELINE_FAILURE_VALUES.has(pipelineError.toLowerCase());
}

/** Vapi ended reasons that indicate an abnormal hangup (not a clean customer hangup). */
export function isAbnormalHangup(endedReason: string | null | undefined): boolean {
  if (!endedReason) return false;
  const lower = endedReason.toLowerCase();
  if (PIPELINE_FAILURE_VALUES.has(lower)) return true;
  return /error|timeout|failed|pipeline|machine|voicemail|busy|no-answer|unreachable/.test(lower);
}

const TOOL_FAILURE_PATTERNS = [
  /\bsomething went wrong running that action\b/i,
  /\btaking longer than expected\b/i,
  /\bmay still be processing\b/i,
  /\bisn['’]t available on this line\b/i,
  /\bwas not confirmed\b/i,
  /\bdid not complete successfully\b/i,
  /\bcouldn['’]t safely verify whether that action was already processed\b/i,
  /\bwas not scheduled because\b/i,
  /\bmessage was not confirmed\b/i,
  /\baction was already started\b/i,
] as const;

/** True when a speakable tool result indicates failure, timeout, or uncertain completion. */
export function isToolCallFailureResult(result: string): boolean {
  const text = result.trim();
  return TOOL_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

export async function recordInboundWebhookHealth(opts: {
  userId?: string | null;
  provider: string;
  eventType: string;
  outcome: WebhookHealthOutcome;
}): Promise<void> {
  try {
    await drizzle.insert(schema.webhookHealth).values({
      userId: opts.userId ?? null,
      provider: opts.provider,
      eventType: opts.eventType,
      outcome: opts.outcome,
    });
  } catch (err) {
    log.warn("recordInboundWebhookHealth failed", {
      provider: opts.provider,
      eventType: opts.eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function recordToolCallBatch(opts: {
  vapiCallId: string;
  userId: string;
  total: number;
  failed: number;
}): Promise<void> {
  if (!opts.vapiCallId || opts.total <= 0) return;
  try {
    const updated = await drizzle
      .update(schema.callLogs)
      .set({
        toolCallsTotal: sql`COALESCE(${schema.callLogs.toolCallsTotal}, 0) + ${opts.total}`,
        toolCallsFailed: sql`COALESCE(${schema.callLogs.toolCallsFailed}, 0) + ${opts.failed}`,
      })
      .where(sql`${schema.callLogs.vapiCallId} = ${opts.vapiCallId}`)
      .returning({ id: schema.callLogs.id });

    if (updated.length > 0) return;

    await drizzle
      .insert(schema.callReliabilityStaging)
      .values({
        vapiCallId: opts.vapiCallId,
        userId: opts.userId,
        toolCallsTotal: opts.total,
        toolCallsFailed: opts.failed,
      })
      .onConflictDoUpdate({
        target: schema.callReliabilityStaging.vapiCallId,
        set: {
          toolCallsTotal: sql`${schema.callReliabilityStaging.toolCallsTotal} + ${opts.total}`,
          toolCallsFailed: sql`${schema.callReliabilityStaging.toolCallsFailed} + ${opts.failed}`,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    log.warn("recordToolCallBatch failed", {
      vapiCallId: opts.vapiCallId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function recordEscalationOutcome(opts: {
  vapiCallId: string;
  userId: string;
  succeeded: boolean;
}): Promise<void> {
  if (!opts.vapiCallId) return;
  try {
    const patch = {
      escalationAttempted: true,
      escalationSucceeded: opts.succeeded,
    };

    const updated = await drizzle
      .update(schema.callLogs)
      .set(patch)
      .where(sql`${schema.callLogs.vapiCallId} = ${opts.vapiCallId}`)
      .returning({ id: schema.callLogs.id });

    if (updated.length > 0) return;

    await drizzle
      .insert(schema.callReliabilityStaging)
      .values({
        vapiCallId: opts.vapiCallId,
        userId: opts.userId,
        escalationAttempted: true,
        escalationSucceeded: opts.succeeded,
      })
      .onConflictDoUpdate({
        target: schema.callReliabilityStaging.vapiCallId,
        set: {
          escalationAttempted: true,
          escalationSucceeded: opts.succeeded,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    log.warn("recordEscalationOutcome failed", {
      vapiCallId: opts.vapiCallId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface StagedReliabilityMetrics {
  toolCallsTotal: number;
  toolCallsFailed: number;
  escalationAttempted: boolean;
  escalationSucceeded: boolean;
}

export async function takeStagedReliabilityMetrics(
  vapiCallId: string,
): Promise<StagedReliabilityMetrics | null> {
  if (!vapiCallId) return null;
  try {
    const [row] = await drizzle
      .select({
        toolCallsTotal: schema.callReliabilityStaging.toolCallsTotal,
        toolCallsFailed: schema.callReliabilityStaging.toolCallsFailed,
        escalationAttempted: schema.callReliabilityStaging.escalationAttempted,
        escalationSucceeded: schema.callReliabilityStaging.escalationSucceeded,
      })
      .from(schema.callReliabilityStaging)
      .where(sql`${schema.callReliabilityStaging.vapiCallId} = ${vapiCallId}`)
      .limit(1);

    if (!row) return null;

    await drizzle
      .delete(schema.callReliabilityStaging)
      .where(sql`${schema.callReliabilityStaging.vapiCallId} = ${vapiCallId}`);

    return row;
  } catch (err) {
    log.warn("takeStagedReliabilityMetrics failed", {
      vapiCallId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
