/* eslint-disable @typescript-eslint/no-explicit-any -- Live tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import { and, eq, inArray } from "drizzle-orm";

import { actionExecutionMode } from "../bot-permission";
import { superviseClientCommunication, type OwnerDecisionRequest } from "../ai-supervisor";
import { ownerDecisionRequestFor } from "../owner-decision";
import { ACTIVE_OPERATOR_TASK_STATUSES } from "../operator-work-status";
import * as schema from "../../db/schema";
import { auditLogger, log as serverLog } from "../server-context";
import { normalizeDncPhone } from "../compliance";
import {
  CALLER_LINKED_LIVE_WRITE_DENIAL,
  PRIVATE_LIVE_READ_DENIAL,
} from "../unverified-live-tools";
import {
  CONSENT_RULE_VERSION,
  buildConsentLedgerRow,
  getConsentRuleForPhone,
} from "../tcpa-consent";
import { IntegrationService } from "../integrations";
import { lookupTenantPhoneNumber, sendTenantMessage } from "../twilio-service";
import { sanitizePhone } from "../agent-runtime-helpers";
import { handleSendPaymentLink, handleSendSignupLink } from "../agent-link-tool-handlers";
import {
  excerptAroundMatch,
  knowledgeSearchWords,
  searchAgentKnowledge,
} from "../agent-knowledge-search";

import type { ToolCallContext, ToolCallResult } from "../agent-tool-types";
import { phoneSuffixForLog } from "../twilio-webhook-privacy";
import { spokenSmsFailureReason } from "../sms-customer-errors";
import { recordKnowledgeGap } from "../knowledge-gaps";
import { callerPhoneKey } from "../caller-phone-match";
import {
  externalEntityActionPolicyForUser,
  liveExternalActionPolicyForUser,
  type ExternalEntityTarget,
} from "../account-environment-policy";

// ─── Knowledge search ────────────────────────────────────────────────────────
const MAX_KB_RESULTS = 8;
const MAX_KB_RESULT_CHARS = 600;

/**
 * Search every rule and fact the Bot was taught. Entries are scored whole and
 * excerpted only on output, around the caller's match, so an answer deep in a
 * long entry is still found and shown.
 */
