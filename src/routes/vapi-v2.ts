/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Production Vapi webhook — full PSTN runtime (assistant, tools, presence, billing).
 * Ported from legacy vapi/index.ts with vapi-assistant-factory-v2 for tenant agents.
 */
import express from "express";
import { and, eq } from "drizzle-orm";

import { VAPI_OPENAI_FALLBACK_MODEL } from "../lib/ai-models";
import { complianceFirstMessagePrefix } from "../lib/agent-runtime";
import * as schema from "../db/schema";
import { enqueue } from "../lib/job-queue";
import { claimLeadEnrichmentSlot } from "../lib/enrichment-debounce";
import { drizzle, log, quotaTracker, tenantStore } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import {
  buildShowcaseAssistantPayload,
  buildShowcaseAtCapacityAssistant,
  extractShowcaseCallerNumber,
  findShowcaseAgentByPayload,
} from "../lib/showcase-assistant";
import { admitShowcaseDemoCall } from "../lib/showcase-demo-ceiling";
import { buildVapiAssistant } from "../lib/vapi-assistant-factory-v2";
import { buildVapiTranscriptOnlyArtifactPlan } from "../lib/vapi-artifact-plan";
import { normalizeVapiToolCalls } from "../lib/vapi-tool-call-utils";
import { SENTIMENT_ANGRY_SIGNALS, SENTIMENT_POSITIVE_SIGNALS } from "../lib/vapi-helpers";
import { buildVapiServerConfig } from "../lib/vapi-server-config";
import { toVapiFunctionTools } from "../lib/vapi-tool-format";
import { evaluateVapiWebhookAuth } from "../lib/vapi-webhook-auth";
import { handleEndOfCallReport } from "../lib/vapi-handlers";
import { shouldQueueWebhook } from "../lib/vapi-webhook-queue";
import { resolveVapiWebhookAgent } from "../lib/vapi-webhook-agent";
import { touchNavCounts } from "../lib/nav-counts-invalidate";
import { notifyInboundCall } from "../lib/mobile-push";
import { clearVapiAssistantSpeaking, setVapiAssistantSpeaking } from "../lib/vapi-listen-gate";
import {
  isToolCallFailureResult,
  recordInboundWebhookHealth,
  recordToolCallBatch,
} from "../lib/call-reliability-capture";
import { dispatchAgentToolCall } from "../lib/agent-tool-dispatch";
import { createAuditContext, runInAuditContext } from "../lib/ai-audit";
import { persistRuntimeAuditRecords } from "../middleware/audit-middleware";
import { runInBackground } from "../lib/background-work";
import { sseBroadcaster } from "../services/sse-broadcaster";

import { extractShowcaseCallContext, handleShowcaseToolCalls } from "./vapi/showcase-handlers";
import type { ToolCallContext, ToolCallResult } from "./vapi/types";

const router = express.Router();

/**
 * Grace window for usage recorded by a tool that outlived the 8s wrapper
 * timeout. Bounded: the point is to catch a slow model call that settles a few
 * seconds late, not to hold a serverless instance open indefinitely.
 */
const LATE_TOOL_AUDIT_GRACE_MS = 20_000;
let _warnedAboutVapiSecret = false;

const callId = (payload: any, message: any) => payload?.call?.id || message?.call?.id || "";
const callerNumber = (payload: any, message: any) =>
  payload?.call?.customer?.number || message?.call?.customer?.number || "";

async function dispatchToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult> {
  return dispatchAgentToolCall(fn, args, context);
}

function evaluateHandoffTriggers(transcriptText: string, confidence: number) {
  const triggerWords = ["urgent", "cancel", "human", "supervisor", "escalate"];
  const hasTriggerWord = triggerWords.some((word) => transcriptText.includes(word));
  const lowConfidence = confidence < 0.75;
  return {
    hasTriggerWord,
    lowConfidence,
    reason: lowConfidence ? "Low Confidence (< 75%)" : "Keyword Trigger",
  };
}

