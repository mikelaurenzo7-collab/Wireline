import express from "express";
import { google } from "googleapis";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { db, log, encryptSecret, decryptSecret, fetchWithTimeout } from "./server-context";
import { getErrorMessage } from "./server-utils";

// ────────────────────────────────────────────────────────────────────
//  Google OAuth Constants & Helpers
// ────────────────────────────────────────────────────────────────────

export const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
];

export function getGoogleOAuthClient(req: express.Request) {
  const baseUrl = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
    || `${req.protocol}://${req.get('host')}`;
    
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${baseUrl}/api/oauth/google/callback`
  );
}

// ────────────────────────────────────────────────────────────────────
//  Microsoft OAuth Constants & Helpers
// ────────────────────────────────────────────────────────────────────

export const MS_SCOPES = [
  "offline_access",
  "User.Read",
  "Mail.Send",
  "Mail.Read",
  "Calendars.Read",
  "Files.Read.All",
].join(" ");

export function getMicrosoftRedirectUri(req: express.Request): string {
  const baseUrl = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
    || `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/api/oauth/microsoft/callback`;
}

/** Refresh a Microsoft access token using the stored refresh token.
 *  Returns the updated { access_token, expires_at } to persist. */
export async function refreshMicrosoftToken(account: {
  refresh_token: string;
}): Promise<{ access_token: string; expires_at: number }> {
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    grant_type:    "refresh_token",
    refresh_token: decryptSecret(account.refresh_token),
    scope:         MS_SCOPES,
  });
  const r = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() }
  );
  const d = await r.json() as any;
  if (!r.ok || !d.access_token) throw new Error(d.error_description || "Microsoft token refresh failed");
  return {
    access_token: d.access_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
  };
}

/** Returns a valid Microsoft access token for the account, refreshing if needed. */
export async function getMicrosoftAccessToken(account: {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}): Promise<string> {
  if (account.expires_at && Date.now() < account.expires_at - 60_000) {
    return decryptSecret(account.access_token);
  }
  const updated = await refreshMicrosoftToken(account);
  await db.from("wireline_email_accounts")
    .update({ access_token: encryptSecret(updated.access_token), expires_at: updated.expires_at })
    .eq("id", account.id);
  return updated.access_token;
}

/** Send an email via Microsoft Graph API (delegated auth). */
export async function sendEmailViaMicrosoft(opts: {
  account: { id: string; access_token: string; refresh_token: string; expires_at: number };
  to: string;
  subject: string;
  body: string;
  threadInternetMessageId?: string; // for reply threading
}): Promise<{ messageId: string; conversationId: string }> {
  const token = await getMicrosoftAccessToken(opts.account);
  const payload: any = {
    message: {
      subject: opts.subject,
      body: { contentType: "Text", content: opts.body },
      toRecipients: [{ emailAddress: { address: opts.to } }],
    },
    saveToSentItems: true,
  };
  const r = await fetchWithTimeout(
    "https://graph.microsoft.com/v1.0/me/sendMail",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    15_000,
  );
  if (!r.ok) {
    const err = await r.json().catch(() => ({})) as any;
    throw new Error(getErrorMessage(err) || `Microsoft Graph sendMail failed: ${r.status}`);
  }
  // Graph returns 202 with no body for sendMail — conversationId is unavailable
  // here; we use a random ID that the sync will backfill on the next poll.
  return { messageId: `ms-${randomUUID()}`, conversationId: "" };
}

// ────────────────────────────────────────────────────────────────────
//  Shared OAuth State signing
// ────────────────────────────────────────────────────────────────────

const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET || process.env.STRIPE_WEBHOOK_SECRET || "wireline-placeholder-secret";

export function generateOAuthState(): string {
  const nonce = randomUUID().replace(/-/g, "");
  const ts = Date.now().toString(36);
  const payload = `${nonce}.${ts}`;
  const sig = createHmac("sha256", OAUTH_STATE_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string | undefined): boolean {
  if (!state) return false;
  try {
    const lastDot = state.lastIndexOf(".");
    if (lastDot <= 0) return false;
    const payload = state.slice(0, lastDot);
    const sig = state.slice(lastDot + 1);
    const expected = createHmac("sha256", OAUTH_STATE_SECRET).update(payload).digest("base64url");
    
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expBuf)) return false;

    // Optional: expiry check (20 mins)
    const parts = payload.split(".");
    if (parts.length < 2) return false;
    const ts = parseInt(parts[1], 36);
    if (isNaN(ts)) return false;
    if (Date.now() - ts > 20 * 60 * 1000) return false;

    return true;
  } catch (e) {
    return false;
  }
}
