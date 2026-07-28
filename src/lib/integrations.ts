/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
import { google } from "googleapis";
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";
import { createMeeting as createZoomMeeting } from "./zoom-service";
import { fetchIcloudInbox, sendIcloudMail } from "./icloud-mail";
import {
  formatIsoInTimeZone,
  localDateWindowToUtc,
  normalizeIanaTimeZone,
} from "./calendar-time";

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
      const accounts = await this.getAccounts("calendar");
      if (accounts.length === 0) return false;

      // Check if the agent has auto_zoom_link enabled
      let zoomUrl: string | undefined;
      if (params.agentId) {
        const [agent] = await drizzle
          .select({ autoZoomLink: schema.agents.autoZoomLink })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, params.agentId), eq(schema.agents.userId, this.userId)))
          .limit(1);

        if (agent?.autoZoomLink) {
          const meeting = await createZoomMeeting(this.userId, {
            topic: params.title,
            startTime: params.startTime,
            duration: Math.round(
              (new Date(params.endTime).getTime() - new Date(params.startTime).getTime()) / 60_000,
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
        return await this.createGoogleEvent(account, bookingParams);
      } else if (account.provider === "microsoft") {
        return await this.createMicrosoftEvent(account, bookingParams);
      }
      return false;
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
   * Yahoo is intentionally a no-op for now — Yahoo killed their
   * REST mail API and the modern path is XOAUTH2 over IMAP, which
   * is touchier and lands in a follow-up phase. The connection
   * token is already stored from the Yahoo mailbox-connect OAuth
   * flow, so phase 2 just adds the IMAP client.
   */
  async fetchInboxMessages(
    opts: {
      limit?: number;
      /** Only return messages received after this ISO timestamp. */
      sinceIso?: string;
    } = {},
  ): Promise<
    {
      messageId: string;
      threadId?: string;
      from: string;
      subject: string;
      snippet: string;
      receivedAt: Date;
      provider: "google" | "microsoft" | "yahoo" | "icloud";
    }[]
  > {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    try {
      const accounts = await this.getAccounts("mail");
      const mailAccounts = accounts.length > 0 ? accounts : await this.getAccounts("calendar");
      if (mailAccounts.length === 0) return [];

      // Fan out across every connected mail account the tenant has.
      // Most tenants have 1 mailbox; some have one per channel.
      const perAccount = await Promise.all(
        mailAccounts.map((account: any) =>
          this.fetchFromAccount(account, { limit, sinceIso: opts.sinceIso }).catch((err) => {
            log.warn("fetchInboxMessages failed for one account", {
              provider: account.provider,
              error: getErrorMessage(err),
            });
            return [];
          }),
        ),
      );

      // Merge + sort newest-first, then cap to the caller's limit.
      const merged = perAccount.flat();
      merged.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
      return merged.slice(0, limit);
    } catch (err) {
      log.error("fetchInboxMessages failed", {
        userId: this.userId,
        error: getErrorMessage(err),
      });
      return [];
    }
  }

  private async fetchFromAccount(
    account: any,
    opts: { limit: number; sinceIso?: string },
  ): Promise<
    {
      messageId: string;
      threadId?: string;
      from: string;
      subject: string;
      snippet: string;
      receivedAt: Date;
      provider: "google" | "microsoft" | "yahoo" | "icloud";
    }[]
  > {
    if (account.provider === "google") {
      return this.fetchGoogleInbox(account, opts);
    }
    if (account.provider === "microsoft") {
      return this.fetchMicrosoftInbox(account, opts);
    }
    if (account.provider === "yahoo") {
      // Phase 2 — XOAUTH2 over IMAP. For now, log so the Account Holder can
      // see we received the call and know it's not silently broken.
      log.info("Yahoo inbox fetch skipped — XOAUTH2 IMAP not yet wired", {
        accountId: account.id,
      });
      return [];
    }
    if (account.provider === "icloud") {
      return this.fetchIcloudInbox(account, opts);
    }
    return [];
  }

  private async fetchIcloudInbox(account: any, opts: { limit: number; sinceIso?: string }) {
    const email = account.emailAddress as string;
    const appPassword = decryptSecret(account.accessToken);
    return fetchIcloudInbox(email, appPassword, opts);
  }

  private async fetchGoogleInbox(account: any, opts: { limit: number; sinceIso?: string }) {
    const auth = await this.getGoogleClient(account);
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
      return [];
    }
    const data = (await r.json()) as any;
    return (data.value || []).map((m: any) => ({
      messageId: m.id as string,
      threadId: m.conversationId,
      from: m.from?.emailAddress?.address || "",
      subject: m.subject || "",
      snippet: m.bodyPreview || "",
      receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : new Date(),
      provider: "microsoft" as const,
    }));
  }

  async sendEmail(params: { to: string; subject: string; body: string }): Promise<boolean> {
    try {
      const accounts = await this.getAccounts("mail");
      // Fallback: If no mail account, try calendar accounts (many have mail too)
      const mailAccounts = accounts.length > 0 ? accounts : await this.getAccounts("calendar");

      if (mailAccounts.length > 0) {
        const account = mailAccounts[0];
        if (account.provider === "google") {
          return await this.sendGoogleEmail(account, params);
        }
        if (account.provider === "microsoft") {
          return await this.sendMicrosoftEmail(account, params);
        }
        if (account.provider === "icloud") {
          if (!account.accessToken || !account.emailAddress) return false;
          const email = account.emailAddress as string;
          const appPassword = decryptSecret(account.accessToken);
          return sendIcloudMail(email, appPassword, params);
        }
      }

      // No OAuth mailbox — fall back to platform Resend so live voice
      // agents can still deliver follow-ups when RESEND_API_KEY is set.
      const { sendEmail: sendPlatformEmail } = await import("./email-service");
      const escaped = params.body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.55; white-space: pre-wrap;">${escaped}</div>`;
      const result = await sendPlatformEmail({
        to: params.to,
        subject: params.subject,
        text: params.body,
        html,
      });
      if (!result.ok) {
        log.warn("Platform Resend fallback failed for tenant email", {
          userId: this.userId,
          to: params.to,
          error: result.error,
        });
      }
      return result.ok;
    } catch (err) {
      log.error("Email sending failed", { userId: this.userId, error: getErrorMessage(err) });
      return false;
    }
  }

  // --- Private Helpers ---

  private async getAccounts(type: "calendar" | "mail") {
    // Tag every row with its source table. Token refresh used to infer the
    // table from `emailAddress` presence — but calendar rows deliberately
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
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth2Client.setCredentials({
      access_token: decryptSecret(account.accessToken),
      refresh_token: account.refreshToken ? decryptSecret(account.refreshToken) : null,
      expiry_date: account.expiresAt ? Number(account.expiresAt) : null,
    });
    return oauth2Client;
  }

  private async getGoogleBusySlots(
    account: any,
    start: Date,
    end: Date,
    timeZone: string,
  ): Promise<string[]> {
    const auth = await this.getGoogleClient(account);
    const calendar = google.calendar({ version: "v3", auth });
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: normalizeIanaTimeZone(timeZone),
      singleEvents: true,
      orderBy: "startTime",
    });
    return (res.data.items || [])
      .map((event: any) => {
        if (event.start?.date && !event.start?.dateTime) {
          return `All day: ${event.summary || "Busy"}`;
        }
        const startIso = event.start?.dateTime;
        const endIso = event.end?.dateTime;
        if (!startIso || !endIso) return null;
        return `${formatIsoInTimeZone(startIso, timeZone)} to ${formatIsoInTimeZone(endIso, timeZone)}: ${event.summary || "Busy"}`;
      })
      .filter((slot: string | null): slot is string => Boolean(slot));
  }

  private async createGoogleEvent(account: any, params: any): Promise<boolean> {
    const auth = await this.getGoogleClient(account);
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

  private async sendGoogleEmail(account: any, params: any): Promise<boolean> {
    const auth = await this.getGoogleClient(account);
    const gmail = google.gmail({ version: "v1", auth });
    const utf8Subject = `=?utf-8?B?${Buffer.from(params.subject).toString("base64")}?=`;
    const messageParts = [
      `To: ${params.to}`,
      "Content-Type: text/html; charset=utf-8",
      "MIME-Version: 1.0",
      `Subject: ${utf8Subject}`,
      "",
      params.body,
    ];
    const message = messageParts.join("\n");
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });
    return true;
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
      $select: "subject,start,end,isAllDay",
      $orderby: "start/dateTime",
    });
    const url = `https://graph.microsoft.com/v1.0/me/calendarView?${query.toString()}`;
    const res = await fetchWithTimeout(
      url,
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
    // Throwing here reaches checkAvailability's catch -> "Failed to check calendar availability."
    if (!res.ok) {
      throw new Error(`Microsoft calendar list failed: ${res.status}`);
    }
    const data = (await res.json()) as any;
    return (data.value || [])
      .map((event: any) => {
        if (event.isAllDay) return `All day: ${event.subject || "Busy"}`;
        const rawStart = event.start?.dateTime;
        const rawEnd = event.end?.dateTime;
        if (!rawStart || !rawEnd) return null;
        const startIso = /(?:Z|[+-]\d{2}:\d{2})$/i.test(rawStart) ? rawStart : `${rawStart}Z`;
        const endIso = /(?:Z|[+-]\d{2}:\d{2})$/i.test(rawEnd) ? rawEnd : `${rawEnd}Z`;
        return `${formatIsoInTimeZone(startIso, timeZone)} to ${formatIsoInTimeZone(endIso, timeZone)}: ${event.subject || "Busy"}`;
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
    return res.ok;
  }

  private async sendMicrosoftEmail(account: any, params: any): Promise<boolean> {
    const token = await this.getMicrosoftToken(account);
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