async function searchKnowledgeForCaller(
  drizzle: any,
  userId: string,
  agentId: string,
  query: string,
  callId?: string | null,
): Promise<string> {
  if (!userId || !agentId) {
    return "NO_VERIFIED_MATCH: The agent identity could not be verified. Do not answer the factual question. Offer to take a message or escalate to a human.";
  }

  const words = knowledgeSearchWords(query);
  // The owner is shown what was asked, with a link to add the answer. Not
  // waited for: the caller is on the line, and it never throws.
  const saveForOwner = () =>
    void recordKnowledgeGap(drizzle, { userId, agentId, question: query, callId }).catch(() => {});
  const matches = await searchAgentKnowledge(drizzle, {
    userId,
    agentId,
    query,
    limit: MAX_KB_RESULTS,
  });
  if (matches.length === 0) {
    // A question of common words only ("is it ok?") has nothing to look up.
    if (words.length === 0) {
      return "NO_VERIFIED_MATCH: The question is too broad to verify safely. Ask the caller for the specific product, service, policy, date, or detail they need.";
    }
    saveForOwner();
    return "NO_VERIFIED_MATCH: No approved knowledge matched the caller's question. Do not answer from memory, inference, or an unrelated entry. For current public facts, use the approved live-research tool only when enabled; otherwise take a message or escalate.";
  }

  // Nothing saved uses the caller's words: what follows was found by meaning
  // alone, and the nearest entry is returned however far it is. The Bot is
  // told so instead of being handed it as verified, and the owner is told
  // what was asked.
  const verified = matches.filter((match) => match.score > 0);
  const byMeaning = matches.filter((match) => match.score <= 0);
  const excerpt = (match: (typeof matches)[number]) =>
    `[${match.source}] ${excerptAroundMatch(match.content, words, MAX_KB_RESULT_CHARS)}`;
  if (!verified.length) {
    if (words.length > 0) saveForOwner();
    return [
      "POSSIBLE_MATCH: Nothing saved uses the caller's words. The entries below were found by meaning and may not answer the question. Use one only if it clearly answers what was asked; otherwise say you do not have that information and offer to take a message. Do not combine them with assumptions.",
      ...byMeaning.map(excerpt),
    ].join("\n\n");
  }
  // Entries found by meaning keep their label beside a keyword match: they
  // are the nearest the index had, however far, and were listed as verified.
  return [
    "VERIFIED_KNOWLEDGE_MATCH: Answer only from the approved excerpts below. If they do not fully resolve the question, say you do not have a verified answer and offer follow-up; do not combine them with assumptions.",
    ...verified.map(excerpt),
    ...(byMeaning.length
      ? [
          "POSSIBLE_MATCH: These were found by meaning, not by the caller's words, and may not answer the question. Use one only if it clearly does.",
          ...byMeaning.map(excerpt),
        ]
      : []),
  ].join("\n\n");
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a real follow-up request a human can act on without promising future
 * delivery. The client-comms
 * supervisor THROWS on a block (it never returns approved:false), so a blocked
 * or failed send lands in a catch — where the agent used to tell the caller a
 * human would follow up while writing nothing at all. Best-effort: never let a
 * task-write failure turn into an unhandled tool error.
 */
async function recordCommsFollowUpTask(
  drizzle: any,
  values: {
    userId: string;
    agentId?: string | null;
    channel: "email" | "sms" | "whatsapp";
    recipient: string | null | undefined;
    payload: Record<string, unknown>;
    deliveryStatus?: "not_sent" | "unconfirmed";
    /** The call it came from, so the review can see it is already waiting. */
    source?: { type: "phone_call"; id: string };
  },
): Promise<boolean> {
  try {
    const manualReview = values.channel !== "sms" || values.deliveryStatus === "unconfirmed";
    await drizzle.insert(schema.followUpTasks).values({
      userId: values.userId,
      agentId: values.agentId ?? null,
      // Unknown outcomes need a human duplicate check. WhatsApp recovery must
      // never enter the SMS-only action executor and silently change transport.
      taskType: manualReview ? "follow_up" : "send_text_message",
      description:
        values.channel === "email"
          ? `Email follow-up to ${values.recipient || "caller"}. ${
              values.deliveryStatus === "not_sent"
                ? "No email was sent; review the request before sending manually."
                : "Delivery is unconfirmed; check sent mail before sending to avoid duplicates."
            }`
          : manualReview
            ? `${values.channel === "whatsapp" ? "WhatsApp" : "SMS"} follow-up to ${values.recipient || "caller"}. ${
                values.deliveryStatus === "not_sent"
                  ? "No message was sent; review the request before sending manually."
                  : "Delivery is unconfirmed; check carrier history before sending to avoid duplicates."
              }${values.channel === "whatsapp" ? " Use WhatsApp, not SMS." : ""}`
            : `Text follow-up to ${values.recipient || "caller"}, flagged for human review from a live call`,
      status: "pending",
      priority: "high",
      targetChannel: manualReview ? "manual" : values.channel,
      sourceType: values.source?.type ?? "voice_tool",
      ...(values.source ? { sourceId: values.source.id } : {}),
      payload: manualReview
        ? {
            ...values.payload,
            channel: values.channel,
            delivery_status: values.deliveryStatus || "unconfirmed",
          }
        : values.payload,
    });
    return true;
  } catch {
    return false;
  }
}

const sameWords = (a: unknown, b: unknown) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Messages from this call that already wait for the owner. A caller who hears
 * "I'm checking with the team" and says "just send it" must not get a second,
 * luckier verdict, so the review is shown what is already waiting, and the
 * same message is never filed twice. A lookup that fails reads as nothing
 * waiting: the review still runs on its own criteria.
 */
async function waitingForOwnerOnThisCall(
  drizzle: any,
  input: { userId: string; callId: string; taskType: "send_email" | "send_text_message" },
): Promise<string[]> {
  try {
    const rows: Array<{ payload: unknown }> = await drizzle
      .select({ payload: schema.followUpTasks.payload })
      .from(schema.followUpTasks)
      .where(
        and(
          eq(schema.followUpTasks.userId, input.userId),
          eq(schema.followUpTasks.sourceType, "phone_call"),
          eq(schema.followUpTasks.sourceId, input.callId),
          // A held WhatsApp message waits as a note, not a text the owner can send.
          input.taskType === "send_text_message"
            ? inArray(schema.followUpTasks.taskType, ["send_text_message", "follow_up"])
            : eq(schema.followUpTasks.taskType, input.taskType),
          inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES]),
        ),
      )
      .limit(3);
    return rows
      .map((row) => (row.payload as { body?: unknown } | null)?.body)
      .filter((body): body is string => typeof body === "string" && Boolean(body.trim()));
  } catch {
    return [];
  }
}

