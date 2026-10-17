/** Bounded recovery of mandatory SIP settlement, never a second customer digest. */
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { withAccountDeletionFence } from "./account-deletion-fence";
import { assertJobPayloadOwner, jobOwnerId } from "./job-owner";
import type { OpenAISipFinalizationContext } from "./post-call-digest";
import type { drizzle } from "./server-context";

export const POST_CALL_FINALIZATION_RECOVERY_TYPE = "post_call_finalization_recovery" as const;
export const POST_CALL_FINALIZATION_RECOVERY_MAX_ATTEMPTS = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PG_BIGINT_MAX = 9_223_372_036_854_775_807n;
type Transaction = Parameters<Parameters<typeof drizzle.transaction>[0]>[0];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parsePostCallSipFinalization(value: unknown): OpenAISipFinalizationContext | null {
  const input = record(value);
  if (
    !input ||
    input.provider !== "openai_sip" ||
    typeof input.callId !== "string" ||
    !/^[A-Za-z0-9_-]{1,256}$/.test(input.callId) ||
    typeof input.openingPlaybackConfirmed !== "boolean" ||
    typeof input.terminalStateReady !== "boolean" ||
    ["providerHangupRequired", "carrierDurationRequired", "noConversationDelivered"].some(
      (key) => input[key] != null && typeof input[key] !== "boolean",
    ) ||
    (input.leadId != null && !/^[1-9][0-9]{0,18}$/.test(String(input.leadId)))
  )
    return null;
  if (input.leadId != null && BigInt(String(input.leadId)) > PG_BIGINT_MAX) return null;
  return {
    provider: "openai_sip",
    callId: input.callId,
    openingPlaybackConfirmed: input.openingPlaybackConfirmed,
    terminalStateReady: input.terminalStateReady,
    ...(input.leadId != null ? { leadId: String(input.leadId) } : {}),
    ...(input.providerHangupRequired === true ? { providerHangupRequired: true } : {}),
    ...(input.carrierDurationRequired === true ? { carrierDurationRequired: true } : {}),
    ...(input.noConversationDelivered === true ? { noConversationDelivered: true } : {}),
  };
}

export type PostCallFinalizationRecoveryEligibility =
  | {
      eligible: true;
      userId: string;
      parentJobId: string;
      callLogId: string;
      finalization: OpenAISipFinalizationContext;
    }
  | { eligible: false; reason: string };

/** Pure planning API; execution must re-read the persisted row under its transaction. */
export function postCallFinalizationRecoveryEligibility(
  parent: unknown,
): PostCallFinalizationRecoveryEligibility {
  const row = record(parent);
  if (!row || row.type !== "post_call_digest" || row.status !== "dead")
    return { eligible: false, reason: "parent_not_dead_original_digest" };
  if (typeof row.id !== "string" || !UUID.test(row.id))
    return { eligible: false, reason: "invalid_parent_identity" };
  const payload = record(row.payload);
  if (!payload || payload.criticalRecoveryOf != null)
    return { eligible: false, reason: "invalid_original_payload" };
  let userId: string;
  try {
    userId = assertJobPayloadOwner(row, payload);
  } catch {
    return { eligible: false, reason: "invalid_parent_owner" };
  }
  if (payload.userId !== userId) return { eligible: false, reason: "invalid_parent_owner" };
  const finalization = parsePostCallSipFinalization(payload.finalization);
  if (!finalization) return { eligible: false, reason: "invalid_sip_finalization" };
  const callLogId = payload.callLogId;
  if (
    typeof callLogId !== "string" ||
    !/^[1-9][0-9]{0,18}$/.test(callLogId) ||
    BigInt(callLogId) > PG_BIGINT_MAX
  )
    return { eligible: false, reason: "invalid_call_identity" };
  if (record(record(row.result)?.finalization)?.state === "completed")
    return { eligible: false, reason: "finalization_already_completed" };
  return { eligible: true, userId, parentJobId: row.id.toLowerCase(), callLogId, finalization };
}

