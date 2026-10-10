/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
import { googleApis } from "./google-apis";
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";
import { createMeeting as createZoomMeeting } from "./zoom-service";
import { fetchIcloudInbox, findIcloudReplyThreading, sendIcloudMail } from "./icloud-mail";
import { fetchAgentMailInbox, findAgentMailReplyThreading, sendAgentMail } from "./agentmail-mail";
import {
  baseReplySubject,
  parseReferencesHeader,
  replyReferences,
  type ReplyThreading,
} from "./imap-reply-target";
import { AppError } from "./api-error";
import { formatIsoInTimeZone, localDateWindowToUtc, normalizeIanaTimeZone } from "./calendar-time";
import {
  assertExternalEntityActionAllowed,
  liveExternalActionPolicyForUser,
} from "./account-environment-policy";
import { runTenantProviderWorkWithDeletionFence } from "./tenant-provider-deletion-fence";
import { requireTenantChannel } from "./channel-entitlements";
import { sendFundedManagedEmail } from "./managed-mail-send-spend";

const MAX_CALENDAR_PAGES = 20;

export type InboxMessagePreview = {
  accountId: string;
  messageId: string;
  threadId?: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  provider: "google" | "microsoft" | "yahoo" | "icloud" | "agentmail";
};

/** A connected mailbox whose fetch failed: dead token, revoked grant, outage. */
export type InboxFetchFailure = { provider: string; error: string };

/**
 * Account reachability is independent of message count: a successful mailbox
 * may be empty even when another connected mailbox fails.
 */
export type InboxFetchResult = {
  messages: InboxMessagePreview[];
  failures: InboxFetchFailure[];
  successfulAccounts: number;
};

type ConnectedMailboxSendParams = {
  to: string;
  subject: string;
  body: string;
  marketing?: boolean;
  textBody?: string;
  htmlBody?: string;
  unsubscribeHeaders?: Record<string, string>;
  /** Places the message in the customer's existing thread when known. */
  threading?: ReplyThreading | null;
};

/** What a thread reply did: whether it was accepted, and whether it joined the customer's thread. */
export type ThreadReplyOutcome = { sent: boolean; threaded: boolean };

function plainTextEmailBodyHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.55; white-space: pre-wrap;">${escaped}</div>`;
}

function safeMimeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function mimeBase64(value: string): string {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") || "";
}

/**
 * Build one standards-compliant message for connected mailbox transports.
 * Promotional messages use multipart/alternative plus RFC 8058 headers so
 * Gmail raw sends and Microsoft Graph MIME sends carry identical semantics.
 */
function buildConnectedMailboxMime(params: ConnectedMailboxSendParams): string {
  const subject = `=?utf-8?B?${Buffer.from(params.subject, "utf8").toString("base64")}?=`;
  const unsubscribeHeaders = Object.entries(params.unsubscribeHeaders || {}).map(
    ([name, value]) => `${name}: ${safeMimeHeaderValue(value)}`,
  );
  const threadHeaders = params.threading
    ? [
        `In-Reply-To: ${safeMimeHeaderValue(params.threading.inReplyTo)}`,
        `References: ${safeMimeHeaderValue(params.threading.references)}`,
      ]
    : [];
  const headers = [
    `To: ${safeMimeHeaderValue(params.to)}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    ...threadHeaders,
    ...unsubscribeHeaders,
  ];

  if (params.textBody && params.htmlBody) {
    const boundary = `wireline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      mimeBase64(params.textBody),
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      mimeBase64(params.htmlBody),
      "",
      `--${boundary}--`,
    ].join("\r\n");
  }

  return [
    ...headers,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    mimeBase64(params.htmlBody ?? params.body),
  ].join("\r\n");
}

/**
 * Unified interface for Calendar and Mail integrations.
 */
export class IntegrationService {
  constructor(private userId: string) {}

  /**
   * Calendar: Check availability across all connected accounts.
   */
  async checkAvailability(input: { date: unknown; timeZone: unknown }): Promise<string> {
    try {
      const environmentPolicy = await liveExternalActionPolicyForUser(this.userId);
      if (!environmentPolicy.allowed) {
        log.warn("Calendar availability blocked by account environment", {
          userId: this.userId,
          accountEnvironment: environmentPolicy.environment ?? "missing",
          code: environmentPolicy.code,
        });
        return "Calendar access is disabled in this demo or test workspace.";
      }
      const accounts = await this.getAccounts("calendar");
      if (accounts.length === 0) return "No calendar accounts connected.";

      const { startTime, endTime, timeZone } = localDateWindowToUtc(input);
      const startOfDay = new Date(startTime);
      const endOfDay = new Date(endTime);
      const busySlots: string[] = [];

      for (const account of accounts) {
        if (account.provider === "google") {
          const slots = await this.getGoogleBusySlots(account, startOfDay, endOfDay, timeZone);
          busySlots.push(...slots);
        } else if (account.provider === "microsoft") {
          const slots = await this.getMicrosoftBusySlots(account, startOfDay, endOfDay, timeZone);
          busySlots.push(...slots);
        } else {
          throw new Error("Connected calendar provider is not supported");
        }
      }

      if (busySlots.length === 0) {
        return `The whole day is currently free in ${timeZone}.`;
      }
      return `Busy slots in ${timeZone}:\n${busySlots.join("\n")}`;
    } catch (err) {
      log.error("Calendar availability check failed", {
        userId: this.userId,
        error: getErrorMessage(err),
      });
      return "Failed to check calendar availability.";
    }
  }

