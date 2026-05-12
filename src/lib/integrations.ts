import { google } from "googleapis";
import { db, log } from "./server-context";
import { decryptSecret, encryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";
import { createMeeting as createZoomMeeting } from "./zoom-service";

/**
 * Unified interface for Calendar and Mail integrations.
 */
export class IntegrationService {
  constructor(private userId: string) {}

  /**
   * Calendar: Check availability across all connected accounts.
   */
  async checkAvailability(date: string): Promise<string> {
    try {
      const accounts = await this.getAccounts("calendar");
      if (accounts.length === 0) return "No calendar accounts connected.";

      const busySlots: string[] = [];
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      for (const account of accounts) {
        if (account.provider === "google") {
          const slots = await this.getGoogleBusySlots(account, startOfDay, endOfDay);
          busySlots.push(...slots);
        } else if (account.provider === "microsoft") {
          const slots = await this.getMicrosoftBusySlots(account, startOfDay, endOfDay);
          busySlots.push(...slots);
        }
      }

      if (busySlots.length === 0) return "The whole day is currently free.";
      return `Busy slots found:\n${busySlots.join("\n")}`;
    } catch (err) {
      log.error("Calendar availability check failed", { userId: this.userId, error: getErrorMessage(err) });
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
        const { data: agent } = await db.from("wireline_agents")
          .select("auto_zoom_link")
          .eq("id", params.agentId)
          .eq("user_id", this.userId)
          .single();
        if (agent?.auto_zoom_link) {
          const meeting = await createZoomMeeting(this.userId, {
            topic: params.title,
            startTime: params.startTime,
            duration: Math.round((new Date(params.endTime).getTime() - new Date(params.startTime).getTime()) / 60_000),
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
  async sendEmail(params: {
    to: string;
    subject: string;
    body: string;
  }): Promise<boolean> {
    try {
      const accounts = await this.getAccounts("mail");
      // Fallback: If no mail account, try calendar accounts (many have mail too)
      const mailAccounts = accounts.length > 0 ? accounts : await this.getAccounts("calendar");
      
      if (mailAccounts.length === 0) return false;

      const account = mailAccounts[0];
      if (account.provider === "google") {
        return await this.sendGoogleEmail(account, params);
      } else if (account.provider === "microsoft") {
        return await this.sendMicrosoftEmail(account, params);
      }
      return false;
    } catch (err) {
      log.error("Email sending failed", { userId: this.userId, error: getErrorMessage(err) });
      return false;
    }
  }

  // --- Private Helpers ---

  private async getAccounts(type: "calendar" | "mail") {
    const table = type === "calendar" ? "wireline_calendar_accounts" : "wireline_email_accounts";
    const { data } = await db.from(table).select("*").eq("user_id", this.userId);
    return data || [];
  }

  private async getGoogleClient(account: any) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: decryptSecret(account.access_token),
      refresh_token: account.refresh_token ? decryptSecret(account.refresh_token) : null,
      expiry_date: account.expires_at,
    });
    return oauth2Client;
  }

  private async getGoogleBusySlots(account: any, start: Date, end: Date): Promise<string[]> {
    const auth = await this.getGoogleClient(account);
    const calendar = google.calendar({ version: "v3", auth });
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
    });
    return (res.data.items || []).map(e => `${new Date(e.start?.dateTime || "").toLocaleTimeString()} - ${new Date(e.end?.dateTime || "").toLocaleTimeString()}: ${e.summary || "Busy"}`);
  }

  private async createGoogleEvent(account: any, params: any): Promise<boolean> {
    const auth = await this.getGoogleClient(account);
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: params.title,
        description: params.description,
        start: { dateTime: params.startTime },
        end: { dateTime: params.endTime },
        attendees: params.attendees?.map((email: string) => ({ email })),
      },
    });
    return true;
  }

  private async sendGoogleEmail(account: any, params: any): Promise<boolean> {
    const auth = await this.getGoogleClient(account);
    const gmail = google.gmail({ version: "v1", auth });
    const utf8Subject = `=?utf-8?B?${Buffer.from(params.subject).toString('base64')}?=`;
    const messageParts = [
      `To: ${params.to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      params.body,
    ];
    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });
    return true;
  }

  private async getMicrosoftBusySlots(account: any, start: Date, end: Date): Promise<string[]> {
    const token = await this.getMicrosoftToken(account);
    const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json() as any;
    return (data.value || []).map((e: any) => `${new Date(e.start.dateTime + 'Z').toLocaleTimeString()} - ${new Date(e.end.dateTime + 'Z').toLocaleTimeString()}: ${e.subject || "Busy"}`);
  }

  private async createMicrosoftEvent(account: any, params: any): Promise<boolean> {
    const token = await this.getMicrosoftToken(account);
    const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: params.title,
        body: { contentType: "HTML", content: params.description },
        start: { dateTime: params.startTime, timeZone: "UTC" },
        end: { dateTime: params.endTime, timeZone: "UTC" },
        attendees: params.attendees?.map((email: string) => ({ emailAddress: { address: email }, type: "required" })),
      }),
    });
    return res.ok;
  }

  private async sendMicrosoftEmail(account: any, params: any): Promise<boolean> {
    const token = await this.getMicrosoftToken(account);
    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: { contentType: "HTML", content: params.body },
          toRecipients: [{ emailAddress: { address: params.to } }],
        },
      }),
    });
    return res.ok;
  }

  private async getMicrosoftToken(account: any): Promise<string> {
    if (account.expires_at && Date.now() < account.expires_at - 60_000) {
      return decryptSecret(account.access_token);
    }
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: decryptSecret(account.refresh_token),
    });
    const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const d = await r.json() as any;
    await db.from("wireline_calendar_accounts").update({
      access_token: encryptSecret(d.access_token),
      expires_at: Date.now() + (d.expires_in || 3600) * 1000,
    }).eq("id", account.id);
    return d.access_token;
  }
}
