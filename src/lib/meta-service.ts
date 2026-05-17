import { drizzle, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Meta (Facebook Login) — OAuth for Marketing Graph / Pages workflows.
 *
 * Tokens are stored in wireline_crm_connections (provider = "meta").
 * Operators connect from Integrations → Meta.
 */

const META_API_VERSION = "v21.0";
const META_GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;

/** Scopes that work without App Review for standard consumer login apps. */
const META_SCOPES = ["public_profile", "email"].join(",");

export function metaOAuthConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function getMetaAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: META_SCOPES,
  });
  return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;
}

export async function exchangeMetaCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; expires_in: number }> {
  const url = new URL(`${META_GRAPH}/oauth/access_token`);
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("client_secret", process.env.META_APP_SECRET!);
  url.searchParams.set("code", code);

  const r = await fetchWithTimeout(url.toString(), {}, 15_000);
  const data = (await r.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
    error_description?: string;
  };
  if (!r.ok || !data.access_token) {
    const msg =
      data.error?.message ||
      (data as { error_message?: string }).error_message ||
      data.error_description ||
      "Meta token exchange failed";
    throw new Error(msg);
  }
  return { access_token: data.access_token, expires_in: data.expires_in || 3600 };
}

export async function fetchMetaMe(accessToken: string): Promise<{
  id: string;
  name?: string;
  email?: string;
}> {
  const u = new URL(`${META_GRAPH}/me`);
  u.searchParams.set("fields", "id,name,email");
  u.searchParams.set("access_token", accessToken);
  const r = await fetchWithTimeout(u.toString(), {}, 15_000);
  const d = (await r.json()) as {
    id?: string;
    name?: string;
    email?: string;
    error?: { message?: string };
  };
  if (!r.ok || !d.id || d.error) {
    throw new Error(d.error?.message || "Meta /me failed");
  }
  return { id: d.id, name: d.name, email: d.email };
}

export async function disconnectMeta(userId: string): Promise<void> {
  await drizzle
    .delete(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "meta")),
    );
}
