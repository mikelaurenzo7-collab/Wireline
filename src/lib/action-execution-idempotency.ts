import { createHash } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, log } from "./server-context";
import type { ActionItem, ActionResult } from "./action-types";

const ACTION_EVENT_TYPE = "action.execution";
const ACTION_RESOURCE_TYPE = "action_engine_execution";

type ActionPhase = "draft" | "auto";

type ClaimResult =
  | { kind: "claimed"; auditId: bigint }
  | { kind: "cached"; result: ActionResult }
  | { kind: "processing" };

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function actionResourceId(input: {
  userId: string;
  action: ActionItem;
  sourceId: string;
  sourceType: string;
  phase: ActionPhase;
}): string {
  const payloadHash = createHash("sha256")
    .update(
      canonicalJson({
        type: input.action.type,
        priority: input.action.priority,
        payload: input.action.payload,
        reasoning: input.action.reasoning || null,
        agentId: input.action.agentId || null,
      }),
    )
    .digest("hex");
  return [
    input.phase,
    input.sourceType,
    input.sourceId,
    input.action.type,
    input.action.agentId || "tenant",
    payloadHash,
  ]
    .join(":")
    .slice(0, 500);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cachedResult(metadata: Record<string, unknown>): ActionResult | null {
  const output = metadata.output;
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const row = output as Record<string, unknown>;
  if (typeof row.success !== "boolean") return null;
  return {
    success: row.success,
    ...(typeof row.queued === "boolean" ? { queued: row.queued } : {}),
    ...(typeof row.actionId === "string" ? { actionId: row.actionId } : {}),
    ...(typeof row.error === "string" ? { error: row.error } : {}),
  };
}

function resultForExisting(metadata: Record<string, unknown>): ClaimResult {
  const status = String(metadata.status || "");
  if (status === "completed" || status === "failed") {
    const output = cachedResult(metadata);
    if (output) return { kind: "cached", result: output };
  }
  return { kind: "processing" };
}

async function claimExecution(input: {
  userId: string;
  action: ActionItem;
  sourceId: string;
  sourceType: string;
  phase: ActionPhase;
  resourceId: string;
}): Promise<ClaimResult> {
  // Let Drizzle infer the transaction type. A transaction intentionally lacks
  // the root database's `$client`; annotating it as `typeof drizzle` makes a
  // valid callback fail strict TypeScript even though every operation below is
  // available on both the database and transaction query builders.
  return drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.resourceId}))`);

    const [existing] = await tx
      .select({ id: schema.auditLog.id, metadata: schema.auditLog.metadata })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, input.userId),
          eq(schema.auditLog.eventType, ACTION_EVENT_TYPE),
          eq(schema.auditLog.resourceType, ACTION_RESOURCE_TYPE),
          eq(schema.auditLog.resourceId, input.resourceId),
        ),
      )
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(1);

    if (existing) return resultForExisting(metadataRecord(existing.metadata));

    const [created] = await tx
      .insert(schema.auditLog)
      .values({
        userId: input.userId,
        action: `action_engine.${input.action.type}`,
        eventType: ACTION_EVENT_TYPE,
        severity: "info",
        resourceType: ACTION_RESOURCE_TYPE,
        resourceId: input.resourceId,
        metadata: {
          status: "processing",
          phase: input.phase,
          sourceId: input.sourceId,
          sourceType: input.sourceType,
          actionType: input.action.type,
          agentId: input.action.agentId || null,
          startedAt: new Date().toISOString(),
        },
      })
      .returning({ id: schema.auditLog.id });

    return { kind: "claimed", auditId: created.id };
  });
}

async function finishExecution(
  auditId: bigint,
  result: ActionResult,
  error?: unknown,
): Promise<void> {
  const status = result.success ? "completed" : "failed";
  await drizzle
    .update(schema.auditLog)
    .set({
      severity: result.success ? "info" : "error",
      metadata: {
        status,
        completedAt: new Date().toISOString(),
        output: {
          success: result.success,
          ...(typeof result.queued === "boolean" ? { queued: result.queued } : {}),
          ...(result.actionId ? { actionId: result.actionId } : {}),
          ...(result.error ? { error: result.error.slice(0, 800) } : {}),
        },
        ...(error
          ? {
              error:
                error instanceof Error
                  ? error.message.slice(0, 800)
                  : String(error).slice(0, 800),
            }
          : {}),
      },
    })
    .where(eq(schema.auditLog.id, auditId));
}

/**
 * Deduplicate action extraction, queueing, retries, and Account Holder approval
 * execution. The draft and auto phases deliberately use different keys so a
 * queued proposal can later execute exactly once after approval.
 */
export async function runIdempotentActionExecution(input: {
  userId: string;
  action: ActionItem;
  sourceId: string;
  sourceType: string;
  phase: ActionPhase;
  execute: () => Promise<ActionResult>;
}): Promise<ActionResult> {
  const resourceId = actionResourceId({ ...input });
  let claim: ClaimResult;
  try {
    claim = await claimExecution({ ...input, resourceId });
  } catch (error) {
    log.error("Action execution claim failed; blocking side effect", {
      userId: input.userId,
      actionType: input.action.type,
      phase: input.phase,
      sourceId: input.sourceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error:
        "Wireline could not safely verify whether this action was already processed, so it did not run it again.",
    };
  }

  if (claim.kind === "cached") return claim.result;
  if (claim.kind === "processing") {
    return {
      success: false,
      error:
        "This exact action is already processing or awaiting outcome verification. It was not run again.",
    };
  }

  try {
    const result = await input.execute();
    await finishExecution(claim.auditId, result).catch((error) =>
      log.warn("Action completion ledger update failed", {
        userId: input.userId,
        actionType: input.action.type,
        phase: input.phase,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return result;
  } catch (error) {
    const result: ActionResult = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    await finishExecution(claim.auditId, result, error).catch(() => undefined);
    throw error;
  }
}
