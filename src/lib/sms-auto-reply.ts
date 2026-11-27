import { createHash } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { generateAgentTextReply } from "./agent-text-reply";
import { assertExternalEntityActionAllowed } from "./account-environment-policy";
import { salesContentWarning } from "./outbound-call-purpose";
import { evaluateSmsThreadReplyGate } from "./sms-reply-compliance";
import {
  inboundAutoReplyBody,
  shouldAnswerLatestInbound,
  smsAutoReplyEnabled,
} from "./sms-auto-reply-policy";
import { drizzle, log } from "./server-context";
import { sendTenantMessage, SmsProviderAttemptAlreadyClaimedError } from "./twilio-service";
import { resolveSmsSenderRegistration } from "./twilio-sms-registration";
import { handSmsReplyToOwner } from "./sms-reply-review";
import { jobOwnerId } from "./job-owner";
import type { JobRow } from "./job-queue";

type AutoReplyOutcome =
  | "sent"
  | "disabled"
  | "unassigned"
  | "superseded"
  | "review_required"
  | "blocked"
  | "carrier_refused"
  | "already_attempted";

/**
 * Process one ordinary inbound message. The webhook committed this job in the
 * same transaction as the message. A durable pre-provider attempt row prevents
 * a lost Twilio response or worker crash from creating a second customer text.
 * Failures before that boundary can retry. An unresolved
 * message remains visible in Inbox for a person to review.
 */