export function postCallFinalizationRecoveryId(userId: string, parentJobId: string): string {
  if (!UUID.test(userId) || !UUID.test(parentJobId)) throw new Error("Invalid recovery identity.");
  const bytes = createHash("sha256")
    .update(
      `botbound/post-call-finalization-recovery/v1/${userId.toLowerCase()}/${parentJobId.toLowerCase()}`,
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type EnqueuePostCallFinalizationRecoveryResult = {
  eligible: boolean;
  created: boolean;
  jobId: string | null;
  reason?: string;
};

/** Use the SAME transaction as the parent dead transition, or an explicit operator backfill. */
export async function enqueuePostCallFinalizationRecovery(
  tx: Transaction,
  input: { parentJobId: string; userId: string },
): Promise<EnqueuePostCallFinalizationRecoveryResult> {
  if (!UUID.test(input.parentJobId) || !UUID.test(input.userId))
    throw new Error("Invalid recovery parent identity.");
  return withAccountDeletionFence(tx, input.userId, async () => {
    const [parent] = await tx
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.id, input.parentJobId),
          eq(schema.jobs.userId, input.userId),
          eq(schema.jobs.type, "post_call_digest"),
          eq(schema.jobs.status, "dead"),
        ),
      )
      .limit(1)
      .for("update");
    const planned = postCallFinalizationRecoveryEligibility(parent);
    if (!planned.eligible) return { ...planned, created: false, jobId: null };
    if (planned.userId !== input.userId.toLowerCase()) throw new Error("Recovery owner mismatch.");
    const [call] = await tx
      .select({ id: schema.callLogs.id })
      .from(schema.callLogs)
      .innerJoin(schema.users, eq(schema.users.id, schema.callLogs.userId))
      .where(
        and(
          eq(schema.callLogs.id, BigInt(planned.callLogId)),
          eq(schema.callLogs.userId, planned.userId),
          eq(schema.callLogs.vapiCallId, `openai:${planned.finalization.callId}`),
          sql`NOT EXISTS (SELECT 1 FROM ${schema.deletionQueue}
          WHERE ${schema.deletionQueue.userId} = ${planned.userId}
          AND (${schema.deletionQueue.status} = 'purging' OR
            (${schema.deletionQueue.status} = 'pending' AND
              (${schema.deletionQueue.scheduledPurgeAt} IS NULL OR ${schema.deletionQueue.scheduledPurgeAt} <= now()))))`,
        ),
      )
      .limit(1);
    if (!call)
      return {
        eligible: false,
        created: false,
        jobId: null,
        reason: "call_or_account_unavailable",
      };
    const jobId = postCallFinalizationRecoveryId(planned.userId, planned.parentJobId);
    const [created] = await tx
      .insert(schema.jobs)
      .values({
        id: jobId,
        userId: planned.userId,
        type: POST_CALL_FINALIZATION_RECOVERY_TYPE,
        payload: { criticalRecoveryOf: planned.parentJobId },
        status: "pending",
        attempts: 0,
        maxAttempts: POST_CALL_FINALIZATION_RECOVERY_MAX_ATTEMPTS,
        runAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.jobs.id })
      .returning({ id: schema.jobs.id });
    return { eligible: true, created: Boolean(created), jobId };
  });
}

export function recoveryParentId(job: unknown): string {
  const row = record(job);
  const payload = record(row?.payload);
  if (
    !row ||
    row.type !== POST_CALL_FINALIZATION_RECOVERY_TYPE ||
    !payload ||
    Object.keys(payload).some((key) => key !== "criticalRecoveryOf") ||
    typeof payload.criticalRecoveryOf !== "string" ||
    !UUID.test(payload.criticalRecoveryOf) ||
    row.id !== postCallFinalizationRecoveryId(jobOwnerId(row), payload.criticalRecoveryOf)
  )
    throw new Error("Invalid critical recovery job identity.");
  return payload.criticalRecoveryOf.toLowerCase();
}
