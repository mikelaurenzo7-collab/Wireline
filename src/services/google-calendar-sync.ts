/* eslint-disable @typescript-eslint/no-explicit-any -- external integration data shape varies by provider. */
import { googleApis } from "../lib/google-apis";
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
  let syncedAccounts = 0;
  let failedAccounts = 0;

  for (const account of accounts) {
    try {
      if (!account.accessToken) throw new Error("Google calendar access token is missing.");
      const google = await googleApis();
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
      );

      oauth2Client.setCredentials({
        access_token: decryptSecret(account.accessToken),
        refresh_token: account.refreshToken ? decryptSecret(account.refreshToken) : null,
        expiry_date: account.expiresAt ? Number(account.expiresAt) : null,
      });

      // OAuth2Client emits synchronously and does not await listener promises.
      // Observe and serialize credential writes, then settle them with this sync.
      let tokenPersistence = Promise.resolve();
      let tokenPersistenceError: Error | null = null;
      oauth2Client.on("tokens", (tokens: any) => {
        if (!tokens.access_token) return;
        tokenPersistence = tokenPersistence
          .then(async () => {
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
          })
          .catch((error: unknown) => {
            tokenPersistenceError = new Error("Google calendar credentials could not be saved.", {
              cause: error,
            });
          });
      });

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      // Fetch events from the primary calendar for the next 30 days
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const response = await calendar.events
        .list({
          calendarId: "primary",
          timeMin: timeMin,
          timeMax: timeMax,
          maxResults: 100,
          singleEvents: true,
          orderBy: "startTime",
        })
        .finally(async () => {
          await tokenPersistence;
        });
      if (tokenPersistenceError) throw tokenPersistenceError;

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
      syncedAccounts++;
    } catch (err: any) {
      failedAccounts++;
      log.error(`Failed to sync calendar for account ${account.id}:`, { error: err.message });
    }
  }

  if (failedAccounts > 0) {
    const partial = syncedAccounts > 0 || totalSynced > 0;
    return {
      status: partial ? "partial" : "error",
      syncedCount: totalSynced,
      failedAccounts,
      error: partial
        ? "Some Google calendars could not be refreshed. Try again or reconnect Google."
        : "Google calendars could not be refreshed. Try again or reconnect Google.",
    };
  }
  return { status: "success", syncedCount: totalSynced };
}