export async function processSmsAutoReplyJob(job: JobRow): Promise<AutoReplyOutcome> {
  const userId = jobOwnerId(job);
  const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
  const threadId = typeof payload.threadId === "string" ? payload.threadId : "";
  const inboundMessageId =
    typeof payload.inboundMessageId === "string" ? payload.inboundMessageId : "";
  if (!/^[0-9a-f-]{36}$/i.test(threadId) || !/^\d+$/.test(inboundMessageId)) {
    throw new Error("Invalid SMS auto-reply job payload.");
  }

  const [thread] = await drizzle
    .select({
      id: schema.smsThreads.id,
      agentId: schema.smsThreads.agentId,
      customerNumber: schema.smsThreads.customerNumber,
      destinationNumber: schema.smsThreads.destinationNumber,
      status: schema.smsThreads.status,
    })
    .from(schema.smsThreads)
    .where(and(eq(schema.smsThreads.id, threadId), eq(schema.smsThreads.userId, userId)))
    .limit(1);
  if (!thread?.agentId || !thread.destinationNumber || thread.status === "routing_conflict")
    return "unassigned";

  const idempotencyKey = `sms-auto-reply/${job.id}`;
  const [priorAttempt] = await drizzle
    .select({ id: schema.smsSendOperations.id })
    .from(schema.smsSendOperations)
    .where(
      and(
        eq(schema.smsSendOperations.userId, userId),
        eq(schema.smsSendOperations.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (priorAttempt) return "already_attempted";

  const [[preference], [settings], [line], [latest], [inbound]] = await Promise.all([
    drizzle
      .select({ preferences: schema.userPreferences.preferences })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .limit(1),
    drizzle
      .select({
        enabled: schema.settings.twilioMessagingEnabled,
        sender: schema.settings.twilioSmsFromNumber,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1),
    drizzle
      .select({ agentId: schema.phoneNumbers.agentId })
      .from(schema.phoneNumbers)
      .where(
        and(
          eq(schema.phoneNumbers.userId, userId),
          eq(schema.phoneNumbers.phoneNumber, thread.destinationNumber),
        ),
      )
      .limit(1),
    drizzle
      .select({ id: schema.smsMessages.id, direction: schema.smsMessages.direction })
      .from(schema.smsMessages)
      .where(and(eq(schema.smsMessages.userId, userId), eq(schema.smsMessages.threadId, threadId)))
      .orderBy(desc(schema.smsMessages.id))
      .limit(1),
    drizzle
      .select({ id: schema.smsMessages.id, createdAt: schema.smsMessages.createdAt })
      .from(schema.smsMessages)
      .where(
        and(
          eq(schema.smsMessages.userId, userId),
          eq(schema.smsMessages.threadId, threadId),
          eq(schema.smsMessages.id, BigInt(inboundMessageId)),
          eq(schema.smsMessages.direction, "in"),
        ),
      )
      .limit(1),
  ]);
  if (
    !smsAutoReplyEnabled(preference?.preferences, thread.destinationNumber) ||
    !settings?.enabled ||
    settings.sender !== thread.destinationNumber
  )
    return "disabled";
  if (line?.agentId !== thread.agentId) return "unassigned";
  if (
    !shouldAnswerLatestInbound({
      expectedMessageId: inboundMessageId,
      latestMessageId: latest?.id?.toString() ?? null,
      latestDirection: latest?.direction ?? null,
      receivedAt: inbound?.createdAt ?? null,
    })
  )
    return "superseded";

  // A carrier-approved sender can still be registered for a narrower use
  // case (such as texts requested during calls). Never enable a new automatic
  // inbound program from registration status alone.
  const registration = await resolveSmsSenderRegistration(thread.destinationNumber);
  if (registration.status !== "registered" || registration.coversInboundReplies !== true)
    return "blocked";

  const [recentReplies] = await drizzle
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.smsMessages)
    .where(
      and(
        eq(schema.smsMessages.userId, userId),
        eq(schema.smsMessages.threadId, threadId),
        eq(schema.smsMessages.direction, "out"),
        gte(schema.smsMessages.createdAt, new Date(Date.now() - 60 * 60_000)),
      ),
    );
  if (Number(recentReplies?.count ?? 0) >= 12) return "review_required";

  const recent = await drizzle
    .select({ direction: schema.smsMessages.direction, body: schema.smsMessages.body })
    .from(schema.smsMessages)
    .where(and(eq(schema.smsMessages.threadId, threadId), eq(schema.smsMessages.userId, userId)))
    .orderBy(desc(schema.smsMessages.id))
    .limit(12);
  const draft = await generateAgentTextReply({
    userId,
    agentId: thread.agentId,
    messages: recent.reverse().map((message) => ({
      direction: message.direction === "out" ? "out" : "in",
      body: message.body,
    })),
  });
  const salesWarning = draft.requiresHuman ? null : salesContentWarning(draft.reply);
  if (draft.requiresHuman || salesWarning) {
    log.info("SMS auto-reply needs owner review", {
      userId,
      threadId,
      reason: draft.reason || "non_sales_content",
    });
    // The suggestion and why it waits go to the owner, who replies from Texts.
    await handSmsReplyToOwner({
      userId,
      agentId: thread.agentId,
      threadId,
      inboundMessageId,
      customerNumber: thread.customerNumber,
      suggestedReply: draft.reply,
      reason:
        draft.reason ||
        "The suggested reply reads as a sales message, which an automatic reply may not send.",
    });
    return "review_required";
  }

  // Recheck after model latency: a human may have replied, a later customer
  // text may have arrived, or the owner may have switched automation off.
  const [[currentPreference], [currentSettings], [currentLine], [currentLatest]] =
    await Promise.all([
      drizzle
        .select({ preferences: schema.userPreferences.preferences })
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId))
        .limit(1),
      drizzle
        .select({
          enabled: schema.settings.twilioMessagingEnabled,
          sender: schema.settings.twilioSmsFromNumber,
        })
        .from(schema.settings)
        .where(eq(schema.settings.userId, userId))
        .limit(1),
      drizzle
        .select({ agentId: schema.phoneNumbers.agentId })
        .from(schema.phoneNumbers)
        .where(
          and(
            eq(schema.phoneNumbers.userId, userId),
            eq(schema.phoneNumbers.phoneNumber, thread.destinationNumber),
          ),
        )
        .limit(1),
      drizzle
        .select({ id: schema.smsMessages.id, direction: schema.smsMessages.direction })
        .from(schema.smsMessages)
        .where(
          and(eq(schema.smsMessages.userId, userId), eq(schema.smsMessages.threadId, threadId)),
        )
        .orderBy(desc(schema.smsMessages.id))
        .limit(1),
    ]);
  if (
    !smsAutoReplyEnabled(currentPreference?.preferences, thread.destinationNumber) ||
    !currentSettings?.enabled ||
    currentSettings.sender !== thread.destinationNumber
  )
    return "disabled";
  if (currentLine?.agentId !== thread.agentId) return "unassigned";
  if (
    !shouldAnswerLatestInbound({
      expectedMessageId: inboundMessageId,
      latestMessageId: currentLatest?.id?.toString() ?? null,
      latestDirection: currentLatest?.direction ?? null,
      receivedAt: inbound?.createdAt ?? null,
    })
  )
    return "superseded";

  await assertExternalEntityActionAllowed(userId, "sms_auto_reply", {
    phone: thread.customerNumber,
  });
  const gate = await evaluateSmsThreadReplyGate({
    userId,
    threadId,
    phone: thread.customerNumber,
    requestedPurpose: "returning_contact",
    content: draft.reply,
    enforceContactConfirmation: true,
  });
  if (!gate.allowed) {
    log.info("SMS auto-reply blocked by contact gate", { userId, threadId, reason: gate.reason });
    return "blocked";
  }

  const result = await sendTenantMessage(userId, {
    to: thread.customerNumber,
    body: inboundAutoReplyBody(draft.reply, Number(recentReplies?.count ?? 0) === 0),
    channel: "sms",
    agentId: thread.agentId,
    fromNumber: thread.destinationNumber,
    idempotencyKey,
    reservationAttempt: Number(job.attempts || 1),
    beforeProviderAttempt: async () => {
      const [claimed] = await drizzle
        .insert(schema.smsSendOperations)
        .values({
          userId,
          threadId,
          idempotencyKey,
          requestHash: createHash("sha256")
            .update(JSON.stringify([threadId, inboundMessageId, draft.reply]))
            .digest("hex"),
          status: "attempting",
        })
        .onConflictDoNothing()
        .returning({ id: schema.smsSendOperations.id });
      if (!claimed) throw new SmsProviderAttemptAlreadyClaimedError();
    },
  });
  await drizzle
    .update(schema.smsSendOperations)
    .set({
      status: result.ok ? "accepted" : result.providerOutcomeAmbiguous ? "ambiguous" : "rejected",
      providerSid: result.sid ?? null,
      providerStatus: result.status ?? null,
      failureCode: result.ok ? null : result.code || "SMS_AUTO_REPLY_REFUSED",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.smsSendOperations.userId, userId),
        eq(schema.smsSendOperations.idempotencyKey, idempotencyKey),
      ),
    );
  if (!result.ok) {
    log.warn("SMS auto-reply was not accepted", {
      userId,
      threadId,
      code: result.code,
      providerOutcomeAmbiguous: result.providerOutcomeAmbiguous ?? false,
    });
    return "carrier_refused";
  }
  return "sent";
}
