/* eslint-disable @typescript-eslint/no-explicit-any -- external integration data shape varies by provider. */
import { encryptSecret, decryptSecret } from "../lib/secret-vault";
import { drizzle, log, fetchWithTimeout } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import {
  importedCalendarInterval,
  replaceCalendarSnapshot,
  type ImportedCalendarEvent,
} from "./calendar-sync-snapshot";

const MAX_CALENDAR_PAGES = 20;

function microsoftUtcInstant(value: { dateTime?: string; timeZone?: string } | undefined): string {
  const raw = value?.dateTime;
  if (typeof raw !== "string") throw new Error("Microsoft calendar event is missing a time.");
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) return raw;
  if (value?.timeZone && value.timeZone !== "UTC" && value.timeZone !== "Etc/UTC") {
    throw new Error("Microsoft calendar did not return the requested UTC timezone.");
  }
  return `${raw}Z`;
}

export async function syncOutlookCalendar(userId: string) {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Missing Microsoft OAuth credentials");
  }

  // 1. Fetch Microsoft Calendar accounts for this user
  const accounts = await drizzle
    .select()
    .from(schema.calendarAccounts)
    .where(
      and(
        eq(schema.calendarAccounts.userId, userId),
        eq(schema.calendarAccounts.provider, "microsoft"),
      ),
    );

  if (!accounts || accounts.length === 0) {
    return { status: "no_accounts" };
  }

  let totalSynced = 0;
  let syncedAccounts = 0;
  let failedAccounts = 0;

  for (const account of accounts) {
    try {
      if (!account.accessToken) throw new Error("Microsoft calendar access token is missing.");
      let accessToken = decryptSecret(account.accessToken);

      // Check if token needs refresh
      if (account.expiresAt && Date.now() > Number(account.expiresAt) - 60_000) {
        const params = new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: account.refreshToken ? decryptSecret(account.refreshToken) : "",
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
        if (!r.ok || !d.access_token) {
          throw new Error(`Microsoft token refresh failed: ${r.status}`);
        }

        accessToken = d.access_token;
        await drizzle
          .update(schema.calendarAccounts)
          .set({
            accessToken: encryptSecret(accessToken),
            ...(typeof d.refresh_token === "string" && d.refresh_token
              ? { refreshToken: encryptSecret(d.refresh_token) }
              : {}),
            expiresAt: BigInt(Date.now() + (d.expires_in || 3600) * 1000),
          })
          .where(eq(schema.calendarAccounts.id, account.id));
      }

      // Fetch events using Microsoft Graph API for next 30 days
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      let nextUrl: string | null =
        `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}&$select=id,subject,start,end,showAs,isCancelled&$top=100`;
      const seenUrls = new Set<string>();
      const events: ImportedCalendarEvent[] = [];
      for (let page = 0; page < MAX_CALENDAR_PAGES && nextUrl; page += 1) {
        const parsed = new URL(nextUrl);
        if (
          parsed.protocol !== "https:" ||
          parsed.host !== "graph.microsoft.com" ||
          parsed.username ||
          parsed.password ||
          parsed.hash ||
          parsed.pathname !== "/v1.0/me/calendarView" ||
          seenUrls.has(parsed.href)
        ) {
          throw new Error("Microsoft calendar returned an unsafe continuation URL.");
        }
        seenUrls.add(parsed.href);
        const response = await fetchWithTimeout(
          parsed.href,
          {
            headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
          },
          15_000,
        );
        if (!response.ok) throw new Error(`Microsoft Graph API failed: ${response.status}`);
        const data = (await response.json()) as any;
        if (!Array.isArray(data.value))
          throw new Error("Microsoft calendar returned an invalid event inventory.");
        for (const event of data.value) {
          if (event.isCancelled || event.showAs === "free") continue;
          if (!event.id) throw new Error("Microsoft calendar event is missing its identity.");
          events.push({
            externalEventId: event.id,
            title: event.subject || "Busy",
            ...importedCalendarInterval(
              microsoftUtcInstant(event.start),
              microsoftUtcInstant(event.end),
            ),
            status: event.showAs || "confirmed",
          });
        }
        const next = data["@odata.nextLink"];
        if (next != null && (typeof next !== "string" || !next))
          throw new Error("Microsoft calendar returned an invalid continuation URL.");
        nextUrl = next || null;
      }
      if (nextUrl) throw new Error("Microsoft calendar pagination exceeded the safety limit.");
      await replaceCalendarSnapshot({ userId, accountId: account.id, timeMin, timeMax, events });
      totalSynced += events.length;
      syncedAccounts++;
    } catch (err: any) {
      failedAccounts++;
      log.error(`Failed to sync Outlook calendar for account ${account.id}:`, {
        error: err.message,
      });
    }
  }

  if (failedAccounts > 0) {
    const partial = syncedAccounts > 0 || totalSynced > 0;
    return {
      status: partial ? "partial" : "error",
      syncedCount: totalSynced,
      failedAccounts,
      error: partial
        ? "Some Outlook calendars could not be refreshed. Try again or reconnect Microsoft."
        : "Outlook calendars could not be refreshed. Try again or reconnect Microsoft.",
    };
  }
  return { status: "success", syncedCount: totalSynced };
}
