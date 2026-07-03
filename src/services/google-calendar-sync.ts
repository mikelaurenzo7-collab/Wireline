/* eslint-disable @typescript-eslint/no-explicit-any -- external integration data shape varies by provider. */
import { google } from "googleapis";
import { encryptSecret, decryptSecret } from "../lib/secret-vault";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

export async function syncGoogleCalendar(userId: string) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Missing Google OAuth credentials");
  }

  // 1. Fetch Google Calendar accounts for this user
  const accounts = await drizzle
    .select()
    .from(schema.calendarAccounts)
    .where(
      and(
        eq(schema.calendarAccounts.userId, userId),
        eq(schema.calendarAccounts.provider, "google"),
      ),
    );

  if (!accounts || accounts.length === 0) {
    return { status: "no_accounts" };
  }

  let totalSynced = 0;

  for (const account of accounts) {
    if (!account.accessToken) continue;
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
      );

      oauth2Client.setCredentials({
        access_token: decryptSecret(account.accessToken),
        refresh_token: account.refreshToken ? decryptSecret(account.refreshToken) : null,
        expiry_date: account.expiresAt ? Number(account.expiresAt) : null,
      });

      // Handle token refresh automatically if expired
      oauth2Client.on("tokens", async (tokens: any) => {
        if (!tokens.access_token) return;
        const update: any = {
          accessToken: encryptSecret(tokens.access_token),
          expiresAt: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
          updatedAt: new Date(),
        };
        if (tokens.refresh_token) {
          update.refreshToken = encryptSecret(tokens.refresh_token);
        }

        await drizzle
          .update(schema.calendarAccounts)
          .set(update)
          .where(eq(schema.calendarAccounts.id, account.id));
      });

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      // Fetch events from the primary calendar for the next 30 days
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin,
        timeMax: timeMax,
        maxResults: 100,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = response.data.items || [];

      // Upsert events
      for (const event of events) {
        if (!event.id || !event.start?.dateTime || !event.end?.dateTime) continue;

        await drizzle
          .insert(schema.calendarEvents)
          .values({
            userId: userId,
            accountId: account.id,
            externalEventId: event.id,
            title: event.summary || "Busy",
            startTime: new Date(event.start.dateTime),
            endTime: new Date(event.end.dateTime),
            status: event.status || "confirmed",
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [schema.calendarEvents.accountId, schema.calendarEvents.externalEventId],
            set: {
              title: event.summary || "Busy",
              startTime: new Date(event.start.dateTime),
              endTime: new Date(event.end.dateTime),
              status: event.status || "confirmed",
              updatedAt: new Date(),
            },
          });

        totalSynced++;
      }
    } catch (err: any) {
      log.error(`Failed to sync calendar for account ${account.id}:`, { error: err.message });
    }
  }

  return { status: "success", syncedCount: totalSynced };
}
