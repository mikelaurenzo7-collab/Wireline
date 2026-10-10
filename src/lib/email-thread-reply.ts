import { createHash } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "./api-error";
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

type LedgerStatus = "processing" | "sent" | "failed";

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
  const bracketed = raw.match(/<[^<>]*>/g);
  let candidate = raw;
  if (bracketed) {
    if (bracketed.length !== 1) return null;
    candidate = bracketed[0].slice(1, -1).trim();
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

async function claimReply(userId: string, key: string, digest: string): Promise<Claim> {
  return drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${key}`}))`);
    const [latest] = await tx
      .select({ metadata: schema.auditLog.metadata })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, userId),
          eq(schema.auditLog.eventType, REPLY_EVENT_TYPE),
          eq(schema.auditLog.resourceType, REPLY_RESOURCE_TYPE),
          eq(schema.auditLog.resourceId, key),
        ),
      )
      .orderBy(desc(schema.auditLog.id))
      .limit(1);

    if (latest) {
      const metadata = metadataRecord(latest.metadata);
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
  const claim = await claimReply(input.userId, key, digest);
  if (claim.kind === "sent") return claim.result;
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

  let outcome: { sent: boolean; threaded: boolean };
  try {
    outcome = await new IntegrationService(input.userId).sendThreadReply({
      accountId: thread.accountId,
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
  await recordLedger(input.userId, key, "sent", { bodyDigest: digest, result }).catch((error) =>
    log.warn("Inbox reply ledger could not record the sent state", {
      userId: input.userId,
      error: getErrorMessage(error),
    }),
  );
  return result;
}
