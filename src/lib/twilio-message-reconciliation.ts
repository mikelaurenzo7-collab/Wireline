import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { enqueue, type JobRow } from "./job-queue";
import { refundRuntimeUsage, reserveRuntimeUsage } from "./runtime-usage-billing";
import { drizzle, log, tenantStore } from "./server-context";
import { getErrorMessage } from "./server-utils";
import type { TwilioMessageChannel } from "./twilio-service-base";

export type TwilioMessageReconciliationStep = "billing_adjustment" | "outbound_persistence";

export interface AcceptedTwilioMessageInput {
  userId: string;
  customerNumber: string;
  body: string;
  sid: string;
  channel: TwilioMessageChannel;
  agentId?: string;
  reservationReference: string;
  estimatedUsd: number;
  actualUsd: number;
  actualSegments: number;
}

interface TwilioMessageReconciliationPayload extends AcceptedTwilioMessageInput {
  steps: TwilioMessageReconciliationStep[];
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

async function existingThread(userId: string, customerNumber: string) {
  const [thread] = await drizzle
    .select({ id: schema.smsThreads.id, agentId: schema.smsThreads.agentId })
    .from(schema.smsThreads)
    .where(
      and(
        eq(schema.smsThreads.userId, userId),
        eq(schema.smsThreads.customerNumber, customerNumber),
      ),
    )
    .limit(1);
  return thread || null;
}

/**
 * Persist carrier-accepted outbound history idempotently by Twilio SID.
 *
 * This deliberately throws. The accepted-message boundary catches the failure
 * and moves it into the durable reconciliation queue instead of telling the
 * customer to retry a message Twilio has already accepted.
 */
export async function persistAcceptedTwilioOutbound(
  input: Pick<AcceptedTwilioMessageInput, "userId" | "customerNumber" | "body" | "sid" | "agentId">,
): Promise<void> {
  const current = await existingThread(input.userId, input.customerNumber);
  let threadId = current?.id;
  if (current) {
    await drizzle
      .update(schema.smsThreads)
      .set({
        lastMessageAt: new Date(),
        status: "open",
        unreadCount: 0,
        ...(input.agentId && !current.agentId ? { agentId: input.agentId } : {}),
      })
      .where(eq(schema.smsThreads.id, current.id));
  } else {
    // First-contact races with the inbound webhook. Adopt the unique-index
    // winner so a retry of this reconciliation can still write the message.
    const [created] = await drizzle
      .insert(schema.smsThreads)
      .values({
        userId: input.userId,
        customerNumber: input.customerNumber,
        agentId: input.agentId || null,
        unreadCount: 0,
      })
      .onConflictDoNothing()
      .returning({ id: schema.smsThreads.id });
    threadId = created?.id;
    if (!threadId) {
      const winner = await existingThread(input.userId, input.customerNumber);
      threadId = winner?.id;
    }
  }

  if (!threadId) {
    throw new Error("Accepted Twilio message has no durable conversation thread.");
  }

  await drizzle
    .insert(schema.smsMessages)
    .values({
      userId: input.userId,
      threadId,
      direction: "out",
      body: input.body,
      twilioSid: input.sid,
      agentId: input.agentId || null,
    })
    // (user_id, twilio_sid) is uniquely indexed. A retried or duplicated job
    // must converge without writing the accepted carrier message twice.
    .onConflictDoNothing();
}

/** Idempotently true-up a carrier-accepted message to Twilio's segment count. */
export async function adjustAcceptedTwilioReservation(
  input: Pick<
    AcceptedTwilioMessageInput,
    | "userId"
    | "reservationReference"
    | "estimatedUsd"
    | "actualUsd"
    | "channel"
    | "sid"
    | "actualSegments"
  >,
): Promise<void> {
  const difference = money(input.actualUsd - input.estimatedUsd);
  if (difference === 0) return;
  const adjustmentReference = `${input.reservationReference}:actual`;
  const metadata = {
    channel: input.channel,
    message_sid: input.sid,
    actual_segments: input.actualSegments,
    estimated_usd: input.estimatedUsd,
    actual_usd: input.actualUsd,
  };

  if (difference < 0) {
    await refundRuntimeUsage({
      userId: input.userId,
      amountUsd: Math.abs(difference),
      referenceId: adjustmentReference,
      reason: "Twilio segment estimate adjustment",
      provider: "twilio",
      source: "twilio",
      metadata,
    });
    return;
  }

  const adjustment = await reserveRuntimeUsage({
    userId: input.userId,
    amountUsd: difference,
    referenceId: adjustmentReference,
    reason: "Twilio segment count adjustment",
    provider: "twilio",
    source: "twilio",
    metadata,
  });
  if (!adjustment.reserved) {
    throw new Error("Accepted Twilio message exceeded its prepaid segment reservation.");
  }
}

async function persistReconciliationIncident(
  input: AcceptedTwilioMessageInput,
  steps: TwilioMessageReconciliationStep[],
  queueError: unknown,
): Promise<void> {
  await tenantStore.exit(() =>
    drizzle.insert(schema.auditLog).values({
      userId: input.userId,
      action: "twilio.message_reconciliation_enqueue_failed",
      eventType: "provider.reconciliation",
      severity: "critical",
      provider: "twilio",
      resourceType: "twilio_message",
      resourceId: input.sid,
      metadata: {
        carrier_accepted: true,
        reconciliation_steps: steps,
        reservation_reference: input.reservationReference,
        destination_suffix: input.customerNumber.slice(-4),
        queue_error: getErrorMessage(queueError),
      },
    }),
  );
}

/**
 * Finish bookkeeping after Twilio accepted the provider request.
 *
 * This function never rejects: once the carrier has accepted a message, local
 * accounting/history failures cannot safely be surfaced as a send failure.
 * Failed steps are retried by the Postgres queue; a critical audit row is the
 * durable fallback if even the queue insert is unavailable.
 */
export async function finalizeAcceptedTwilioMessage(
  input: AcceptedTwilioMessageInput,
): Promise<{ reconciliationPending: boolean; jobId?: string }> {
  const failedSteps: TwilioMessageReconciliationStep[] = [];
  const failures: Partial<Record<TwilioMessageReconciliationStep, string>> = {};

  if (input.channel === "sms") {
    try {
      await adjustAcceptedTwilioReservation(input);
    } catch (error) {
      failedSteps.push("billing_adjustment");
      failures.billing_adjustment = getErrorMessage(error);
    }
  }

  try {
    await persistAcceptedTwilioOutbound(input);
  } catch (error) {
    failedSteps.push("outbound_persistence");
    failures.outbound_persistence = getErrorMessage(error);
  }

  if (failedSteps.length === 0) return { reconciliationPending: false };

  let jobId: string | undefined;
  let durableFallbackRecorded = false;
  try {
    // A failed query can leave the authenticated request's outer transaction
    // unusable. Exit that context so the recovery job gets a fresh root-scoped
    // transaction, then validate ownership again inside the worker.
    const queued = await tenantStore.exit(() =>
      enqueue(drizzle, {
        userId: input.userId,
        type: "twilio_message_reconciliation",
        payload: { ...input, steps: failedSteps } satisfies TwilioMessageReconciliationPayload,
      }),
    );
    jobId = queued.jobId;
  } catch (queueError) {
    try {
      await persistReconciliationIncident(input, failedSteps, queueError);
      durableFallbackRecorded = true;
    } catch (auditError) {
      log.error("Twilio accepted-message reconciliation could not be persisted", {
        userId: input.userId,
        sid: input.sid,
        channel: input.channel,
        steps: failedSteps,
        queueError: getErrorMessage(queueError),
        auditError: getErrorMessage(auditError),
      });
    }
  }

  log.error("Twilio provider accepted message with local reconciliation pending", {
    userId: input.userId,
    sid: input.sid,
    channel: input.channel,
    steps: failedSteps,
    failures,
    jobId,
    durableFallbackRecorded,
    providerAccepted: true,
    doNotRetryProviderSend: true,
  });

  return { reconciliationPending: true, jobId };
}

function jobOwnerId(job: JobRow): string {
  const shaped = job as unknown as { userId?: string; user_id?: string };
  return String(shaped.userId || shaped.user_id || "");
}

function parseReconciliationPayload(job: JobRow): TwilioMessageReconciliationPayload {
  const payload = job.payload as Partial<TwilioMessageReconciliationPayload>;
  const ownerId = jobOwnerId(job);
  const steps = Array.isArray(payload?.steps)
    ? payload.steps.filter(
        (step): step is TwilioMessageReconciliationStep =>
          step === "billing_adjustment" || step === "outbound_persistence",
      )
    : [];
  if (!ownerId || typeof payload?.userId !== "string" || payload.userId !== ownerId) {
    throw new Error("Twilio reconciliation job tenant does not match its payload owner.");
  }
  if (
    typeof payload.sid !== "string" ||
    !payload.sid ||
    (payload.channel !== "sms" && payload.channel !== "whatsapp") ||
    typeof payload.customerNumber !== "string" ||
    typeof payload.body !== "string" ||
    typeof payload.reservationReference !== "string" ||
    !Number.isFinite(payload.estimatedUsd) ||
    !Number.isFinite(payload.actualUsd) ||
    !Number.isFinite(payload.actualSegments) ||
    steps.length === 0
  ) {
    throw new Error("Twilio reconciliation job contains an invalid accepted-message payload.");
  }

  return { ...(payload as TwilioMessageReconciliationPayload), steps };
}

/** Retry only local bookkeeping for a message the provider already accepted. */
export async function handleTwilioMessageReconciliationJob(job: JobRow): Promise<void> {
  const payload = parseReconciliationPayload(job);
  await tenantStore.run(payload.userId, async () => {
    // Keep transaction-bound tenant queries sequential. Each step is idempotent,
    // so a partial attempt can safely resume after the queue's normal backoff.
    if (payload.steps.includes("billing_adjustment")) {
      await adjustAcceptedTwilioReservation(payload);
    }
    if (payload.steps.includes("outbound_persistence")) {
      await persistAcceptedTwilioOutbound(payload);
    }
  });

  log.info("Twilio accepted-message reconciliation completed", {
    jobId: job.id,
    userId: payload.userId,
    sid: payload.sid,
    steps: payload.steps,
  });
}
