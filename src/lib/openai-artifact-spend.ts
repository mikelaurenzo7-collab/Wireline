import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import {
  markPlatformCostReservationAmbiguous,
  releasePlatformCostReservationIfReserved,
  reservePlatformCostRecord,
  type PlatformCostReservation,
} from "../middleware/audit-middleware";
import { AppError } from "./api-error";
import { drizzle } from "./server-context";
import { clearBudgetCache, recordDailySpend } from "./spend-guards";

/** Full listed 1 GB / 20-minute price; do not assume account-specific proration.
 * https://developers.openai.com/api/docs/pricing (verified 2026-09-27)
 * This is a conservative session estimate, not provider-reported invoice cost.
 */
export const OPENAI_ARTIFACT_CONTAINER_ESTIMATE_USD = 0.03;
const ATTEMPT_ACTION = "artifact.container.attempt";
const CONTAINER_ACTION = "artifact.container.session";
const MODEL = "code-interpreter-1gb";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Every actual HTTP attempt can create a new container, including job retries. */
export async function reserveArtifactContainerSpend(
  userId: string,
): Promise<PlatformCostReservation> {
  const result = await reservePlatformCostRecord({
    userId,
    action: ATTEMPT_ACTION,
    provider: "openai",
    model: MODEL,
    costUsd: OPENAI_ARTIFACT_CONTAINER_ESTIMATE_USD,
    idempotencyKey: `openai-artifact-attempt:${randomUUID()}`,
    requestMeta: {
      surface: "business_artifact",
      memory_limit: "1g",
      cost_basis: "container_session_estimate",
      input_mode: "fresh_prompt_without_prior_container",
    },
  });
  if (result.reserved) return result.reservation;
  throw new AppError(
    result.reason === "cap_reached" ? 402 : 503,
    result.reason === "cap_reached" ? "SPEND_CAP_REACHED" : "SPEND_GUARD_UNAVAILABLE",
    "BotBound could not reserve the report's provider cost. Review Billing or try again shortly.",
  );
}

/** Only canonical server output items prove invocation; citations alone do not. */
export function artifactContainerEvidence(payload: unknown) {
  const root = record(payload);
  const output = Array.isArray(root.output) ? root.output : null;
  const ids = new Set<string>();
  let unknownInvocation = false;
  for (const value of output || []) {
    const item = record(value);
    if (item.type !== "code_interpreter_call") continue;
    if (
      typeof item.container_id === "string" &&
      /^cntr_[a-zA-Z0-9_-]{1,200}$/.test(item.container_id)
    ) {
      ids.add(item.container_id);
    } else unknownInvocation = true;
  }
  return {
    containerIds: [...ids],
    unknownInvocation,
    confirmedNoInvocation:
      root.status === "completed" && output !== null && ids.size === 0 && !unknownInvocation,
  };
}

/**
 * Reconcile the provisional debit with unique provider-returned containers.
 * Receipt insertion and attempt replacement share one transaction. Model usage
 * is separate; this never touches the customer Runtime reservation or balance.
 */
export async function reconcileArtifactContainerSpend(
  reservation: PlatformCostReservation,
  payload: unknown,
  httpStatus: number,
): Promise<string[]> {
  const evidence = artifactContainerEvidence(payload);
  if (!evidence.containerIds.length) {
    if (
      !evidence.unknownInvocation &&
      (evidence.confirmedNoInvocation || (httpStatus >= 400 && httpStatus < 500))
    ) {
      await releasePlatformCostReservationIfReserved(reservation);
    } else await markPlatformCostReservationAmbiguous(reservation);
    return [];
  }
  const costAdded = await drizzle.transaction(async (tx) => {
    await tx
      .select({ userId: schema.spendBudgets.userId })
      .from(schema.spendBudgets)
      .where(eq(schema.spendBudgets.userId, reservation.userId))
      .for("update");
    const [attempt] = await tx
      .select({
        action: schema.auditLog.action,
        provider: schema.auditLog.provider,
        metadata: schema.auditLog.metadata,
      })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.id, reservation.auditId),
          eq(schema.auditLog.userId, reservation.userId),
        ),
      )
      .limit(1)
      .for("update");
    if (!attempt || attempt.action !== ATTEMPT_ACTION || attempt.provider !== "openai") {
      throw new Error("Artifact container attempt receipt is unavailable.");
    }
    const metadata = record(attempt.metadata);
    if (metadata.accounting_state === "container_response_reconciled") return 0;
    let added = 0;
    for (const containerId of evidence.containerIds) {
      const [inserted] = await tx
        .insert(schema.auditLog)
        .values({
          userId: reservation.userId,
          action: CONTAINER_ACTION,
          provider: "openai",
          model: MODEL,
          costUsd: String(OPENAI_ARTIFACT_CONTAINER_ESTIMATE_USD),
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreateTokens: 0,
          idempotencyKey: `container:${containerId}`,
          metadata: {
            cost_basis: "container_session_estimate",
            accounting_state: "committed",
            memory_limit: "1g",
            container_id: containerId,
            source_attempt_id: String(reservation.auditId),
          },
        })
        .onConflictDoNothing()
        .returning({ id: schema.auditLog.id });
      if (inserted) added += OPENAI_ARTIFACT_CONTAINER_ESTIMATE_USD;
    }
    await tx
      .update(schema.auditLog)
      .set({
        costUsd: evidence.unknownInvocation ? String(OPENAI_ARTIFACT_CONTAINER_ESTIMATE_USD) : "0",
        metadata: {
          ...metadata,
          accounting_state: "container_response_reconciled",
          container_ids: evidence.containerIds,
          unknown_invocation: evidence.unknownInvocation,
        },
      })
      .where(
        and(
          eq(schema.auditLog.id, reservation.auditId),
          eq(schema.auditLog.userId, reservation.userId),
        ),
      );
    return added;
  });
  clearBudgetCache(reservation.userId);
  if (costAdded > 0) recordDailySpend(costAdded);
  return evidence.containerIds;
}

export async function retainAmbiguousArtifactContainerSpend(reservation: PlatformCostReservation) {
  await markPlatformCostReservationAmbiguous(reservation);
}
