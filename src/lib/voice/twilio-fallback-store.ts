import { and, eq, gte, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { drizzle } from "../server-context";
import { OPENAI_SIP_PROVIDER_MAX_SECONDS } from "./openai-sip-config";
import { inboundConcurrentCallCeiling } from "../inbound-concurrency";
import {
  fallbackReceiptId,
  TWILIO_FALLBACK_DURATION_TOLERANCE_SECONDS,
} from "./twilio-fallback-receipt";
import type {
  FallbackAdmission,
  FallbackCompletion,
  FallbackReceipt,
  TwilioFallbackStore,
} from "./twilio-fallback-receipt";

const ADMITTED = "voice.fallback.admitted";
const COMPLETED = "voice.fallback.completed";
type Executor = Pick<typeof drizzle, "select" | "insert" | "update">;

async function readMetadata(tx: Executor, userId: string, key: string, action: string) {
  const [row] = await tx
    .select({ metadata: schema.auditLog.metadata })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.userId, userId),
        eq(schema.auditLog.resourceId, key),
        eq(schema.auditLog.resourceType, "voice_fallback"),
        eq(schema.auditLog.provider, "twilio"),
        eq(schema.auditLog.action, action),
      ),
    )
    .limit(1);
  return row?.metadata;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Twilio fallback admission receipt is malformed.");
  }
  return value as Record<string, unknown>;
}

async function readReceipt(
  tx: Executor,
  row: { userId: string; agentId: string | null; customerNumber: string | null },
  parentCallSid: string,
): Promise<FallbackReceipt> {
  const key = fallbackReceiptId(parentCallSid);
  // These exact event types are written only here, atomically with the unique
  // call record. Request JSON and editable Bot metadata never supply authority.
  const admission = object(await readMetadata(tx, row.userId, key, ADMITTED));
  if (
    typeof admission.calledNumber !== "string" ||
    !/^\+[1-9]\d{7,14}$/.test(admission.calledNumber) ||
    typeof admission.fallbackNumber !== "string" ||
    !/^\+[1-9]\d{7,14}$/.test(admission.fallbackNumber) ||
    !Number.isSafeInteger(admission.maxSeconds) ||
    Number(admission.maxSeconds) < 30 ||
    Number(admission.maxSeconds) > OPENAI_SIP_PROVIDER_MAX_SECONDS ||
    typeof admission.leaseId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(admission.leaseId) ||
    typeof admission.leaseExpiresAt !== "string" ||
    !Number.isFinite(Date.parse(admission.leaseExpiresAt))
  ) {
    throw new Error("Twilio fallback admission receipt is malformed.");
  }
  const completionData = await readMetadata(tx, row.userId, key, COMPLETED);
  let completion: FallbackCompletion | null = null;
  if (completionData) {
    const value = object(completionData);
    if (
      !(value.childCallSid === null || typeof value.childCallSid === "string") ||
      typeof value.status !== "string" ||
      !Number.isSafeInteger(value.durationSeconds) ||
      Number(value.durationSeconds) < 0
    ) {
      throw new Error("Twilio fallback completion receipt is malformed.");
    }
    completion = {
      childCallSid: value.childCallSid as string | null,
      status: value.status,
      durationSeconds: Number(value.durationSeconds),
    };
  }
  return {
    userId: row.userId,
    agentId: row.agentId,
    callerNumber: row.customerNumber ?? "",
    parentCallSid,
    calledNumber: admission.calledNumber,
    fallbackNumber: admission.fallbackNumber,
    maxSeconds: Number(admission.maxSeconds),
    leaseId: admission.leaseId,
    leaseExpiresAt: admission.leaseExpiresAt,
    completion,
  };
}

function event(userId: string, key: string, action: string, metadata: Record<string, unknown>) {
  return {
    userId,
    action,
    provider: "twilio",
    eventType: "provider.webhook",
    resourceType: "voice_fallback",
    resourceId: key,
    metadata,
  };
}

