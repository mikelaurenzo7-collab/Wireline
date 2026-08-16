/**
 * Google Sheets Integration Service — call-log spreadsheet.
 *
 * Mirrors the Microsoft Excel integration (microsoft-graph-service.ts)
 * but for the 70%+ of SMBs who use Google Workspace instead of O365.
 *
 * OAuth connection stored in crmConnections with provider = 'google_sheets'.
 * Tokens are stored encrypted via secret-vault.ts and auto-refreshed
 * when within 5 minutes of expiry (Google tokens last 1 hour).
 *
 * On first use, auto-creates a "Wireline Call Log" spreadsheet in the
 * user's Google Drive with a header row + auto-formatted columns. The
 * spreadsheet ID is cached in the connection metadata so subsequent
 * appends skip the discovery step.
 *
 * Scopes required:
 *   - https://www.googleapis.com/auth/spreadsheets (create + append)
 *   - https://www.googleapis.com/auth/drive.file   (create the file)
 */

import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const GOOGLE_SHEETS_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

const SHEET_TITLE = "Wireline Call Log";
const HEADERS = ["Logged", "Caller", "Outcome", "Details", "Agent", "Duration"];

export function googleSheetsConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleSheetsAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SHEETS_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeGoogleSheetsCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const r = await fetchWithTimeout(
    TOKEN_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as GoogleTokenResponse;
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google token exchange failed");
  }
  return data;
}

async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetchWithTimeout(
    TOKEN_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as GoogleTokenResponse;
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google token refresh failed");
  }
  return data;
}

interface SheetConnection {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  metadata: Record<string, unknown>;
}

async function getConnection(userId: string): Promise<SheetConnection | null> {
  if (!userId) return null;
  const [conn] = await drizzle
    .select({
      id: schema.crmConnections.id,
      accessToken: schema.crmConnections.accessToken,
      refreshToken: schema.crmConnections.refreshToken,
      expiresAt: schema.crmConnections.expiresAt,
      metadata: schema.crmConnections.metadata,
    })
    .from(schema.crmConnections)
    .where(
      and(
        eq(schema.crmConnections.userId, userId),
        eq(schema.crmConnections.provider, "google_sheets"),
      ),
    )
    .limit(1);
  if (!conn) return null;
  return {
    id: conn.id,
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    expiresAt: conn.expiresAt,
    metadata: (conn.metadata as Record<string, unknown>) || {},
  };
}

/** Returns a valid (auto-refreshed) access token, or null when not connected. */
async function getAccessToken(userId: string): Promise<string | null> {
  const conn = await getConnection(userId);
  if (!conn) return null;

  let token: string;
  let refresh: string | null = null;
  try {
    token = decryptSecret(conn.accessToken);
    if (conn.refreshToken) refresh = decryptSecret(conn.refreshToken);
  } catch (err) {
    log.error("Google Sheets token decrypt failed", { error: getErrorMessage(err) });
    return null;
  }

  const expiringSoon = !conn.expiresAt || conn.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (expiringSoon && refresh) {
    try {
      const refreshed = await refreshGoogleToken(refresh);
      token = refreshed.access_token;
      await drizzle
        .update(schema.crmConnections)
        .set({
          accessToken: encryptSecret(refreshed.access_token),
          // Google doesn't always return a new refresh token — keep the old one
          ...(refreshed.refresh_token
            ? { refreshToken: encryptSecret(refreshed.refresh_token) }
            : {}),
          expiresAt: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000),
          updatedAt: new Date(),
        })
        .where(eq(schema.crmConnections.id, conn.id));
    } catch (err) {
      const message = getErrorMessage(err);
      log.error("Google Sheets token refresh failed", { error: message });
      const isTerminal = /invalid_grant|invalid_rapt|token has been expired or revoked/i.test(
        message,
      );
      if (isTerminal) {
        await drizzle
          .update(schema.crmConnections)
          .set({
            active: false,
            updatedAt: new Date(),
          })
          .where(eq(schema.crmConnections.id, conn.id));
        return null;
      }
      // Soft refresh failures: keep serving the existing token briefly so a
      // transient Google blip doesn't break mid-call sheet writes.
    }
  }
  return token;
}

async function patchMetadata(connId: string, patch: Record<string, unknown>): Promise<void> {
  const [conn] = await drizzle
    .select({ metadata: schema.crmConnections.metadata })
    .from(schema.crmConnections)
    .where(eq(schema.crmConnections.id, connId))
    .limit(1);
  const meta = { ...((conn?.metadata as Record<string, unknown>) || {}), ...patch };
  await drizzle
    .update(schema.crmConnections)
    .set({ metadata: meta, updatedAt: new Date() })
    .where(eq(schema.crmConnections.id, connId));
}

