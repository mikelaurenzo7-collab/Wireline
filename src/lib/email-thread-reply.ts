import { createHash } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "./api-error";
import {
  EMPTY_EMAIL_THREAD_DELIVERY,
  summarizeEmailReplyLedger,
  type EmailThreadDelivery,
} from "./email-delivery";
import { replySubject } from "./imap-reply-target";
import { IntegrationService } from "./integrations";
import { mailboxScopedExternalId } from "./mailbox-identity";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export const EMAIL_REPLY_MAX_CHARS = 10_000;

const REPLY_EVENT_TYPE = "email.thread_reply";
const REPLY_RESOURCE_TYPE = "email_thread_reply";

export type EmailThreadReplyMessage = {
  id: string;
  role: "owner";
  content: string;
  created_at: string;
};

export type EmailThreadReplyResult = {
  status: "sent";
  /** True when this operation key was already sent; nothing was resent. */
  duplicate: boolean;
  /** True when the reply joined the customer's thread, not just "Re:" the subject. */
  threaded: boolean;
  message: EmailThreadReplyMessage;
};

type LedgerStatus = "processing" | "sent" | "failed" | "owner_acknowledged";

type Claim =
  | { kind: "claimed" }
  | { kind: "sent"; result: EmailThreadReplyResult }
  | { kind: "processing" }
  | { kind: "conflict" };

/**
 * The single address a reply may go to. Inbox rows carry the sender as
 * "Name <address>" or a bare address; a list, a name alone, or anything that
 * could inject another recipient is refused rather than guessed at.
 */
export function replyRecipient(customerEmail: string | null | undefined): string | null {
  const raw = (customerEmail ?? "").trim();
  if (!raw) return null;
  let candidate = raw;
  if (raw.includes("<") || raw.includes(">")) {
    const named = /^([^<>\r\n]*)<([^<>]*)>$/.exec(raw);
    if (!named || /[@;\r\n]/.test(named[1])) return null;
    candidate = named[2].trim();
  }
  return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(candidate) ? candidate : null;
}

