/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi webhook/tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import { and, desc, eq, ilike, inArray, not, or } from "drizzle-orm";

import { superviseClientCommunication } from "../../lib/ai-supervisor";
import * as schema from "../../db/schema";
import { auditLogger } from "../../lib/server-context";
import { normalizeDncPhone } from "../../lib/compliance";
import { IntegrationService } from "../../lib/integrations";
import { lookupTenantPhoneNumber, sendTenantMessage } from "../../lib/twilio-service";
import { PRESERVED_LEAD_STATUSES, sanitizePhone } from "../../lib/vapi-helpers";
import {
  handleCreateAccount,
  handleSendPaymentLink,
  handleSendSignupLink,
} from "../../lib/vapi-tool-handlers";

import type { ToolCallContext, ToolCallResult } from "./types";

// ─── Knowledge search helpers ────────────────────────────────────────────────
const MAX_KB_RESULTS = 8;
const MAX_KB_RESULT_CHARS = 600;
const KNOWLEDGE_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "can",
  "could",
  "does",
  "for",
  "from",
  "have",
  "how",
  "into",
  "our",
  "please",
  "that",
  "the",
  "their",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2 && !KNOWLEDGE_STOP_WORDS.has(token)),
    ),
  );
}

function scoreSnippet(content: string, queryTokens: string[]): number {
  const lower = content.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (lower.includes(token)) score += 1;
  }
  return score;
}