/**
 * Ensure the managed "Wireline Call Log" spreadsheet exists.
 * On first use, creates the spreadsheet in Google Drive with
 * formatted headers. Returns the spreadsheetId or null.
 */
async function ensureSpreadsheet(token: string, conn: SheetConnection): Promise<string | null> {
  // Return cached spreadsheet ID if we already created one
  const cached = conn.metadata.spreadsheet_id as string | undefined;
  if (cached) return cached;

  const auth = { Authorization: `Bearer ${token}` };

  // Search for existing spreadsheet by name in Drive
  try {
    const searchRes = await fetchWithTimeout(
      `${DRIVE_API}?q=${encodeURIComponent(`name='${SHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`)}&fields=files(id,name)`,
      { headers: auth },
      10_000,
    );
    if (searchRes.ok) {
      const data = (await searchRes.json()) as { files?: { id: string }[] };
      if (data.files?.[0]?.id) {
        await patchMetadata(conn.id, { spreadsheet_id: data.files[0].id });
        return data.files[0].id;
      }
    }
  } catch {
    // Fall through to create
  }

  // Create a new spreadsheet with headers
  try {
    const createRes = await fetchWithTimeout(
      SHEETS_API,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          properties: { title: SHEET_TITLE },
          sheets: [
            {
              properties: { title: "Call Log" },
              data: [
                {
                  startRow: 0,
                  startColumn: 0,
                  rowData: [
                    {
                      values: HEADERS.map((h) => ({
                        userEnteredValue: { stringValue: h },
                        userEnteredFormat: {
                          textFormat: { bold: true },
                          backgroundColor: { red: 0.31, green: 0.12, blue: 0.48 },
                          // White text on Wireline mono header
                          foregroundColorStyle: {
                            rgbColor: { red: 1, green: 1, blue: 1 },
                          },
                        },
                      })),
                    },
                  ],
                },
              ],
            },
          ],
        }),
      },
      15_000,
    );
    if (!createRes.ok) {
      log.warn("Google Sheets create failed", { status: createRes.status });
      return null;
    }
    const sheet = (await createRes.json()) as { spreadsheetId?: string };
    if (!sheet.spreadsheetId) return null;

    await patchMetadata(conn.id, { spreadsheet_id: sheet.spreadsheetId });
    log.info("Created Wireline Call Log in Google Sheets", { spreadsheetId: sheet.spreadsheetId });
    return sheet.spreadsheetId;
  } catch (err) {
    log.error("Google Sheets create error", { error: getErrorMessage(err) });
    return null;
  }
}

/**
 * Append a call-log row to the tenant's Google Sheets workbook.
 *
 * Mirrors logToExcel() in microsoft-graph-service.ts — same
 * fire-and-forget pattern, same caller/outcome/details shape.
 */
export async function logToGoogleSheets(params: {
  userId: string;
  caller: string;
  outcome: string;
  details: string;
  agentName?: string;
  durationMinutes?: number;
}): Promise<boolean> {
  const token = await getAccessToken(params.userId);
  if (!token) {
    log.warn("Google Sheets not connected, skipping log");
    return false;
  }
  const conn = await getConnection(params.userId);
  if (!conn) return false;

  try {
    const spreadsheetId = await ensureSpreadsheet(token, conn);
    if (!spreadsheetId) return false;

    const row = [
      new Date().toISOString(),
      params.caller,
      params.outcome,
      params.details,
      params.agentName || "",
      params.durationMinutes != null ? String(params.durationMinutes) : "",
    ];

    const r = await fetchWithTimeout(
      `${SHEETS_API}/${spreadsheetId}/values/Call Log!A:F:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] }),
      },
      10_000,
    );
    if (!r.ok) {
      log.warn("Google Sheets row append failed", { status: r.status });
      return false;
    }
    return true;
  } catch (err) {
    log.error("Google Sheets logToGoogleSheets error", { error: getErrorMessage(err) });
    return false;
  }
}

export async function disconnectGoogleSheets(userId: string): Promise<void> {
  const { revokeCrmProviderTokens } = await import("./oauth-provider-revocation");
  await revokeCrmProviderTokens(userId, "google_sheets");
  await drizzle
    .delete(schema.crmConnections)
    .where(
      and(
        eq(schema.crmConnections.userId, userId),
        eq(schema.crmConnections.provider, "google_sheets"),
      ),
    );
}