function bodyDigest(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cachedResult(metadata: Record<string, unknown>): EmailThreadReplyResult | null {
  const result = metadataRecord(metadata.result);
  const message = metadataRecord(result.message);
  if (typeof message.id !== "string" || typeof message.content !== "string") return null;
  return {
    status: "sent",
    duplicate: true,
    threaded: result.threaded === true,
    message: {
      id: message.id,
      role: "owner",
      content: message.content,
      created_at: typeof message.created_at === "string" ? message.created_at : "",
    },
  };
}

/**
 * Append-only ledger. The request role may insert and read its own audit rows
 * but has no UPDATE path, so every state change is a new row and the newest
 * row for an operation key is its state. A key whose send is unresolved
 * ("processing") is never sent again: the provider may already have accepted it.
 */
async function recordLedger(
  userId: string,
  key: string,
  status: LedgerStatus,
  metadata: Record<string, unknown>,
  executor: Pick<typeof drizzle, "insert"> = drizzle,
): Promise<void> {
  await executor.insert(schema.auditLog).values({
    userId,
    action: "email.thread_reply",
    eventType: REPLY_EVENT_TYPE,
    severity: status === "failed" ? "warning" : "info",
    resourceType: REPLY_RESOURCE_TYPE,
    resourceId: key,
    metadata: { ...metadata, status, at: new Date().toISOString() },
  });
}

async function claimReply(
  userId: string,
  threadId: string,
  key: string,
  digest: string,
): Promise<Claim> {
  return drizzle.transaction(async (tx) => {
    // Serialize all reply operations for one conversation, not just replays of
    // the same UUID. A second tab or device must see an unresolved first send.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${threadId}`}))`);
    const latestResult = await tx.execute(sql`
      SELECT resource_id, metadata
      FROM (
        SELECT DISTINCT ON (resource_id) resource_id, metadata
        FROM public.wireline_audit_log
        WHERE user_id = ${userId}
          AND event_type = ${REPLY_EVENT_TYPE}
          AND resource_type = ${REPLY_RESOURCE_TYPE}
          AND resource_id LIKE ${`${threadId}:%`}
        ORDER BY resource_id, id DESC
      ) AS latest
    `);
    const latestRows = (
      latestResult as unknown as {
        rows?: Array<{ resource_id?: unknown; metadata?: unknown }>;
      }
    ).rows;
    if (
      latestRows?.some(
        (row) =>
          typeof row.resource_id === "string" &&
          metadataRecord(row.metadata).status === "processing",
      )
    ) {
      return { kind: "processing" };
    }

    const latestForKey = latestRows?.find((row) => row.resource_id === key);
    if (latestForKey) {
      const metadata = metadataRecord(latestForKey.metadata);
      if (metadata.bodyDigest !== digest) return { kind: "conflict" };
      if (metadata.status === "sent") {
        const result = cachedResult(metadata);
        return result ? { kind: "sent", result } : { kind: "processing" };
      }
      if (metadata.status !== "failed") return { kind: "processing" };
    }
    await recordLedger(userId, key, "processing", { bodyDigest: digest }, tx);
    return { kind: "claimed" };
  });
}

/**
 * Let the mailbox owner explicitly resolve an ambiguous delivery after checking
 * Sent. This appends an acknowledgement and never rewrites the original
 * processing record or makes its operation key reusable.
 */
export async function acknowledgeUnresolvedEmailThreadReply(input: {
  userId: string;
  threadId: string;
}): Promise<{ acknowledged: true; alreadyAcknowledged: boolean }> {
  const [thread] = await drizzle
    .select({ id: schema.emailThreads.id })
    .from(schema.emailThreads)
    .where(
      and(eq(schema.emailThreads.id, input.threadId), eq(schema.emailThreads.userId, input.userId)),
    )
    .limit(1);
  if (!thread) throw AppError.notFound("Conversation not found.");

  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.userId}:${input.threadId}`}))`,
    );
    const latestResult = await tx.execute(sql`
      SELECT resource_id, metadata
      FROM (
        SELECT DISTINCT ON (resource_id) resource_id, metadata
        FROM public.wireline_audit_log
        WHERE user_id = ${input.userId}
          AND event_type = ${REPLY_EVENT_TYPE}
          AND resource_type = ${REPLY_RESOURCE_TYPE}
          AND resource_id LIKE ${`${input.threadId}:%`}
        ORDER BY resource_id, id DESC
      ) AS latest
    `);
    const latestRows =
      (
        latestResult as unknown as {
          rows?: Array<{ resource_id?: unknown; metadata?: unknown }>;
        }
      ).rows ?? [];
    const unresolved = latestRows.filter(
      (row) =>
        typeof row.resource_id === "string" && metadataRecord(row.metadata).status === "processing",
    );

    if (unresolved.length) {
      for (const row of unresolved) {
        const resourceId = row.resource_id;
        if (typeof resourceId !== "string") continue;
        const metadata = metadataRecord(row.metadata);
        await recordLedger(
          input.userId,
          resourceId,
          "owner_acknowledged",
          {
            ...(typeof metadata.bodyDigest === "string" ? { bodyDigest: metadata.bodyDigest } : {}),
            resolution: "owner_checked_sent",
            duplicateRiskAccepted: true,
          },
          tx,
        );
      }
      return { acknowledged: true, alreadyAcknowledged: false };
    }

    if (latestRows.some((row) => metadataRecord(row.metadata).status === "owner_acknowledged")) {
      return { acknowledged: true, alreadyAcknowledged: true };
    }
    throw new AppError(
      409,
      "EMAIL_REPLY_NOT_UNRESOLVED",
      "There is no unresolved reply in this conversation to acknowledge.",
    );
  });
}

/**
 * Send the owner's reply in one inbox conversation, at most once per
 * operation key, from the mailbox that received the conversation.
 */
