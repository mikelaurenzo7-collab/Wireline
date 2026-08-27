/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
/**
 * Vapi Webhook Queue Handler
 * ---------------------------------------------------------------------------
 * Processes Vapi webhooks asynchronously to prevent blocking and retries.
 *
 * Problem: Vapi webhooks timeout after ~5 seconds. If processing takes longer
 * (e.g., end-of-call report with AI analysis), Vapi retries, causing duplicate
 * processing and wasted resources.
 *
 * Solution: Queue non-time-sensitive webhook types for async processing.
 * Return 200 OK immediately for webhook delivery acknowledgment.
 *
 * Webhook types handled async:
 * - end-of-call-report: AI analysis, logging, webhooks (can take 10-30s)
 * - conversation-update: Sentiment analysis (can take 2-5s)
 * - status-update (ended): Cleanup tasks
 *
 * Webhook types handled sync (need immediate response):
 * - assistant-request: Must return assistant config immediately
 * - tool-calls: Must return tool results immediately
 * - status-update (in-progress/ringing): Real-time presence updates
 */

import type { JobRow } from "./job-queue";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { handleEndOfCallReport } from "./vapi-handlers";
import { getErrorMessage } from "./server-utils";
import { SENTIMENT_ANGRY_SIGNALS } from "./vapi-helpers";
import { runVapiExternalEffectsIfAllowed } from "./vapi-external-effect-policy";

export interface VapiWebhookPayload {
  message?: {
    type: string;
    [key: string]: any;
  };
  call?: {
    id?: string;
    customer?: { number?: string };
    status?: string;
  };
  [key: string]: any;
}

export interface VapiWebhookJobPayload {
  webhookType: string;
  payload: VapiWebhookPayload;
  agentId: string;
  userId: string;
  webhookAgentId: string;
}

/**
 * Queue a Vapi webhook for async processing
 * Returns true if queued, false if should be handled synchronously
 */
export function shouldQueueWebhook(webhookType: string): boolean {
  // These webhook types can be processed async
  const asyncTypes = [
    "end-of-call-report",
    "conversation-update",
    // Status updates for ended calls can be async
    // In-progress/ringing need to be sync for real-time presence
  ];
  return asyncTypes.includes(webhookType);
}

/**
 * Process a queued Vapi webhook job
 * This runs in the background worker
 */
export function resolveVapiWebhookType(
  stored: VapiWebhookJobPayload | Record<string, unknown>,
): string {
  if (typeof stored.webhookType === "string" && stored.webhookType.length > 0) {
    return stored.webhookType;
  }
  const nested = stored.payload as VapiWebhookPayload | undefined;
  return nested?.message?.type || "unknown";
}

export async function processVapiWebhookJob(job: JobRow): Promise<{
  webhookType: string;
  vapiCallId?: string;
}> {
  const payload = job.payload as unknown as VapiWebhookJobPayload;
  const webhookType = resolveVapiWebhookType(payload);
  const webhookPayload = payload.payload;
  const agentId = payload.agentId;
  const userId = payload.userId;

  log.info("Processing async Vapi webhook", {
    jobId: job.id,
    webhookType,
    agentId,
    userId,
  });

  try {
    switch (webhookType) {
      case "end-of-call-report": {
        // Process end-of-call report with AI analysis
        const message = webhookPayload.message;
        if (message) {
          await handleEndOfCallReport({
            message: message as any,
            agent: { id: agentId, user_id: userId },
          });
        }
        break;
      }

      case "conversation-update": {
        // Process conversation update (sentiment analysis)
        // This is already partially handled inline, but deep analysis can be async
        await processConversationUpdateAsync(webhookPayload, agentId, userId);
        break;
      }

      default:
        log.warn("Unknown async webhook type", { webhookType, jobId: job.id });
    }

    const vapiCallId =
      webhookPayload?.call?.id ||
      (webhookPayload?.message?.call as { id?: string } | undefined)?.id;

    log.info("Async Vapi webhook processed successfully", {
      jobId: job.id,
      webhookType,
      vapiCallId,
    });

    return { webhookType, vapiCallId };
  } catch (error) {
    log.error("Failed to process async Vapi webhook", {
      jobId: job.id,
      webhookType,
      error: getErrorMessage(error),
    });
    throw error; // Re-throw to trigger job retry
  }
}

/**
 * Async processing for conversation updates
 * Handles sentiment analysis and circuit breaker logic
 */
async function processConversationUpdateAsync(
  payload: VapiWebhookPayload,
  agentId: string,
  userId: string,
): Promise<void> {
  const message = payload.message;
  if (!message || message.type !== "conversation-update") return;

  const callId = payload.call?.id || (message.call as { id?: string } | undefined)?.id;
  if (!callId) return;

  const turns: any[] = message.conversation || message.messages || [];
  const userTurns = turns.filter((t: { role: string }) => t.role === "user").slice(-2);

  const combined = userTurns
    .map((t: { content?: string; message?: string }) =>
      (t.content || t.message || "").toLowerCase(),
    )
    .join(" ");

  const negativeHits = SENTIMENT_ANGRY_SIGNALS.filter((w) => combined.includes(w)).length;
  if (negativeHits < 1) return;

  await runVapiExternalEffectsIfAllowed({
    userId,
    action: "vapi_conversation_update_external_effects",
    perform: async () => {
      const { analyzeLiveSentiment } = await import("./gemini-brain");
      const result = await analyzeLiveSentiment(combined);

      if (result.escalate) {
        await drizzle
          .update(schema.signalPresence)
          .set({
            label: `🚨 Escalation Risk: ${result.reason}`,
          })
          .where(eq(schema.signalPresence.id, callId));

        const { NotificationService } = await import("./notifications");
        const notifier = new NotificationService(userId, agentId);
        await notifier.sendUrgentAlert({
          title: "High Escalation Risk Detected",
          message: `Live monitoring detected a high-stress situation: ${result.reason}`,
          callId: callId,
          metadata: { urgency: result.urgency },
        });

        log.warn("Circuit Breaker Tripped (async)", {
          callId,
          reason: result.reason,
          urgency: result.urgency,
        });
      }
    },
  });
}
