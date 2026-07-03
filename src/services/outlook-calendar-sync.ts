/* eslint-disable @typescript-eslint/no-explicit-any -- external integration data shape varies by provider. */
import { encryptSecret, decryptSecret } from "../lib/secret-vault";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

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

  for (const account of accounts) {
    if (!account.accessToken) continue;
    try {
      let accessToken = decryptSecret(account.accessToken);

      // Check if token needs refresh
      if (account.expiresAt && Date.now() > Number(account.expiresAt) - 60_000) {
        const params = new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: account.refreshToken ? decryptSecret(account.refreshToken) : "",
        });

        const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });

        const d = (await r.json()) as any;
        if (!r.ok || !d.access_token) {
          log.error("Microsoft token refresh failed for account", {
            accountId: account.id,
            error: d,
          });
          continue;
        }

        accessToken = d.access_token;
        await drizzle
          .update(schema.calendarAccounts)
          .set({
            accessToken: encryptSecret(accessToken),
            expiresAt: BigInt(Date.now() + (d.expires_in || 3600) * 1000),
          })
          .where(eq(schema.calendarAccounts.id, account.id));
      }

      // Fetch events using Microsoft Graph API for next 30 days
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${timeMin}&endDateTime=${timeMax}&$select=id,subject,start,end,showAs`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Microsoft Graph API failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      const events = data.value || [];

      // Upsert events
      for (const event of events) {
        if (!event.id || !event.start?.dateTime || !event.end?.dateTime) continue;

        await drizzle
          .insert(schema.calendarEvents)
          .values({
            userId: userId,
            accountId: account.id,
            externalEventId: event.id,
            title: event.subject || "Busy",
            // Graph API returns time with a timezone object, we'll try to convert to ISO
            startTime: new Date(event.start.dateTime + "Z"),
            endTime: new Date(event.end.dateTime + "Z"),
            status: event.showAs || "confirmed",
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [schema.calendarEvents.accountId, schema.calendarEvents.externalEventId],
            set: {
              title: event.subject || "Busy",
              startTime: new Date(event.start.dateTime + "Z"),
              endTime: new Date(event.end.dateTime + "Z"),
              status: event.showAs || "confirmed",
              updatedAt: new Date(),
            },
          });

        totalSynced++;
      }
    } catch (err: any) {
      log.error(`Failed to sync Outlook calendar for account ${account.id}:`, {
        error: err.message,
      });
    }
  }

  return { status: "success", syncedCount: totalSynced };
}
