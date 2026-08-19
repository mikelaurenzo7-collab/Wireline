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
export const AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL = "botbound-managed-agentmail-v1";
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

export type AgentMailInbox = { inboxId: string; email: string };
export type AgentMailInboxMessage = {
  messageId: string;
  threadId?: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  provider: "agentmail";
};

type AgentMailInboxCreateOptions = {
  domain?: string;
  clientId?: string;
  metadata?: Record<string, string | number | boolean>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveAgentMailCredential(value: string): string {
  const supplied = String(value || "").replace(/\s+/g, "");
  if (supplied !== AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL) return supplied;
  const managed = String(process.env.AGENTMAIL_API_KEY || "").replace(/\s+/g, "");
  if (!managed) throw new AgentMailConnectError("BotBound managed email is temporarily unavailable.");
  return managed;
}

function createImapClient(email: string, credential: string) {
  return new ImapFlow({
    host: AGENTMAIL_IMAP_HOST,
    port: AGENTMAIL_IMAP_PORT,
    secure: true,
    auth: { user: email, pass: resolveAgentMailCredential(credential) },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

function formatAddressList(list: Array<{ name?: string; address?: string }> | undefined): string {
  return (list || [])
    .map((entry) =>
      entry.name ? (entry.address ? `${entry.name} <${entry.address}>` : entry.name) : (entry.address ?? ""),
    )
    .filter(Boolean)
    .join(", ");
}

export function normalizeAgentMailInbox(raw: unknown): AgentMailInbox | null {
  const row = asRecord(raw);
  if (!row) return null;
  const inboxId = String(row.inbox_id ?? row.inboxId ?? "").trim();
  const email = String(row.email ?? inboxId).trim().toLowerCase();
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
  return emailAddress.split("@")[1]?.trim().toLowerCase() === AGENTMAIL_FREE_DOMAIN;
}

async function agentMailJson(
  credential: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const apiKey = resolveAgentMailCredential(credential);
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

function assertAgentMailStatus(status: number, message: string): void {
  if (status === 401 || status === 403) {
    throw new AgentMailConnectError("That AgentMail API key was rejected.");
  }
  if (status < 200 || status >= 300) throw new AgentMailConnectError(message);
}

export async function listAgentMailInboxes(credential: string): Promise<AgentMailInbox[]> {
  const inboxes: AgentMailInbox[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const { status, body } = await agentMailJson(credential, `/inboxes?${query}`);
    assertAgentMailStatus(status, "Could not list AgentMail inboxes with that API key.");
    const payload = asRecord(body);
    for (const row of Array.isArray(payload?.inboxes) ? payload.inboxes : []) {
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
  credential: string,
  username: string,
  displayName = "BotBound",
  options: AgentMailInboxCreateOptions = {},
): Promise<AgentMailInbox> {
  const { status, body } = await agentMailJson(credential, "/inboxes", {
    method: "POST",
    body: JSON.stringify({
      username,
      ...(options.domain ? { domain: options.domain } : {}),
      display_name: displayName,
      client_id: options.clientId || WIRELINE_INBOX_CLIENT_ID,
      ...(options.metadata ? { metadata: options.metadata } : {}),
    }),
  });
  assertAgentMailStatus(
    status,
    options.domain
      ? `Could not create that AgentMail inbox on ${options.domain}. Confirm the domain is verified in the AgentMail organization.`
      : "Could not create that AgentMail inbox. Check the username and org capacity.",
  );
  const created = normalizeAgentMailInbox(body) ?? normalizeAgentMailInbox(asRecord(body)?.inbox);
  if (!created) throw new AgentMailConnectError("AgentMail created an inbox but did not return its address.");
  return created;
}

export async function resolveAgentMailInbox(
  credential: string,
  emailAddress: string,
): Promise<AgentMailInbox> {
  const wanted = emailAddress.trim().toLowerCase();
  const existing = await listAgentMailInboxes(credential);
  const match = existing.find((inbox) => inboxMatchesAddress(inbox, wanted));
  if (match) return match;
  if (!isAgentMailManagedAddress(wanted)) {
    throw new AgentMailConnectError(
      "That address is not in this AgentMail org. Custom domains must be verified before inbox creation.",
    );
  }
  const username = agentmailLocalPart(wanted);
  if (!username) throw new AgentMailConnectError("Use a simple AgentMail inbox name.");
  return createAgentMailInbox(credential, username);
}

export async function verifyAgentMailCredentials(email: string, credential: string): Promise<void> {
  const client = createImapClient(email, credential);
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
  credential: string,
  opts: { limit: number; sinceIso?: string },
): Promise<AgentMailInboxMessage[]> {
  const client = createImapClient(email, credential);
  const limit = Math.min(Math.max(opts.limit, 1), 100);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = opts.sinceIso ? new Date(opts.sinceIso) : undefined;
      const uids = await client.search(since ? { since } : { all: true }, { uid: true });
      if (!uids?.length) return [];
      const recentUids = uids.slice(-limit).reverse();
      const messages: AgentMailInboxMessage[] = [];
      for await (const msg of client.fetch(recentUids, { envelope: true }, { uid: true })) {
        const envelope = msg.envelope;
        if (!envelope) continue;
        messages.push({
          messageId:
            envelope.messageId ||
            (msg.uid != null ? `agentmail-uid-${msg.uid}` : `agentmail-seq-${msg.seq}`),
          from: formatAddressList(envelope.from),
          subject: envelope.subject ?? "",
          snippet: envelope.subject ?? "",
          receivedAt: envelope.date ?? new Date(),
          provider: "agentmail",
        });
      }
      return messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()).slice(0, limit);
    } finally {
      lock.release();
    }
  } catch (error) {
    log.warn("AgentMail inbox fetch failed", { email, error: getErrorMessage(error) });
    throw error;
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function sendAgentMail(
  email: string,
  credential: string,
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
    auth: { user: email, pass: resolveAgentMailCredential(credential) },
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
  } catch (error) {
    log.error("AgentMail SMTP send failed", { email, error: getErrorMessage(error) });
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

function normalizeAgentMailWebhook(raw: unknown): AgentMailWebhook | null {
  const row = asRecord(raw);
  if (!row) return null;
  const webhookId = String(row.webhook_id ?? row.webhookId ?? "").trim();
  const url = String(row.url ?? "").trim();
  if (!webhookId || !url) return null;
  const ids = (value: unknown) =>
    Array.isArray(value) ? value.map((id) => String(id).trim()).filter(Boolean) : [];
  return {
    webhookId,
    url,
    clientId: String(row.client_id ?? row.clientId ?? "").trim() || null,
    inboxIds: ids(row.inbox_ids ?? row.inboxIds),
    eventTypes: ids(row.event_types ?? row.eventTypes),
    secret: String(row.secret ?? "").trim() || null,
  };
}

function webhookOwnedByAccount(webhook: AgentMailWebhook, accountId: string, url: string | null): boolean {
  if (url && webhook.url === url) return true;
  if (webhook.clientId === agentMailWebhookClientId(accountId)) return true;
  return webhook.clientId === AGENTMAIL_WEBHOOK_CLIENT_ID && Boolean(url) && webhook.url === url;
}

export async function listAgentMailWebhooks(credential: string): Promise<AgentMailWebhook[]> {
  const webhooks: AgentMailWebhook[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const { status, body } = await agentMailJson(credential, `/webhooks?${query}`);
    assertAgentMailStatus(status, "Could not list AgentMail webhooks with that API key.");
    const payload = asRecord(body);
    for (const row of Array.isArray(payload?.webhooks) ? payload.webhooks : []) {
      const webhook = normalizeAgentMailWebhook(row);
      if (webhook) webhooks.push(webhook);
    }
    const next = String(payload?.next_page_token ?? payload?.nextPageToken ?? "").trim();
    if (!next) break;
    pageToken = next;
  }
  return webhooks;
}

export async function deleteAgentMailWebhook(credential: string, webhookId: string): Promise<void> {
  const { status } = await agentMailJson(credential, `/webhooks/${encodeURIComponent(webhookId)}`, {
    method: "DELETE",
  });
  if (status === 404) return;
  assertAgentMailStatus(status, "Could not remove the previous AgentMail webhook.");
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
  if (canReuse && existing) return { webhookId: existing.webhookId, secret: null };
  if (existing) await deleteAgentMailWebhook(input.apiKey, existing.webhookId);

  const { status, body } = await agentMailJson(input.apiKey, "/webhooks", {
    method: "POST",
    body: JSON.stringify({
      url,
      event_types: [...AGENTMAIL_WEBHOOK_EVENT_TYPES],
      inbox_ids: [input.inboxId],
      client_id: agentMailWebhookClientId(input.accountId),
    }),
  });
  assertAgentMailStatus(status, "Could not register the AgentMail inbound webhook for this inbox.");
  const created = normalizeAgentMailWebhook(body) ?? normalizeAgentMailWebhook(asRecord(body)?.webhook);
  if (!created) throw new AgentMailConnectError("AgentMail created a webhook but did not return its id.");
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