/** The review is told what already waits from this call, when anything does. */
async function withWhatAlreadyWaits(
  drizzle: any,
  request: OwnerDecisionRequest | undefined,
  input: { userId: string; callId: string; taskType: "send_email" | "send_text_message" },
): Promise<OwnerDecisionRequest | undefined> {
  if (!request) return undefined;
  const alreadyWaiting = await waitingForOwnerOnThisCall(drizzle, input);
  return alreadyWaiting.length ? { ...request, alreadyWaiting } : request;
}

async function tenantLiveExternalActionBlock(
  userId: string | null | undefined,
  action: string,
  target?: ExternalEntityTarget,
): Promise<string | null> {
  if (!userId) return "The workspace could not be verified, so no live action was taken.";
  try {
    const environmentPolicy = await liveExternalActionPolicyForUser(userId);
    if (!environmentPolicy.allowed) {
      return environmentPolicy.message;
    }
    if (target) {
      const entityPolicy = await externalEntityActionPolicyForUser(userId, target);
      if (!entityPolicy.allowed) return entityPolicy.message;
    }
    return null;
  } catch (error) {
    contextSafeLog(action, error);
    return "Live actions are temporarily unavailable, so nothing was sent.";
  }
}

function contextSafeLog(action: string, error: unknown): void {
  serverLog.warn("Live tenant external-action policy failed closed", {
    action,
    error: error instanceof Error ? error.message : String(error),
  });
}

