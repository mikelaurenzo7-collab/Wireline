import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client with service role key for backend tasks
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const db = createClient(supabaseUrl, supabaseServiceKey);

export async function syncOutlookCalendar(userId: string) {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Missing Microsoft OAuth credentials");
  }

  // 1. Fetch Microsoft Calendar accounts for this user
  const { data: accounts, error: accountErr } = await db
    .from("wireline_calendar_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "microsoft");

  if (accountErr) {
    throw new Error(`Failed to fetch calendar accounts: ${accountErr.message}`);
  }

  if (!accounts || accounts.length === 0) {
    return { status: "no_accounts" };
  }

  let totalSynced = 0;

  for (const account of accounts) {
    try {
      let accessToken = account.access_token;
      
      // Check if token needs refresh
      if (account.expires_at && Date.now() > account.expires_at - 60_000) {
        const params = new URLSearchParams({
          client_id:     process.env.MICROSOFT_CLIENT_ID,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET,
          grant_type:    "refresh_token",
          refresh_token: account.refresh_token,
        });
        
        const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", { 
          method: "POST", 
          headers: { "Content-Type": "application/x-www-form-urlencoded" }, 
          body: params.toString() 
        });
        
        const d = await r.json() as any;
        if (!r.ok || !d.access_token) {
           console.error("Microsoft token refresh failed for account", account.id, d);
           continue;
        }
        
        accessToken = d.access_token;
        await db.from("wireline_calendar_accounts")
          .update({ 
             access_token: accessToken, 
             expires_at: Date.now() + (d.expires_in || 3600) * 1000 
          })
          .eq("id", account.id);
      }

      // Fetch events using Microsoft Graph API for next 30 days
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${timeMin}&endDateTime=${timeMax}&$select=id,subject,start,end,showAs`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        throw new Error(`Microsoft Graph API failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      const events = data.value || [];

      // Upsert events
      for (const event of events) {
        if (!event.id || !event.start?.dateTime || !event.end?.dateTime) continue;

        await db.from("wireline_calendar_events").upsert({
          user_id: userId,
          account_id: account.id,
          external_event_id: event.id,
          title: event.subject || "Busy",
          // Graph API returns time with a timezone object, we'll try to convert to ISO
          start_time: new Date(event.start.dateTime + 'Z').toISOString(),
          end_time: new Date(event.end.dateTime + 'Z').toISOString(),
          status: event.showAs || "confirmed",
          updated_at: new Date().toISOString()
        }, { onConflict: "account_id, external_event_id" });

        totalSynced++;
      }
    } catch (err) {
      console.error(`Failed to sync Outlook calendar for account ${account.id}:`, err);
    }
  }

  return { status: "success", syncedCount: totalSynced };
}