  /**
   * Calendar: Book an appointment.
   */
  async bookAppointment(params: {
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    attendees?: string[];
    agentId?: string;
  }): Promise<boolean> {
    try {
      let providerWorkStarted = false;
      const fenced = await runTenantProviderWorkWithDeletionFence({
        userId: this.userId,
        operation: "integration_calendar_booking",
        retainOnSuccess: () => providerWorkStarted,
        perform: async () => {
          const environmentPolicy = await liveExternalActionPolicyForUser(this.userId);
          if (!environmentPolicy.allowed) {
            log.warn("Calendar booking blocked by account environment", {
              userId: this.userId,
              accountEnvironment: environmentPolicy.environment ?? "missing",
              code: environmentPolicy.code,
            });
            return false;
          }
          for (const attendee of params.attendees || []) {
            await assertExternalEntityActionAllowed(this.userId, "calendar_attendee_invitation", {
              email: attendee,
            });
          }
          const accounts = await this.getAccounts("calendar");
          if (accounts.length === 0) return false;

          // Availability may have changed after the caller chose a time. Recheck
          // the exact interval before creating a meeting or calendar event.
          // Any read failure fails closed through the enclosing error handler.
          const start = new Date(params.startTime);
          const end = new Date(params.endTime);
          if (
            !Number.isFinite(start.getTime()) ||
            !Number.isFinite(end.getTime()) ||
            end <= start
          ) {
            return false;
          }
          for (const account of accounts) {
            const busy =
              account.provider === "google"
                ? await this.getGoogleBusySlots(account, start, end, "UTC")
                : account.provider === "microsoft"
                  ? await this.getMicrosoftBusySlots(account, start, end, "UTC")
                  : null;
            if (!busy || busy.length > 0) return false;
          }

          // Check if the agent has auto_zoom_link enabled.
          let zoomUrl: string | undefined;
          if (params.agentId) {
            const [agent] = await drizzle
              .select({ autoZoomLink: schema.agents.autoZoomLink })
              .from(schema.agents)
              .where(
                and(eq(schema.agents.id, params.agentId), eq(schema.agents.userId, this.userId)),
              )
              .limit(1);

            if (agent?.autoZoomLink) {
              providerWorkStarted = true;
              const meeting = await createZoomMeeting(this.userId, {
                topic: params.title,
                startTime: params.startTime,
                duration: Math.round(
                  (new Date(params.endTime).getTime() - new Date(params.startTime).getTime()) /
                    60_000,
                ),
              });
              if (meeting) {
                zoomUrl = meeting.join_url;
              }
            }
          }

          const bookingParams = {
            ...params,
            description: zoomUrl
              ? `${params.description}\n\nZoom Meeting: ${zoomUrl}`
              : params.description,
            location: zoomUrl || undefined,
            generateMeetLink: !zoomUrl,
          };

          // Pick the first account as the primary for booking.
          const account = accounts[0];
          if (account.provider === "google") {
            providerWorkStarted = true;
            return await this.createGoogleEvent(account, bookingParams);
          } else if (account.provider === "microsoft") {
            providerWorkStarted = true;
            return await this.createMicrosoftEvent(account, bookingParams);
          }
          return false;
        },
      });
      if (!fenced.performed) {
        log.warn("Calendar booking blocked by terminal account deletion", {
          userId: this.userId,
        });
        return false;
      }
      return fenced.result;
    } catch (err) {
      log.error("Calendar booking failed", { userId: this.userId, error: getErrorMessage(err) });
      return false;
    }
  }