export async function handleCoreToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, agentVoiceName, drizzle, log, message, payload, toolCallId, webhookAgentId } =
    context;

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
      const searchCallId = message.call?.id || (payload.call as { id?: string } | undefined)?.id;
      const results = await searchKnowledgeForCaller(
        drizzle,
        agent?.user_id || "",
        webhookAgentId,
        query,
        typeof searchCallId === "string" ? searchCallId : null,
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
      const { title, description, priority } = args || {};
      const text = [title, description]
        .map((part) => (typeof part === "string" ? part.trim() : ""))
        .filter(Boolean);
      // The caller's number lets the owner call back straight from Approvals.
      const callerNumber =
        (
          message.call as { customer?: { number?: string | null } } | undefined
        )?.customer?.number?.trim() || null;
      const [task] = await drizzle
        .insert(schema.followUpTasks)
        .values({
          userId: agent?.user_id,
          agentId: webhookAgentId,
          taskType: "follow_up",
          description:
            text.length > 1 && !text[1].startsWith(text[0])
              ? `${text[0]}: ${text[1]}`
              : text.at(-1) || "Caller follow-up",
          customerInfo: callerNumber ? { phone: callerNumber } : null,
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
        result:
          "I couldn't save that follow-up task just now. Please contact the team directly or ask me to try again.",
      };
    }
  }

  if (fn === "search_leads") {
    return { toolCallId, result: PRIVATE_LIVE_READ_DENIAL };
  }

  if (fn === "update_lead_status") {
    return { toolCallId, result: CALLER_LINKED_LIVE_WRITE_DENIAL };
  }

  if (fn === "send_email") {
    const { to_email, subject, body, email_confirmed } = args || {};
    let sendAttempted = false;
    let emailPayload = { to: to_email, subject, body };
    // Set for a Bot on Auto: the review then also decides whether the owner
    // would want a say before this goes.
    let ownerDecision: OwnerDecisionRequest | undefined;
    try {
      const blocked = await tenantLiveExternalActionBlock(agent?.user_id, "vapi_email_send", {
        email: to_email,
      });
      if (blocked) return { toolCallId, result: blocked };
      if (email_confirmed !== true) {
        return {
          toolCallId,
          result:
            "EMAIL_CONFIRMATION_REQUIRED: No email was sent or follow-up saved. Read back the exact email address and wait for the caller to confirm it before trying again with email_confirmed=true. Do not guess a spelling or correction.",
        };
      }
      const callId = message.call?.id || (payload.call as { id?: string } | undefined)?.id;
      if (typeof callId === "string" && callId) {
        const [permissions] = await drizzle
          .select({
            agentLevel: schema.agents.autonomyLevel,
            tenantLevel: schema.settings.autonomyLevel,
            playbook: schema.agents.playbook,
          })
          .from(schema.agents)
          .leftJoin(schema.settings, eq(schema.settings.userId, schema.agents.userId))
          .where(and(eq(schema.agents.id, agent.id), eq(schema.agents.userId, agent.user_id)))
          .limit(1);
        if (!permissions)
          return {
            toolCallId,
            result: "Email permission could not be verified. No email was sent.",
          };
        ownerDecision = await withWhatAlreadyWaits(
          drizzle,
          ownerDecisionRequestFor(permissions, permissions.playbook),
          { userId: agent.user_id, callId, taskType: "send_email" },
        );
        if (actionExecutionMode({ ...permissions, actionType: "send_email" }) === "draft") {
          const { executeAction } = await import("../action-engine");
          const approval = await executeAction(
            agent.user_id,
            { type: "send_email", agentId: agent.id, priority: "medium", payload: emailPayload },
            { sourceType: "phone_call", sourceId: callId },
            "draft",
          );
          return {
            toolCallId,
            result:
              approval.success && approval.queued
                ? `DRAFT_SAVED: ${to_email}
The email is written and waiting for the team to send it. Tell the caller in plain words, for example: "I've written that up and passed it to the team to send." Do not say it was sent, do not mention approval or a queue, and do not promise a delivery time.`
                : "The email request could not be saved for the team. No email was sent.",
          };
        }
      }
      // Throws ClientCommunicationBlockedError on a block — there is no
      // approved:false return, so a blocked send falls through to the catch,
      // which records a real task instead of fabricating a follow-up.
      const reviewed = await superviseClientCommunication({
        channel: "email",
        agentName: agentVoiceName,
        source: "voice_tool",
        purpose: "client follow-up requested during a live call",
        recipient: to_email,
        subject,
        body,
        context:
          "Outbound email generated from a live Bot tool call during a customer conversation.",
        ownerDecision,
      });
      if (reviewed.ownerDecision) {
        const waitingForOwner = `DRAFT_SAVED: ${to_email}
The email is written and the owner needs to confirm one thing before it goes. Tell the caller in plain words, for example: "I've written that up, and I'm checking one thing with the team before it goes out." Do not say it was sent, do not promise what the answer will be, and do not mention approval or a queue.`;
        // The same email is already with the owner from this call.
        if (ownerDecision?.alreadyWaiting?.some((waiting) => sameWords(waiting, body))) {
          return { toolCallId, result: waitingForOwner };
        }
        // The Bot decided its owner would want a say. The email waits as it
        // was written, with what the owner has to decide. `ownerDecision` is
        // only requested inside the branch above, so the call is known.
        const { executeAction } = await import("../action-engine");
        const held = await executeAction(
          agent.user_id,
          {
            type: "send_email",
            agentId: agent.id,
            priority: "medium",
            payload: { ...emailPayload, reasoning: reviewed.ownerDecision },
          },
          { sourceType: "phone_call", sourceId: String(callId) },
          "draft",
        );
        return {
          toolCallId,
          result:
            held.success && held.queued
              ? waitingForOwner
              : "The email request could not be saved for the team. No email was sent.",
        };
      }
      emailPayload = { to: to_email, subject: reviewed.subject || subject, body: reviewed.body };
      const service = new IntegrationService(agent?.user_id);
      sendAttempted = true;
      const success = await service.sendEmail({ ...emailPayload, agentId: agent.id });
      if (success) {
        return {
          toolCallId,
          result: `SUBMISSION_OK: Email accepted by the sending service for ${to_email}. Confirm briefly, for example: "I've sent that over. Is there anything else I can help with?" Then pause. Do not read the email or overview aloud unless asked. If the caller is saying goodbye, close warmly instead. Submission succeeded. Inbox arrival is separate and has not been checked. Do not describe this as a failed send or offer a retry. Do not resend merely because inbox arrival is unverified.`,
        };
      }
      const recorded = await recordCommsFollowUpTask(drizzle, {
        userId: agent?.user_id,
        agentId: agent?.id,
        channel: "email",
        recipient: to_email,
        payload: emailPayload,
        deliveryStatus: "unconfirmed",
      });
      return {
        toolCallId,
        result: recorded
          ? "The email send was not confirmed. Your request was saved for manual review. Do not promise delivery or retry automatically; the team should check sent mail first to avoid duplicates."
          : "The email send was not confirmed, and your follow-up request could not be saved. Please contact the team directly. Do not retry automatically or promise delivery.",
      };
    } catch {
      // Preserve uncertainty after starting a send. A provider may have accepted
      // it before an exception; manual review must not automatically send twice.
      const recorded = await recordCommsFollowUpTask(drizzle, {
        userId: agent?.user_id,
        agentId: agent?.id,
        channel: "email",
        recipient: to_email,
        payload: emailPayload,
        deliveryStatus: sendAttempted ? "unconfirmed" : "not_sent",
      });
      const delivery = sendAttempted ? "The email send was not confirmed." : "No email was sent.";
      return {
        toolCallId,
        result: recorded
          ? `${delivery} Your request was saved for manual review. Do not promise delivery or retry automatically.${sendAttempted ? " The team should check sent mail first to avoid duplicates." : ""}`
          : `${delivery} Your follow-up request could not be saved. Please contact the team directly. Do not retry automatically or promise delivery.`,
      };
    }
  }

  // Tenant signup-link tool. Retired showcase profiles are not public runtime
  // entrypoints; authenticated tenant policy owns every live invocation.
  //
  // Core branch logic lives in src/lib/agent-link-tool-handlers.ts so it
  // can be unit-tested with mocked transports — the route stays a
  // thin adapter (look up the agent name, inject deps).
  if (fn === "send_signup_link") {
    const blocked = await tenantLiveExternalActionBlock(
      agent?.user_id,
      "vapi_tenant_signup_link_email",
      { email: args?.to_email },
    );
    if (blocked) return { toolCallId, result: `DELIVERY_FAILED: ${blocked}` };
    const { sendSignupLinkEmail } = await import("../email-service");
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

  // send_payment_link — emails the caller a checkout link for a
  // specific plan so they can pay + activate without friction.
  if (fn === "send_payment_link") {
    const blocked = await tenantLiveExternalActionBlock(
      agent?.user_id,
      "vapi_tenant_payment_link_email",
      { email: args?.to_email },
    );
    if (blocked) return { toolCallId, result: `DELIVERY_FAILED: ${blocked}` };
    const { sendPaymentLinkEmail } = await import("../email-service");
    const { result } = await handleSendPaymentLink(args || {}, {
      sendPaymentLinkEmail,
      log,
    });
    return { toolCallId, result };
  }

  if (fn === "send_text_message") {
    const requestedChannel = args?.channel === "whatsapp" ? "whatsapp" : "sms";
    let sendAttempted = false;
    let recoveryBody = args?.message_body;
    // Set for a Bot on Auto: the review then also decides whether the owner
    // would want a say before this goes.
    let ownerDecision: OwnerDecisionRequest | undefined;
    const notConfirmed = (reason: string): ToolCallResult => ({
      toolCallId,
      result: `The message was not confirmed. ${reason}`,
    });
    try {
      const { to_number, channel, message_body } = args || {};
      const fallbackNumber =
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
        (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
      const liveCallerNumber = sanitizePhone(fallbackNumber);
      const requestedNumber = sanitizePhone(to_number || fallbackNumber);
      // A caller's own number is rarely said the way the carrier reports it:
      // "512-555-0100" on a call from +15125550100. Compared as text, the
      // person on the line was treated as a stranger, and the text they asked
      // for was held to the rules for a cold message. It is the same phone, and
      // the carrier's form is the one that sends.
      const requestedKey = callerPhoneKey(requestedNumber);
      const isLiveCounterpart =
        Boolean(liveCallerNumber) &&
        (requestedNumber === liveCallerNumber ||
          (requestedKey !== null && requestedKey === callerPhoneKey(liveCallerNumber)));
      const targetNumber = isLiveCounterpart ? liveCallerNumber : requestedNumber;

      if (!targetNumber) {
        return notConfirmed("No destination number was available for that message.");
      }

      if (!agent?.user_id) {
        return notConfirmed(
          "I wasn't able to send that text because I couldn't verify the account. Please reach out to us directly.",
        );
      }

      const blocked = await tenantLiveExternalActionBlock(
        agent.user_id,
        "vapi_tenant_message_send",
        { phone: targetNumber },
      );
      if (blocked) return notConfirmed(blocked);

      // Mid-call SMS must clear the shared outbound gate. The live-session
      // exemptions (skip quiet hours + 24h duplicate, supply consent) are only
      // valid when the text goes to the consumer who is on this call —
      // to_number is a model-supplied argument, so any OTHER destination is a
      // cold outbound text and gets the full gate: quiet hours, duplicate
      // window, tenant DNC, and consent evaluation with no synthesized
      // express-written-consent.
      const { evaluateOutboundDialGate } = await import("../outbound-dial-gate");
      const gate = await evaluateOutboundDialGate({
        userId: agent.user_id,
        phone: targetNumber,
        isMarketingCall: !isLiveCounterpart,
        salesScreening: isLiveCounterpart ? "bulk" : "one_off",
        hasExpressWrittenConsent: isLiveCounterpart,
        isLiveSessionFollowUp: isLiveCounterpart,
      });
      if (!gate.allowed) {
        const isDncBlock = gate.reason === "blocked_internal_dnc" || gate.reason === "blocked_tcpa";
        const salesAttestation = gate.reason === "sales_attestation_required";
        // Never create a future-send task for a DNC block. For temporary or
        // operational blocks, persist the human-review task before promising
        // the caller that anyone will follow up.
        const recorded =
          !isDncBlock &&
          !salesAttestation &&
          (await recordCommsFollowUpTask(drizzle, {
            userId: agent.user_id,
            agentId: agent?.id,
            channel: requestedChannel,
            recipient: targetNumber,
            payload: { to: targetNumber, body: message_body, blocked_reason: gate.reason },
            deliveryStatus: "not_sent",
          }));
        return notConfirmed(
          salesAttestation
            ? "I can't send a sales text until you confirm, once, that you're responsible for permission and Do Not Call rules. You'll see that checkbox the next time you place a sales call or text."
            : isDncBlock
              ? "I can't text that number, it's on a do-not-contact list."
              : gate.reason === "outside_permitted_calling_hours"
                ? recorded
                  ? "I can't text that number right now, it's outside permitted contact hours. I've logged the request for human follow-up."
                  : "I can't text that number right now, it's outside permitted contact hours. Please contact us directly."
                : recorded
                  ? "I wasn't able to send that text, but I've logged it for human follow-up."
                  : "I wasn't able to send that text right now, please reach out to us directly.",
        );
      }

      // A Bot works on its own unless its owner asked to see customer messages
      // first. Email already honoured that choice; a text did not, so an owner
      // who chose to check first still had texts leave during the call.
      const textCallId =
        (message.call as { id?: string } | undefined)?.id ||
        (payload.call as { id?: string } | undefined)?.id;
      // Leaves the text waiting for the owner. With a reason, the Bot itself
      // decided the owner would want a say, and the owner is told why.
      let holdTextForOwner: ((reason?: string) => Promise<ToolCallResult>) | null = null;
      if (typeof textCallId === "string" && textCallId && agent?.id) {
        const [permissions] = await drizzle
          .select({
            agentLevel: schema.agents.autonomyLevel,
            tenantLevel: schema.settings.autonomyLevel,
            playbook: schema.agents.playbook,
          })
          .from(schema.agents)
          .leftJoin(schema.settings, eq(schema.settings.userId, schema.agents.userId))
          .where(and(eq(schema.agents.id, agent.id), eq(schema.agents.userId, agent.user_id)))
          .limit(1);
        if (!permissions) return notConfirmed("Text permission could not be verified.");
        holdTextForOwner = async (reason) => {
          const heldPayload = {
            to: targetNumber,
            body: message_body,
            ...(reason ? { reasoning: reason } : {}),
          };
          const waiting = reason
            ? `the owner needs to confirm one thing before it goes. Tell the caller in plain words, for example: "I've written that up, and I'm checking one thing with the team before it goes out." Do not say it was sent, and do not promise what the answer will be.`
            : `waiting for the team to send it. Tell the caller in plain words, for example: "I've written that up and passed it to the team to send." Do not say it was sent.`;
          // A held WhatsApp request must stay WhatsApp. The owner's send
          // button for a held text sends SMS, so this one waits as a note
          // that says which channel the caller asked for.
          if (requestedChannel === "whatsapp") {
            const noted = await recordCommsFollowUpTask(drizzle, {
              userId: agent.user_id,
              agentId: agent.id,
              channel: "whatsapp",
              recipient: targetNumber,
              payload: heldPayload,
              deliveryStatus: "not_sent",
              ...(textCallId ? { source: { type: "phone_call" as const, id: textCallId } } : {}),
            });
            return noted
              ? {
                  toolCallId,
                  result: `DRAFT_SAVED: ${targetNumber}
The WhatsApp message is written and ${waiting}`,
                }
              : notConfirmed("The request could not be saved for the team. No message was sent.");
          }
          const { executeAction } = await import("../action-engine");
          const held = await executeAction(
            agent.user_id,
            {
              type: "send_text_message",
              agentId: agent.id,
              priority: "medium",
              payload: heldPayload,
            },
            { sourceType: "phone_call", sourceId: textCallId },
            "draft",
          );
          return held.success && held.queued
            ? {
                toolCallId,
                result: `DRAFT_SAVED: ${targetNumber}
The text is written and ${waiting}`,
              }
            : notConfirmed("The text request could not be saved for the team. No text was sent.");
        };
        if (actionExecutionMode({ ...permissions, actionType: "send_text_message" }) === "draft") {
          // Awaited here so a save that throws reaches the fallback below.
          return await holdTextForOwner();
        }
        ownerDecision = await withWhatAlreadyWaits(
          drizzle,
          ownerDecisionRequestFor(permissions, permissions.playbook),
          { userId: agent.user_id, callId: textCallId, taskType: "send_text_message" },
        );
      }

      // Throws ClientCommunicationBlockedError on a block (no approved:false
      // return), so a blocked text falls to the catch below, which records a
      // real task rather than claiming it was queued.
      const reviewed = await superviseClientCommunication({
        channel: "sms",
        agentName: agentVoiceName,
        source: "voice_tool",
        purpose: "client text follow-up requested during a live call",
        recipient: targetNumber,
        body: message_body,
        context: `Requested channel: ${channel === "whatsapp" ? "whatsapp" : "sms"}.`,
        ownerDecision,
      });
      // The Bot decided its owner would want a say. The text waits as it was
      // written, with what the owner has to decide.
      if (reviewed.ownerDecision) {
        // The same text is already with the owner from this call.
        if (ownerDecision?.alreadyWaiting?.some((waiting) => sameWords(waiting, message_body))) {
          return {
            toolCallId,
            result: `DRAFT_SAVED: ${targetNumber}
The text is written and the owner needs to confirm one thing before it goes. Tell the caller in plain words, for example: "I've written that up, and I'm checking one thing with the team before it goes out." Do not say it was sent, and do not promise what the answer will be.`,
          };
        }
        // Awaited here so a save that throws reaches the fallback below.
        return holdTextForOwner
          ? await holdTextForOwner(reviewed.ownerDecision)
          : notConfirmed("The request could not be saved for the team. No message was sent.");
      }
      recoveryBody = reviewed.body;
      sendAttempted = true;
      const outcome = await sendTenantMessage(agent.user_id, {
        to: targetNumber,
        body: reviewed.body,
        channel: channel === "whatsapp" ? "whatsapp" : "sms",
        agentId: agent?.id,
      });
      if (outcome.ok && isLiveCounterpart) {
        // Per-recipient consent record (carrier requirement: "keep records of
        // consent for each recipient"). A live-counterpart send is only
        // reachable after the agent captured the verbal opt-in this tool's
        // guidance mandates, so the send is the consent-capture event — the
        // call recording/transcript behind call_id is the artifact. Cold
        // sends to other numbers rely on pre-existing consent and do not
        // fabricate a grant here. Best-effort: a ledger outage must not fail
        // a message that already left.
        try {
          const consentCallId =
            (message.call as { id?: string } | undefined)?.id ||
            (payload.call as { id?: string } | undefined)?.id ||
            null;
          const { rule, state } = getConsentRuleForPhone(targetNumber);
          const row = buildConsentLedgerRow({
            user_id: agent.user_id,
            call_id: consentCallId,
            customer_number: targetNumber,
            event: "consent_granted",
            rule_version: CONSENT_RULE_VERSION,
            rule,
            state,
            metadata: {
              channel: outcome.channel === "whatsapp" ? "whatsapp" : "sms",
              consent_kind: "sms_verbal_optin",
              source: "send_text_message_tool",
            },
          });
          const existing = consentCallId
            ? await drizzle
                .select({ id: schema.consentLog.id })
                .from(schema.consentLog)
                .where(
                  and(
                    eq(schema.consentLog.userId, row.user_id),
                    eq(schema.consentLog.callId, consentCallId),
                    eq(schema.consentLog.event, "consent_granted"),
                    eq(schema.consentLog.customerNumber, targetNumber),
                  ),
                )
                .limit(1)
            : [];
          if (!existing[0]) {
            await drizzle.insert(schema.consentLog).values({
              userId: row.user_id,
              callId: row.call_id,
              customerNumber: row.customer_number,
              event: row.event,
              ruleVersion: row.rule_version,
              rule: row.rule,
              state: row.state,
              metadata: row.metadata,
            });
          }
        } catch (ledgerErr) {
          log.warn("SMS consent ledger write failed (message already sent)", {
            error: ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr),
          });
        }
      }
      return outcome.ok
        ? {
            toolCallId,
            result: `${outcome.channel === "whatsapp" ? "WhatsApp" : "SMS"} sent to ${targetNumber}.`,
          }
        : // The Bot may say this to the caller, so it never names the carrier vendor.
          notConfirmed(spokenSmsFailureReason(outcome));
    } catch {
      // An exception after entering the transport does not prove rejection.
      // Save reviewed content for manual duplicate checking, never a resend.
      const targetForTask =
        sanitizePhone(
          (args?.to_number as string | undefined) ||
            (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
            (message.call as { customer?: { number?: string } } | undefined)?.customer?.number,
        ) || null;
      const recorded = agent?.user_id
        ? await recordCommsFollowUpTask(drizzle, {
            userId: agent.user_id,
            agentId: agent?.id,
            channel: requestedChannel,
            recipient: targetForTask,
            payload: { to: targetForTask, body: recoveryBody },
            deliveryStatus: sendAttempted ? "unconfirmed" : "not_sent",
          })
        : false;
      return notConfirmed(
        recorded
          ? sendAttempted
            ? "The request was saved for manual review. Check carrier history before sending to avoid duplicates. Do not retry automatically or promise delivery."
            : "I've logged that text for our team to follow up on."
          : sendAttempted
            ? "The follow-up request could not be saved. Do not retry automatically or promise delivery. Ask the caller to contact the business directly."
            : "I wasn't able to send that text right now, please reach out to us directly.",
      );
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

      const blocked = await tenantLiveExternalActionBlock(
        agent?.user_id,
        "vapi_tenant_phone_lookup",
        { phone: targetNumber },
      );
      if (blocked) return { toolCallId, result: blocked };

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
        result: "I wasn't able to verify that number right now.",
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
            phone: phoneSuffixForLog(rawPhone),
            error: err instanceof Error ? err.message : String(err),
          }),
        );

      // A spoken opt-out must stop the active call, not merely suppress future
      // calls. Await the provider control command so the tool result cannot race
      // ahead of the required termination attempt.
      let termination = { attempted: 0, terminated: 0, failed: 0 };
      try {
        const { SentinelService } = await import("../../services/sentinel");
        const sentinel = new SentinelService();
        termination = await sentinel.terminateActiveCallsForNumber(normalizedPhone, agent?.user_id);
      } catch (terminationError) {
        // The DNC row is already durable. A provider/control-plane failure must
        // never fall through to the outer "opt-out was not saved" response.
        termination = { attempted: 0, terminated: 0, failed: 1 };
        log.error("sentinel failed after DNC suppression was persisted", {
          phone: phoneSuffixForLog(normalizedPhone),
          error:
            terminationError instanceof Error ? terminationError.message : String(terminationError),
        });
      }

      if (termination.failed > 0) {
        log.error("sentinel could not confirm every DNC call termination", {
          phone: phoneSuffixForLog(normalizedPhone),
          attempted: termination.attempted,
          terminated: termination.terminated,
          failed: termination.failed,
        });
      }

      return {
        toolCallId,
        result:
          termination.failed > 0
            ? `${rawPhone || normalizedPhone} is now on the Do Not Call list. The carrier did not confirm that every active call ended, so stop speaking and end this call immediately.`
            : `${rawPhone || normalizedPhone} is now on the Do Not Call list. End this conversation immediately.`,
      };
    } catch {
      // The DNC insert failed — nothing was recorded and nothing retries it.
      // Telling the consumer their opt-out "is taken care of" would be false
      // assurance on a legal request; be honest so they can repeat it.
      return {
        toolCallId,
        result:
          "I wasn't able to add that number to the Do Not Call list just now. Please ask me again in a moment, or contact us directly so we can record it.",
      };
    }
  }

  return null;
}
