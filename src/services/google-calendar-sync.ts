import { google } from "googleapis";
import { encryptSecret, decryptSecret } from "../lib/secret-vault";
import { db } from "../lib/server-context";

export async function syncGoogleCalendar(userId: string) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Missing Google OAuth credentials");
  }

  // 1. Fetch Google Calendar accounts for this user
  const { data: accounts, error: accountErr } = await db
    .from("wireline_calendar_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google");

  if (accountErr) {
    throw new Error(`Failed to fetch calendar accounts: ${accountErr.message}`);
  }

  if (!accounts || accounts.length === 0) {
    return { status: "no_accounts" };
  }

  let totalSynced = 0;

  for (const account of accounts) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        access_token: decryptSecret(account.access_token),
        refresh_token: account.refresh_token ? decryptSecret(account.refresh_token) : null,
        expiry_date: account.expires_at,
      });

      // Handle token refresh automatically if expired
      oauth2Client.on('tokens', async (tokens) => {
        if (!tokens.access_token) return;
        if (tokens.refresh_token) {
           await db.from("wireline_calendar_accounts")
             .update({ 
               access_token: encryptSecret(tokens.access_token), 
               refresh_token: encryptSecret(tokens.refresh_token),
               expires_at: tokens.expiry_date 
             })
             .eq("id", account.id);
        } else {
           await db.from("wireline_calendar_accounts")
             .update({ 
               access_token: encryptSecret(tokens.access_token),
               expires_at: tokens.expiry_date 
             })
             .eq("id", account.id);
        }
      });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Fetch events from the primary calendar for the next 30 days
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin,
        timeMax: timeMax,
        maxResults: 100,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];

      // Upsert events
      for (const event of events) {
        if (!event.id || !event.start?.dateTime || !event.end?.dateTime) continue;

        await db.from("wireline_calendar_events").upsert({
          user_id: userId,
          account_id: account.id,
          external_event_id: event.id,
          title: event.summary || "Busy",
          start_time: event.start.dateTime,
          end_time: event.end.dateTime,
          status: event.status || "confirmed",
          updated_at: new Date().toISOString()
        }, { onConflict: "account_id, external_event_id" });

        totalSynced++;
      }
    } catch (err) {
      console.error(`Failed to sync calendar for account ${account.id}:`, err);
    }
  }

  return { status: "success", syncedCount: totalSynced };
}
