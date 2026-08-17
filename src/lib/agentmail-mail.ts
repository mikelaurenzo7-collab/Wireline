import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

import { resolveCanonicalAppUrl } from "./app-url";
import { fetchWithTimeout, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export const AGENTMAIL_API_BASE = "https://api.agentmail.to/v0";
export const AGENTMAIL_IMAP_HOST = "imap.agentmail.to";
export const AGENTMAIL_IMAP_PORT = 993;
export const AGENTMAIL_SMTP_HOST = "smtp.agentmail.to";
export const AGENTMAIL_SMTP_PORT = 465;
export const AGENTMAIL_FREE_DOMAIN = "agentmail.to";

const AGENTMAIL_MAIL_SCOPE = "imap smtp api-key webhook";
const WIRELINE_INBOX_CLIENT_ID = "wireline-mailbox";
export const AGENTMAIL_WEBHOOK_CLIENT_ID = "wireline-mailbox-webhook";
export const AGENTMAIL_WEBHOOK_EVENT_TYPES = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.bounced",
  "message.complained",
  "message.rejected",
] as const;

export function agentMailWebhookClientId(accountId: string): string {
  return `${AGENTMAIL_WEBHOOK_CLIENT_ID}:${accountId}`;
}

export class AgentMailConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentMailConnectError";
  }
}

export type AgentMailInbox = {
  inboxId: string;
  email: string;
};

export type AgentMailInboxMessage = {
  messageId: string;
  threadId?: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  provider: "agentmail";
};

