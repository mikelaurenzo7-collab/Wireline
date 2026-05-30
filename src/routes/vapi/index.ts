/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi webhook/tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import express from "express";
import { and, eq } from "drizzle-orm";

import * as claudeBrain from "../../lib/claude-brain";
import * as schema from "../../db/schema";
import { enqueue } from "../../lib/job-queue";
import { claimLeadEnrichmentSlot } from "../../lib/enrichment-debounce";
import { drizzle, IS_PROD, log } from "../../lib/server-context";
import { getErrorMessage } from "../../lib/server-utils";
import {
  buildShowcaseAssistantPayload,
  findShowcaseAgentByPayload,
} from "../../lib/showcase-assistant";
import { buildVapiAssistant } from "../../lib/vapi-assistant-factory";
import { normalizeVapiToolCalls } from "../../lib/vapi-tool-call-utils";
import {
  SENTIMENT_ANGRY_SIGNALS,
  SENTIMENT_POSITIVE_SIGNALS,
  timingSafeEq,
  VAPI_WEBHOOK_SECRET,
} from "../../lib/vapi-helpers";
import { handleEndOfCallReport } from "../../lib/vapi-handlers";
import { shouldQueueWebhook } from "../../lib/vapi-webhook-queue";
import { resolveVapiWebhookAgent } from "../../lib/vapi-webhook-agent";

import { handleCalendarToolCall } from "./tool-handlers-calendar";
import { handleCoreToolCall } from "./tool-handlers-core";
import { handleEnrichmentToolCall } from "./tool-handlers-enrichment";
import { handleNotificationToolCall } from "./tool-handlers-notifications";
import { handleShopifyToolCall } from "./tool-handlers-shopify";
import { handleSquareToolCall } from "./tool-handlers-square";
import { handleWorkflowToolCall } from "./tool-handlers-workflow";
import { handleShowcaseToolCalls } from "./showcase-handlers";
import type { ToolCallContext, ToolCallResult } from "./types";

const router = express.Router();
let _warnedAboutVapiSecret = false;

async function dispatchToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult> {
  const handlers = [
    handleCoreToolCall,
    handleCalendarToolCall,
    handleEnrichmentToolCall,
    handleNotificationToolCall,
    handleWorkflowToolCall,
    handleShopifyToolCall,
    handleSquareToolCall,
  ];

  for (const handler of handlers) {
    const result = await handler(fn, args, context);
    if (result) return result;
  }

  return {
    toolCallId: context.toolCallId,
    result: "That action isn't available on this line right now. Help the caller another way.",
  };
}

