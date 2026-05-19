import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";

/**
 * Meta (Facebook + Instagram) OAuth helpers.
 *
 * Currently scoped to **connection establishment only** — we surface
 * a "Connect with Meta" button in Integrations and store the token,
 * but the Lead Ads webhook ingest + CAPI conversion export are
 * future work. Customers who connect today get nothing actionable
 * back; the button is here so the integrations strip shows the
 * tile and the OAuth flow is ready to plug data calls into when
 * we ship the next phase.
 *
 * Auth model: Facebook Login for Business — same OAuth dialog used
 * by anyone who wants Lead Ads / Conversions API access. Requires
 * an approved Facebook app under business.facebook.com with the
 * `ads_management` + `leads_retrieval` permissions.
 */

const META_AUTH = "https://www.facebook.com/v18.0/dialog/oauth";
const META_TOKEN = "https://graph.facebook.com/v18.0/oauth/access_token";
const META_GRAPH = "https://graph.facebook.com/v18.0";

export function metaOAuthConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

const META_SCOPES = [
  "email",
  "public_profile",
  "ads_management",
  "leads_retrieval",
  "pages_show_list",
  "pages_read_engagement",
].join(",");

export function getMetaAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.META_APP_ID!,
    redirect_uri: redirectUri,
    scope: META_SCOPES,
    state,
  });
  return `${META_AUTH}?${params.toString()}`;
}

export async function exchangeMetaCode(
  code: string,
  redirectUri: string,
): Promise<{
  access_token: string;
  token_type?: string;
  expires_in?: number;
}> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: redirectUri,
    code,
  });
  const response = await fetchWithTimeout(
    `${META_TOKEN}?${params.toString()}`,
    { method: "GET" },
    10_000,
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Meta token exchange failed: ${response.status} ${errText}`);
  }
  return response.json();
}

/**
 * Probe the connection by fetching the authenticated user's
 * email + name from the Graph API. Used to confirm and label
 * the connection in the UI.
 */
export async function getMetaUserInfo(
  accessToken: string,
): Promise<{ email?: string; name?: string } | null> {
  try {
    const r = await fetchWithTimeout(
      `${META_GRAPH}/me?fields=email,name&access_token=${encodeURIComponent(accessToken)}`,
      { method: "GET" },
      10_000,
    );
    if (!r.ok) return null;
    return (await r.json()) as { email?: string; name?: string };
  } catch (err) {
    log.warn("Meta user info fetch failed", { error: getErrorMessage(err) });
    return null;
  }
}

/**
 * List the Facebook pages the authenticated user manages. We store
 * the page IDs in the connection metadata so the Lead Ads webhook
 * can map an incoming leadgen event's page_id back to the
 * Wireline tenant that owns it.
 */
export async function getMetaUserPages(
  accessToken: string,
): Promise<{ id: string; name: string }[]> {
  try {
    const r = await fetchWithTimeout(
      `${META_GRAPH}/me/accounts?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
      { method: "GET" },
      10_000,
    );
    if (!r.ok) return [];
    const data = (await r.json()) as any;
    return (data.data || []).map((p: any) => ({ id: p.id, name: p.name }));
  } catch (err) {
    log.warn("Meta pages fetch failed", { error: getErrorMessage(err) });
    return [];
  }
}

/**
 * Subscribe each page to leadgen events so Meta starts pushing
 * Lead Ads submissions to our webhook. Requires the page's own
 * access_token (returned by /me/accounts via the access_token
 * field if the `pages_show_list` scope is granted).
 */
export async function subscribePageToLeadgen(
  pageId: string,
  pageAccessToken: string,
): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(
      `${META_GRAPH}/${pageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${encodeURIComponent(pageAccessToken)}`,
      { method: "POST" },
      10_000,
    );
    return r.ok;
  } catch (err) {
    log.warn("Meta page leadgen subscribe failed", { pageId, error: getErrorMessage(err) });
    return false;
  }
}

export async function disconnectMeta(userId: string): Promise<void> {
  await drizzle
    .update(schema.crmConnections)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "meta")),
    );
}
