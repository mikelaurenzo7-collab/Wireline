import { and, eq, isNull, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { enqueue, type JobRow } from "./job-queue";
import { refundRuntimeUsage, reserveRuntimeUsage } from "./runtime-usage-billing";
import { drizzle, log, tenantStore } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { smsOutcomeAfterMessage } from "./sms-thread-outcome";
import { settleSmsUsage } from "./sms-usage-billing";
import { SMS_COST_PER_SEGMENT_USD } from "./sms-billing";
import { USAGE_METERS } from "./usage-billing-catalog";
import { getTwilioClient, type TwilioMessageChannel } from "./twilio-service-base";

export type TwilioMessageReconciliationStep = "billing_adjustment" | "outbound_persistence";

export interface AcceptedTwilioMessageInput {
  userId: string;
  customerNumber: string;
  body: string;
  sid: string;
  channel: TwilioMessageChannel;
  agentId?: string;
  /** Exact Twilio sender accepted for this SMS. Missing only on legacy queued jobs. */
  destinationNumber?: string;
  reservationReference: string;
  estimatedUsd: number;
  actualUsd: number;
  actualSegments: number;
  /** Messaging Services can accept a message before its segment count is known. */
  segmentCountPending?: boolean;
  /** Missing on historical jobs, which must retain prepaid-wallet accounting. */
  fundingModel?: "shared_work" | "runtime_balance";
}

interface TwilioMessageReconciliationPayload extends AcceptedTwilioMessageInput {
  steps: TwilioMessageReconciliationStep[];
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

async function existingThread(userId: string, customerNumber: string, destinationNumber?: string) {
  const [thread] = await drizzle
    .select({
      id: schema.smsThreads.id,
      agentId: schema.smsThreads.agentId,
      status: schema.smsThreads.status,
    })
    .from(schema.smsThreads)
    .where(
      and(
        eq(schema.smsThreads.userId, userId),
        eq(schema.smsThreads.customerNumber, customerNumber),
        destinationNumber
          ? eq(schema.smsThreads.destinationNumber, destinationNumber)
          : isNull(schema.smsThreads.destinationNumber),
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
  input: Pick<
    AcceptedTwilioMessageInput,
    "userId" | "customerNumber" | "destinationNumber" | "body" | "sid" | "agentId"
  >,
): Promise<void> {
  const current = await existingThread(input.userId, input.customerNumber, input.destinationNumber);
  let threadId = current?.id;
  if (current) {
    // Carrier acceptance is message history, not an operator outcome change.
    // Preserve every explicitly owned lifecycle state; otherwise an account
    // holder replying from an escalated thread would silently move Inbox back
    // to `open` while its human-handoff task remained active in Approvals.
    // A new accepted attempt may clear only transport-derived/unknown state.
    await drizzle
      .update(schema.smsThreads)
      .set({
        lastMessageAt: new Date(),
        status: smsOutcomeAfterMessage(schema.smsThreads.status),
        unreadCount: 0,
        ...(input.agentId
          ? {
              agentId: sql`case when ${schema.smsThreads.status} = 'routing_conflict' then ${schema.smsThreads.agentId} else coalesce(${schema.smsThreads.agentId}, ${input.agentId}) end`,
            }
          : {}),
      })
      .where(and(eq(schema.smsThreads.id, current.id), eq(schema.smsThreads.userId, input.userId)));
  } else {
    // First-contact races with the inbound webhook. Adopt the unique-index
    // winner so a retry of this reconciliation can still write the message.
    const [created] = await drizzle
      .insert(schema.smsThreads)
      .values({
        userId: input.userId,
        customerNumber: input.customerNumber,
        destinationNumber: input.destinationNumber || null,
        agentId: input.agentId || null,
        unreadCount: 0,
      })
      .onConflictDoNothing()
      .returning({ id: schema.smsThreads.id });
    threadId = created?.id;
    if (!threadId) {
      const winner = await existingThread(
        input.userId,
        input.customerNumber,
        input.destinationNumber,
      );
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
    | "fundingModel"
    | "segmentCountPending"
  >,
): Promise<void> {
  if (input.segmentCountPending)
    throw new Error("Accepted SMS segment count is still awaiting Twilio confirmation.");
  if (input.fundingModel === "shared_work") {
    if (
      input.channel !== "sms" ||
      !(await settleSmsUsage(input.userId, input.reservationReference, input.actualSegments))
    )
      throw new Error("Accepted SMS has no shared-work reservation.");
    return;
  }
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
  await tenantStore.exit(
    async () =>
      await drizzle.insert(schema.auditLog).values({
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

  if (input.channel === "sms" && input.segmentCountPending) {
    // Zero on the creation response is unknown, not free and not the estimate.
    // Keep the reserve until a read of the accepted SID confirms actual usage.
    failedSteps.push("billing_adjustment");
  } else if (input.channel === "sms") {
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

  const details = {
    userId: input.userId,
    sid: input.sid,
    channel: input.channel,
    steps: failedSteps,
    failures,
    jobId,
    durableFallbackRecorded,
    providerAccepted: true,
    doNotRetryProviderSend: true,
  };
  if (Object.keys(failures).length > 0 || !jobId)
    log.error("Twilio provider accepted message with local reconciliation pending", details);
  else log.info("Twilio accepted SMS is awaiting its final segment count", details);

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
    !Number.isSafeInteger(payload.actualSegments) ||
    Number(payload.actualSegments) < 0 ||
    (payload.segmentCountPending !== undefined &&
      (typeof payload.segmentCountPending !== "boolean" || payload.channel !== "sms")) ||
    (payload.fundingModel !== undefined &&
      payload.fundingModel !== "shared_work" &&
      payload.fundingModel !== "runtime_balance") ||
    steps.length === 0
  ) {
    throw new Error("Twilio reconciliation job contains an invalid accepted-message payload.");
  }

  return { ...(payload as TwilioMessageReconciliationPayload), steps };
}

/** Read the accepted message; never submit another carrier send to resolve billing. */
async function confirmAcceptedSmsSegments(
  input: TwilioMessageReconciliationPayload,
): Promise<TwilioMessageReconciliationPayload> {
  if (!input.segmentCountPending || !input.steps.includes("billing_adjustment")) return input;
  const client = getTwilioClient();
  if (!client) throw new Error("Twilio is unavailable for SMS segment reconciliation.");
  const message = await client.messages(input.sid).fetch();
  if (message.sid !== input.sid || message.to !== input.customerNumber)
    throw new Error("Twilio segment reconciliation returned a different message.");
  const count = String(message.numSegments ?? "").trim();
  const segments = /^\d+$/.test(count) ? Number(count) : Number.NaN;
  // A queued/accepted zero stays reserved. Only a definitive no-send status
  // allows zero settlement; missing resources and fetch failures prove nothing.
  if (
    !Number.isSafeInteger(segments) ||
    segments < 0 ||
    (segments === 0 && message.status !== "failed" && message.status !== "canceled")
  )
    throw new Error("Twilio has not confirmed the accepted SMS segment count yet.");
  const rate =
    input.fundingModel === "shared_work"
      ? USAGE_METERS.sms_segments.tiers[0].unitUsd
      : SMS_COST_PER_SEGMENT_USD;
  return {
    ...input,
    actualSegments: segments,
    actualUsd: money(rate * segments),
    segmentCountPending: false,
  };
}

/** Retry bookkeeping and authoritative reads for a message already accepted. */
export async function handleTwilioMessageReconciliationJob(job: JobRow): Promise<void> {
  // Fetch outside the tenant transaction; provider latency must not hold it open.
  const payload = await confirmAcceptedSmsSegments(parseReconciliationPayload(job));
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
