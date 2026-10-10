import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { findImapReplyThreading, type ReplyThreading } from "./imap-reply-target";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export const ICLOUD_IMAP_HOST = "imap.mail.me.com";
export const ICLOUD_IMAP_PORT = 993;
export const ICLOUD_SMTP_HOST = "smtp.mail.me.com";
export const ICLOUD_SMTP_PORT = 587;

const ICLOUD_MAIL_SCOPE = "imap smtp app-password";

export type IcloudInboxMessage = {
  messageId: string;
  threadId?: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  provider: "icloud";
};

function createImapClient(email: string, appPassword: string) {
  return new ImapFlow({
    host: ICLOUD_IMAP_HOST,
    port: ICLOUD_IMAP_PORT,
    secure: true,
    auth: { user: email, pass: appPassword },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

function formatAddressList(list: Array<{ name?: string; address?: string }> | undefined): string {
  if (!list?.length) return "";
  return list
    .map((a) => (a.name ? `${a.name} <${a.address ?? ""}>` : (a.address ?? "")))
    .filter(Boolean)
    .join(", ");
}

/**
 * Prove the Account Holder's iCloud Mail app-specific password works before we store it.
 */
export async function verifyIcloudMailCredentials(
  email: string,
  appPassword: string,
): Promise<void> {
  const client = createImapClient(email, appPassword);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/**
 * Pull recent inbox headers via IMAP. Apple does not expose a Gmail/Graph-style
 * REST API for iCloud Mail — app-specific passwords + IMAP/SMTP is the path.
 */
export async function fetchIcloudInbox(
  email: string,
  appPassword: string,
  opts: { limit: number; sinceIso?: string },
): Promise<IcloudInboxMessage[]> {
  const client = createImapClient(email, appPassword);
  const limit = Math.min(Math.max(opts.limit, 1), 100);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = opts.sinceIso ? new Date(opts.sinceIso) : undefined;
      const searchQuery = since ? { since } : { all: true };
      const uids = await client.search(searchQuery, { uid: true });
      if (!uids || uids.length === 0) return [];

      const recentUids = uids.slice(-limit).reverse();
      const messages: IcloudInboxMessage[] = [];

      for await (const msg of client.fetch(
        recentUids,
        { envelope: true, source: false },
        { uid: true },
      )) {
        const envelope = msg.envelope;
        if (!envelope) continue;
        const messageId =
          envelope.messageId ||
          (msg.uid != null ? `icloud-uid-${msg.uid}` : `icloud-seq-${msg.seq}`);
        messages.push({
          messageId,
          from: formatAddressList(envelope.from),
          subject: envelope.subject ?? "",
          snippet: envelope.subject ?? "",
          receivedAt: envelope.date ?? new Date(),
          provider: "icloud",
        });
      }

      messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
      return messages.slice(0, limit);
    } finally {
      lock.release();
    }
  } catch (err) {
    log.warn("iCloud inbox fetch failed", { email, error: getErrorMessage(err) });
    // Preserve the distinction between an empty inbox and an unreachable one.
    // IntegrationService records this failure and the sync route exposes the
    // reconnect action instead of claiming there are no new messages.
    throw new Error("iCloud inbox could not be refreshed. Reconnect iCloud and try again.", {
      cause: err,
    });
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** Thread headers for replying to the newest message from `from` in this iCloud inbox. */
export function findIcloudReplyThreading(
  email: string,
  appPassword: string,
  query: { from: string; subject: string },
): Promise<ReplyThreading | null> {
  return findImapReplyThreading(createImapClient(email, appPassword), query);
}

export async function sendIcloudMail(
  email: string,
  appPassword: string,
  params: {
    to: string;
    subject: string;
    body: string;
    textBody?: string;
    htmlBody?: string;
    unsubscribeHeaders?: Record<string, string>;
    /** Places the message in the customer's existing thread when known. */
    threading?: ReplyThreading | null;
  },
): Promise<boolean> {
  const transporter = nodemailer.createTransport({
    host: ICLOUD_SMTP_HOST,
    port: ICLOUD_SMTP_PORT,
    secure: false,
    requireTLS: true,
    auth: { user: email, pass: appPassword },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  try {
    await transporter.verify();
    await transporter.sendMail({
      from: email,
      to: params.to,
      subject: params.subject,
      text: params.textBody ?? params.body,
      ...(params.htmlBody ? { html: params.htmlBody } : {}),
      ...(params.unsubscribeHeaders ? { headers: params.unsubscribeHeaders } : {}),
      ...(params.threading
        ? { inReplyTo: params.threading.inReplyTo, references: params.threading.references }
        : {}),
    });
    return true;
  } catch (err) {
    log.error("iCloud SMTP send failed", { email, error: getErrorMessage(err) });
    return false;
  } finally {
    transporter.close();
  }
}

export function icloudGrantedScopes(): string {
  return ICLOUD_MAIL_SCOPE;
}
