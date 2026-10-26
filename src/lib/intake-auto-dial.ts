import { and, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { evaluateOutboundDialGate, mergeLeadMetadata } from "./outbound-dial-gate";
import { DEFAULT_MAX_ATTEMPTS, writeTransactionConfig } from "./job-queue";
import { drizzle, log } from "./server-context";
import { getErrorMessage, toJsonbSafe } from "./server-utils";
import { placeOutboundCall } from "./voice/outbound-call-service";
import { assertOutboundVoiceAllowed } from "./voice-spend-control";

export const INTAKE_AUTO_DIAL_JOB_TYPE = "intake_auto_dial" as const;

export type IntakeAutoDialJobPayload = {
  userId: string;
  leadId: string;
  intakeKeyName: string;
};

type IntakeAutoDialDb = Pick<typeof drizzle, "transaction">;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseLeadId(value: string): bigint {
  try {
    const leadId = BigInt(value);
    if (leadId <= 0n) throw new Error("not positive");
    return leadId;
  } catch {
    throw new Error("Intake auto-dial job contains an invalid lead id.");
  }
}

/**
 * Serialize intake retries on the lead and adopt an existing job when one was
 * already committed. This makes a timed-out HTTP retry converge without a new
 * schema index while ensuring `auto_dial_initiated` is never true before the
 * durable row exists.
 */
export async function ensureIntakeAutoDialJob(
  payload: IntakeAutoDialJobPayload,
  db: IntakeAutoDialDb = drizzle,
): Promise<{ jobId: string; alreadyEnqueued: boolean }> {
  const leadId = parseLeadId(payload.leadId);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`intake-auto-dial:${payload.userId}:${leadId}`}))`,
    );

    const [existing] = await tx
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, payload.userId),
          eq(schema.jobs.type, INTAKE_AUTO_DIAL_JOB_TYPE),
          sql`${schema.jobs.payload}->>'leadId' = ${String(leadId)}`,
        ),
      )
      .limit(1);
    if (existing) return { jobId: existing.id, alreadyEnqueued: true };

    const [inserted] = await tx
      .insert(schema.jobs)
      .values({
        userId: payload.userId,
        type: INTAKE_AUTO_DIAL_JOB_TYPE,
        payload: { ...payload, leadId: String(leadId) },
        status: "pending",
        attempts: 0,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        runAt: new Date(),
      })
      .returning({ id: schema.jobs.id });
    if (!inserted) throw new Error("Intake auto-dial enqueue returned no durable job.");
    return { jobId: inserted.id, alreadyEnqueued: false };
  }, writeTransactionConfig());
}

export async function intakeAutoDialJobExists(
  payload: Pick<IntakeAutoDialJobPayload, "userId" | "leadId">,
): Promise<boolean> {
  const leadId = parseLeadId(payload.leadId);
  const [existing] = await drizzle
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, payload.userId),
        eq(schema.jobs.type, INTAKE_AUTO_DIAL_JOB_TYPE),
        sql`${schema.jobs.payload}->>'leadId' = ${String(leadId)}`,
      ),
    )
    .limit(1);
  return Boolean(existing);
}

async function writeAutoDialFailure(input: {
  leadId: bigint;
  userId: string;
  status: string;
  error: string;
  providerStatus?: number | string;
  doNotRetry?: boolean;
}) {
  await drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(input.leadId)}`}))`,
    );
    const [lead] = await tx
      .select({ metadata: schema.outboundLeads.metadata, callId: schema.outboundLeads.callId })
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.id, input.leadId),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      )
      .limit(1);
    const metadata = record(lead?.metadata);
    const nativeVoice = record(metadata.native_voice);
    // The shared placement/callback boundary owns accepted and terminal state.
    // A late worker failure must not replace that evidence with AutoDialFailed.
    if (
      lead?.callId ||
      nativeVoice.twilio_call_sid ||
      nativeVoice.openai_call_id ||
      nativeVoice.bridge_served_at
    )
      return;
    await tx
      .update(schema.outboundLeads)
      .set({
        status: input.status,
        metadata: toJsonbSafe({
          ...metadata,
          native_voice: {
            ...nativeVoice,
            ...(input.doNotRetry ? { do_not_retry: true } : {}),
          },
          auto_dial_error: input.error,
          auto_dial_status: input.providerStatus ?? "internal_error",
          auto_dial_do_not_retry: input.doNotRetry === true,
        }) as never,
      })
      .where(
        and(
          eq(schema.outboundLeads.id, input.leadId),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      );
  }, writeTransactionConfig());
}

export async function enqueueIntakeAutoDial(payload: IntakeAutoDialJobPayload): Promise<boolean> {
  try {
    await ensureIntakeAutoDialJob(payload);
    return true;
  } catch (error) {
    const leadId = parseLeadId(payload.leadId);
    const message = getErrorMessage(error);
    await writeAutoDialFailure({
      leadId,
      userId: payload.userId,
      status: "AutoDialFailed",
      error: message,
      providerStatus: "enqueue_failed",
    }).catch((recordError) =>
      log.error("Intake auto-dial enqueue failure could not be recorded", {
        userId: payload.userId,
        leadId: payload.leadId,
        enqueueError: message,
        recordError: getErrorMessage(recordError),
      }),
    );
    log.error("Intake auto-dial durable enqueue failed", {
      userId: payload.userId,
      leadId: payload.leadId,
      error: message,
    });
    return false;
  }
}

export type IntakeAutoDialOutcome =
  | "already_placed"
  | "blocked"
  | "deferred_quiet_hours"
  | "dialing"
  | "failed"
  | "lead_missing"
  | "terminal_failure";

/** Execute one durable intake auto-dial attempt. Provider placement itself is
 * protected by the lead-scoped native outbound reservation, so worker recovery
 * cannot double-dial after an accepted or ambiguous carrier outcome. */
export async function processIntakeAutoDialJob(
  payload: IntakeAutoDialJobPayload,
): Promise<{ outcome: IntakeAutoDialOutcome; callId?: string }> {
  const leadId = parseLeadId(payload.leadId);
  const [lead] = await drizzle
    .select({
      agentId: schema.outboundLeads.agentId,
      customerName: schema.outboundLeads.customerName,
      customerNumber: schema.outboundLeads.customerNumber,
      context: schema.outboundLeads.context,
      metadata: schema.outboundLeads.metadata,
      callId: schema.outboundLeads.callId,
    })
    .from(schema.outboundLeads)
    .where(
      and(eq(schema.outboundLeads.id, leadId), eq(schema.outboundLeads.userId, payload.userId)),
    )
    .limit(1);
  if (!lead) return { outcome: "lead_missing" };
  if (lead.callId) return { outcome: "already_placed", callId: lead.callId };

  const metadata = record(lead.metadata);
  const nativeVoice = record(metadata.native_voice);
  if (metadata.auto_dial_do_not_retry === true || nativeVoice.do_not_retry === true) {
    return { outcome: "terminal_failure" };
  }
  if (!lead.agentId || !lead.customerNumber) {
    await writeAutoDialFailure({
      leadId,
      userId: payload.userId,
      status: "AutoDialFailed",
      error: "Intake auto-dial requires a Bot and customer number.",
      doNotRetry: true,
    });
    return { outcome: "terminal_failure" };
  }

  try {
    const gate = await evaluateOutboundDialGate({
      userId: payload.userId,
      phone: lead.customerNumber,
      leadId,
      metadata,
      isMarketingCall: false,
      requireFederalDncScreening: false,
      hasExpressWrittenConsent: false,
      audit: {
        channel: "call",
        requestedPurpose: "returning_contact",
        effectivePurpose: "returning_contact",
      },
    });
    if (!gate.allowed) {
      if (gate.reason === "outside_permitted_calling_hours") {
        await drizzle
          .update(schema.outboundLeads)
          .set({
            callbackScheduledAt: new Date(Date.now() + 60 * 60 * 1000),
            metadata: toJsonbSafe({
              ...mergeLeadMetadata(metadata, gate.metadataPatch),
              auto_dial_status: "deferred_quiet_hours",
            }) as never,
          })
          .where(
            and(
              eq(schema.outboundLeads.id, leadId),
              eq(schema.outboundLeads.userId, payload.userId),
            ),
          );
        log.info("Auto-dial deferred to next permitted window", { leadId: String(leadId) });
        return { outcome: "deferred_quiet_hours" };
      }
      await drizzle
        .update(schema.outboundLeads)
        .set({
          status: gate.status,
          metadata: toJsonbSafe(mergeLeadMetadata(metadata, gate.metadataPatch)) as never,
        })
        .where(
          and(eq(schema.outboundLeads.id, leadId), eq(schema.outboundLeads.userId, payload.userId)),
        );
      log.warn("Auto-dial blocked by outbound gate", {
        leadId: String(leadId),
        reason: gate.reason,
        status: gate.status,
      });
      return { outcome: "blocked" };
    }

    try {
      await assertOutboundVoiceAllowed({
        userId: payload.userId,
        source: "automation",
        units: 0,
      });
    } catch (spendError) {
      const spendMessage =
        spendError instanceof Error ? spendError.message : "voice spend controls blocked";
      await writeAutoDialFailure({
        leadId,
        userId: payload.userId,
        status: "AutoDialFailed",
        error: spendMessage,
      });
      log.warn("Auto-dial blocked by voice spend controls", {
        leadId: String(leadId),
        error: spendMessage,
      });
      return { outcome: "blocked" };
    }

    const result = await placeOutboundCall({
      userId: payload.userId,
      agentId: lead.agentId,
      customerName: lead.customerName,
      customerNumber: lead.customerNumber,
      context: lead.context || `Inbound lead via ${payload.intakeKeyName}`,
      callPurpose: "returning_contact",
      leadId,
    });
    if (result.ok && result.callId) {
      // Calls.create may return after the exact terminal callback. The shared
      // placement owns status, attempt count and call identity in either order.
      return { outcome: "dialing", callId: result.callId };
    }

    const doNotRetry =
      result.doNotRetry === true ||
      result.providerOutcomeAmbiguous === true ||
      (result.ok && !result.callId);
    await writeAutoDialFailure({
      leadId,
      userId: payload.userId,
      status: doNotRetry ? "Error" : "AutoDialFailed",
      error: result.error || "Native voice placement did not return a call id.",
      providerStatus: result.status,
      doNotRetry,
    });
    log.warn("Auto-dial failed for lead", {
      leadId: String(leadId),
      status: result.status,
      doNotRetry,
      error: result.error,
    });
    return { outcome: doNotRetry ? "terminal_failure" : "failed" };
  } catch (error) {
    await writeAutoDialFailure({
      leadId,
      userId: payload.userId,
      status: "AutoDialFailed",
      error: getErrorMessage(error),
    }).catch(() => {});
    throw error;
  }
}