function buildDurableTakeMessageAssistant(
  agentId: string,
  agentName?: string,
  complianceMode?: string | null,
  businessName?: string | null,
) {
  const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, "");
  const server = appUrl
    ? buildVapiServerConfig(`${appUrl}/api/vapi-webhook?agentId=${encodeURIComponent(agentId)}`)
    : undefined;
  const canPersist = Boolean(server);
  const tools = canPersist
    ? toVapiFunctionTools([
        {
          name: "create_followup_task",
          description:
            "Persist the caller's complete message for a human. Use only after collecting and reading back their name, callback number, reason for calling, and urgency. Promise follow-up only if the result explicitly confirms the task was created.",
          parameters: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description:
                  "Complete caller message including name, callback number, reason, urgency, and any requested timing.",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high"],
                description: "Use high only for genuinely urgent or time-sensitive messages.",
              },
            },
            required: ["description", "priority"],
          },
        },
      ])
    : [];

  const artifactPlan = buildVapiTranscriptOnlyArtifactPlan();
  const disclosurePrefix = complianceFirstMessagePrefix(complianceMode, businessName || agentName, {
    outboundAiCall: false,
    recordingEnabled: artifactPlan.recordingEnabled,
  });

  return {
    firstMessage: `${disclosurePrefix}Hi, you've reached ${agentName || "our office"}. I can take a message for the team.`,
    maxDurationSeconds: 300,
    artifactPlan,
    model: {
      provider: "openai" as const,
      model: VAPI_OPENAI_FALLBACK_MODEL,
      systemPrompt: canPersist
        ? "You are a courteous, concise message-taking assistant. Collect the caller's name, callback number, reason for calling, and urgency. Read the details back once. Then use create_followup_task. Say the message was recorded and promise follow-up only if the tool explicitly confirms creation. If the tool fails, times out, or remains uncertain, say the message was not confirmed and offer the business's other contact channel. Do not answer business questions, quote prices, or book appointments."
        : "You are a courteous, concise message-taking assistant, but message persistence is unavailable. Explain that you cannot safely record or promise delivery of a message right now, suggest the caller use the business's other contact channel, and end politely. Do not collect sensitive details, answer business questions, quote prices, book appointments, or promise follow-up.",
      tools,
    },
    ...(server ? { server, serverMessages: ["tool-calls", "end-of-call-report"] } : {}),
  };
}

