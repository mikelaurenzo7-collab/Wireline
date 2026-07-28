import { and, desc, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import type { ToolCallContext, ToolCallResult } from "../routes/vapi/types";

const TOOL_EVENT_TYPE = "voice.tool_call";
const TOOL_RESOURCE_TYPE = "vapi_tool_call";
const PROCESSING_STALE_AFTER_MS = 30_000;

const SIDE_EFFECT_TOOL_NAMES = new Set([
  "create_followup_task",
  "send_email",
  "send_text_message",
  "add_to_dnc",
  "book_appointment",
  "update_lead_status",
  "log_payment_promise",
  "create_support_ticket",
  "leave_voicemail",
  "schedule_callback",
  "capture_customer_profile",
  "send_slack_notification",
  "post_x_tweet",
  "reply_to_x_tweet",
  "like_x_tweet",
  "repost_x_tweet",
  "send_x_dm",
  "generate_zoom_link",
  "crm_log_call",
  "crm_create_opportunity",
  "crm_create_contact",
  "crm_update_deal_stage",
  "send_contract",
  "shopify_start_return",
  "shopify_cancel_order",
  "shopify_update_address",
  "shopify_create_draft_order",
  "shopify_add_order_note",
  "shopify_apply_discount",
  "square_create_payment_link",
  "square_send_invoice",
  "send_teams_message",
  "log_to_excel",
  "log_to_google_sheets",
  "meta_submit_lead",
  "navigate_to",
  "add_reminder",
  "play_music",
  "route_to_business_unit",
  "trigger_enterprise_webhook",
  "send_signup_link",
  "create_account",
  "send_payment_link",
]);

export function isIdempotentAgentTool(name: string): boolean {
  return SIDE_EFFECT_TOOL_NAMES.has(name);
}

function callId(context: ToolCallContext): string {
  const payloadCall = context.payload.call as { id?: unknown } | undefined;
  const messageCall = context.message.call as { id?: unknown } | undefined;
  return String(payloadCall?.id || messageCall?.id || "no-call");
}

function resourceId(name: string, context: ToolCallContext): string {
  return `${callId(context)}:${context.toolCallId}:${name}`.slice(0, 500);
}

type ClaimResult =
  | { kind: "claimed"; auditId: bigint }
  | { kind: "cached"; result: string }
  | { kind: "processing" };

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function processingIsFresh(metadata: Record<string, unknown>): boolean {
  const startedAt = Date.parse(String(metadata.startedAt || ""));
  return Number.isFinite(startedAt) && Date.now() - startedAt < PROCESSING_STALE_AFTER_MS;
}

async function claimToolExecution(
  name: string,
  context: ToolCallContext,
  key: string,
): Promise<ClaimResult> {
  return context.drizzle.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);

    const [existing] = await tx
      .select({
        id: schema.auditLog.id,
        metadata: schema.auditLog.metadata,
      })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, context.agent.user_id),
          eq(schema.auditLog.eventType, TOOL_EVENT_TYPE),
          eq(schema.auditLog.resourceType, TOOL_RESOURCE_TYPE),
          eq(schema.auditLog.resourceId, key),
        ),
      )
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(1);

    if (existing) {
      const metadata = metadataRecord(existing.metadata);
      if (metadata.status === "completed" && typeof metadata.result === "string") {
        return { kind: "cached", result: metadata.result };
      }
      if (metadata.status === "processing" && processingIsFresh(metadata)) {
        return { kind: "processing" };
      }

      await tx
        .update(schema.auditLog)
        .set({
          action: `agent_tool.${name}`,
          severity: "info",
          metadata: {
            status: "processing",
            startedAt: new Date().toISOString(),
            toolCallId: context.toolCallId,
            callId: callId(context),
          },
        })
        .where(eq(schema.auditLog.id, existing.id));
      return { kind: "claimed", auditId: existing.id };
    }

    const [created] = await tx
      .insert(schema.auditLog)
      .values({
        userId: context.agent.user_id,
        action: `agent_tool.${name}`,
        eventType: TOOL_EVENT_TYPE,
        severity: "info",
        resourceType: TOOL_RESOURCE_TYPE,
        resourceId: key,
        metadata: {
          status: "processing",
          startedAt: new Date().toISOString(),
          toolCallId: context.toolCallId,
          callId: callId(context),
        },
      })
      .returning({ id: schema.auditLog.id });

    return { kind: "claimed", auditId: created.id };
  });
}

async function finishToolExecution(
  context: ToolCallContext,
  auditId: bigint,
  status: "completed" | "failed",
  result?: string,
  error?: unknown,
): Promise<void> {
  await context.drizzle
    .update(schema.auditLog)
    .set({
      severity: status === "completed" ? "info" : "error",
      metadata: {
        status,
        completedAt: new Date().toISOString(),
        toolCallId: context.toolCallId,
        callId: callId(context),
        ...(result ? { result: result.slice(0, 1_200) } : {}),
        ...(error
          ? { error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) }
          : {}),
      },
    })
    .where(eq(schema.auditLog.id, auditId));
}

/**
 * Deduplicate retried Vapi side-effect calls by call ID + toolCallId + tool name.
 * Read-only tools bypass the ledger. A concurrent duplicate receives an honest
 * in-progress result; a completed duplicate receives the original result without
 * repeating the external action. If the ledger itself is unavailable, external
 * writes fail closed rather than risking an untraceable duplicate.
 */
export async function runIdempotentAgentToolCall(
  name: string,
  context: ToolCallContext,
  execute: () => Promise<ToolCallResult>,
): Promise<ToolCallResult> {
  if (!isIdempotentAgentTool(name) || !context.agent?.user_id || !context.toolCallId) {
    return execute();
  }

  const key = resourceId(name, context);
  let claim: ClaimResult;
  try {
    claim = await claimToolExecution(name, context, key);
  } catch (error) {
    context.log.error("Live tool idempotency claim failed; blocking external write", {
      tool: name,
      toolCallId: context.toolCallId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      toolCallId: context.toolCallId,
      result:
        "I couldn't safely verify whether that action was already processed, so I did not run it again. Be transparent with the caller and offer a manual follow-up.",
    };
  }

  if (claim.kind === "cached") {
    return { toolCallId: context.toolCallId, result: claim.result };
  }
  if (claim.kind === "processing") {
    return {
      toolCallId: context.toolCallId,
      result:
        "That action is already in progress. Do not run it again. Let the caller know you are still working on it.",
    };
  }

  try {
    const result = await execute();
    await finishToolExecution(context, claim.auditId, "completed", result.result).catch((error) =>
      context.log.warn("Live tool completion ledger update failed", {
        tool: name,
        toolCallId: context.toolCallId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return result;
  } catch (error) {
    await finishToolExecution(context, claim.auditId, "failed", undefined, error).catch(() => undefined);
    throw error;
  }
}