function createImapClient(email: string, apiKey: string) {
  return new ImapFlow({
    host: AGENTMAIL_IMAP_HOST,
    port: AGENTMAIL_IMAP_PORT,
    secure: true,
    auth: { user: email, pass: apiKey },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

function formatAddressList(list: Array<{ name?: string; address?: string }> | undefined): string {
  if (!list?.length) return "";
  return list
    .map((a) => (a.name ? `${nameAddress(a.name, a.address)}` : (a.address ?? "")))
    .filter(Boolean)
    .join(", ");
}

function nameAddress(name: string, address?: string): string {
  return address ? `${name} <${address}>` : name;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeAgentMailInbox(raw: unknown): AgentMailInbox | null {
  const row = asRecord(raw);
  if (!row) return null;
  const inboxId = String(row.inbox_id ?? row.inboxId ?? "").trim();
  const email = String(row.email ?? inboxId)
    .trim()
    .toLowerCase();
  if (!inboxId && !email) return null;
  return { inboxId: inboxId || email, email: email || inboxId.toLowerCase() };
}

export function inboxMatchesAddress(inbox: AgentMailInbox, emailAddress: string): boolean {
  const wanted = emailAddress.trim().toLowerCase();
  return inbox.email === wanted || inbox.inboxId.trim().toLowerCase() === wanted;
}

export function agentmailLocalPart(emailAddress: string): string | null {
  const at = emailAddress.indexOf("@");
  if (at <= 0) return null;
  const local = emailAddress.slice(0, at).trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(local) ? local : null;
}

export function isAgentMailManagedAddress(emailAddress: string): boolean {
  const host = emailAddress.split("@")[1]?.trim().toLowerCase();
  return host === AGENTMAIL_FREE_DOMAIN;
}

async function agentMailJson(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetchWithTimeout(`${AGENTMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text };
    }
  }
  return { status: response.status, body };
}

export async function listAgentMailInboxes(apiKey: string): Promise<AgentMailInbox[]> {
  const inboxes: AgentMailInbox[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const { status, body } = await agentMailJson(apiKey, `/inboxes?${query.toString()}`);
    if (status === 401 || status === 403) {
      throw new AgentMailConnectError(
        "That AgentMail API key was rejected. Create a key in the AgentMail console and paste it here.",
      );
    }
    if (status < 200 || status >= 300) {
      throw new AgentMailConnectError("Could not list AgentMail inboxes with that API key.");
    }
    const payload = asRecord(body);
    const rows = Array.isArray(payload?.inboxes) ? payload.inboxes : [];
    for (const row of rows) {
      const inbox = normalizeAgentMailInbox(row);
      if (inbox) inboxes.push(inbox);
    }
    const next = String(payload?.next_page_token ?? payload?.nextPageToken ?? "").trim();
    if (!next) break;
    pageToken = next;
  }
  return inboxes;
}

export async function createAgentMailInbox(
  apiKey: string,
  username: string,
  displayName = "Wireline",
): Promise<AgentMailInbox> {
  const { status, body } = await agentMailJson(apiKey, "/inboxes", {
    method: "POST",
    body: JSON.stringify({
      username,
      display_name: displayName,
      client_id: WIRELINE_INBOX_CLIENT_ID,
    }),
  });
  if (status === 401 || status === 403) {
    throw new AgentMailConnectError(
      "That AgentMail API key was rejected. Create a key in the AgentMail console and paste it here.",
    );
  }
  if (status < 200 || status >= 300) {
    throw new AgentMailConnectError(
      "Could not create that AgentMail inbox. Check the username is free and the org still has inbox capacity.",
    );
  }
  const created = normalizeAgentMailInbox(body) ?? normalizeAgentMailInbox(asRecord(body)?.inbox);
  if (!created) {
    throw new AgentMailConnectError("AgentMail created an inbox but did not return its address.");
  }
  return created;
}

/**
 * Resolve an existing inbox, or create `local@agentmail.to` when the org is on
 * the free domain. Custom domains must already exist in the AgentMail org.
 */
export async function resolveAgentMailInbox(
  apiKey: string,
  emailAddress: string,
): Promise<AgentMailInbox> {
  const wanted = emailAddress.trim().toLowerCase();
  const existing = await listAgentMailInboxes(apiKey);
  const match = existing.find((inbox) => inboxMatchesAddress(inbox, wanted));
  if (match) return match;

  if (!isAgentMailManagedAddress(wanted)) {
    throw new AgentMailConnectError(
      "That address is not in this AgentMail org. Free-tier inboxes are @agentmail.to. Custom domains such as trywireline.com need AgentMail Developer, then an inbox on that domain.",
    );
  }
  const username = agentmailLocalPart(wanted);
  if (!username) {
    throw new AgentMailConnectError("Use a simple inbox name such as trywireline@agentmail.to.");
  }
  return createAgentMailInbox(apiKey, username);
}

export async function verifyAgentMailCredentials(email: string, apiKey: string): Promise<void> {
  const client = createImapClient(email, apiKey);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function fetchAgentMailInbox(
  email: string,
  apiKey: string,
  opts: { limit: number; sinceIso?: string },
): Promise<AgentMailInboxMessage[]> {
  const client = createImapClient(email, apiKey);
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
      const messages: AgentMailInboxMessage[] = [];

      for await (const msg of client.fetch(
        recentUids,
        { envelope: true, source: false },
        { uid: true },
      )) {
        const envelope = msg.envelope;
        if (!envelope) continue;
        const messageId =
          envelope.messageId ||
          (msg.uid != null ? `agentmail-uid-${msg.uid}` : `agentmail-seq-${msg.seq}`);
        messages.push({
          messageId,
          from: formatAddressList(envelope.from),
          subject: envelope.subject ?? "",
          snippet: envelope.subject ?? "",
          receivedAt: envelope.date ?? new Date(),
          provider: "agentmail",
        });
      }

      messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
      return messages.slice(0, limit);
    } finally {
      lock.release();
    }
  } catch (err) {
    log.warn("AgentMail inbox fetch failed", { email, error: getErrorMessage(err) });
    throw err;
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function sendAgentMail(
  email: string,
  apiKey: string,
  params: {
    to: string;
    subject: string;
    body: string;
    textBody?: string;
    htmlBody?: string;
    unsubscribeHeaders?: Record<string, string>;
  },
): Promise<boolean> {
  const transporter = nodemailer.createTransport({
    host: AGENTMAIL_SMTP_HOST,
    port: AGENTMAIL_SMTP_PORT,
    secure: true,
    auth: { user: email, pass: apiKey },
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
    });
    return true;
  } catch (err) {
    log.error("AgentMail SMTP send failed", { email, error: getErrorMessage(err) });
    return false;
  } finally {
    transporter.close();
  }
}

export function agentmailGrantedScopes(): string {
  return AGENTMAIL_MAIL_SCOPE;
}

export type AgentMailWebhook = {
  webhookId: string;
  url: string;
  clientId: string | null;
  inboxIds: string[];
  eventTypes: string[];
  secret: string | null;
};

function webhookOwnedByAccount(
  webhook: AgentMailWebhook,
  accountId: string,
  url: string | null,
): boolean {
  if (url && webhook.url === url) return true;
  if (webhook.clientId === agentMailWebhookClientId(accountId)) return true;
  // Legacy org-wide client id. Claim that row only when it still
  // points at this mailbox URL so a second inbox does not steal it.
  return webhook.clientId === AGENTMAIL_WEBHOOK_CLIENT_ID && Boolean(url) && webhook.url === url;
}

function normalizeAgentMailWebhook(raw: unknown): AgentMailWebhook | null {
  const row = asRecord(raw);
  if (!row) return null;
  const webhookId = String(row.webhook_id ?? row.webhookId ?? "").trim();
  const url = String(row.url ?? "").trim();
  if (!webhookId || !url) return null;
  const inboxIds = Array.isArray(row.inbox_ids)
    ? row.inbox_ids.map((id) => String(id).trim()).filter(Boolean)
    : Array.isArray(row.inboxIds)
      ? row.inboxIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
  const eventTypes = Array.isArray(row.event_types)
    ? row.event_types.map((id) => String(id).trim()).filter(Boolean)
    : Array.isArray(row.eventTypes)
      ? row.eventTypes.map((id) => String(id).trim()).filter(Boolean)
      : [];
  const clientId = String(row.client_id ?? row.clientId ?? "").trim() || null;
  const secret = String(row.secret ?? "").trim() || null;
  return { webhookId, url, clientId, inboxIds, eventTypes, secret };
}

export async function listAgentMailWebhooks(apiKey: string): Promise<AgentMailWebhook[]> {
  const webhooks: AgentMailWebhook[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const { status, body } = await agentMailJson(apiKey, `/webhooks?${query.toString()}`);
    if (status === 401 || status === 403) {
      throw new AgentMailConnectError(
        "That AgentMail API key was rejected. Create a key in the AgentMail console and paste it here.",
      );
    }
    if (status < 200 || status >= 300) {
      throw new AgentMailConnectError("Could not list AgentMail webhooks with that API key.");
    }
    const payload = asRecord(body);
    const rows = Array.isArray(payload?.webhooks) ? payload.webhooks : [];
    for (const row of rows) {
      const webhook = normalizeAgentMailWebhook(row);
      if (webhook) webhooks.push(webhook);
    }
    const next = String(payload?.next_page_token ?? payload?.nextPageToken ?? "").trim();
    if (!next) break;
    pageToken = next;
  }
  return webhooks;
}

export async function deleteAgentMailWebhook(apiKey: string, webhookId: string): Promise<void> {
  const { status } = await agentMailJson(apiKey, `/webhooks/${encodeURIComponent(webhookId)}`, {
    method: "DELETE",
  });
  if (status === 404) return;
  if (status < 200 || status >= 300) {
    throw new AgentMailConnectError("Could not remove the previous AgentMail webhook.");
  }
}

export function publicAgentMailWebhookUrl(accountId: string): string | null {
  const resolved = resolveCanonicalAppUrl();
  if ("error" in resolved) return null;
  if (/localhost|127\.0\.0\.1/i.test(resolved.url)) return null;
  return `${resolved.url}/api/webhooks/agentmail/${accountId}`;
}

export async function ensureAgentMailWebhook(input: {
  apiKey: string;
  inboxId: string;
  accountId: string;
  hasStoredSecret: boolean;
}): Promise<{ webhookId: string; secret: string | null } | null> {
  const url = publicAgentMailWebhookUrl(input.accountId);
  if (!url) {
    log.warn("Skipping AgentMail webhook registration; APP_URL is not a public origin", {
      accountId: input.accountId,
    });
    return null;
  }

  const existing = (await listAgentMailWebhooks(input.apiKey)).find((webhook) =>
    webhookOwnedByAccount(webhook, input.accountId, url),
  );

  const canReuse =
    existing &&
    existing.url === url &&
    input.hasStoredSecret &&
    existing.inboxIds.includes(input.inboxId) &&
    AGENTMAIL_WEBHOOK_EVENT_TYPES.every((eventType) => existing.eventTypes.includes(eventType));
  if (canReuse && existing) {
    return { webhookId: existing.webhookId, secret: null };
  }

  if (existing) {
    await deleteAgentMailWebhook(input.apiKey, existing.webhookId);
  }

  const { status, body } = await agentMailJson(input.apiKey, "/webhooks", {
    method: "POST",
    body: JSON.stringify({
      url,
      event_types: [...AGENTMAIL_WEBHOOK_EVENT_TYPES],
      inbox_ids: [input.inboxId],
      client_id: agentMailWebhookClientId(input.accountId),
    }),
  });
  if (status === 401 || status === 403) {
    throw new AgentMailConnectError(
      "That AgentMail API key cannot create webhooks. Create a key with webhook permission in the AgentMail console.",
    );
  }
  if (status < 200 || status >= 300) {
    throw new AgentMailConnectError(
      "Could not register the AgentMail inbound webhook for this inbox.",
    );
  }
  const created =
    normalizeAgentMailWebhook(body) ?? normalizeAgentMailWebhook(asRecord(body)?.webhook);
  if (!created?.webhookId) {
    throw new AgentMailConnectError("AgentMail created a webhook but did not return its id.");
  }
  return { webhookId: created.webhookId, secret: created.secret };
}

export async function deleteAgentMailWebhooksForAccount(input: {
  apiKey: string;
  accountId: string;
}): Promise<void> {
  const url = publicAgentMailWebhookUrl(input.accountId);
  const webhooks = await listAgentMailWebhooks(input.apiKey);
  for (const webhook of webhooks) {
    if (webhookOwnedByAccount(webhook, input.accountId, url)) {
      await deleteAgentMailWebhook(input.apiKey, webhook.webhookId);
    }
  }
}

export async function deleteWirelineAgentMailWebhooks(apiKey: string): Promise<void> {
  const webhooks = await listAgentMailWebhooks(apiKey);
  for (const webhook of webhooks) {
    const clientId = webhook.clientId || "";
    if (
      clientId === AGENTMAIL_WEBHOOK_CLIENT_ID ||
      clientId.startsWith(`${AGENTMAIL_WEBHOOK_CLIENT_ID}:`) ||
      /\/api\/webhooks\/agentmail\//.test(webhook.url)
    ) {
      await deleteAgentMailWebhook(apiKey, webhook.webhookId);
    }
  }
}
