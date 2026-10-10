import type { ImapFlow } from "imapflow";

import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/** RFC 5322 identifiers that place a reply in the customer's existing thread. */
export type ReplyThreading = { inReplyTo: string; references: string };

const MAX_REFERENCES = 20;

/** The conversation subject without any leading "Re:" / "Fwd:" markers. */
export function baseReplySubject(subject: string): string {
  return subject.replace(/^\s*(?:(?:re|fw|fwd)\s*:\s*)+/i, "").trim();
}

/** "Re: <subject>", never "Re: Re: <subject>". */
export function replySubject(subject: string): string {
  const base = baseReplySubject(subject);
  return base ? `Re: ${base}` : "Re: Your message";
}

/** Message IDs from a raw `References:` header block, oldest first. */
export function parseReferencesHeader(raw: string): string[] {
  const value = raw.replace(/^references:/i, "").replace(/\r?\n[ \t]+/g, " ");
  return value.match(/<[^<>\s]+>/g) ?? [];
}

/** The References chain a reply carries: the thread so far plus the message answered. */
export function replyReferences(prior: string[], messageId: string): string {
  const chain = [...prior.filter((id) => id !== messageId), messageId];
  return chain.slice(-MAX_REFERENCES).join(" ");
}

/**
 * Find the newest INBOX message from `from` with the thread's subject and
 * return the identifiers a reply needs. The inbox stores only hashed provider
 * IDs, so the mailbox itself is the source of truth. Any failure returns null:
 * the caller still sends a "Re:" reply, just without thread headers.
 */
export async function findImapReplyThreading(
  client: ImapFlow,
  query: { from: string; subject: string },
): Promise<ReplyThreading | null> {
  const subject = baseReplySubject(query.subject);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search(
        subject ? { from: query.from, subject } : { from: query.from },
        { uid: true },
      );
      if (!Array.isArray(uids) || uids.length === 0) return null;
      // UIDs ascend in arrival order, so the last one is the newest message.
      const newest = Math.max(...uids);
      const message = await client.fetchOne(
        String(newest),
        { envelope: true, headers: ["references"] },
        { uid: true },
      );
      const messageId = message ? message.envelope?.messageId : undefined;
      if (!message || !messageId) return null;
      const prior = message.headers ? parseReferencesHeader(message.headers.toString("utf8")) : [];
      return { inReplyTo: messageId, references: replyReferences(prior, messageId) };
    } finally {
      lock.release();
    }
  } catch (error) {
    log.warn("Reply threading lookup failed; sending without thread headers", {
      error: getErrorMessage(error),
    });
    return null;
  } finally {
    await client.logout().catch(() => undefined);
  }
}