export const twilioFallbackStore: TwilioFallbackStore = {
  async findLine(userId, calledNumber) {
    const [line] = await drizzle
      .select({ agentId: schema.phoneNumbers.agentId })
      .from(schema.phoneNumbers)
      .where(
        and(
          eq(schema.phoneNumbers.userId, userId),
          eq(schema.phoneNumbers.phoneNumber, calledNumber),
        ),
      )
      .limit(1);
    return line ?? null;
  },

  async claim(input: FallbackAdmission) {
    return drizzle.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`voice-fallback:${input.userId}`}))`,
      );
      // Hold the exact line assignment through receipt creation. A settings-only
      // sender or concurrent release/reassignment cannot authorize a new Dial.
      const [line] = await tx
        .select({ agentId: schema.phoneNumbers.agentId })
        .from(schema.phoneNumbers)
        .where(
          and(
            eq(schema.phoneNumbers.userId, input.userId),
            eq(schema.phoneNumbers.phoneNumber, input.calledNumber),
          ),
        )
        .limit(1)
        .for("update");
      if (!line || line.agentId !== input.agentId) return null;
      const key = fallbackReceiptId(input.parentCallSid);
      const [prior] = await tx
        .select()
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.vapiCallId, key), eq(schema.callLogs.userId, input.userId)))
        .limit(1)
        .for("update");
      if (prior) {
        const receipt = await readReceipt(tx, prior, input.parentCallSid);
        if (
          receipt.calledNumber !== input.calledNumber ||
          receipt.callerNumber !== input.callerNumber
        ) {
          throw new Error("Twilio fallback parent identity is already bound to another call.");
        }
        return receipt;
      }
      const [capacity] = await tx
        .select({ live: sql<string>`count(*)` })
        .from(schema.signalPresence)
        .where(
          and(
            eq(schema.signalPresence.userId, input.userId),
            gte(schema.signalPresence.startedAt, new Date(Date.now() - 2 * 60 * 60 * 1000)),
            sql`coalesce(${schema.signalPresence.label}, '') not like ${"% · Outbound"}`,
          ),
        );
      const live = Number(capacity?.live);
      if (!Number.isSafeInteger(live) || live < 0)
        throw new Error("Fallback voice capacity is unavailable.");
      if (live >= inboundConcurrentCallCeiling()) return null;
      const [inserted] = await tx
        .insert(schema.callLogs)
        .values({
          userId: input.userId,
          agentId: input.agentId,
          vapiCallId: key,
          direction: "inbound",
          customerNumber: input.callerNumber,
          summary: "Human fallback transfer requested.",
          escalationAttempted: true,
        })
        .onConflictDoNothing({ target: schema.callLogs.vapiCallId })
        .returning({ id: schema.callLogs.id });
      if (inserted) {
        await tx.insert(schema.auditLog).values(
          event(input.userId, key, ADMITTED, {
            calledNumber: input.calledNumber,
            fallbackNumber: input.fallbackNumber,
            maxSeconds: input.maxSeconds,
            leaseId: input.leaseId,
            leaseExpiresAt: input.leaseExpiresAt,
          }),
        );
        await tx.insert(schema.signalPresence).values({
          id: key,
          userId: input.userId,
          agentId: input.agentId,
          customerNumber: input.callerNumber,
          status: "transferring",
          label: "Human fallback",
          type: "voice",
        });
        return { ...input, completion: null };
      }
      const [existing] = await tx
        .select()
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.vapiCallId, key), eq(schema.callLogs.userId, input.userId)))
        .limit(1)
        .for("update");
      if (!existing) return null;
      const receipt = await readReceipt(tx, existing, input.parentCallSid);
      if (
        receipt.calledNumber !== input.calledNumber ||
        receipt.callerNumber !== input.callerNumber
      ) {
        throw new Error("Twilio fallback parent identity is already bound to another call.");
      }
      return receipt;
    });
  },

  async find(parentCallSid) {
    // This signed provider callback is the sole unscoped lookup. Its owner is
    // the pre-Dial record, never a customer-supplied ID or current phone owner.
    const [row] = await drizzle
      .select()
      .from(schema.callLogs)
      .where(eq(schema.callLogs.vapiCallId, fallbackReceiptId(parentCallSid)))
      .limit(1);
    return row ? readReceipt(drizzle, row, parentCallSid) : null;
  },

  async complete(receipt, completion) {
    return drizzle.transaction(async (tx) => {
      const key = fallbackReceiptId(receipt.parentCallSid);
      const [row] = await tx
        .select()
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.vapiCallId, key), eq(schema.callLogs.userId, receipt.userId)))
        .limit(1)
        .for("update");
      if (!row) throw new Error("Twilio fallback admission disappeared before settlement.");
      const current = await readReceipt(tx, row, receipt.parentCallSid);
      if (current.completion) {
        if (
          current.completion.childCallSid !== completion.childCallSid ||
          current.completion.durationSeconds !== completion.durationSeconds ||
          current.completion.status !== completion.status
        ) {
          throw new Error("Twilio fallback terminal receipt conflicts with an earlier completion.");
        }
        return current.completion;
      }
      await tx
        .insert(schema.auditLog)
        .values(event(receipt.userId, key, COMPLETED, { ...completion }));
      if (
        completion.durationSeconds >
        receipt.maxSeconds + TWILIO_FALLBACK_DURATION_TOLERANCE_SECONDS
      ) {
        await tx.insert(schema.auditLog).values({
          ...event(receipt.userId, key, "voice.fallback.duration_overrun", {
            actualSeconds: completion.durationSeconds,
            admittedSeconds: receipt.maxSeconds,
            customerMeteredSeconds: receipt.maxSeconds,
            childCallSid: completion.childCallSid,
            reconciliationRequired: true,
          }),
          severity: "error",
        });
      }
      await tx
        .update(schema.callLogs)
        .set({
          durationSeconds: completion.durationSeconds,
          endedReason: `fallback-${completion.status}`,
          escalationSucceeded: completion.status === "completed",
          summary:
            completion.status === "completed"
              ? "Human fallback transfer completed."
              : "Human fallback transfer was not answered.",
        })
        .where(
          and(eq(schema.callLogs.vapiCallId, key), eq(schema.callLogs.userId, receipt.userId)),
        );
      await tx
        .delete(schema.signalPresence)
        .where(
          and(eq(schema.signalPresence.id, key), eq(schema.signalPresence.userId, receipt.userId)),
        );
      return completion;
    });
  },
};