export async function sendEmailThreadReply(input: {
  userId: string;
  threadId: string;
  body: string;
  operationKey: string;
}): Promise<EmailThreadReplyResult> {
  const body = input.body.trim();
  if (!body) throw AppError.badRequest("Write a reply before sending.");
  if (body.length > EMAIL_REPLY_MAX_CHARS) {
    throw AppError.badRequest(
      `Replies can be up to ${EMAIL_REPLY_MAX_CHARS.toLocaleString("en-US")} characters.`,
    );
  }

  const [thread] = await drizzle
    .select({
      id: schema.emailThreads.id,
      accountId: schema.emailThreads.accountId,
      scopedThreadId: schema.emailThreads.threadId,
      customerEmail: schema.emailThreads.customerEmail,
      subject: schema.emailThreads.subject,
    })
    .from(schema.emailThreads)
    .where(
      and(eq(schema.emailThreads.id, input.threadId), eq(schema.emailThreads.userId, input.userId)),
    )
    .limit(1);
  if (!thread) throw AppError.notFound("Conversation not found.");
  if (!thread.accountId) {
    throw new AppError(
      409,
      "EMAIL_REPLY_NO_MAILBOX",
      "This conversation isn't linked to a connected mailbox, so it can't be answered here.",
    );
  }
  const to = replyRecipient(thread.customerEmail);
  if (!to) {
    throw new AppError(
      409,
      "EMAIL_REPLY_NO_RECIPIENT",
      "This conversation has no single customer address to reply to.",
    );
  }

  const key = `${thread.id}:${input.operationKey}`;
  const digest = bodyDigest(body);
  const claim = await claimReply(input.userId, thread.id, key, digest);
  if (claim.kind === "sent") return claim.result;
  let usageReceipt: { periodKey: string; quantity: number; occurredAt: string } | null = null;
  if (claim.kind === "claimed") {
    // Usage billing: no new handled email once the monthly limit is spent.
    const { admitAccountUsage } = await import("./usage-billing-store");
    try {
      const admission = await admitAccountUsage(input.userId, "emails_handled");
      if (admission)
        usageReceipt = {
          periodKey: admission.periodKey,
          quantity: 1,
          occurredAt: new Date().toISOString(),
        };
    } catch (error) {
      await recordLedger(input.userId, key, "failed", {
        bodyDigest: digest,
        error: getErrorMessage(error).slice(0, 300),
      }).catch(() => undefined);
      throw error;
    }
  }
  if (claim.kind === "conflict") {
    throw new AppError(
      409,
      "EMAIL_REPLY_KEY_REUSED",
      "This reply changed after it was submitted. Send it again as a new reply.",
    );
  }
  if (claim.kind === "processing") {
    throw new AppError(
      409,
      "EMAIL_REPLY_UNRESOLVED",
      "This reply may already have been sent. Refresh the conversation before sending it again.",
    );
  }

  let outcome: { sent: boolean; threaded: boolean; ambiguous?: boolean };
  try {
    outcome = await new IntegrationService(input.userId).sendThreadReply({
      accountId: thread.accountId,
      ...(thread.scopedThreadId ? { scopedThreadId: thread.scopedThreadId } : {}),
      to,
      subject: replySubject(thread.subject ?? ""),
      body,
    });
  } catch (error) {
    // Refused before any provider work (plan, recipient, or account policy).
    await recordLedger(input.userId, key, "failed", {
      bodyDigest: digest,
      error: getErrorMessage(error).slice(0, 300),
    }).catch(() => undefined);
    throw error;
  }
  if (outcome.ambiguous) {
    // Keep the processing row. The provider may have accepted the reply, so
    // this operation key must remain ineligible for another external send.
    throw new AppError(
      409,
      "EMAIL_REPLY_UNRESOLVED",
      "The mailbox may have accepted this reply. Check its Sent folder before starting another reply.",
    );
  }
  if (!outcome.sent) {
    await recordLedger(input.userId, key, "failed", { bodyDigest: digest }).catch(() => undefined);
    throw new AppError(
      502,
      "EMAIL_REPLY_NOT_SENT",
      "The mailbox didn't accept this reply. Check it in Connections, then try again.",
    );
  }

  const createdAt = new Date();
  let messageId = `reply-${key}`;
  try {
    const [saved] = await drizzle
      .insert(schema.emailMessages)
      .values({
        userId: input.userId,
        threadId: thread.id,
        googleMessageId: mailboxScopedExternalId(thread.accountId, "botbound-reply", key),
        role: "owner",
        content: body,
        createdAt,
      })
      .onConflictDoNothing({
        target: [schema.emailMessages.userId, schema.emailMessages.googleMessageId],
      })
      .returning({ id: schema.emailMessages.id });
    if (saved) messageId = String(saved.id);
    await drizzle
      .update(schema.emailThreads)
      .set({ read: true, lastMessageAt: createdAt })
      .where(
        and(eq(schema.emailThreads.id, thread.id), eq(schema.emailThreads.userId, input.userId)),
      );
  } catch (error) {
    // The customer already has the reply. A missing transcript row must not
    // turn a delivered reply into an error that invites a duplicate send.
    log.error("Sent inbox reply could not be added to the conversation", {
      userId: input.userId,
      threadId: thread.id,
      error: getErrorMessage(error),
    });
  }

  const result: EmailThreadReplyResult = {
    status: "sent",
    duplicate: false,
    threaded: outcome.threaded,
    message: { id: messageId, role: "owner", content: body, created_at: createdAt.toISOString() },
  };
  // The sent receipt and billing intent share one durable row. The sweep can
  // replay billing without ever sending the customer another email.
  await recordLedger(input.userId, key, "sent", { bodyDigest: digest, result, usageReceipt }).catch(
    (error) =>
      log.warn("Inbox reply ledger could not record the sent state", {
        userId: input.userId,
        error: getErrorMessage(error),
      }),
  );
  if (usageReceipt) {
    try {
      const { recordSettledUsageReceipt } = await import("./usage-billing-store");
      await recordSettledUsageReceipt({
        userId: input.userId,
        meter: "emails_handled",
        sourceType: "email_reply",
        sourceId: key,
        receipt: usageReceipt,
      });
    } catch (error) {
      log.warn("Email usage receipt will be retried by the sweep", {
        userId: input.userId,
        error: getErrorMessage(error),
      });
    }
  }
  return result;
}

