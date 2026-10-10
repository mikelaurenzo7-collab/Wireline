import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { findImapReplyThreading, type ReplyThreading } from "./imap-reply-target";

import { resolveCanonicalAppUrl } from "./app-url";
import { fetchWithTimeout, log } from "./server-context";
import { decryptSecret } from "./secret-vault";
import { getErrorMessage, sanitizeErrorMessage, sanitizeForAudit } from "./server-utils";
import {
  existingManagedEmailDomain,
  isBotBoundManagedEmailDomain,
} from "./managed-agentmail-domain";

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
export const AGENTMAIL_MANAGED_SCOPE_MARKER = "managed-botbound";
export const AGENTMAIL_WEBHOOK_EVENT_TYPES = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.bounced",
  "message.complained",
  "message.rejected",
] as const;

export function agentMailWebhookClientId(accountId: string, webhookUrl?: string): string {
  const accountKey = `${AGENTMAIL_WEBHOOK_CLIENT_ID}:${accountId}`;
  if (!webhookUrl) return accountKey;
  // AgentMail treats client_id as an idempotency key. A destination change
  // must create a replacement without reusing or deleting the old hook.
  const destination = canonicalAgentMailWebhookUrl(webhookUrl) ?? webhookUrl;
  return `${accountKey}:${createHash("sha256").update(destination).digest("hex").slice(0, 24)}`;
}

export class AgentMailConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentMailConnectError";
  }
}

export type AgentMailInbox = { inboxId: string; email: string };
export type AgentMailAccountForManagedErasure = {
  provider: string | null;
  emailAddress: string;
  accessToken: string | null;
  oauthGrantedScopes: string | null;
};
export type AgentMailManagedErasureSummary = {
  managedAccountsReconciled: number;
  inboxesDeleted: number;
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
  if (!managed)
    throw new AgentMailConnectError("BotBound managed email is temporarily unavailable.");
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
      entry.name
        ? entry.address
          ? `${entry.name} <${entry.address}>`
          : entry.name
        : (entry.address ?? ""),
    )
    .filter(Boolean)
    .join(", ");
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