async function searchAgentKnowledge(
  drizzle: any,
  userId: string,
  agentId: string,
  query: string,
): Promise<string> {
  if (!userId || !agentId) {
    return "NO_VERIFIED_MATCH: The agent identity could not be verified. Do not answer the factual question. Offer to take a message or escalate to a human.";
  }

  const [directives, knowledge] = await Promise.all([
    drizzle
      .select({ content: schema.directives.content })
      .from(schema.directives)
      .where(and(eq(schema.directives.agentId, agentId), eq(schema.directives.userId, userId)))
      .orderBy(desc(schema.directives.priority))
      .limit(40),
    drizzle
      .select({ content: schema.knowledge.content })
      .from(schema.knowledge)
      .where(and(eq(schema.knowledge.agentId, agentId), eq(schema.knowledge.userId, userId)))
      .orderBy(desc(schema.knowledge.createdAt))
      .limit(200),
  ]);

  type Snippet = { source: "rule" | "knowledge"; content: string };
  const snippets: Snippet[] = [
    ...directives.map((d: any) => ({
      source: "rule" as const,
      content: (d.content || "").trim().slice(0, MAX_KB_RESULT_CHARS),
    })),
    ...knowledge.map((k: any) => ({
      source: "knowledge" as const,
      content: (k.content || "").trim().slice(0, MAX_KB_RESULT_CHARS),
    })),
  ].filter((s) => s.content.length > 0);

  if (snippets.length === 0) {
    return "NO_VERIFIED_MATCH: This agent has no approved knowledge for that question. Do not guess or fill gaps from general knowledge. Ask one clarifying question, then take a message or escalate if the caller still needs a factual answer.";
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return "NO_VERIFIED_MATCH: The question is too broad to verify safely. Ask the caller for the specific product, service, policy, date, or detail they need.";
  }

  const scored = snippets
    .map((s) => ({ ...s, score: scoreSnippet(s.content, queryTokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_KB_RESULTS);

  if (scored.length === 0) {
    return "NO_VERIFIED_MATCH: No approved knowledge matched the caller's question. Do not answer from memory, inference, or an unrelated entry. For current public facts, use the approved live-research tool only when enabled; otherwise take a message or escalate.";
  }

  return [
    "VERIFIED_KNOWLEDGE_MATCH: Answer only from the approved excerpts below. If they do not fully resolve the question, say you do not have a verified answer and offer follow-up; do not combine them with assumptions.",
    ...scored.map((s) => `[${s.source}] ${s.content}`),
  ].join("\n\n");
}
// ─────────────────────────────────────────────────────────────────────────────

export async function handleCoreToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, drizzle, log, message, payload, toolCallId, webhookAgentId } = context;

  // ── Knowledge base search (highest priority — fast, no side effects) ──────
  if (fn === "search_knowledge_base") {
    try {
      const query = typeof args?.query === "string" ? args.query.trim() : "";
      if (!query) {
        return {
          toolCallId,
          result:
            "NO_VERIFIED_MATCH: No specific question was provided. Ask the caller what exact fact they need before answering.",
        };
      }
      const results = await searchAgentKnowledge(
        drizzle,
        agent?.user_id || "",
        webhookAgentId,
        query,
      );
      return { toolCallId, result: results };
    } catch (e: any) {
      log.error("search_knowledge_base failed", { error: e?.message });
      return {
        toolCallId,
        result:
          "NO_VERIFIED_MATCH: Knowledge search is temporarily unavailable. Do not answer the factual question from memory or guesswork. Take a message or escalate to a human.",
      };
    }
  }

  if (fn === "create_followup_task") {
    try {
      const { description, priority } = args || {};
      const [task] = await drizzle
        .insert(schema.followUpTasks)
        .values({
          userId: agent?.user_id,
          agentId: webhookAgentId,
          taskType: "follow_up",
          description,
          priority: priority || "medium",
          status: "pending",
          sourceType: "phone_call",
          sourceId:
            (message.call as { id?: string } | undefined)?.id ||
            (payload.call as { id?: string } | undefined)?.id ||
            "in-call",
          targetChannel: "manual",
        })
        .returning({ id: schema.followUpTasks.id });

      return {
        toolCallId,
        result: `Task ${task.id.split("-")[0]} created.`,
      };
    } catch {
      return {
        toolCallId,
        result: "I've noted that down. I'll make sure the team follows up with you.",
      };
    }
  }

  if (fn === "search_leads") {
    try {
      const { query } = args || {};
      const safeQuery = String(query || "")
        .replace(/[^A-Za-z0-9 @.\-+]/g, "")
        .slice(0, 80);
      const leads = await drizzle
        .select({
          name: schema.outboundLeads.customerName,
          status: schema.outboundLeads.status,
          customerNumber: schema.outboundLeads.customerNumber,
          context: schema.outboundLeads.context,
        })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.userId, agent?.user_id),
            or(
              ilike(schema.outboundLeads.customerName, `%${safeQuery}%`),
              ilike(schema.outboundLeads.customerNumber, `%${safeQuery}%`),
            ),
          ),
        )
        .limit(3);

      if (leads && leads.length > 0) {
        const summaries = leads.map(
          (l: any) => `${l.name} (${l.status}) | Phone: ${l.customerNumber || "N/A"}`,
        );
        return {
          toolCallId,
          result: `Found records:\n${summaries.join("\n")}`,
        };
      }

      return { toolCallId, result: "No matching records found." };
    } catch {
      return {
        toolCallId,
        result:
          "I wasn't able to pull that up right now. Let me take your info and have someone get back to you.",
      };
    }
  }

  if (fn === "update_lead_status") {
    try {
      const { status, notes } = args || {};
      const customerPhone =
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
        (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
      if (customerPhone) {
        const safePhone = sanitizePhone(customerPhone);
        await drizzle
          .update(schema.outboundLeads)
          .set({ status, context: notes || "", lastCalledAt: new Date() })
          .where(
            and(
              eq(schema.outboundLeads.userId, agent?.user_id),
              ilike(schema.outboundLeads.customerNumber, `%${safePhone}%`),
              not(inArray(schema.outboundLeads.status, PRESERVED_LEAD_STATUSES)),
            ),
          );
      }
      return { toolCallId, result: `Lead status updated to '${status}'.` };
    } catch {
      return {
        toolCallId,
        result: "I've noted that update. Someone from the team will confirm shortly.",
      };
    }
  }

  if (fn === "send_email") {
    try {
      const { to_email, subject, body } = args || {};
      const reviewed = await superviseClientCommunication({
        channel: "email",
        agentName: webhookAgentId,
        source: "voice_tool",
        purpose: "client follow-up requested during a live call",
        recipient: to_email,
        subject,
        body,
        context: "Outbound email generated from a Vapi tool call during a customer conversation.",
      });
      if (!reviewed.approved) {
        return {
          toolCallId,
          result: "I've queued that email up for you. It should arrive shortly.",
        };
      }
      const service = new IntegrationService(agent?.user_id);
      const success = await service.sendEmail({
        to: to_email,
        subject: reviewed.subject || subject,
        body: reviewed.body,
      });
      return {
        toolCallId,
        result: success
          ? "Email sent."
          : "I wasn't able to send that right now, but I've noted your request. Someone from our team will follow up.",
      };
    } catch {
      return {
        toolCallId,
        result:
          "I ran into a hiccup sending that email. Let me note your address and have someone send it to you directly.",
      };
    }
  }

  // Platform-Resend signup-link tool — the showcase + demo agents
  // (Sarah, Liam, Marcus, etc.) call this when a caller asks for a
  // Wireline trial signup link. Distinct from `send_email` above,
  // which routes through the TENANT'S connected Google/Microsoft
  // OAuth account — showcase agents have no tenant so they need a
  // platform-level transport. Closes the "agent promised an email
  // but never sent it" gap Mike caught on the demo line.
  //
  // Core branch logic lives in src/lib/vapi-tool-handlers.ts so it
  // can be unit-tested with mocked transports — the route stays a
  // thin adapter (look up the agent name, inject deps).
  if (fn === "send_signup_link") {
    const { sendSignupLinkEmail } = await import("../../lib/email-service");
    const agentNameRow = await drizzle
      .select({ name: schema.agents.name })
      .from(schema.agents)
      .where(eq(schema.agents.id, webhookAgentId))
      .limit(1);
    const { result } = await handleSendSignupLink(args || {}, {
      sendSignupLinkEmail,
      agentName: agentNameRow[0]?.name ?? undefined,
      log,
    });
    return { toolCallId, result };
  }

  // create_account — a Wireline employee signs a caller up by phone.
  // Creates the account with a random password + emails a
  // set-password link so the caller picks their own. Same
  // confirm-the-email guardrail as send_signup_link.
  if (fn === "create_account") {
    const { authService } = await import("../../lib/auth-service");
    const { sendPasswordResetEmail } = await import("../../lib/email-service");
    const crypto = await import("crypto");
    const { result } = await handleCreateAccount(args || {}, {
      signUp: (email, password, fullName) => authService.signUp(email, password, fullName),
      createPasswordResetToken: (email) => authService.createPasswordResetToken(email),
      sendPasswordResetEmail,
      randomPassword: () => crypto.randomBytes(24).toString("base64url"),
      log,
    });
    return { toolCallId, result };
  }

  // send_payment_link — emails the caller a checkout link for a
  // specific plan so they can pay + activate without friction.
  if (fn === "send_payment_link") {
    const { sendPaymentLinkEmail } = await import("../../lib/email-service");
    const { result } = await handleSendPaymentLink(args || {}, {
      sendPaymentLinkEmail,
      log,
    });
    return { toolCallId, result };
  }

  if (fn === "send_text_message") {
    try {
      const { to_number, channel, message_body } = args || {};
      const fallbackNumber =
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
        (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
      const targetNumber = sanitizePhone(to_number || fallbackNumber);

      if (!targetNumber) {
        return {
          toolCallId,
          result: "No destination number was available for that message.",
        };
      }

      const reviewed = await superviseClientCommunication({
        channel: "sms",
        agentName: webhookAgentId,
        source: "voice_tool",
        purpose: "client text follow-up requested during a live call",
        recipient: targetNumber,
        body: message_body,
        context: `Requested channel: ${channel === "whatsapp" ? "whatsapp" : "sms"}.`,
      });
      if (!reviewed.approved) {
        return {
          toolCallId,
          result: "I've queued that message for you. It should go out shortly.",
        };
      }
      const outcome = await sendTenantMessage(agent?.user_id, {
        to: targetNumber,
        body: reviewed.body,
        channel: channel === "whatsapp" ? "whatsapp" : "sms",
        agentId: agent?.id,
      });
      return {
        toolCallId,
        result: outcome.ok
          ? `${outcome.channel === "whatsapp" ? "WhatsApp" : "SMS"} sent to ${targetNumber}.`
          : outcome.reason || "Message send failed.",
      };
    } catch {
      return {
        toolCallId,
        result:
          "I wasn't able to send that text right now. Let me note that and have someone follow up.",
      };
    }
  }

  if (fn === "lookup_phone_number") {
    try {
      const fallbackNumber =
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
        (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
      const targetNumber = sanitizePhone(args?.phone_number || fallbackNumber);

      if (!targetNumber) {
        return {
          toolCallId,
          result: "No phone number was available to validate.",
        };
      }

      const lookup = await lookupTenantPhoneNumber(agent?.user_id, targetNumber);
      return {
        toolCallId,
        result: lookup.ok
          ? `Lookup for ${lookup.phoneNumber || targetNumber}: valid=${lookup.valid ? "yes" : "no"}, line_type=${lookup.lineType || "unknown"}, carrier=${lookup.carrierName || "unknown"}.`
          : lookup.reason || "Phone lookup failed.",
      };
    } catch {
      return {
        toolCallId,
        result: "I wasn't able to verify that number right now, but I've noted it down.",
      };
    }
  }

  if (fn === "add_to_dnc") {
    try {
      const fallbackNumber =
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
        (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
      const rawPhone = String(args?.phone_number || fallbackNumber || "");
      const normalizedPhone = normalizeDncPhone(rawPhone);

      if (!normalizedPhone) {
        return {
          toolCallId,
          result: "No valid phone number was available to suppress.",
        };
      }

      await drizzle
        .insert(schema.dncList)
        .values({
          userId: agent?.user_id,
          phone: normalizedPhone,
          phoneRaw: rawPhone,
          reason: args?.reason || "agent opt-out",
          source: "agent_tool",
        })
        .onConflictDoNothing({ target: [schema.dncList.userId, schema.dncList.phone] });

      void auditLogger
        .logDnc("added", {
          userId: agent?.user_id,
          count: 1,
          metadata: {
            phone: rawPhone,
            source: "agent_tool",
            reason: args?.reason || null,
          },
        })
        .catch((err) =>
          log.warn("audit logDnc(agent_tool) failed", {
            phone: rawPhone,
            error: err instanceof Error ? err.message : String(err),
          }),
        );

      // Real-time termination for the current call if it's the same number
      const { SentinelService } = await import("../../services/sentinel");
      const sentinel = new SentinelService();
      void sentinel.terminateActiveCallsForNumber(normalizedPhone).catch((err) =>
        log.error("sentinel terminate-on-agent-DNC failed", {
          phone: normalizedPhone,
          error: err instanceof Error ? err.message : String(err),
        }),
      );

      return {
        toolCallId,
        result: `${rawPhone || normalizedPhone} is now on the Do Not Call list.`,
      };
    } catch {
      return {
        toolCallId,
        result: "I've noted your preference. We'll make sure that's taken care of.",
      };
    }
  }

  return null;
}
