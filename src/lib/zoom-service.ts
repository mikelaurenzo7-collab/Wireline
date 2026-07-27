/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";

/**
 * Zoom Integration Service — OAuth 2.0 authorization_code flow.
 *
 * Account Holders connect their Zoom account via Admin → Integrations.
 * When an agent books a calendar appointment, a Zoom meeting link
 * is automatically generated and attached to the event.
 */

const ZOOM_AUTH_URL = "https://zoom.us/oauth/authorize";
const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";
const ZOOM_API = "https://api.zoom.us/v2";

export interface ZoomMeeting {
  id: number;
  join_url: string;
  start_url: string;
  topic: string;
}

interface ZoomConnection {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// ────────────────────────────────────────────────────────────────────
//  OAuth
// ────────────────────────────────────────────────────────────────────

export function zoomOAuthConfigured(): boolean {
  return !!(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

export function getZoomAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.ZOOM_CLIENT_ID!,
    redirect_uri: redirectUri,
    state,
  });
  return `${ZOOM_AUTH_URL}?${params.toString()}`;
}

export async function exchangeZoomCode(
  code: string,
  redirectUri: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const basicAuth = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`,
  ).toString("base64");

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const r = await fetchWithTimeout(
    ZOOM_TOKEN_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as any;
  if (!r.ok || !data.access_token) {
    throw new Error(data.reason || data.error || "Zoom token exchange failed");
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 3600,
  };
}

async function refreshZoomToken(
  conn: ZoomConnection,
): Promise<{ access_token: string; refresh_token: string; expires_at: number }> {
  const basicAuth = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`,
  ).toString("base64");

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: decryptSecret(conn.refresh_token),
  });

  const r = await fetchWithTimeout(
    ZOOM_TOKEN_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as any;
  if (!r.ok || !data.access_token) {
    throw new Error(data.reason || "Zoom token refresh failed");
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

// ────────────────────────────────────────────────────────────────────
//  Token Management
// ────────────────────────────────────────────────────────────────────

async function getConnection(userId: string): Promise<ZoomConnection | null> {
  const [data] = await drizzle
    .select({
      id: schema.crmConnections.id,
      access_token: schema.crmConnections.accessToken,
      refresh_token: schema.crmConnections.refreshToken,
      expires_at: schema.crmConnections.expiresAt,
    })
    .from(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "zoom")),
    )
    .limit(1);

  if (!data) return null;

  return {
    id: data.id,
    access_token: data.access_token || "",
    refresh_token: data.refresh_token || "",
    expires_at: data.expires_at ? Number(data.expires_at) : 0,
  };
}

async function getValidToken(userId: string): Promise<string | null> {
  const conn = await getConnection(userId);
  if (!conn) return null;

  if (conn.expires_at && Date.now() < conn.expires_at - 60_000) {
    return decryptSecret(conn.access_token);
  }

  try {
    const updated = await refreshZoomToken(conn);
    await drizzle
      .update(schema.crmConnections)
      .set({
        accessToken: encryptSecret(updated.access_token),
        refreshToken: encryptSecret(updated.refresh_token),
        expiresAt: new Date(updated.expires_at),
        updatedAt: new Date(),
      })
      .where(eq(schema.crmConnections.id, conn.id));
    return updated.access_token;
  } catch (err) {
    log.error("Zoom token refresh failed", { error: getErrorMessage(err) });
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
//  Zoom API Operations
// ────────────────────────────────────────────────────────────────────

export async function createMeeting(
  userId: string,
  params: {
    topic: string;
    startTime: string;
    duration?: number;
  },
): Promise<ZoomMeeting | null> {
  const token = await getValidToken(userId);
  if (!token) {
    log.warn("Zoom not connected — skipping meeting creation");
    return null;
  }

  try {
    const body = {
      topic: params.topic,
      type: 2, // scheduled meeting
      start_time: params.startTime,
      duration: params.duration || 60,
      settings: {
        join_before_host: true,
        waiting_room: false,
        auto_recording: "none",
      },
    };

    const r = await fetchWithTimeout(
      `${ZOOM_API}/users/me/meetings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      15_000,
    );
    const data = (await r.json()) as any;
    if (!r.ok) {
      log.warn("Zoom createMeeting failed", { status: r.status, error: data.message });
      return null;
    }
    return {
      id: data.id,
      join_url: data.join_url,
      start_url: data.start_url,
      topic: data.topic,
    };
  } catch (err) {
    log.error("Zoom createMeeting error", { error: getErrorMessage(err) });
    return null;
  }
}

export async function disconnectZoom(userId: string): Promise<void> {
  const { revokeCrmProviderTokens } = await import("./oauth-provider-revocation");
  await revokeCrmProviderTokens(userId, "zoom");
  await drizzle
    .delete(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "zoom")),
    );
}
