/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import { eq } from "drizzle-orm";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { evaluateVapiWebhookAuth } from "../lib/vapi-webhook-auth";
import { resolveVapiWebhookAgent } from "../lib/vapi-webhook-agent";
import { buildVapiAssistant } from "../lib/vapi-assistant-factory-v2";
import { normalizeVapiToolCalls } from "../lib/vapi-tool-call-utils";
import { dispatchScopedToolCall } from "../lib/agent-tool-dispatch-v2";

const router = express.Router();
const callId = (payload: any, message: any) => payload?.call?.id || message?.call?.id || "";
const callerNumber = (payload: any, message: any) => payload?.call?.customer?.number || message?.call?.customer?.number || "";

router.post("/api/vapi-webhook", async (req, res) => {
  const auth = evaluateVapiWebhookAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ code: "ERROR", error: auth.error });
  const payload = (req.body || {}) as Record<string, any>;
  const message = payload.message || {};
  const routed = await resolveVapiWebhookAgent({ payload, queryAgentId: typeof req.query.agentId === "string" ? req.query.agentId : undefined });
  if (!routed.ok) return res.status(routed.status).json(routed.body);
  const agent = { id: routed.webhookAgentId, user_id: routed.agentUserId };
  const [settings] = await drizzle.select({ aiTier: schema.settings.aiTier, voiceLlmProvider: schema.settings.voiceLlmProvider, voiceLlmModel: schema.settings.voiceLlmModel, twilioMessagingEnabled: schema.settings.twilioMessagingEnabled, twilioLookupEnabled: schema.settings.twilioLookupEnabled }).from(schema.settings).where(eq(schema.settings.userId, agent.user_id)).limit(1);

  if (message.type === "assistant-request") {
    try { return res.json({ assistant: await buildVapiAssistant({ message, agent, userSettings: settings || {} }) }); }
    catch (error) { log.error("Vapi assistant configuration failed", { agentId: agent.id, error: error instanceof Error ? error.message : String(error) }); return res.json({ assistant: { firstMessage: "I am having trouble connecting. Please try again.", model: { provider: "openai", model: "gpt-4o", systemPrompt: "Apologize briefly and end the call." } } }); }
  }

  if (message.type === "tool-calls") {
    const calls = normalizeVapiToolCalls(message);
    const results = await Promise.all(calls.map(async (toolCall) => {
      try { return await dispatchScopedToolCall(toolCall.name, toolCall.arguments || {}, { toolCallId: toolCall.id, userId: agent.user_id, agentId: agent.id, callerNumber: callerNumber(payload, message), drizzle }); }
      catch (error) { log.warn("Vapi action failed", { agentId: agent.id, tool: toolCall.name, error: error instanceof Error ? error.message : String(error) }); return { toolCallId: toolCall.id, result: "That action could not be completed right now. I can route this to a human teammate." }; }
    }));
    return res.json({ results });
  }

  if (message.type === "end-of-call-report") {
    const id = callId(payload, message);
    if (id) {
      await drizzle.insert(schema.callLogs).values({ userId: agent.user_id, agentId: agent.id, vapiCallId: id, direction: message.call?.type?.toLowerCase().includes("outbound") ? "outbound" : "inbound", customerNumber: callerNumber(payload, message) || null, durationSeconds: Number(message.call?.durationSeconds || payload.call?.durationSeconds || 0), summary: message.analysis?.summary || payload.call?.analysis?.summary || null, transcript: message.transcript || message.call?.transcript || null, sentiment: message.analysis?.sentiment || "neutral" }).onConflictDoNothing();
    }
    return res.json({ success: true, received: true });
  }

  return res.json({ received: true });
});
export default router;
