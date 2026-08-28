/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi webhook/tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import { asc, eq, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { drizzle, log } from "../../lib/server-context";
import { isOwnerRoutingShowcaseTool } from "../../lib/showcase-assistant";
import { sanitizePhone } from "../../lib/vapi-helpers";
import { handleSendPaymentLink, handleSendSignupLink } from "../../lib/vapi-tool-handlers";
import { normalizeVapiToolCalls } from "../../lib/vapi-tool-call-utils";

export type ShowcaseCallContext = {
  callId: string;
  callerName: string | null;
  callerNumber: string | null;
  dialedNumber: string | null;
};

export function extractShowcaseCallContext(
  payload: Record<string, unknown>,
  message?: Record<string, any>,
): ShowcaseCallContext {
  const call = ((payload.call as Record<string, any> | undefined) ||
    (message?.call as Record<string, any> | undefined) ||
    {}) as Record<string, any>;
  const rawDialedNumber =
    typeof call.phoneNumber === "string" ? call.phoneNumber : call.phoneNumber?.number;

  return {
    callId:
      (typeof call.id === "string" && call.id) ||
      `showcase-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    callerName:
      typeof call.customer?.name === "string" && call.customer.name.trim()
        ? call.customer.name.trim()
        : null,
    callerNumber: sanitizePhone(call.customer?.number) || null,
    dialedNumber: sanitizePhone(rawDialedNumber) || rawDialedNumber || null,
  };
}

export function normalizeTaskPriority(priority: unknown): "low" | "medium" | "high" {
  return priority === "low" || priority === "high" ? priority : "medium";
}

export async function resolveShowcaseOwnerUserId(): Promise<string | null> {
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (ownerEmail) {
    const [owner] = await drizzle
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${ownerEmail}`)
      .limit(1);
    if (owner?.id) return owner.id;
  }

  const [admin] = await drizzle
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.isAdmin, true))
    .orderBy(asc(schema.users.createdAt))
    .limit(1);

  return admin?.id ?? null;
}

export async function queueShowcaseTask(args: {
  ownerUserId: string | null;
  taskType: string;
  description: string;
  priority: "low" | "medium" | "high";
  callContext: ShowcaseCallContext;
  showcaseAgentName: string;
  extraCustomerInfo?: Record<string, unknown>;
}): Promise<boolean> {
  if (!args.ownerUserId) return false;

  await drizzle.insert(schema.followUpTasks).values({
    userId: args.ownerUserId,
    taskType: args.taskType,
    description: args.description,
    priority: args.priority,
    status: "pending",
    sourceType: "showcase_call",
    sourceId: args.callContext.callId,
    targetChannel: "manual",
    customerInfo: {
      showcaseAgent: args.showcaseAgentName,
      callerName: args.callContext.callerName,
      callerNumber: args.callContext.callerNumber,
      dialedNumber: args.callContext.dialedNumber,
      ...(args.extraCustomerInfo || {}),
    },
  });

  return true;
}