router.post("/api/vapi-webhook", async (req: express.Request, res: express.Response) => {
  const provided =
    (req.headers["x-vapi-secret"] as string | undefined) ||
    (req.headers["x-vapi-signature"] as string | undefined) ||
    "";

  if (!process.env.VAPI_WEBHOOK_SECRET) {
    if (IS_PROD) {
      log.error("VAPI_WEBHOOK_SECRET unset in production — rejecting webhook");
      return res.status(503).json({ error: "Webhook auth not configured." });
    }
    if (!_warnedAboutVapiSecret) {
      log.warn("VAPI_WEBHOOK_SECRET unset — accepting all webhook requests (dev only)");
      _warnedAboutVapiSecret = true;
    }
  } else if (!timingSafeEq(provided, VAPI_WEBHOOK_SECRET)) {
    // Include ip + signature prefix for abuse pattern detection
    // (volume probing, replay attacks). Bounded leak — the prefix
    // alone is not enough to reconstruct the secret.
    log.warn("Rejected Vapi webhook with bad/missing signature", {
      ip: req.ip,
      sig_prefix: provided ? provided.slice(0, 8) : null,
      ts: Date.now(),
    });
    return res.status(401).json({ error: "Invalid webhook signature." });
  }

  const payload = req.body as Record<string, unknown>;
  const message = payload.message as Record<string, any> | undefined;
  const showcaseRoute = findShowcaseAgentByPayload(payload);

  if (showcaseRoute && message?.type === "assistant-request") {
    return res.json({
      assistant: buildShowcaseAssistantPayload(showcaseRoute.agent, showcaseRoute.kind, {
        serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      }),
    });
  }

  if (showcaseRoute && message?.type === "tool-calls") {
    const results = await handleShowcaseToolCalls({
      payload,
      message,
      showcaseAgentName: showcaseRoute.agent.name,
      showcaseKind: showcaseRoute.kind,
    });
    return res.json({ results });
  }

  if (
    showcaseRoute &&
    message &&
    [
      "status-update",
      "conversation-update",
      "language-change-detected",
      "end-of-call-report",
    ].includes(message.type)
  ) {
    return res.json({ received: true });
  }

  const queryAgentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
  const routed = await resolveVapiWebhookAgent({ payload, queryAgentId });
  if (!routed.ok) {
    return res
      .status((routed as { status: number }).status)
      .json((routed as { body: Record<string, unknown> }).body);
  }

  const webhookAgentId = routed.webhookAgentId;
  const agent = { id: webhookAgentId, user_id: routed.agentUserId };

  const [agentVoiceRow] = await drizzle
    .select({ name: schema.agents.name })
    .from(schema.agents)
    .where(eq(schema.agents.id, webhookAgentId))
    .limit(1);
  const agentVoiceName = agentVoiceRow?.name ?? undefined;

  const [userSettings] = await drizzle
    .select({
      subscriptionStatus: schema.settings.subscriptionStatus,
      voiceLlmProvider: schema.settings.voiceLlmProvider,
      voiceLlmModel: schema.settings.voiceLlmModel,
      twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
      twilioLookupEnabled: schema.settings.twilioLookupEnabled,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, agent.user_id))
    .limit(1);

  const subscriptionStatus = userSettings?.subscriptionStatus || "active";

  if (subscriptionStatus !== "active") {
    if (message && message.type === "assistant-request") {
      return res.json({
        assistant: {
          firstMessage: "The automated service for this line is suspended.",
          model: {
            provider: "openai",
            model: claudeBrain.VAPI_OPENAI_FALLBACK_MODEL,
            systemPrompt: "Explain suspension and end call.",
          },
        },
      });
    }
    return res.status(403).json({ error: "Access Denied" });
  }

  if (message && message.type === "assistant-request") {
    try {
      const assistant = await buildVapiAssistant({
        message: message as any,
        agent: agent as any,
        userSettings: userSettings as any,
      });
      return res.json({ assistant });
    } catch (e: any) {
      log.error("Vapi webhook config error", { agentId: webhookAgentId, error: e?.message });
      return res.json({
        assistant: {
          firstMessage: "I am having trouble connecting. Please try again.",
          model: {
            provider: "openai",
            model: claudeBrain.VAPI_OPENAI_FALLBACK_MODEL,
            systemPrompt: "Apologize and hang up.",
          },
        },
      });
    }
  }

  if (message && message.type === "tool-calls") {
    const { finalizeVapiToolBatch, runVapiToolCallsWithConcurrency, withVapiToolTimeout } =
      await import("../../lib/vapi-tool-results");
    const toolCalls = normalizeVapiToolCalls(message).map((tc) => ({
      id: tc.id,
      function: { name: tc.name, arguments: tc.arguments },
    }));
    const toolCallRows = await runVapiToolCallsWithConcurrency(toolCalls, (toolCall) =>
      withVapiToolTimeout(
        (async () => {
          return await dispatchToolCall(
            toolCall.function?.name || "",
            toolCall.function?.arguments || {},
            {
              toolCallId: toolCall.id,
              payload,
              message,
              agent,
              webhookAgentId,
              agentVoiceName,
              drizzle,
              log,
            },
          );
        })().catch((err) => ({
          toolCallId: toolCall.id,
          result:
            (err as Error)?.message === "VAPI_TOOL_TIMEOUT"
              ? "That is taking longer than expected. Apologize briefly and offer to follow up by email or text."
              : "Something went wrong running that action. Continue the conversation and try another approach.",
        })),
      ),
    );
    const results = finalizeVapiToolBatch(toolCalls, toolCallRows);
    return res.json({ results });
  }

  if (message && message.type === "status-update") {
    const callId = (payload.call as { id?: string } | undefined)?.id;
    const status =
      (message as { status?: string }).status ||
      (payload.call as { status?: string } | undefined)?.status;
    const customerNumber = (payload.call as { customer?: { number?: string } } | undefined)
      ?.customer?.number;
    if (callId) {
      if (["in-progress", "ringing", "queued"].includes(status || "")) {
        await drizzle
          .insert(schema.signalPresence)
          .values({
            id: callId,
            userId: agent?.user_id,
            agentId: webhookAgentId,
            customerNumber: customerNumber || "Unknown",
            status: status,
            startedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.signalPresence.id,
            set: { status },
          });

        // Update lead status to "Connected" when call is in-progress
        if (status === "in-progress" && customerNumber && agent?.user_id) {
          await drizzle
            .update(schema.outboundLeads)
            .set({ status: "Connected", callId })
            .where(
              and(
                eq(schema.outboundLeads.customerNumber, customerNumber),
                eq(schema.outboundLeads.userId, agent.user_id),
                eq(schema.outboundLeads.status, "Dialing"),
              ),
            )
            .catch((e) =>
              log.warn("Failed to update lead status to Connected", { error: getErrorMessage(e) }),
            );
        }

        if (customerNumber && agent?.user_id) {
          const shouldEnrich = await claimLeadEnrichmentSlot(agent.user_id, customerNumber);
          if (shouldEnrich) {
            await enqueue(drizzle, {
              userId: agent.user_id,
              type: "proactive_lead_enrichment",
              payload: { userId: agent.user_id, customerNumber },
            }).catch((e) => log.warn("Enrichment queue failed", { error: getErrorMessage(e) }));
          }
        }
      } else if (status === "ended" || status === "completed") {
        await drizzle.delete(schema.signalPresence).where(eq(schema.signalPresence.id, callId));
      }
    }
  }

  if (message && message.type === "conversation-update") {
    const callId =
      (payload.call as { id?: string } | undefined)?.id ||
      (message.call as { id?: string } | undefined)?.id;
    if (callId) {
      const turns: any[] = message.conversation || message.messages || [];
      const userTurns = turns
        .filter((t: { role: string; content?: string; message?: string }) => t.role === "user")
        .slice(-2);
      const combined = userTurns
        .map((t: { content?: string; message?: string }) =>
          (t.content || t.message || "").toLowerCase(),
        )
        .join(" ");

      const negativeHits = SENTIMENT_ANGRY_SIGNALS.filter((w) => combined.includes(w)).length;
      const positiveHits = SENTIMENT_POSITIVE_SIGNALS.filter((w) => combined.includes(w)).length;

      let liveSentimentLabel = "Live · Active";
      if (negativeHits >= 2) liveSentimentLabel = "⚠ Frustrated";
      else if (positiveHits >= 2) liveSentimentLabel = "✓ Positive";

      await drizzle
        .update(schema.signalPresence)
        .set({ label: liveSentimentLabel })
        .where(eq(schema.signalPresence.id, callId));

      // Deep Gemini analysis runs async — never block the webhook thread.
      if (negativeHits >= 1 && shouldQueueWebhook("conversation-update")) {
        try {
          await enqueue(drizzle, {
            userId: agent.user_id,
            type: "vapi_webhook",
            payload: {
              webhookType: "conversation-update",
              payload: req.body,
              agentId: webhookAgentId,
              userId: agent.user_id,
              webhookAgentId,
            } as Record<string, unknown>,
          });
        } catch (e) {
          log.warn("Failed to queue conversation-update", { error: getErrorMessage(e) });
        }
      }
    }
    return res.json({ received: true });
  }

  if (message && message.type === "end-of-call-report") {
    // Queue for async processing to prevent Vapi timeout/retries
    // End-of-call processing can take 10-30s (AI analysis, webhook dispatch)
    try {
      await enqueue(drizzle, {
        userId: agent.user_id,
        type: "vapi_webhook",
        payload: {
          webhookType: "end-of-call-report",
          payload: req.body,
          agentId: webhookAgentId,
          userId: agent.user_id,
          webhookAgentId,
        } as Record<string, unknown>,
      });
      log.info("Queued end-of-call-report for async processing", {
        agentId: webhookAgentId,
        callId: (message.call as { id?: string })?.id,
      });
      return res.json({ success: true, queued: true });
    } catch (e: any) {
      log.error("Failed to queue end-of-call-report", { error: getErrorMessage(e) });
      // Fallback to sync processing if queue fails
      try {
        await handleEndOfCallReport({ message: message as any, agent: agent as any });
        return res.json({ success: true });
      } catch (e2: any) {
        log.error("Failed to process call completion (sync fallback)", {
          error: getErrorMessage(e2),
        });
        return res.json({ success: false });
      }
    }
  }

  return res.json({ received: true });
});

export default router;
