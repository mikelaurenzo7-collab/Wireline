/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
import express from "express";
import { google } from "googleapis";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { drizzle, fetchWithTimeout, IS_PROD } from "./server-context";
import { isProductionRuntime } from "./session-cookie";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";
import { verifyInternalJwt } from "./auth-utils";
import { getInternalJwtSecret } from "./internal-jwt-secret";

// ────────────────────────────────────────────────────────────────────
//  Google OAuth Constants & Helpers
// ────────────────────────────────────────────────────────────────────

export const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

function getAppOrigin(req: express.Request): string {
  if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  if (IS_PROD) throw new Error("APP_URL is required for OAuth redirects in production");
  return `${req.protocol}://${req.get("host")}`;
}

function getOAuthStateSecret(): string {
  if (process.env.OAUTH_STATE_SECRET) return process.env.OAUTH_STATE_SECRET;
  if (isProductionRuntime()) throw new Error("OAUTH_STATE_SECRET is required in production");
  return "wireline-dev-oauth-state-secret-at-least-32-bytes";
}

export function getGoogleOAuthClient(req: express.Request) {
  const baseUrl = getAppOrigin(req);

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${baseUrl}/api/oauth/google/callback`,
  );
}

export function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    // The redirect URI is only used for the initial code-to-token swap;
    // refreshes and direct API calls don't need it but the library
    // requires a placeholder or valid string.
    "http://localhost:3000/api/oauth/google/callback",
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
  "Calendars.ReadWrite",
  "Files.Read.All",
].join(" ");

export function getMicrosoftRedirectUri(req: express.Request): string {
  const baseUrl = getAppOrigin(req);
  return `${baseUrl}/api/oauth/microsoft/callback`;
}

/** Refresh a Microsoft access token using the stored refresh token.
 *  Returns the updated { access_token, expires_at } to persist. */
export async function refreshMicrosoftToken(account: {
  refreshToken: string;
}): Promise<{ access_token: string; expires_at: number }> {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: decryptSecret(account.refreshToken),
    scope: MS_SCOPES,
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
  if (!r.ok || !d.access_token)
    throw new Error(d.error_description || "Microsoft token refresh failed");
  return {
    access_token: d.access_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
  };
}

/** Returns a valid Microsoft access token for the account, refreshing if needed. */
export async function getMicrosoftAccessToken(account: {
  id: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: bigint | null;
}): Promise<string> {
  const expiresAtMs = account.expiresAt ? Number(account.expiresAt) : 0;
  if (expiresAtMs && Date.now() < expiresAtMs - 60_000) {
    return decryptSecret(account.accessToken);
  }
  const updated = await refreshMicrosoftToken(account);
  await drizzle
    .update(schema.emailAccounts)
    .set({
      accessToken: encryptSecret(updated.access_token),
      expiresAt: BigInt(updated.expires_at),
    })
    .where(eq(schema.emailAccounts.id, account.id));
  return updated.access_token;
}

/** Send an email via Microsoft Graph API (delegated auth). */
export async function sendEmailViaMicrosoft(opts: {
  account: { id: string; accessToken: string; refreshToken: string; expiresAt: bigint | null };
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
    const err = (await r.json().catch(() => ({}))) as any;
    throw new Error(getErrorMessage(err) || `Microsoft Graph sendMail failed: ${r.status}`);
  }
  // Graph returns 202 with no body for sendMail — conversationId is unavailable
  // here; we use a random ID that the sync will backfill on the next poll.
  return { messageId: `ms-${randomUUID()}`, conversationId: "" };
}

// ────────────────────────────────────────────────────────────────────
//  Shared OAuth State signing
// ────────────────────────────────────────────────────────────────────

/** Signed OAuth state may embed `userId` so browser callbacks can resolve the tenant without relying on cookies. */
export interface VerifiedOAuthState {
  ok: boolean;
  userId?: string;
  /** PKCE code_verifier for providers that require it (e.g. X/Twitter OAuth 2.0). */
  pkceVerifier?: string;
}

export function generateOAuthState(opts?: { userId?: string; pkceVerifier?: string }): string {
  const nonce = randomUUID().replace(/-/g, "");
  const ts = Date.now().toString(36);
  const parts = [nonce, ts];
  if (opts?.userId) parts.push(Buffer.from(opts.userId, "utf8").toString("base64url"));
  if (opts?.pkceVerifier) parts.push(Buffer.from(opts.pkceVerifier, "utf8").toString("base64url"));
  const payload = parts.join(".");
  const sig = createHmac("sha256", getOAuthStateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string | undefined): VerifiedOAuthState {
  if (!state) return { ok: false };
  try {
    const lastDot = state.lastIndexOf(".");
    if (lastDot <= 0) return { ok: false };
    const payload = state.slice(0, lastDot);
    const sig = state.slice(lastDot + 1);
    const expected = createHmac("sha256", getOAuthStateSecret())
      .update(payload)
      .digest("base64url");

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return { ok: false };
    if (!timingSafeEqual(sigBuf, expBuf)) return { ok: false };

    const parts = payload.split(".");
    if (parts.length < 2) return { ok: false };
    const ts = parseInt(parts[1], 36);
    if (isNaN(ts)) return { ok: false };
    // Keep signed-state TTL aligned with the oauth bridge cookie (10 minutes).
    // A longer state window left a dead zone where state still verified but the
    // bridge cookie was gone, producing "Sign-in session expired" for valid states.
    if (Date.now() - ts > 10 * 60 * 1000) return { ok: false };

    let userId: string | undefined;
    let pkceVerifier: string | undefined;
    if (parts.length >= 3 && parts[2]) {
      try {
        userId = Buffer.from(parts[2], "base64url").toString("utf8");
      } catch {
        return { ok: false };
      }
    }
    if (parts.length >= 4 && parts[3]) {
      try {
        pkceVerifier = Buffer.from(parts[3], "base64url").toString("utf8");
      } catch {
        return { ok: false };
      }
    }

    return { ok: true, userId, pkceVerifier };
  } catch {
    return { ok: false };
  }
}

export async function resolveUserIdFromOAuthSession(req: express.Request): Promise<string | null> {
  // Bearer-in-Authorization-header only — no cookie sessions (see README).
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!bearerToken) return null;

  const secret = getInternalJwtSecret() || "";
  const payload = await verifyInternalJwt(bearerToken, secret);
  return payload?.sub ?? null;
}

/** Space-delimited Microsoft Graph scope line passed at token time — must include write access for booking. */
export const MICROSOFT_CALENDAR_WRITE_SCOPE = "Calendars.ReadWrite";

/**
 * Returns whether a previously granted Google OAuth scope string includes calendar event creation.
 * Used when stored `scopes` are persisted for an account; if scopes are unknown, Account Holder should re-connect after scope upgrades.
 */
export function googleGrantedScopesAllowCalendarWrite(
  scopeStr: string | null | undefined,
): boolean {
  if (!scopeStr?.trim()) return false;
  return scopeStr.includes("calendar.events");
}

/** Microsoft delegated scopes string must contain Calendars.ReadWrite for POST /me/events. */
export function microsoftGrantedScopesAllowCalendarWrite(
  scopeStr: string | null | undefined,
): boolean {
  if (!scopeStr?.trim()) return false;
  return scopeStr.includes(MICROSOFT_CALENDAR_WRITE_SCOPE);
}