export async function handleShowcaseToolCalls(args: {
  payload: Record<string, unknown>;
  message: Record<string, any>;
  showcaseAgentName: string;
  showcaseKind: "cs" | "demo";
}) {
  const toolCalls = normalizeVapiToolCalls(args.message);
  const callContext = extractShowcaseCallContext(args.payload, args.message);
  const ownerUserId = await resolveShowcaseOwnerUserId();
  const results: Array<{ toolCallId: string; result: string }> = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.name;
    const toolArgs = toolCall.arguments;

    // Demo lines are pure showcases on the public landing page. They must
    // never page the founder (Mike) — no escalations, no callbacks, no
    // follow-up tasks. Even if the model hallucinates an owner-routing
    // tool, short-circuit here so a demo call can never land a task in
    // the owner's triage inbox. Only the real BotBound employee lines
    // ("cs") are allowed to escalate to a human.
    if (args.showcaseKind === "demo" && isOwnerRoutingShowcaseTool(toolName)) {
      results.push({
        toolCallId: toolCall.id,
        result:
          "This is a live BotBound demo, so I can't transfer you or set up a callback from our team. " +
          "If you'd like to talk to the real BotBound team, I can email you a link to sign up and add Runtime Balance when you are ready for live calls.",
      });
      continue;
    }

    if (toolName === "send_signup_link") {
      const { sendSignupLinkEmail } = await import("../../lib/email-service");
      const { result } = await handleSendSignupLink(toolArgs, {
        sendSignupLinkEmail,
        agentName: args.showcaseAgentName,
        log,
      });
      if (result.startsWith("DELIVERY_FAILED:")) {
        await queueShowcaseTask({
          ownerUserId,
          taskType: "showcase_signup_email_failed",
          description: `[Signup email failed] ${args.showcaseAgentName} → ${String(toolArgs.to_email || "unknown")}`,
          priority: "high",
          callContext,
          showcaseAgentName: args.showcaseAgentName,
          extraCustomerInfo: { to_email: toolArgs.to_email, tool_result: result.slice(0, 500) },
        }).catch(() => false);
      }
      results.push({ toolCallId: toolCall.id, result });
      continue;
    }

    if (toolName === "send_payment_link") {
      const { sendPaymentLinkEmail } = await import("../../lib/email-service");
      const { result } = await handleSendPaymentLink(toolArgs, {
        sendPaymentLinkEmail,
        log,
      });
      if (result.startsWith("DELIVERY_FAILED:")) {
        await queueShowcaseTask({
          ownerUserId,
          taskType: "showcase_payment_email_failed",
          description: `[Payment email failed] ${args.showcaseAgentName} → ${String(toolArgs.to_email || "unknown")}`,
          priority: "high",
          callContext,
          showcaseAgentName: args.showcaseAgentName,
          extraCustomerInfo: { to_email: toolArgs.to_email, tool_result: result.slice(0, 500) },
        }).catch(() => false);
      }
      results.push({ toolCallId: toolCall.id, result });
      continue;
    }

    if (toolName === "schedule_callback") {
      const callbackDatetime = String(toolArgs.callback_datetime || "").trim();
      const notes = String(toolArgs.notes || "Caller asked for a callback.").trim();
      const queued = await queueShowcaseTask({
        ownerUserId,
        taskType: "showcase_callback",
        description: `[Showcase callback] ${args.showcaseAgentName}: ${notes}`,
        priority: "high",
        callContext,
        showcaseAgentName: args.showcaseAgentName,
        extraCustomerInfo: { callbackDatetime },
      }).catch(() => false);

      results.push({
        toolCallId: toolCall.id,
        result: queued
          ? `Your callback request was recorded for team review with a preferred time of ${callbackDatetime || "the time you mentioned"}. That time is not yet scheduled or confirmed.`
          : "I couldn't record the callback request. Please use the Support link at botbound.me for another contact path.",
      });
      continue;
    }

    if (toolName === "escalate_to_human") {
      const reason = String(toolArgs.reason || "Caller requested a human follow-up.").trim();
      const queued = await queueShowcaseTask({
        ownerUserId,
        taskType: "human_escalation",
        description: `[Showcase escalation] ${args.showcaseAgentName}: ${reason}`,
        priority: "high",
        callContext,
        showcaseAgentName: args.showcaseAgentName,
        extraCustomerInfo: { reason },
      }).catch(() => false);

      results.push({
        toolCallId: toolCall.id,
        result: queued
          ? "Your request was recorded for team review. I can't promise when someone will respond."
          : "I couldn't record the review request. Please use the Support link at botbound.me for another contact path.",
      });
      continue;
    }

    if (toolName === "create_followup_task") {
      const description = String(toolArgs.description || "Public-line follow-up requested.").trim();
      const queued = await queueShowcaseTask({
        ownerUserId,
        taskType: "showcase_follow_up",
        description: `[Showcase follow-up] ${args.showcaseAgentName}: ${description}`,
        priority: normalizeTaskPriority(toolArgs.priority),
        callContext,
        showcaseAgentName: args.showcaseAgentName,
      }).catch(() => false);

      results.push({
        toolCallId: toolCall.id,
        result: queued
          ? "Your follow-up request was recorded for team review."
          : "I couldn't record the follow-up request. Please use the Support link at botbound.me for another contact path.",
      });
      continue;
    }

    if (toolName === "capture_customer_profile") {
      const queued = await queueShowcaseTask({
        ownerUserId,
        taskType: "showcase_profile",
        description: `[Showcase profile] ${args.showcaseAgentName}: structured caller notes captured.`,
        priority: "medium",
        callContext,
        showcaseAgentName: args.showcaseAgentName,
        extraCustomerInfo: { profile: toolArgs },
      }).catch(() => false);

      results.push({
        toolCallId: toolCall.id,
        result: queued
          ? "Great, I've captured your details for the team."
          : "I couldn't record those details. Please use the Support link at botbound.me for another contact path.",
      });
      continue;
    }

    if (toolName === "view_recent_interactions") {
      results.push({
        toolCallId: toolCall.id,
        result: "No prior call history is stored for this public showcase line.",
      });
      continue;
    }

    if (
      toolName === "book_appointment" ||
      toolName === "book_consultation" ||
      toolName === "book_showing" ||
      toolName === "file_claim" ||
      toolName === "schedule_service" ||
      toolName === "book_discovery_call"
    ) {
      results.push({
        toolCallId: toolCall.id,
        result: "DEMO_SUCCESS: Action successfully simulated for the demo.",
      });
      continue;
    }

    results.push({
      toolCallId: toolCall.id,
      result: "That's not something I can do on this line, but I'm happy to help you another way.",
    });
  }

  return results;
}
