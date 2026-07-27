/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { createHash, randomBytes } from "node:crypto";
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";

/**
 * X (Twitter) Integration Service — OAuth 2.0 authorization_code + PKCE.
 *
 * Account Holders connect their X account via Admin → Integrations.
 * Tokens are stored encrypted in wireline_crm_connections (provider='x').
 */

const X_AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const X_API = "https://api.twitter.com/2";

/** Scopes for posting, engagement, and DMs. Account Holders must reconnect after scope upgrades. */
const X_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
  "like.read",
  "like.write",
  "dm.read",
  "dm.write",
].join(" ");

export const X_ENGAGEMENT_TOOL_NAMES = [
  "post_x_tweet",
  "reply_to_x_tweet",
  "like_x_tweet",
  "repost_x_tweet",
  "send_x_dm",
  "list_x_mentions",
] as const;

interface XConnection {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  active: boolean | null;
  metadata: Record<string, unknown> | null;
}

export interface XUserProfile {
  id: string;
  username: string;
  name: string;
}

export interface XMention {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
}

// ────────────────────────────────────────────────────────────────────
//  OAuth + PKCE
// ────────────────────────────────────────────────────────────────────

export function xOAuthConfigured(): boolean {
  return !!(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function getXAuthUrl(redirectUri: string, state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: X_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${X_AUTH_URL}?${params.toString()}`;
}

function xBasicAuthHeader(): string {
  const raw = `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

export async function exchangeXCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: process.env.X_CLIENT_ID!,
  });

  const r = await fetchWithTimeout(
    X_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: xBasicAuthHeader(),
      },
      body: params.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as any;
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "X token exchange failed");
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 7200,
  };
}

async function refreshXToken(
  conn: XConnection,
): Promise<{ access_token: string; refresh_token: string; expires_at: number }> {
  if (!conn.refreshToken) throw new Error("X refresh token is unavailable");
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: decryptSecret(conn.refreshToken),
    client_id: process.env.X_CLIENT_ID!,
  });

  const r = await fetchWithTimeout(
    X_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: xBasicAuthHeader(),
      },
      body: params.toString(),
    },
    15_000,
  );
  const data = (await r.json()) as any;
  if (!r.ok || !data.access_token) {
    const isTerminal =
      r.status === 400 ||
      data.error === "invalid_grant" ||
      String(data.error_description || "").includes("invalid_grant");
    const err = new Error(data.error_description || data.error || "X token refresh failed");
    (err as any).isTerminal = isTerminal;
    throw err;
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || decryptSecret(conn.refreshToken),
    expires_at: Date.now() + (data.expires_in || 7200) * 1000,
  };
}

async function getConnection(userId: string): Promise<XConnection | null> {
  const [data] = await drizzle
    .select({
      id: schema.crmConnections.id,
      accessToken: schema.crmConnections.accessToken,
      refreshToken: schema.crmConnections.refreshToken,
      expiresAt: schema.crmConnections.expiresAt,
      active: schema.crmConnections.active,
      metadata: schema.crmConnections.metadata,
    })
    .from(schema.crmConnections)
    .where(and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "x")))
    .limit(1);

  if (!data) return null;
  return {
    ...data,
    expiresAt: data.expiresAt ? data.expiresAt.getTime() : null,
    metadata: (data.metadata as Record<string, unknown> | null) ?? null,
  };
}

async function getValidToken(userId: string): Promise<string | null> {
  const conn = await getConnection(userId);
  if (!conn || conn.active === false) return null;

  if (conn.expiresAt && Date.now() < conn.expiresAt - 60_000) {
    return decryptSecret(conn.accessToken);
  }

  if (!conn.refreshToken) {
    return decryptSecret(conn.accessToken);
  }

  try {
    const updated = await refreshXToken(conn);
    await drizzle
      .update(schema.crmConnections)
      .set({
        accessToken: encryptSecret(updated.access_token),
        refreshToken: encryptSecret(updated.refresh_token),
        expiresAt: new Date(updated.expires_at),
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.crmConnections.id, conn.id));
    return updated.access_token;
  } catch (err: any) {
    log.error("X token refresh failed", { error: getErrorMessage(err) });
    if (err.isTerminal) {
      await drizzle
        .update(schema.crmConnections)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(schema.crmConnections.id, conn.id));
    }
    return null;
  }
}

function xHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function resolveXUserId(userId: string, token: string): Promise<string | null> {
  const conn = await getConnection(userId);
  const fromMeta = conn?.metadata?.x_user_id;
  if (typeof fromMeta === "string" && fromMeta) return fromMeta;
  const profile = await fetchXUserProfile(token);
  if (!profile?.id) return null;
  if (conn) {
    await drizzle
      .update(schema.crmConnections)
      .set({
        metadata: { ...(conn.metadata || {}), x_user_id: profile.id, username: profile.username },
        updatedAt: new Date(),
      })
      .where(eq(schema.crmConnections.id, conn.id));
  }
  return profile.id;
}