export function hasExactAgentMailManagedScope(scopes: string | null | undefined): boolean {
  return typeof scopes === "string" && scopes.split(/\s+/).includes(AGENTMAIL_MANAGED_SCOPE_MARKER);
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

type AgentMailJsonRequester = typeof agentMailJson;

function assertAgentMailStatus(status: number, message: string): void {
  if (status === 401 || status === 403) {
    throw new AgentMailConnectError("That AgentMail API key was rejected.");
  }
  if (status < 200 || status >= 300) throw new AgentMailConnectError(message);
}

export async function listAgentMailInboxes(
  credential: string,
  request: AgentMailJsonRequester = agentMailJson,
): Promise<AgentMailInbox[]> {
  const inboxes: AgentMailInbox[] = [];
  let pageToken: string | undefined;
  const seenPageTokens = new Set<string>();
  while (true) {
    if (pageToken) {
      if (seenPageTokens.has(pageToken)) {
        throw new AgentMailConnectError(
          "AgentMail returned a repeated inbox page token; mailbox inventory is incomplete.",
        );
      }
      seenPageTokens.add(pageToken);
    }
    const query = new URLSearchParams({ limit: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const { status, body } = await request(credential, `/inboxes?${query}`);
    assertAgentMailStatus(status, "Could not list AgentMail inboxes with that API key.");
    const payload = asRecord(body);
    if (!payload || !Array.isArray(payload.inboxes)) {
      throw new AgentMailConnectError(
        "AgentMail returned an invalid inbox inventory; mailbox cleanup was deferred.",
      );
    }
    for (const row of payload.inboxes) {
      const inbox = normalizeAgentMailInbox(row);
      if (!inbox) {
        throw new AgentMailConnectError(
          "AgentMail returned an invalid inbox entry; mailbox cleanup was deferred.",
        );
      }
      inboxes.push(inbox);
    }
    const rawNext = payload.next_page_token ?? payload.nextPageToken;
    if (rawNext != null && typeof rawNext !== "string") {
      throw new AgentMailConnectError(
        "AgentMail returned an invalid inbox page token; mailbox cleanup was deferred.",
      );
    }
    const next = String(rawNext ?? "").trim();
    if (!next) break;
    pageToken = next;
  }
  return inboxes;
}

export async function deleteAgentMailInbox(
  credential: string,
  inboxId: string,
  request: AgentMailJsonRequester = agentMailJson,
): Promise<"deleted" | "already_absent"> {
  const { status } = await request(credential, `/inboxes/${encodeURIComponent(inboxId)}`, {
    method: "DELETE",
  });
  if (status === 404) return "already_absent";
  assertAgentMailStatus(status, "Could not delete the managed AgentMail inbox.");
  return "deleted";
}

type ManagedAgentMailErasureDeps = {
  decryptAccessToken: (encrypted: string) => string;
  verifyManagedDomain: (credential: string, domain: string) => Promise<void>;
  listInboxes: (credential: string) => Promise<AgentMailInbox[]>;
  deleteInbox: (credential: string, inboxId: string) => Promise<"deleted" | "already_absent">;
};

function configuredManagedAgentMailDomain(domainOverride?: string): string {
  const domain = String(domainOverride ?? process.env.AGENTMAIL_DEFAULT_DOMAIN ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
  const syntacticallyValid =
    domain.includes(".") &&
    /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain) &&
    isBotBoundManagedEmailDomain(domain, true);
  if (!syntacticallyValid) {
    throw new AgentMailConnectError(
      "The BotBound managed AgentMail domain is missing or invalid; mailbox cleanup was deferred.",
    );
  }
  return domain;
}

/**
 * Prove that the currently configured managed API key still belongs to the
 * organization that owns BotBound's exact verified sending domain. A valid,
 * empty inbox list from a different AgentMail organization is not evidence
 * that the old organization's mailbox has been erased.
 */
export async function verifyManagedAgentMailDomainIdentity(
  credential: string,
  request: AgentMailJsonRequester = agentMailJson,
  domainOverride?: string,
): Promise<void> {
  const configuredDomain = configuredManagedAgentMailDomain(domainOverride);
  const seenPageTokens = new Set<string>();
  let pageToken: string | undefined;
  let matchedDomainId: string | null = null;

  while (true) {
    if (pageToken) {
      if (seenPageTokens.has(pageToken)) {
        throw new AgentMailConnectError(
          "AgentMail returned a repeated domain page token; mailbox cleanup was deferred.",
        );
      }
      seenPageTokens.add(pageToken);
    }
    const query = new URLSearchParams({ limit: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const { status, body } = await request(credential, `/domains?${query}`);
    assertAgentMailStatus(status, "Could not verify the managed AgentMail organization.");
    const payload = asRecord(body);
    if (!payload || !Array.isArray(payload.domains)) {
      throw new AgentMailConnectError(
        "AgentMail returned an invalid domain inventory; mailbox cleanup was deferred.",
      );
    }
    for (const rawDomain of payload.domains) {
      const domain = asRecord(rawDomain);
      const domainId = String(domain?.domain_id ?? domain?.domainId ?? "").trim();
      const domainName = String(domain?.domain ?? "")
        .trim()
        .toLowerCase();
      if (!domainId || !domainName) {
        throw new AgentMailConnectError(
          "AgentMail returned an invalid domain entry; mailbox cleanup was deferred.",
        );
      }
      if (domainName === configuredDomain) matchedDomainId = domainId;
    }
    const rawNext = payload.next_page_token ?? payload.nextPageToken;
    if (rawNext != null && typeof rawNext !== "string") {
      throw new AgentMailConnectError(
        "AgentMail returned an invalid domain page token; mailbox cleanup was deferred.",
      );
    }
    const next = String(rawNext ?? "").trim();
    if (!next) break;
    pageToken = next;
  }

  if (!matchedDomainId) {
    throw new AgentMailConnectError(
      "The active AgentMail organization does not own BotBound's managed domain; mailbox cleanup was deferred.",
    );
  }

  const { status, body } = await request(
    credential,
    `/domains/${encodeURIComponent(matchedDomainId)}`,
  );
  assertAgentMailStatus(status, "Could not verify the managed AgentMail domain.");
  const detail = asRecord(body);
  const detailId = String(detail?.domain_id ?? detail?.domainId ?? "").trim();
  const detailDomain = String(detail?.domain ?? "")
    .trim()
    .toLowerCase();
  const detailStatus = String(detail?.status ?? "")
    .trim()
    .toUpperCase();
  if (
    detailId !== matchedDomainId ||
    detailDomain !== configuredDomain ||
    detailStatus !== "VERIFIED"
  ) {
    throw new AgentMailConnectError(
      "BotBound's managed AgentMail domain is not verified under the active organization; mailbox cleanup was deferred.",
    );
  }
}

/**
 * Permanently remove only BotBound-owned AgentMail inboxes before local
 * account erasure destroys their cleanup pointers. Tenant-owned/legacy
 * AgentMail connections never carry the exact managed scope marker and are
 * deliberately ignored.
 */
export async function eraseManagedAgentMailInboxesForPurge(
  accounts: readonly AgentMailAccountForManagedErasure[],
  overrides: Partial<ManagedAgentMailErasureDeps> = {},
): Promise<AgentMailManagedErasureSummary> {
  const managedAccounts = accounts.filter(
    (account) =>
      account.provider === "agentmail" && hasExactAgentMailManagedScope(account.oauthGrantedScopes),
  );
  if (managedAccounts.length === 0) {
    return { managedAccountsReconciled: 0, inboxesDeleted: 0 };
  }

  const decryptAccessToken = overrides.decryptAccessToken ?? decryptSecret;
  const verifyManagedDomain =
    overrides.verifyManagedDomain ??
    ((credential: string, domain: string) =>
      verifyManagedAgentMailDomainIdentity(credential, undefined, domain));
  const listInboxes = overrides.listInboxes ?? listAgentMailInboxes;
  const deleteInbox = overrides.deleteInbox ?? deleteAgentMailInbox;
  const wantedAddresses: string[] = [];
  const wantedDomains = new Set<string>();

  // Validate every local ownership pointer before touching the provider. A
  // marker/sentinel contradiction is configuration corruption, not a BYO
  // account, and must block local erasure so an operator can repair it.
  for (const account of managedAccounts) {
    if (!account.accessToken) {
      throw new AgentMailConnectError(
        "A managed AgentMail inbox is missing its BotBound credential sentinel.",
      );
    }
    let credentialMarker: string;
    try {
      credentialMarker = decryptAccessToken(account.accessToken);
    } catch {
      throw new AgentMailConnectError(
        "A managed AgentMail inbox credential could not be decrypted; mailbox cleanup was deferred.",
      );
    }
    if (credentialMarker !== AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL) {
      throw new AgentMailConnectError(
        "A managed AgentMail inbox does not use the BotBound credential sentinel.",
      );
    }
    const address = account.emailAddress.trim().toLowerCase();
    const domain = existingManagedEmailDomain(address);
    if (!domain) {
      throw new AgentMailConnectError(
        "A managed AgentMail inbox has a missing or invalid email domain; mailbox cleanup was deferred.",
      );
    }
    wantedAddresses.push(address);
    wantedDomains.add(domain);
  }

  // Prove the active key still belongs to the exact organization/domain before
  // treating even a valid empty inbox inventory as authoritative.
  for (const domain of wantedDomains) {
    await verifyManagedDomain(AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL, domain);
  }

  // One complete, identity-proven organization inventory is authoritative for
  // every managed pointer. listAgentMailInboxes follows all pages and fails
  // closed on a malformed or cyclic cursor sequence.
  const providerInboxes = await listInboxes(AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL);
  let inboxesDeleted = 0;
  for (const address of wantedAddresses) {
    const matches = providerInboxes.filter((inbox) => inbox.email === address);
    for (const inbox of matches) {
      // A concurrent/retried deletion can turn an inventoried inbox into 404;
      // deleteAgentMailInbox treats that as idempotent success.
      await deleteInbox(AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL, inbox.inboxId);
      inboxesDeleted += 1;
    }
  }

  return {
    managedAccountsReconciled: managedAccounts.length,
    inboxesDeleted,
  };
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
  if (!created)
    throw new AgentMailConnectError("AgentMail created an inbox but did not return its address.");
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
      if (!Array.isArray(uids) || uids.length === 0) return [];
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
      return messages
        .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
        .slice(0, limit);
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

/** Thread headers for replying to the newest message from `from` in this AgentMail inbox. */
export function findAgentMailReplyThreading(
  email: string,
  credential: string,
  query: { from: string; subject: string },
): Promise<ReplyThreading | null> {
  return findImapReplyThreading(createImapClient(email, credential), query);
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
    /** Places the message in the customer's existing thread when known. */
    threading?: ReplyThreading | null;
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
      ...(params.threading
        ? { inReplyTo: params.threading.inReplyTo, references: params.threading.references }
        : {}),
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
  enabled: boolean;
  podIds: string[];
  ownerInboxId: string | null;
};

function uniqueIds(value: unknown, extra?: string | null): string[] {
  const ids = Array.isArray(value) ? value.map((id) => String(id).trim()).filter(Boolean) : [];
  const scoped = String(extra ?? "").trim();
  if (scoped && !ids.includes(scoped)) ids.push(scoped);
  return ids;
}

function normalizeAgentMailWebhook(raw: unknown): AgentMailWebhook | null {
  const row = asRecord(raw);
  if (!row) return null;
  const webhookId = String(row.webhook_id ?? row.webhookId ?? "").trim();
  const url = String(row.url ?? "").trim();
  if (!webhookId || !url) return null;
  return {
    webhookId,
    url,
    clientId: String(row.client_id ?? row.clientId ?? "").trim() || null,
    inboxIds: uniqueIds(row.inbox_ids ?? row.inboxIds, String(row.inbox_id ?? row.inboxId ?? "")),
    eventTypes: uniqueIds(row.event_types ?? row.eventTypes),
    secret: String(row.secret ?? "").trim() || null,
    enabled: row.enabled !== false,
    podIds: uniqueIds(row.pod_ids ?? row.podIds),
    ownerInboxId: String(row.inbox_id ?? row.inboxId ?? "").trim() || null,
  };
}

function canonicalAgentMailWebhookUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin}${pathname}`;
  } catch {
    return null;
  }
}

function webhookUrlsMatch(left: string, right: string | null): boolean {
  if (!right) return false;
  const canonicalLeft = canonicalAgentMailWebhookUrl(left);
  const canonicalRight = canonicalAgentMailWebhookUrl(right);
  return Boolean(canonicalLeft && canonicalRight && canonicalLeft === canonicalRight);
}

function webhookOwnedByAccount(
  webhook: AgentMailWebhook,
  accountId: string,
  url: string | null,
): boolean {
  if (webhookUrlsMatch(webhook.url, url)) return true;
  const accountKey = agentMailWebhookClientId(accountId);
  if (webhook.clientId === accountKey || webhook.clientId?.startsWith(`${accountKey}:`))
    return true;
  if (webhook.clientId !== AGENTMAIL_WEBHOOK_CLIENT_ID) return false;
  try {
    const legacyUrl = new URL(webhook.url);
    const pathname = legacyUrl.pathname.replace(/\/+$/, "") || "/";
    return (
      ["https://botbound.me", "https://www.botbound.me", "https://trywireline.com"].includes(
        legacyUrl.origin,
      ) &&
      !legacyUrl.username &&
      !legacyUrl.password &&
      !legacyUrl.search &&
      !legacyUrl.hash &&
      pathname === `/api/webhooks/agentmail/${accountId}`
    );
  } catch {
    return false;
  }
}

function redactAgentMailApiBody(body: unknown): unknown {
  if (typeof body === "string") return sanitizeErrorMessage(body);
  return sanitizeForAudit(body);
}

function logAgentMailWebhookRequestFailure(operation: string, status: number, body: unknown): void {
  log.warn("AgentMail webhook request failed", {
    operation,
    status,
    body: redactAgentMailApiBody(body),
  });
}

function throwIfAgentMailWebhookRequestFailed(
  operation: string,
  status: number,
  body: unknown,
  message: string,
): void {
  if (status >= 200 && status < 300) return;
  logAgentMailWebhookRequestFailure(operation, status, body);
  if (status === 401 || status === 403) {
    throw new AgentMailConnectError("That AgentMail API key was rejected.");
  }
  throw new AgentMailConnectError(message);
}

export async function listAgentMailWebhooks(credential: string): Promise<AgentMailWebhook[]> {
  const webhooks: AgentMailWebhook[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const { status, body } = await agentMailJson(credential, `/webhooks?${query}`);
    throwIfAgentMailWebhookRequestFailed(
      "webhooks.list",
      status,
      body,
      "Could not list AgentMail webhooks with that API key.",
    );
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

export async function getAgentMailWebhook(
  credential: string,
  webhookId: string,
): Promise<AgentMailWebhook> {
  const { status, body } = await agentMailJson(
    credential,
    `/webhooks/${encodeURIComponent(webhookId)}`,
  );
  throwIfAgentMailWebhookRequestFailed(
    "webhooks.get",
    status,
    body,
    "Could not read the AgentMail inbound webhook.",
  );
  const webhook =
    normalizeAgentMailWebhook(body) ?? normalizeAgentMailWebhook(asRecord(body)?.webhook);
  if (!webhook) {
    throw new AgentMailConnectError("AgentMail returned an invalid webhook.");
  }
  return webhook;
}

async function readAgentMailWebhookSecret(
  apiKey: string,
  webhook: AgentMailWebhook,
): Promise<string | null> {
  if (webhook.secret) return webhook.secret;
  const current = await getAgentMailWebhook(apiKey, webhook.webhookId);
  if (current.webhookId !== webhook.webhookId || !webhookUrlsMatch(current.url, webhook.url)) {
    throw new AgentMailConnectError("AgentMail webhook identity changed; reconnect the mailbox.");
  }
  if (!current.enabled) {
    throw new AgentMailConnectError(
      "AgentMail webhook is disabled; enable it in AgentMail and reconnect.",
    );
  }
  if (
    !current.secret &&
    (current.ownerInboxId !== webhook.ownerInboxId ||
      !(["inboxIds", "podIds", "eventTypes"] as const).every(
        (field) =>
          current[field].length === webhook[field].length &&
          current[field].every((value) => webhook[field].includes(value)),
      ))
  ) {
    throw new AgentMailConnectError(
      "AgentMail webhook subscriptions changed; reconnect the mailbox.",
    );
  }
  return current.secret;
}

export async function deleteAgentMailWebhook(credential: string, webhookId: string): Promise<void> {
  const { status, body } = await agentMailJson(
    credential,
    `/webhooks/${encodeURIComponent(webhookId)}`,
    {
      method: "DELETE",
    },
  );
  if (status === 404) return;
  throwIfAgentMailWebhookRequestFailed(
    "webhooks.delete",
    status,
    body,
    "Could not remove the previous AgentMail webhook.",
  );
}

export function publicAgentMailWebhookUrl(accountId: string): string | null {
  const resolved = resolveCanonicalAppUrl();
  if ("error" in resolved) return null;
  if (/localhost|127\.0\.0\.1/i.test(resolved.url)) return null;
  return `${resolved.url}/api/webhooks/agentmail/${accountId}`;
}

async function adoptAgentMailWebhook(
  apiKey: string,
  webhook: AgentMailWebhook,
  inboxId: string,
  hasStoredSecret: boolean,
): Promise<{ webhookId: string; secret: string | null }> {
  if (!webhook.enabled) {
    throw new AgentMailConnectError(
      "AgentMail webhook is disabled; enable it in AgentMail and reconnect.",
    );
  }
  if (webhook.ownerInboxId && webhook.ownerInboxId !== inboxId) {
    throw new AgentMailConnectError(
      "AgentMail webhook belongs to another inbox; reconnect the matching mailbox.",
    );
  }
  const patch: { add_inbox_ids?: string[]; event_types?: string[] } = {};
  // Empty filters cover the organization and all standard events. Preserve
  // those subscriptions, and preserve extra explicit subscriptions on PATCH.
  if (
    (webhook.inboxIds.length > 0 || webhook.podIds.length > 0) &&
    !webhook.inboxIds.includes(inboxId)
  ) {
    patch.add_inbox_ids = [inboxId];
  }
  if (
    webhook.eventTypes.length > 0 &&
    !AGENTMAIL_WEBHOOK_EVENT_TYPES.every((event) => webhook.eventTypes.includes(event))
  ) {
    patch.event_types = [...new Set([...webhook.eventTypes, ...AGENTMAIL_WEBHOOK_EVENT_TYPES])];
  }
  let ready = webhook;
  if (Object.keys(patch).length > 0) {
    const { status, body } = await agentMailJson(
      apiKey,
      `/webhooks/${encodeURIComponent(webhook.webhookId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    );
    throwIfAgentMailWebhookRequestFailed(
      "webhooks.update",
      status,
      body,
      "Could not repair the AgentMail delivery subscription.",
    );
    const updated =
      normalizeAgentMailWebhook(body) ?? normalizeAgentMailWebhook(asRecord(body)?.webhook);
    if (
      !updated ||
      !updated.enabled ||
      updated.webhookId !== webhook.webhookId ||
      !webhookUrlsMatch(updated.url, webhook.url) ||
      (patch.add_inbox_ids && !updated.inboxIds.includes(inboxId)) ||
      (patch.event_types && !patch.event_types.every((event) => updated.eventTypes.includes(event)))
    ) {
      throw new AgentMailConnectError(
        "AgentMail did not confirm the repaired delivery subscription.",
      );
    }
    ready = updated;
  }
  // Prefer the provider's current secret over an older saved value. If the
  // same validated hook omits it, callers retain their encrypted secret.
  const secret = await readAgentMailWebhookSecret(apiKey, ready);
  if (!secret && !hasStoredSecret) {
    throw new AgentMailConnectError("AgentMail webhook did not expose its signing secret");
  }
  return { webhookId: webhook.webhookId, secret };
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
  const existing = await listAgentMailWebhooks(input.apiKey);
  const owned = existing.filter((webhook) => webhookOwnedByAccount(webhook, input.accountId, url));
  // Provider list order is not an ownership signal. Concurrent reconnects must
  // select the same current hook even if duplicate subscriptions exist.
  const adopted =
    owned
      .filter((webhook) => webhookUrlsMatch(webhook.url, url))
      .sort(
        (left, right) =>
          Number(right.enabled) - Number(left.enabled) ||
          left.webhookId.localeCompare(right.webhookId),
      )[0] ?? null;
  // Reconnect is not a cleanup operation: deleting older hooks here can lose
  // delivery before the caller durably stores the replacement signing secret.
  // The caller retires duplicates only after durably storing that secret.
  if (adopted)
    return adoptAgentMailWebhook(input.apiKey, adopted, input.inboxId, input.hasStoredSecret);

  const { status, body } = await agentMailJson(input.apiKey, "/webhooks", {
    method: "POST",
    body: JSON.stringify({
      url,
      event_types: [...AGENTMAIL_WEBHOOK_EVENT_TYPES],
      inbox_ids: [input.inboxId],
      client_id: agentMailWebhookClientId(input.accountId, url),
    }),
  });
  if (status < 200 || status >= 300) {
    logAgentMailWebhookRequestFailure("webhooks.create", status, body);
    if (status === 401 || status === 403) {
      throw new AgentMailConnectError("That AgentMail API key was rejected.");
    }
    throw new AgentMailConnectError(
      "Could not register the AgentMail inbound webhook for this inbox.",
    );
  }
  const createdPayload = asRecord(asRecord(body)?.webhook) ?? asRecord(body);
  const created = normalizeAgentMailWebhook(body) ?? normalizeAgentMailWebhook(createdPayload);
  const createdId =
    created?.webhookId ??
    String(createdPayload?.webhook_id ?? createdPayload?.webhookId ?? "").trim();
  try {
    if (!created) {
      throw new AgentMailConnectError("AgentMail returned an invalid webhook after creation.");
    }
    if (!created.enabled || !webhookUrlsMatch(created.url, url)) {
      throw new AgentMailConnectError("AgentMail created an inactive or mismatched webhook.");
    }
    const secret = await readAgentMailWebhookSecret(input.apiKey, created);
    if (!secret) {
      throw new AgentMailConnectError("AgentMail webhook did not expose its signing secret");
    }
    return { webhookId: created.webhookId, secret };
  } catch (error) {
    // Idempotent creation can return an existing resource. Never roll back a
    // hook that was already present before this registration attempt.
    if (createdId && !existing.some((webhook) => webhook.webhookId === createdId)) {
      await deleteAgentMailWebhook(input.apiKey, createdId).catch((cleanupError) => {
        log.warn("Unverifiable AgentMail webhook cleanup failed", {
          webhookId: createdId,
          error: getErrorMessage(cleanupError),
        });
      });
    }
    throw error;
  }
}

export async function deleteAgentMailWebhooksForAccount(input: {
  apiKey: string;
  accountId: string;
  /** Retire duplicates only after this hook's signing secret has been persisted. */
  keepWebhookId?: string;
}): Promise<void> {
  const url = publicAgentMailWebhookUrl(input.accountId);
  const webhooks = await listAgentMailWebhooks(input.apiKey);
  if (input.keepWebhookId) {
    const retained = webhooks.find((webhook) => webhook.webhookId === input.keepWebhookId);
    if (!retained?.enabled || !webhookUrlsMatch(retained.url, url)) {
      throw new AgentMailConnectError(
        "AgentMail replacement webhook could not be confirmed; previous subscriptions were retained.",
      );
    }
  }
  for (const webhook of webhooks) {
    if (
      webhook.webhookId !== input.keepWebhookId &&
      webhookOwnedByAccount(webhook, input.accountId, url)
    ) {
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