  /**
   * Mail: Send an email.
   */
  /**
   * Pull the most recent inbox messages for the tenant's connected
   * mail account. Used by the action engine's `triage_inbox` flow
   * and the manual "Sync inbox" button. Returns a unified shape
   * regardless of provider so callers don't branch.
   *
   * Yahoo inbox retrieval is not implemented; report that account as
   * unavailable rather than treating an unattempted fetch as a healthy inbox.
   */
  async fetchInboxMessages(
    opts: {
      limit?: number;
      /** Only return messages received after this ISO timestamp. */
      sinceIso?: string;
    } = {},
  ): Promise<InboxFetchResult> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const failures: InboxFetchFailure[] = [];
    try {
      await requireTenantChannel(this.userId, "email");
      // Only canonical email-account rows may source inbox persistence. Google
      // and Microsoft callbacks upsert both calendar and mailbox rows; falling
      // back to calendar rows lost the mailbox identity needed for safe dedupe.
      const mailAccounts = await this.getAccounts("mail");
      if (mailAccounts.length === 0) return { messages: [], failures, successfulAccounts: 0 };

      // Fan out across every connected mail account the tenant has.
      // Most tenants have 1 mailbox; some have one per channel.
      //
      // A per-account failure is REPORTED, not just logged. Swallowing it and
      // returning [] made a dead mailbox, expired refresh token, revoked
      // OAuth grant, provider outage, indistinguishable from an empty inbox,
      // so the account holder saw a cheerful "No new inbox messages found."
      // every time while mail piled up unreachable behind a broken connection.
      const perAccount = await Promise.all(
        mailAccounts.map((account: any) =>
          this.fetchFromAccount(account, { limit, sinceIso: opts.sinceIso }).catch((err) => {
            const error = getErrorMessage(err);
            log.warn("fetchInboxMessages failed for one account", {
              provider: account.provider,
              error,
            });
            failures.push({ provider: String(account.provider ?? "unknown"), error });
            return [];
          }),
        ),
      );

      // Merge + sort newest-first, then cap to the caller's limit.
      const merged = perAccount.flat();
      merged.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
      return {
        messages: merged.slice(0, limit),
        failures,
        successfulAccounts: mailAccounts.length - failures.length,
      };
    } catch (err) {
      const error = getErrorMessage(err);
      log.error("fetchInboxMessages failed", { userId: this.userId, error });
      failures.push({ provider: "unknown", error });
      return { messages: [], failures, successfulAccounts: 0 };
    }
  }

  private async fetchFromAccount(
    account: any,
    opts: { limit: number; sinceIso?: string },
  ): Promise<InboxMessagePreview[]> {
    if (account.provider === "google") {
      return this.fetchGoogleInbox(account, opts);
    }
    if (account.provider === "microsoft") {
      return this.fetchMicrosoftInbox(account, opts);
    }
    if (account.provider === "yahoo") {
      throw new Error("Yahoo inbox refresh is not available yet.");
    }
    if (account.provider === "icloud") {
      return this.fetchIcloudInbox(account, opts);
    }
    if (account.provider === "agentmail") {
      return this.fetchAgentMailInbox(account, opts);
    }
    throw new Error("Inbox refresh is not available for this mailbox provider.");
  }

  private async fetchIcloudInbox(account: any, opts: { limit: number; sinceIso?: string }) {
    const email = account.emailAddress as string;
    const appPassword = decryptSecret(account.accessToken);
    const messages = await fetchIcloudInbox(email, appPassword, opts);
    return messages.map((message) => ({ ...message, accountId: String(account.id) }));
  }

  private async fetchAgentMailInbox(account: any, opts: { limit: number; sinceIso?: string }) {
    const email = account.emailAddress as string;
    const apiKey = decryptSecret(account.accessToken);
    const messages = await fetchAgentMailInbox(email, apiKey, opts);
    return messages.map((message) => ({ ...message, accountId: String(account.id) }));
  }

  private async fetchGoogleInbox(account: any, opts: { limit: number; sinceIso?: string }) {
    const auth = await this.getGoogleClient(account);
    const google = await googleApis();
    const gmail = google.gmail({ version: "v1", auth });
    // `q` filters by Gmail search syntax. We always exclude category:promotions
    // and category:social so agent inboxes aren't flooded with newsletters.
    const qParts = ["in:inbox", "-category:promotions", "-category:social"];
    if (opts.sinceIso) {
      const since = Math.floor(new Date(opts.sinceIso).getTime() / 1000);
      qParts.push(`after:${since}`);
    }
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: opts.limit,
      q: qParts.join(" "),
    });
    const ids = listRes.data.messages?.map((m: any) => m.id).filter(Boolean) ?? [];
    if (ids.length === 0) return [];

    // metadata format → just headers + snippet, no body. Cheap.
    const details = await Promise.all(
      ids.map((id: any) =>
        gmail.users.messages.get({
          userId: "me",
          id: id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        }),
      ),
    );
    return details
      .map((d) => {
        const headers = d.data.payload?.headers ?? [];
        const get = (n: string) =>
          headers.find((h: any) => h.name?.toLowerCase() === n.toLowerCase())?.value ?? "";
        const internalDate = d.data.internalDate
          ? new Date(Number(d.data.internalDate))
          : new Date();
        return {
          accountId: String(account.id),
          messageId: d.data.id ?? "",
          threadId: d.data.threadId ?? undefined,
          from: get("From"),
          subject: get("Subject"),
          snippet: d.data.snippet ?? "",
          receivedAt: internalDate,
          provider: "google" as const,
        };
      })
      .filter((m) => m.messageId);
  }

  private async fetchMicrosoftInbox(account: any, opts: { limit: number; sinceIso?: string }) {
    const token = await this.getMicrosoftToken(account);
    const params = new URLSearchParams({
      $top: String(opts.limit),
      $select: "id,conversationId,from,subject,bodyPreview,receivedDateTime",
      $orderby: "receivedDateTime DESC",
    });
    if (opts.sinceIso) {
      params.set("$filter", `receivedDateTime ge ${opts.sinceIso}`);
    }
    const url = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${params.toString()}`;
    const r = await fetchWithTimeout(
      url,
      { headers: { Authorization: `Bearer ${token}` } },
      15_000,
    );
    if (!r.ok) {
      log.warn("Microsoft inbox fetch non-200", { status: r.status });
      // The shared inbox collector reports thrown provider failures to the
      // sync route. Returning [] here falsely claims the mailbox is up to date.
      throw new Error("Microsoft inbox could not be refreshed. Try again or reconnect Microsoft.");
    }
    const data = (await r.json()) as any;
    return (data.value || []).map((m: any) => ({
      accountId: String(account.id),
      messageId: m.id as string,
      threadId: m.conversationId,
      from: m.from?.emailAddress?.address || "",
      subject: m.subject || "",
      snippet: m.bodyPreview || "",
      receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : new Date(),
      provider: "microsoft" as const,
    }));
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    body: string;
    /**
     * True for recurring/unsolicited commercial mail (cadence email steps).
     * Marketing sends honor a sender-scoped suppression list and carry the
     * tenant's business identity, postal address, and unsubscribe affordance.
     * They must leave from the tenant's connected mailbox so the RFC headers
     * and commercial sender identity agree.
     */
    marketing?: boolean;
  }): Promise<boolean> {
    try {
      let providerWorkStarted = false;
      const fenced = await runTenantProviderWorkWithDeletionFence({
        userId: this.userId,
        operation: "integration_email_send",
        retainOnSuccess: () => providerWorkStarted,
        perform: async () => {
          const environmentPolicy = await liveExternalActionPolicyForUser(this.userId);
          if (!environmentPolicy.allowed) {
            log.warn("Outbound tenant email blocked by account environment", {
              userId: this.userId,
              accountEnvironment: environmentPolicy.environment ?? "missing",
              code: environmentPolicy.code,
            });
            return false;
          }
          await assertExternalEntityActionAllowed(this.userId, "tenant_email_send", {
            email: params.to,
          });
          await requireTenantChannel(this.userId, "email");
          // This service sends one recipient per attempt. Reject header injection
          // and recipient lists before reserving funds or opening a transport.
          if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(params.to)) return false;

          const accounts = await this.getAccounts("mail");
          // Fallback: If no mail account, try calendar accounts (many have mail too)
          const mailAccounts = accounts.length > 0 ? accounts : await this.getAccounts("calendar");

          if (mailAccounts.length > 0) {
            // Marketing compliance for the tenant's OWN mailbox transports.
            // Cadence marketing never falls through to Wireline's transactional
            // sender: honoring suppression and sender identity here is what makes a
            // recorded opt-out binding no matter which connected mailbox sends.
            let sendParams: ConnectedMailboxSendParams = params;
            if (params.marketing) {
              const {
                getTenantMarketingIdentity,
                isTenantEmailSuppressed,
                buildTenantComplianceFooterText,
                buildTenantComplianceFooterHtml,
                buildTenantListUnsubscribeHeaders,
              } = await import("./email-compliance");
              const identity = await getTenantMarketingIdentity(this.userId);
              if (!identity) {
                log.warn("Marketing email skipped, tenant sender identity is incomplete", {
                  userId: this.userId,
                });
                return false;
              }
              if (await isTenantEmailSuppressed(this.userId, params.to)) {
                log.info("Marketing email skipped, recipient opted out of this sender", {
                  userId: this.userId,
                  to: params.to,
                });
                return false;
              }
              const complianceArgs = {
                userId: this.userId,
                email: params.to,
                identity,
              };
              sendParams = {
                ...params,
                textBody: `${params.body}${buildTenantComplianceFooterText(complianceArgs)}`,
                htmlBody: `${plainTextEmailBodyHtml(params.body)}${buildTenantComplianceFooterHtml(
                  complianceArgs,
                )}`,
                unsubscribeHeaders: buildTenantListUnsubscribeHeaders(this.userId, params.to),
              };
            }

            const account =
              mailAccounts.find((candidate) => candidate.provider === "agentmail") ??
              mailAccounts[0];
            if (account.provider === "google") {
              providerWorkStarted = true;
              return await this.sendGoogleEmail(account, sendParams);
            }
            if (account.provider === "microsoft") {
              providerWorkStarted = true;
              return await this.sendMicrosoftEmail(account, sendParams);
            }
            if (account.provider === "icloud") {
              if (!account.accessToken || !account.emailAddress) return false;
              const email = account.emailAddress as string;
              const appPassword = decryptSecret(account.accessToken);
              providerWorkStarted = true;
              return sendIcloudMail(email, appPassword, sendParams);
            }
            if (account.provider === "agentmail") {
              if (!account.accessToken || !account.emailAddress) return false;
              const email = account.emailAddress as string;
              const apiKey = decryptSecret(account.accessToken);
              return sendFundedManagedEmail({
                userId: this.userId,
                provider: "agentmail",
                perform: async () => {
                  providerWorkStarted = true;
                  return sendAgentMail(email, apiKey, sendParams);
                },
              });
            }
            if (account.provider === "yahoo") {
              log.warn("Yahoo Mail send refused because XOAUTH2 transport is not implemented", {
                userId: this.userId,
              });
              return false;
            }
          }

          // A tenant cadence must leave from the tenant's own mailbox. Sending a
          // customer's marketing campaign through BotBound's transactional Resend
          // identity would misidentify the commercial sender and blur opt-out scope.
          if (params.marketing) {
            log.warn("Marketing email skipped, connect a tenant mailbox before sending cadences", {
              userId: this.userId,
            });
            return false;
          }

          // Customer-requested follow-ups remain Email-channel work even when
          // the platform provides the transport. System security/billing notices
          // use email-service directly and are independent of this channel.
          const { sendEmail: sendPlatformEmail } = await import("./email-service");
          const escaped = params.body
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.55; white-space: pre-wrap;">${escaped}</div>`;
          if (!process.env.RESEND_API_KEY?.trim()) return false;
          return sendFundedManagedEmail({
            userId: this.userId,
            provider: "resend",
            perform: async () => {
              providerWorkStarted = true;
              const result = await sendPlatformEmail({
                to: params.to,
                subject: params.subject,
                text: params.body,
                html,
              });
              if (!result.ok) {
                log.warn("Platform Resend fallback failed for tenant email", {
                  userId: this.userId,
                  error: result.error,
                });
              }
              return result.ok;
            },
          });
        },
      });
      if (!fenced.performed) {
        log.warn("Outbound tenant email blocked by terminal account deletion", {
          userId: this.userId,
        });
        return false;
      }
      return fenced.result;
    } catch (err) {
      log.error("Email sending failed", { userId: this.userId, error: getErrorMessage(err) });
      return false;
    }
  }

  /**
   * Answer one inbox conversation from the mailbox that received it. Unlike
   * sendEmail, a reply never falls back to another mailbox or to BotBound's
   * transactional sender: the customer must hear back from the address they
   * wrote to. Plan, recipient, and environment refusals propagate as AppErrors
   * so the owner sees why; transport failures return `sent: false`.
   */
  async sendThreadReply(params: {
    accountId: string;
    to: string;
    subject: string;
    body: string;
  }): Promise<ThreadReplyOutcome> {
    const notSent: ThreadReplyOutcome = { sent: false, threaded: false };
    try {
      let providerWorkStarted = false;
      const fenced = await runTenantProviderWorkWithDeletionFence({
        userId: this.userId,
        operation: "integration_email_reply",
        retainOnSuccess: () => providerWorkStarted,
        perform: async (): Promise<ThreadReplyOutcome> => {
          const environmentPolicy = await liveExternalActionPolicyForUser(this.userId);
          if (!environmentPolicy.allowed) {
            log.warn("Inbox reply blocked by account environment", {
              userId: this.userId,
              accountEnvironment: environmentPolicy.environment ?? "missing",
              code: environmentPolicy.code,
            });
            return notSent;
          }
          await assertExternalEntityActionAllowed(this.userId, "tenant_email_send", {
            email: params.to,
          });
          await requireTenantChannel(this.userId, "email");
          if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(params.to)) return notSent;

          const account = (await this.getAccounts("mail")).find(
            (candidate) => candidate.id === params.accountId,
          );
          if (!account) return notSent;
          const sendParams: ConnectedMailboxSendParams = {
            to: params.to,
            subject: params.subject,
            body: params.body,
            textBody: params.body,
            htmlBody: plainTextEmailBodyHtml(params.body),
          };
          const query = { from: params.to, subject: params.subject };

          if (account.provider === "google") {
            const target = await this.findGoogleReplyTarget(account, query);
            providerWorkStarted = true;
            const sent = await this.sendGoogleEmail(
              account,
              { ...sendParams, threading: target?.threading ?? null },
              target?.threadId,
            );
            return { sent, threaded: sent && Boolean(target) };
          }
          if (account.provider === "microsoft") {
            providerWorkStarted = true;
            return this.replyMicrosoftEmail(account, params);
          }
          if (account.provider === "icloud") {
            if (!account.accessToken || !account.emailAddress) return notSent;
            const email = account.emailAddress as string;
            const appPassword = decryptSecret(account.accessToken);
            const threading = await findIcloudReplyThreading(email, appPassword, query);
            providerWorkStarted = true;
            const sent = await sendIcloudMail(email, appPassword, { ...sendParams, threading });
            return { sent, threaded: sent && Boolean(threading) };
          }
          if (account.provider === "agentmail") {
            if (!account.accessToken || !account.emailAddress) return notSent;
            const email = account.emailAddress as string;
            const apiKey = decryptSecret(account.accessToken);
            const threading = await findAgentMailReplyThreading(email, apiKey, query);
            const sent = await sendFundedManagedEmail({
              userId: this.userId,
              provider: "agentmail",
              perform: async () => {
                providerWorkStarted = true;
                return sendAgentMail(email, apiKey, { ...sendParams, threading });
              },
            });
            return { sent, threaded: sent && Boolean(threading) };
          }
          log.warn("Inbox reply refused: this mailbox provider cannot send", {
            userId: this.userId,
            provider: account.provider,
          });
          return notSent;
        },
      });
      if (!fenced.performed) {
        log.warn("Inbox reply blocked by terminal account deletion", { userId: this.userId });
        return notSent;
      }
      return fenced.result;
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("Inbox reply failed", { userId: this.userId, error: getErrorMessage(err) });
      return notSent;
    }
  }

  // --- Private Helpers ---

  private async getAccounts(type: "calendar" | "mail") {
    // Tag every row with its source table. Token refresh used to infer the
    // table from `emailAddress` presence, but calendar rows deliberately
    // mirror the email address (see schema), so a Microsoft *calendar*
    // account's refreshed tokens were written to wireline_email_accounts
    // WHERE id = <calendar uuid>: zero rows, tokens never persisted, and the
    // invalid_grant terminal cleanup could never self-heal the row either.
    if (type === "calendar") {
      const rows = await drizzle
        .select()
        .from(schema.calendarAccounts)
        .where(eq(schema.calendarAccounts.userId, this.userId));
      return rows.map((row) => ({ ...row, __accountTable: "calendar" as const }));
    } else {
      const rows = await drizzle
        .select()
        .from(schema.emailAccounts)
        .where(eq(schema.emailAccounts.userId, this.userId));
      return rows.map((row) => ({ ...row, __accountTable: "mail" as const }));
    }
  }

  private async getGoogleClient(account: any) {
    const google = await googleApis();
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    const accessToken = account.accessToken ? decryptSecret(account.accessToken) : null;
    const refreshToken = account.refreshToken ? decryptSecret(account.refreshToken) : null;
    const expiryDate = account.expiresAt ? Number(account.expiresAt) : null;
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiryDate,
    });

    const table =
      account.__accountTable === "calendar"
        ? schema.calendarAccounts
        : account.__accountTable === "mail"
          ? schema.emailAccounts
          : account.emailAddress
            ? schema.emailAccounts
            : schema.calendarAccounts;

    if (!accessToken) {
      throw new Error("Google connection needs reconnect: access token is missing.");
    }

    // Google documents that revoked credentials surface as 400/401 OAuth
    // failures. Refresh just before expiry so a terminal invalid_grant becomes
    // durable reconnect state instead of leaving a row that looks connected
    // forever. Successful refreshes are persisted for the next invocation.
    if (expiryDate && Date.now() >= expiryDate - 60_000) {
      if (!refreshToken) {
        await drizzle
          .update(table as any)
          .set({ accessToken: null, refreshToken: null, expiresAt: BigInt(0) })
          .where(eq((table as any).id, account.id));
        throw new Error("Google connection needs reconnect: refresh token is missing.");
      }

      try {
        const refreshed = await oauth2Client.getAccessToken();
        const token = refreshed?.token;
        if (!token) throw new Error("Google token refresh returned no access token.");
        const credentials = oauth2Client.credentials;
        await drizzle
          .update(table as any)
          .set({
            accessToken: encryptSecret(token),
            ...(credentials.refresh_token
              ? { refreshToken: encryptSecret(credentials.refresh_token) }
              : {}),
            ...(credentials.expiry_date ? { expiresAt: BigInt(credentials.expiry_date) } : {}),
          })
          .where(eq((table as any).id, account.id));
      } catch (error: any) {
        const oauthCode = String(error?.response?.data?.error || error?.code || "").toLowerCase();
        const message = getErrorMessage(error).toLowerCase();
        const terminal =
          oauthCode === "invalid_grant" ||
          message.includes("invalid_grant") ||
          message.includes("token has been expired or revoked") ||
          message.includes("token has been revoked");
        if (terminal) {
          await drizzle
            .update(table as any)
            .set({ accessToken: null, refreshToken: null, expiresAt: BigInt(0) })
            .where(eq((table as any).id, account.id));
        }
        throw error;
      }
    }

    return oauth2Client;
  }

  private async getGoogleBusySlots(
    account: any,
    start: Date,
    end: Date,
    timeZone: string,
  ): Promise<string[]> {
    const auth = await this.getGoogleClient(account);
    const google = await googleApis();
    const calendar = google.calendar({ version: "v3", auth });
    const events: any[] = [];
    let pageToken: string | undefined;
    let exhausted = false;

    for (let page = 0; page < MAX_CALENDAR_PAGES; page += 1) {
      const res = await calendar.events.list({
        calendarId: "primary",
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        timeZone: normalizeIanaTimeZone(timeZone),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 2_500,
        ...(pageToken ? { pageToken } : {}),
      });
      if (res.data.items != null && !Array.isArray(res.data.items)) {
        throw new Error("Google calendar returned an invalid event inventory");
      }
      events.push(...(res.data.items || []));
      if (
        res.data.nextPageToken != null &&
        (typeof res.data.nextPageToken !== "string" || !res.data.nextPageToken)
      ) {
        throw new Error("Google calendar returned an invalid continuation token");
      }
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) {
        exhausted = true;
        break;
      }
    }
    if (!exhausted) {
      throw new Error("Google calendar pagination exceeded the safety limit");
    }

    return events
      .filter((event: any) => event.status !== "cancelled" && event.transparency !== "transparent")
      .map((event: any) => {
        if (event.start?.date && !event.start?.dateTime) {
          return "All day: Busy";
        }
        const startIso = event.start?.dateTime;
        const endIso = event.end?.dateTime;
        if (!startIso || !endIso)
          throw new Error("Google calendar event is missing its time interval");
        return `${formatIsoInTimeZone(startIso, timeZone)} to ${formatIsoInTimeZone(endIso, timeZone)}: Busy`;
      })
      .filter((slot: string | null): slot is string => Boolean(slot));
  }

  private async createGoogleEvent(account: any, params: any): Promise<boolean> {
    const auth = await this.getGoogleClient(account);
    const google = await googleApis();
    const calendar = google.calendar({ version: "v3", auth });

    const requestBody: any = {
      summary: params.title,
      description: params.description,
      start: { dateTime: params.startTime },
      end: { dateTime: params.endTime },
      attendees: params.attendees?.map((email: string) => ({ email })),
    };

    if (params.location) {
      requestBody.location = params.location;
    }

    if (params.generateMeetLink) {
      requestBody.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      };
    }

    await calendar.events.insert({
      calendarId: "primary",
      ...(params.generateMeetLink ? { conferenceDataVersion: 1 } : {}),
      requestBody,
    });
    return true;
  }

  private async sendGoogleEmail(
    account: any,
    params: ConnectedMailboxSendParams,
    providerThreadId?: string,
  ): Promise<boolean> {
    const auth = await this.getGoogleClient(account);
    const google = await googleApis();
    const gmail = google.gmail({ version: "v1", auth });
    const message = buildConnectedMailboxMime(params);
    const encodedMessage = Buffer.from(message, "utf8").toString("base64url");
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
        ...(providerThreadId ? { threadId: providerThreadId } : {}),
      },
    });
    return true;
  }

  /**
   * The Gmail thread and RFC identifiers of the newest message from `from`
   * with this subject. The inbox keeps only hashed provider IDs, so Gmail
   * itself is the source of truth. Any failure means "send without threading".
   */
  private async findGoogleReplyTarget(
    account: any,
    query: { from: string; subject: string },
  ): Promise<{ threadId: string; threading: ReplyThreading } | null> {
    try {
      const auth = await this.getGoogleClient(account);
      const google = await googleApis();
      const gmail = google.gmail({ version: "v1", auth });
      const subject = baseReplySubject(query.subject).replace(/"/g, "");
      const list = await gmail.users.messages.list({
        userId: "me",
        q: `from:${query.from}${subject ? ` subject:"${subject}"` : ""}`,
        maxResults: 1,
      });
      const latest = list.data.messages?.[0];
      if (!latest?.id || !latest.threadId) return null;
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: latest.id,
        format: "metadata",
        metadataHeaders: ["Message-ID", "References"],
      });
      const headers = detail.data.payload?.headers ?? [];
      const header = (name: string) =>
        headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
      const messageId = header("Message-ID").trim();
      if (!messageId) return null;
      return {
        threadId: latest.threadId,
        threading: {
          inReplyTo: messageId,
          references: replyReferences(parseReferencesHeader(header("References")), messageId),
        },
      };
    } catch (error) {
      log.warn("Gmail reply threading lookup failed; sending without thread headers", {
        userId: this.userId,
        error: getErrorMessage(error),
      });
      return null;
    }
  }

  private async getMicrosoftBusySlots(
    account: any,
    start: Date,
    end: Date,
    timeZone: string,
  ): Promise<string[]> {
    const token = await this.getMicrosoftToken(account);
    const query = new URLSearchParams({
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      $select: "start,end,isAllDay,showAs,isCancelled",
      $orderby: "start/dateTime",
    });
    let nextUrl: string | null =
      `https://graph.microsoft.com/v1.0/me/calendarView?${query.toString()}`;
    const events: any[] = [];
    let exhausted = false;

    for (let page = 0; page < MAX_CALENDAR_PAGES && nextUrl; page += 1) {
      const parsed = new URL(nextUrl);
      if (
        parsed.protocol !== "https:" ||
        parsed.hostname !== "graph.microsoft.com" ||
        !parsed.pathname.startsWith("/v1.0/")
      ) {
        throw new Error("Microsoft calendar returned an unsafe continuation URL");
      }
      const res = await fetchWithTimeout(
        parsed.toString(),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Prefer: 'outlook.timezone="UTC"',
          },
        },
        15_000,
      );
      // Fail CLOSED: a non-2xx (401/429/503/timeout) must not be read as "no busy slots",
      // or a booked calendar would be reported free during a live booking call (double-booking).
      if (!res.ok) {
        throw new Error(`Microsoft calendar list failed: ${res.status}`);
      }
      const data = (await res.json()) as any;
      if (!Array.isArray(data.value)) {
        throw new Error("Microsoft calendar returned an invalid event inventory");
      }
      events.push(...data.value);
      if (
        data["@odata.nextLink"] != null &&
        (typeof data["@odata.nextLink"] !== "string" || !data["@odata.nextLink"])
      ) {
        throw new Error("Microsoft calendar returned an invalid continuation URL");
      }
      nextUrl = data["@odata.nextLink"] ?? null;
      if (!nextUrl) {
        exhausted = true;
        break;
      }
    }
    if (!exhausted) {
      throw new Error("Microsoft calendar pagination exceeded the safety limit");
    }

    return events
      .filter((event: any) => !event.isCancelled && event.showAs !== "free")
      .map((event: any) => {
        if (event.isAllDay) return "All day: Busy";
        const rawStart = event.start?.dateTime;
        const rawEnd = event.end?.dateTime;
        if (!rawStart || !rawEnd)
          throw new Error("Microsoft calendar event is missing its time interval");
        if (
          [event.start?.timeZone, event.end?.timeZone].some(
            (zone) => zone && zone !== "UTC" && zone !== "Etc/UTC",
          )
        ) {
          throw new Error("Microsoft calendar did not return the requested UTC timezone");
        }
        const startIso = /(?:Z|[+-]\d{2}:\d{2})$/i.test(rawStart) ? rawStart : `${rawStart}Z`;
        const endIso = /(?:Z|[+-]\d{2}:\d{2})$/i.test(rawEnd) ? rawEnd : `${rawEnd}Z`;
        return `${formatIsoInTimeZone(startIso, timeZone)} to ${formatIsoInTimeZone(endIso, timeZone)}: Busy`;
      })
      .filter((slot: string | null): slot is string => Boolean(slot));
  }

  private async createMicrosoftEvent(account: any, params: any): Promise<boolean> {
    const token = await this.getMicrosoftToken(account);
    const res = await fetchWithTimeout(
      "https://graph.microsoft.com/v1.0/me/events",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: params.title,
          body: { contentType: "HTML", content: params.description },
          start: { dateTime: String(params.startTime).replace(/Z$/i, ""), timeZone: "UTC" },
          end: { dateTime: String(params.endTime).replace(/Z$/i, ""), timeZone: "UTC" },
          attendees: params.attendees?.map((email: string) => ({
            emailAddress: { address: email },
            type: "required",
          })),
        }),
      },
      15_000,
    );
    if (!res.ok) {
      log.warn("Microsoft calendar event creation failed", {
        userId: this.userId,
        status: res.status,
      });
    }
    return res.ok;
  }

  private async sendMicrosoftEmail(
    account: any,
    params: ConnectedMailboxSendParams,
  ): Promise<boolean> {
    const token = await this.getMicrosoftToken(account);

    // Graph JSON only accepts custom Internet headers beginning with "x-".
    // Marketing needs the standard List-Unsubscribe / List-Unsubscribe-Post
    // names, so send the provider-independent MIME message when those headers
    // are present. Microsoft documents text/plain + base64 MIME for sendMail.
    if (params.unsubscribeHeaders) {
      const message = buildConnectedMailboxMime(params);
      const res = await fetchWithTimeout(
        "https://graph.microsoft.com/v1.0/me/sendMail",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
          body: Buffer.from(message, "utf8").toString("base64"),
        },
        15_000,
      );
      return res.ok;
    }

    const res = await fetchWithTimeout(
      "https://graph.microsoft.com/v1.0/me/sendMail",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: params.subject,
            body: { contentType: "HTML", content: params.body },
            toRecipients: [{ emailAddress: { address: params.to } }],
          },
        }),
      },
      15_000,
    );
    return res.ok;
  }

  /** The Graph id of the newest inbox message from `from` with this subject. */
  private async findMicrosoftReplyTarget(
    token: string,
    query: { from: string; subject: string },
  ): Promise<string | null> {
    try {
      const search = new URLSearchParams({
        $filter: `from/emailAddress/address eq '${query.from.replace(/'/g, "''")}'`,
        $top: "25",
        $select: "id,subject,receivedDateTime",
      });
      const res = await fetchWithTimeout(
        `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${search.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
        15_000,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        value?: Array<{ id?: string; subject?: string; receivedDateTime?: string }>;
      };
      const wanted = baseReplySubject(query.subject).toLowerCase();
      const newest = (data.value ?? [])
        .filter(
          (message) =>
            typeof message.id === "string" &&
            baseReplySubject(message.subject ?? "").toLowerCase() === wanted,
        )
        .sort(
          (a, b) => Date.parse(b.receivedDateTime ?? "") - Date.parse(a.receivedDateTime ?? ""),
        )[0];
      return newest?.id ?? null;
    } catch (error) {
      log.warn("Microsoft reply threading lookup failed; sending without thread headers", {
        userId: this.userId,
        error: getErrorMessage(error),
      });
      return null;
    }
  }

  private async replyMicrosoftEmail(
    account: any,
    params: { to: string; subject: string; body: string },
  ): Promise<ThreadReplyOutcome> {
    const token = await this.getMicrosoftToken(account);
    const targetId = await this.findMicrosoftReplyTarget(token, {
      from: params.to,
      subject: params.subject,
    });
    if (targetId) {
      // Graph's reply action addresses the sender and sets the thread headers.
      // A failed reply is not retried as a fresh send: it may have been accepted.
      const res = await fetchWithTimeout(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(targetId)}/reply`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: { body: { contentType: "Text", content: params.body } },
          }),
        },
        15_000,
      );
      return { sent: res.ok, threaded: res.ok };
    }
    const sent = await this.sendMicrosoftEmail(account, {
      to: params.to,
      subject: params.subject,
      body: plainTextEmailBodyHtml(params.body),
    });
    return { sent, threaded: false };
  }

  private async getMicrosoftToken(account: any): Promise<string> {
    if (account.expiresAt && Date.now() < Number(account.expiresAt) - 60_000) {
      return decryptSecret(account.accessToken);
    }
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: decryptSecret(account.refreshToken),
    });
    const r = await fetchWithTimeout(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
      15_000,
    );
    const d = (await r.json()) as any;
    // Use the tagged source table (see getAccounts). The old emailAddress
    // inference silently mis-routed calendar-account token writes. Fall back
    // to the legacy inference only for untagged account objects.
    const table =
      account.__accountTable === "calendar"
        ? schema.calendarAccounts
        : account.__accountTable === "mail"
          ? schema.emailAccounts
          : account.emailAddress
            ? schema.emailAccounts
            : schema.calendarAccounts;

    if (!r.ok || !d.access_token) {
      const isTerminal =
        r.status === 400 ||
        d.error === "invalid_grant" ||
        (typeof d.error_description === "string" &&
          d.error_description.toLowerCase().includes("invalid_grant"));
      // Never persist encryptSecret(undefined) — that permanently bricks the row.
      if (isTerminal) {
        await drizzle
          .update(table as any)
          .set({
            accessToken: null,
            refreshToken: null,
            expiresAt: BigInt(0),
          })
          .where(eq((table as any).id, account.id));
      }
      throw new Error(d.error_description || d.error || "Microsoft token refresh failed");
    }

    await drizzle
      .update(table as any)
      .set({
        accessToken: encryptSecret(d.access_token),
        ...(d.refresh_token ? { refreshToken: encryptSecret(d.refresh_token) } : {}),
        expiresAt: BigInt(Date.now() + (d.expires_in || 3600) * 1000),
      })
      .where(eq((table as any).id, account.id));

    return d.access_token;
  }
}