async function xApiJson<T>(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false }> {
  const token = await getValidToken(userId);
  if (!token) {
    log.warn("X not connected");
    return { ok: false };
  }

  try {
    const r = await fetchWithTimeout(
      `${X_API}${path}`,
      {
        ...init,
        headers: {
          ...xHeaders(token),
          ...(init?.headers as Record<string, string> | undefined),
        },
      },
      15_000,
    );
    const data = (await r.json()) as any;
    if (!r.ok) {
      throw new Error(data.detail || data.title || data.error || `X API error: ${r.status}`);
    }
    return { ok: true, data: data as T };
  } catch (err) {
    log.error("X API request failed", { path, error: getErrorMessage(err) });
    return { ok: false };
  }
}

// ────────────────────────────────────────────────────────────────────
//  X API Operations
// ────────────────────────────────────────────────────────────────────

export async function fetchXUserProfile(accessToken: string): Promise<XUserProfile | null> {
  try {
    const r = await fetchWithTimeout(
      `${X_API}/users/me?user.fields=username,name`,
      { headers: xHeaders(accessToken) },
      15_000,
    );
    if (!r.ok) return null;
    const data = (await r.json()) as any;
    const user = data.data;
    if (!user?.id) return null;
    return {
      id: String(user.id),
      username: String(user.username || ""),
      name: String(user.name || ""),
    };
  } catch (err) {
    log.error("X user profile fetch failed", { error: getErrorMessage(err) });
    return null;
  }
}

export async function lookupXUserIdByUsername(
  userId: string,
  username: string,
): Promise<string | null> {
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return null;
  const res = await xApiJson<{ data?: { id: string } }>(
    userId,
    `/users/by/username/${encodeURIComponent(handle)}`,
    { method: "GET" },
  );
  return res.ok && res.data.data?.id ? String(res.data.data.id) : null;
}

export async function postXTweet(userId: string, text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const res = await xApiJson<{ data?: { id: string } }>(userId, "/tweets", {
    method: "POST",
    body: JSON.stringify({ text: trimmed.slice(0, 280) }),
  });
  return res.ok && res.data.data?.id ? String(res.data.data.id) : null;
}

export async function replyToXTweet(
  userId: string,
  inReplyToTweetId: string,
  text: string,
): Promise<string | null> {
  const trimmed = text.trim();
  const tweetId = inReplyToTweetId.trim();
  if (!trimmed || !tweetId) return null;

  const res = await xApiJson<{ data?: { id: string } }>(userId, "/tweets", {
    method: "POST",
    body: JSON.stringify({
      text: trimmed.slice(0, 280),
      reply: { in_reply_to_tweet_id: tweetId },
    }),
  });
  return res.ok && res.data.data?.id ? String(res.data.data.id) : null;
}

export async function likeXTweet(userId: string, tweetId: string): Promise<boolean> {
  const id = tweetId.trim();
  if (!id) return false;

  const token = await getValidToken(userId);
  if (!token) return false;
  const xUserId = await resolveXUserId(userId, token);
  if (!xUserId) return false;

  const res = await xApiJson<{ data?: { liked: boolean } }>(userId, `/users/${xUserId}/likes`, {
    method: "POST",
    body: JSON.stringify({ tweet_id: id }),
  });
  return res.ok && res.data.data?.liked === true;
}

export async function repostXTweet(userId: string, tweetId: string): Promise<string | null> {
  const id = tweetId.trim();
  if (!id) return null;

  const token = await getValidToken(userId);
  if (!token) return null;
  const xUserId = await resolveXUserId(userId, token);
  if (!xUserId) return null;

  const res = await xApiJson<{ data?: { retweeted: boolean; rest_id?: string } }>(
    userId,
    `/users/${xUserId}/retweets`,
    {
      method: "POST",
      body: JSON.stringify({ tweet_id: id }),
    },
  );
  if (!res.ok) return null;
  return res.data.data?.rest_id ? String(res.data.data.rest_id) : id;
}

export async function sendXDirectMessage(
  userId: string,
  participantIdOrUsername: string,
  text: string,
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;

  let participantId = participantIdOrUsername.trim();
  if (!/^\d+$/.test(participantId)) {
    const resolved = await lookupXUserIdByUsername(userId, participantId);
    if (!resolved) return false;
    participantId = resolved;
  }

  const res = await xApiJson<{ data?: { dm_conversation_id: string } }>(
    userId,
    `/dm_conversations/with/${participantId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ text: trimmed.slice(0, 10_000) }),
    },
  );
  return res.ok && !!res.data.data?.dm_conversation_id;
}

export async function listXMentions(userId: string, limit = 10): Promise<XMention[]> {
  const token = await getValidToken(userId);
  if (!token) return [];
  const xUserId = await resolveXUserId(userId, token);
  if (!xUserId) return [];

  const max = Math.min(Math.max(limit, 1), 25);
  const res = await xApiJson<{ data?: any[] }>(
    userId,
    `/users/${xUserId}/mentions?max_results=${max}&tweet.fields=created_at,author_id,text`,
    { method: "GET" },
  );
  if (!res.ok || !res.data.data) return [];
  return res.data.data.map((row) => ({
    id: String(row.id),
    text: String(row.text || ""),
    author_id: row.author_id ? String(row.author_id) : undefined,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }));
}

export async function disconnectX(userId: string): Promise<void> {
  const { revokeCrmProviderTokens } = await import("./oauth-provider-revocation");
  await revokeCrmProviderTokens(userId, "x");
  await drizzle
    .delete(schema.crmConnections)
    .where(and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "x")));
}