router.post("/api/vapi-webhook", async (req, res) => {
  const auth = evaluateVapiWebhookAuth(req);
  if (!auth.ok) {
    if (auth.status === 503) {
      log.error("VAPI_WEBHOOK_SECRET unset in production — rejecting webhook");
    }
    const messageType =
      ((req.body as Record<string, unknown>)?.message as { type?: string } | undefined)?.type ??
      "unknown";
    void recordInboundWebhookHealth({
      provider: "vapi",
      eventType: messageType,
      outcome: "rejected",
    });
    return res.status(auth.status).json({ code: "ERROR", error: auth.error });
  }
  if (!process.env.VAPI_WEBHOOK_SECRET && !_warnedAboutVapiSecret) {
    log.warn("VAPI_WEBHOOK_SECRET unset — accepting all webhook requests (dev only)");
    _warnedAboutVapiSecret = true;
  }

  const payload = (req.body || {}) as Record<string, any>;
  const message = payload.message || {};
  const showcaseRoute = findShowcaseAgentByPayload(payload);

  if (showcaseRoute && message?.type === "assistant-request") {
    // Aggregate demo-spend ceiling: every call is COGS-capped individually,
    // but the published numbers also need a daily budget. Refused calls get a
    // bounded, dignified capacity message instead of the full demo.
    const admission = await admitShowcaseDemoCall(extractShowcaseCallerNumber(payload));
    if (!admission.admitted) {
      log.warn("Showcase demo call refused by aggregate ceiling", {
        reason: admission.reason,
        agent: showcaseRoute.agent.name,
      });
      return res.json({
        assistant: {
          ...buildShowcaseAtCapacityAssistant(showcaseRoute.agent),
          artifactPlan: buildVapiTranscriptOnlyArtifactPlan(),
        },
      });
    }
    const assistant = buildShowcaseAssistantPayload(showcaseRoute.agent, showcaseRoute.kind, {
      webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
    });
    return res.json({
      assistant: {
        ...assistant,
        artifactPlan: buildVapiTranscriptOnlyArtifactPlan(),
      },
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
    [
      "status-update",
      "conversation-update",
      "language-change-detected",
      "end-of-call-report",
    ].includes(message?.type)
  ) {
    if (message.type === "end-of-call-report") {
      const callContext = extractShowcaseCallContext(payload, message);
      const {
        recordDemoCallEvent,
        classifyDemoIntent,
        sendDemoRecapEmail,
        markDemoRecapSent,
        extractEmailFromText,
      } = await import("../lib/demo-funnel");
      const summary =
        message.analysis?.summary || message.call?.analysis?.summary || "Demo conversation";
      const eventId = await recordDemoCallEvent({
        dialedNumber: callContext.dialedNumber || showcaseRoute.agent.tel,
        showcaseAgent: showcaseRoute.agent.name,
        callerNumber: callContext.callerNumber,
        source: "showcase_webhook",
        intentVertical: classifyDemoIntent(summary, showcaseRoute.agent.name),
        vapiCallId: callContext.callId,
      });
      if (eventId) {
        const appUrl = (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
        const signupUrl = `${appUrl}/signup?demo=${encodeURIComponent(showcaseRoute.agent.name.toLowerCase())}`;
        const prospectEmail = extractEmailFromText(String(summary));
        if (prospectEmail) {
          const sent = await sendDemoRecapEmail({
            to: prospectEmail,
            agentName: showcaseRoute.agent.name,
            summary: String(summary).slice(0, 500),
            signupUrl,
          });
          if (sent) await markDemoRecapSent(eventId);
        }
      }
    }
    return res.json({ received: true });
  }

  const queryAgentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
  const routed = await resolveVapiWebhookAgent({ payload, queryAgentId });
  if (!routed.ok) return res.status(routed.status).json(routed.body);

  return tenantStore.run(routed.agentUserId, async () => {
    const webhookAgentId = routed.webhookAgentId;
    const agent = { id: webhookAgentId, user_id: routed.agentUserId };

    const [agentVoiceRow] = await drizzle
      .select({ name: schema.agents.name, complianceMode: schema.agents.complianceMode })
      .from(schema.agents)
      .where(eq(schema.agents.id, webhookAgentId))
      .limit(1);
    const agentVoiceName = agentVoiceRow?.name ?? undefined;
    const agentComplianceMode = agentVoiceRow?.complianceMode ?? undefined;

    const [userSettings] = await drizzle
      .select({
        subscriptionStatus: schema.settings.subscriptionStatus,
        aiTier: schema.settings.aiTier,
        voiceLlmProvider: schema.settings.voiceLlmProvider,
        voiceLlmModel: schema.settings.voiceLlmModel,
        twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
        twilioLookupEnabled: schema.settings.twilioLookupEnabled,
        businessName: schema.settings.businessName,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, agent.user_id))
      .limit(1);

    const subscriptionStatus = userSettings?.subscriptionStatus ?? "pending_activation";

    if (subscriptionStatus !== "active") {
      if (message?.type === "assistant-request") {
        return res.json({
          assistant: {
            firstMessage: "The automated service for this line is suspended.",
            artifactPlan: buildVapiTranscriptOnlyArtifactPlan(),
            model: {
              provider: "openai",
              model: VAPI_OPENAI_FALLBACK_MODEL,
              systemPrompt: "Explain suspension and end call.",
            },
          },
        });
      }
      // end-of-call-report is deliberately NOT denied. A suspended line still
      // answers (with the suspension assistant above), so a real call really
      // happened — and 403-ing its report threw away the call log, the
      // transcript DNC/opt-out capture, and the TCPA compliance evidence for
      // that call. A legal opt-out is not conditional on the tenant's billing
      // state, and a tenant who reactivates must not find a hole in their
      // history. Every other message type stays denied: a suspended line must
      // not run tools, transfers, or live enrichment.
      if (message?.type !== "end-of-call-report") {
        return res.status(403).json({ code: "ERROR", error: "Access Denied" });
      }
      log.info("Suspended tenant end-of-call-report accepted for logging and compliance", {
        agentId: webhookAgentId,
        subscriptionStatus,
      });
    }

    if (message?.type === "assistant-request") {
      try {
        // Inbound solvency posture: an active-but-deeply-insolvent tenant
        // (completed calls left a completion-grace debt beyond the threshold)
        // still gets their line answered — but by a bounded take-a-message
        // assistant, not the full agent. Callers are never hung up on for
        // billing; COGS stops compounding while the balance is unpaid.
        // Wallet lookup failure fails OPEN to the full assistant — a DB blip
        // must not degrade a paying tenant's inbound line.
        const INBOUND_TAKE_MESSAGE_GRACE_USD = 5;
        const wallet = await import("../lib/voice-wallet-guard")
          .then(({ getVoiceWalletSnapshot }) => getVoiceWalletSnapshot(agent.user_id))
          .catch(() => null);
        if (wallet && wallet.completion_grace_due_usd >= INBOUND_TAKE_MESSAGE_GRACE_USD) {
          log.warn("Inbound routed to take-a-message assistant — completion grace due", {
            agentId: webhookAgentId,
            completionGraceDueUsd: wallet.completion_grace_due_usd,
          });
          return res.json({
            assistant: buildDurableTakeMessageAssistant(
              webhookAgentId,
              agentVoiceName,
              agentComplianceMode,
              userSettings?.businessName,
            ),
          });
        }
        // Concurrency ceiling: the grace gate reads settled ledger state, so a
        // burst of simultaneous inbound calls all passed it before any of them
        // settled. Beyond the per-tenant live-call ceiling, overflow degrades
        // to the same bounded take-a-message assistant (fail-open on error).
        const { inboundConcurrencyExceeded } = await import("../lib/inbound-concurrency");
        if (await inboundConcurrencyExceeded(agent.user_id)) {
          log.warn("Inbound routed to take-a-message assistant — concurrency ceiling", {
            agentId: webhookAgentId,
          });
          return res.json({
            assistant: buildDurableTakeMessageAssistant(
              webhookAgentId,
              agentVoiceName,
              agentComplianceMode,
              userSettings?.businessName,
            ),
          });
        }
        // Daily minute ceiling: settlement increments voice_minutes_daily for
        // inbound too, but only the OUTBOUND path ever read it — so a tenant
        // whose number gets flooded (or farmed) ran the full assistant at up
        // to 40 min/call all day with the wallet merely accruing grace debt.
        // Past the plan's daily minutes, callers still get answered — by the
        // bounded take-a-message assistant, capping full-assistant COGS at the
        // same posture as the grace and concurrency gates. Read-only check
        // (delta 0): the completed call settles its real minutes afterward.
        // Fail OPEN on tracker error — a DB blip must not degrade a paying
        // tenant's inbound line.
        const dailyDecision = await quotaTracker
          .checkAndIncrement(agent.user_id, "voice_minutes_daily", 0)
          .catch(() => null);
        if (dailyDecision && !dailyDecision.allowed) {
          log.warn("Inbound routed to take-a-message assistant — daily minute ceiling", {
            agentId: webhookAgentId,
            used: dailyDecision.used,
            limit: dailyDecision.limit,
          });
          return res.json({
            assistant: buildDurableTakeMessageAssistant(
              webhookAgentId,
              agentVoiceName,
              agentComplianceMode,
              userSettings?.businessName,
            ),
          });
        }
        return res.json({
          assistant: await buildVapiAssistant({
            message,
            agent,
            userSettings: userSettings || {},
          }),
        });
      } catch (error) {
        log.error("Vapi assistant configuration failed", {
          agentId: webhookAgentId,
          error: error instanceof Error ? error.message : String(error),
        });
        return res.json({
          assistant: {
            firstMessage: "I am having trouble connecting. Please try again.",
            artifactPlan: buildVapiTranscriptOnlyArtifactPlan(),
            model: {
              provider: "openai",
              model: VAPI_OPENAI_FALLBACK_MODEL,
              systemPrompt: "Apologize briefly and end the call.",
            },
          },
        });
      }
    }

    if (message?.type === "tool-calls") {
      const { finalizeVapiToolBatch, runVapiToolCallsWithConcurrency, withVapiToolTimeout } =
        await import("../lib/vapi-tool-results");
      const toolCalls = normalizeVapiToolCalls(message).map((tc) => ({
        id: tc.id,
        function: { name: tc.name, arguments: tc.arguments },
      }));
      // Mid-call tools reach platform-funded models: send_email and send_sms run
      // every outgoing message through the supervisor, and gemini_ground falls
      // back to a grounded Gemini search. Both meter through recordUsage, which
      // is `auditCtx.getStore()?.records.push(...)` — a silent no-op with no
      // context on the stack. The webhook opened a tenant scope but never an
      // audit context, so that COGS never reached the ledger and the tenant's
      // AI envelope was spent invisibly. The end-of-call arm has always done
      // this (vapi-handlers.ts); the live-call arm had not.
      const toolAuditContext = createAuditContext();
      let anyToolTimedOut = false;
      const toolCallRows = await runInAuditContext(toolAuditContext, () =>
        runVapiToolCallsWithConcurrency(toolCalls, (toolCall) =>
          // The .catch MUST wrap withVapiToolTimeout(...) — the timeout rejects
          // from the wrapper, not the inner dispatch. Catching only the inner
          // promise lets a >8s tool reject the whole batch (HTTP 500, all tool
          // results lost mid-call). The underlying provider promise may continue,
          // so timeout language must forbid an automatic retry.
          withVapiToolTimeout(
            (async () =>
              dispatchToolCall(toolCall.function?.name || "", toolCall.function?.arguments || {}, {
                toolCallId: toolCall.id,
                payload,
                message,
                agent,
                webhookAgentId,
                agentVoiceName,
                drizzle,
                log,
              }))(),
          ).catch((err) => {
            const timedOut = (err as Error)?.message === "VAPI_TOOL_TIMEOUT";
            if (timedOut) anyToolTimedOut = true;
            return {
              toolCallId: toolCall.id,
              result: timedOut
                ? "That action is taking longer than expected and may still be processing. Do not repeat it or claim success or failure. Tell the caller the outcome cannot yet be confirmed and offer to create a durable follow-up task."
                : "The action did not complete successfully. Do not claim success or repeat it automatically. Tell the caller what could not be confirmed and offer a durable follow-up task or safe alternative.",
            };
          }),
        ),
      );
      if (agent?.user_id && (toolAuditContext.records.length || anyToolTimedOut)) {
        // Background, not awaited: Vapi drops the tool result if this response
        // is slow, and the ledger write must not sit in front of a live call.
        // runInBackground (not a bare promise) so Vercel keeps the instance
        // alive past the response instead of freezing the INSERT away.
        const auditUserId = agent.user_id;
        const toolCallCount = toolCalls.length;
        runInBackground("vapi tool-call ai spend accounting", async () => {
          // A tool that blew the 8s wrapper timeout returned early while its
          // provider promise kept running — and records its usage only when it
          // finally settles. Snapshotting here would miss exactly the slowest,
          // most expensive calls. When that happened, wait a bounded grace
          // window so those late records land in the ledger too.
          if (anyToolTimedOut) {
            await new Promise((resolve) => setTimeout(resolve, LATE_TOOL_AUDIT_GRACE_MS));
          }
          const records = toolAuditContext.records.slice();
          if (!records.length) return;
          await persistRuntimeAuditRecords({
            userId: auditUserId,
            action: "vapi.tool-calls",
            records,
            requestMeta: {
              agent_id: webhookAgentId,
              tool_calls: toolCallCount,
              ...(anyToolTimedOut ? { included_late_tool_usage: true } : {}),
            },
          });
        });
      }
      const results = finalizeVapiToolBatch(toolCalls, toolCallRows);
      const id = callId(payload, message);
      if (id && agent?.user_id && toolCalls.length > 0) {
        const failed = results.filter((row) => isToolCallFailureResult(row.result)).length;
        void recordToolCallBatch({
          vapiCallId: id,
          userId: agent.user_id,
          total: toolCalls.length,
          failed,
        });
      }
      void recordInboundWebhookHealth({
        userId: agent?.user_id,
        provider: "vapi",
        eventType: "tool-calls",
        outcome: "success",
      });
      return res.json({ results });
    }

    if (message?.type === "speech-update") {
      const id = callId(payload, message);
      const role = String(message.role || "");
      const status = String(message.status || "");
      if (id && role === "assistant") {
        if (/start/i.test(status)) setVapiAssistantSpeaking(id, true);
        else if (/stop|end/i.test(status)) setVapiAssistantSpeaking(id, false);
      } else if (id && role === "user" && /start/i.test(status)) {
        setVapiAssistantSpeaking(id, false);
      }
      if (id && /ended|completed/i.test(status || "")) {
        clearVapiAssistantSpeaking(id);
      }
      return res.json({ ok: true });
    }

    if (message?.type === "transcript") {
      const transcriptText = String(message.transcript || "").toLowerCase();
      const confidence = message.confidence ?? 1.0;
      const { hasTriggerWord, lowConfidence, reason } = evaluateHandoffTriggers(
        transcriptText,
        confidence,
      );
      if (hasTriggerWord || lowConfidence) {
        log.warn("Handoff Logic Engine Triggered", {
          agentId: agent.id,
          callId: callId(payload, message),
          reason,
          transcript: transcriptText,
        });
        sseBroadcaster.broadcast(
          "handoff_requested",
          {
            agentId: agent.id,
            callId: callId(payload, message),
            reason,
            transcript: transcriptText,
          },
          agent.user_id,
        );
      }
      return res.json({ received: true });
    }

    if (message?.type === "status-update") {
      const id = callId(payload, message);
      const status = message.status || payload.call?.status;
      const customerNumber = callerNumber(payload, message);
      const monitor = payload.call?.monitor;
      const controlUrl = monitor?.controlUrl;
      const listenUrl = monitor?.listenUrl;
      if (id) {
        if (["in-progress", "ringing", "queued"].includes(status || "")) {
          await drizzle
            .insert(schema.signalPresence)
            .values({
              id,
              userId: agent?.user_id,
              agentId: webhookAgentId,
              customerNumber: customerNumber || "Unknown",
              status,
              controlUrl: controlUrl || null,
              listenUrl: listenUrl || null,
              startedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: schema.signalPresence.id,
              set: {
                status,
                ...(controlUrl ? { controlUrl } : {}),
                ...(listenUrl ? { listenUrl } : {}),
              },
            });
          if (agent?.user_id) touchNavCounts(agent.user_id);

          const callType = payload.call?.type;
          const isInbound = callType ? callType.toLowerCase().includes("inbound") : false;
          if (isInbound && ["ringing", "queued"].includes(status || "") && agent?.user_id) {
            void notifyInboundCall(agent.user_id, {
              callId: id,
              fromNumber: customerNumber || "Unknown",
              agentName: agentVoiceName ?? null,
              agentId: webhookAgentId ?? null,
            });
          }

          if (status === "in-progress" && customerNumber && agent?.user_id) {
            await drizzle
              .update(schema.outboundLeads)
              .set({ status: "Connected", callId: id })
              .where(
                and(
                  eq(schema.outboundLeads.customerNumber, customerNumber),
                  eq(schema.outboundLeads.userId, agent.user_id),
                  eq(schema.outboundLeads.status, "Dialing"),
                ),
              )
              .catch((e) =>
                log.warn("Failed to update lead status to Connected", {
                  error: getErrorMessage(e),
                }),
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
          await drizzle.delete(schema.signalPresence).where(eq(schema.signalPresence.id, id));
          if (agent?.user_id) touchNavCounts(agent.user_id);
        }
      }
      return res.json({ received: true });
    }

    if (message?.type === "conversation-update") {
      const id = callId(payload, message);
      if (id) {
        const turns: any[] = message.conversation || message.messages || [];
        const userTurns = turns.filter((t: { role: string }) => t.role === "user").slice(-2);
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
          .where(eq(schema.signalPresence.id, id));
        if (agent.user_id) touchNavCounts(agent.user_id);

        const confidence = message.confidence ?? 1.0;
        const { hasTriggerWord, lowConfidence, reason } = evaluateHandoffTriggers(
          combined,
          confidence,
        );
        if (hasTriggerWord || lowConfidence) {
          sseBroadcaster.broadcast(
            "handoff_requested",
            { agentId: agent.id, callId: id, reason, transcript: combined },
            agent.user_id,
          );
        }

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

    if (message?.type === "end-of-call-report") {
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
          callId: message.call?.id,
        });
        return res.json({ success: true, queued: true });
      } catch (e) {
        log.error("Failed to queue end-of-call-report", { error: getErrorMessage(e) });
        try {
          await handleEndOfCallReport({ message, agent });
          return res.json({ success: true });
        } catch (e2) {
          log.error("Failed to process call completion (sync fallback)", {
            error: getErrorMessage(e2),
          });
          void recordInboundWebhookHealth({
            userId: agent?.user_id,
            provider: "vapi",
            eventType: "end-of-call-report",
            outcome: "error",
          });
          return res.status(500).json({ success: false });
        }
      }
    }

    if (message?.type) {
      void recordInboundWebhookHealth({
        userId: agent?.user_id,
        provider: "vapi",
        eventType: message.type,
        outcome: "success",
      });
    }

    return res.json({ received: true });
  });
});

export default router;