/**
 * Read the thread's reply delivery truth from the same ledger the send path
 * writes. Delivery is an annotation on the conversation, never the payload,
 * so a ledger read failure degrades to no status instead of failing the
 * thread. Messages that did not come from this send path (mailbox sync,
 * provider side sends) have no ledger row and report no status.
 */
export async function loadEmailThreadDelivery(
  userId: string,
  threadId: string,
): Promise<EmailThreadDelivery> {
  try {
    const rows = await drizzle
      .select({ resourceId: schema.auditLog.resourceId, metadata: schema.auditLog.metadata })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, userId),
          eq(schema.auditLog.eventType, REPLY_EVENT_TYPE),
          eq(schema.auditLog.resourceType, REPLY_RESOURCE_TYPE),
          sql`${schema.auditLog.resourceId} like ${`${threadId}:%`}`,
        ),
      )
      .orderBy(desc(schema.auditLog.id));
    return summarizeEmailReplyLedger(
      rows.map((row) => ({
        resourceId: typeof row.resourceId === "string" ? row.resourceId : "",
        metadata: row.metadata,
      })),
    );
  } catch (error) {
    log.warn("Inbox reply delivery state could not be loaded", {
      userId,
      threadId,
      error: getErrorMessage(error),
    });
    return EMPTY_EMAIL_THREAD_DELIVERY;
  }
}
