/**
 * Best-effort provider-side OAuth grant revocation.
 *
 * Disconnect and GDPR purge previously only deleted encrypted tokens from
 * Postgres. That left live grants at Google / Microsoft / Slack / etc. until
 * they expired. Callers revoke first, then delete local rows. Provider
 * outages never block disconnect or purge — already-invalid grants count as
 * success.
 */

import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { decryptSecret } from "./secret-vault";
import { drizzle, fetchWithTimeout, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export type OAuthRevocationSummary = {
  attempted: number;
  revoked: number;
  skipped: number;
  errors: string[];
};

type TokenBundle = {
  provider: string;
  accessToken: string | null;
  refreshToken: string | null;
  instanceUrl: string | null;
  metadata: unknown;
};

function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

async function postForm(
  url: string,
  body: URLSearchParams,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body: body.toString(),
    },
    10_000,
  );
}

function shopDomainFromConnection(conn: TokenBundle): string | null {
  const fromInstance = conn.instanceUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "") || null;
  const meta = conn.metadata as { shop?: string } | null;
  const candidate = (meta?.shop || fromInstance || "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(candidate)) return null;
  return candidate;
}

/**
 * Revoke a single provider grant. Returns true when the provider accepted
 * the revoke (or the grant was already gone). Returns false when we could
 * not attempt a meaningful revoke (missing tokens / unsupported provider).
 */
export async function revokeProviderGrant(conn: TokenBundle): Promise<boolean> {
  const access = safeDecrypt(conn.accessToken);
  const refresh = safeDecrypt(conn.refreshToken);
  const token = refresh || access;
  if (!token && conn.provider !== "icloud" && conn.provider !== "agentmail") return false;

  try {
    switch (conn.provider) {
      case "google":
      case "google_sheets": {
        const r = await postForm(
          "https://oauth2.googleapis.com/revoke",
          new URLSearchParams({ token: token! }),
        );
        return r.ok || r.status === 400;
      }
      case "microsoft":
      case "microsoft_teams":
      case "microsoft_excel": {
        if (!access) return false;
        const r = await fetchWithTimeout(
          "https://graph.microsoft.com/v1.0/me/revokeSignInSessions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${access}` },
          },
          10_000,
        );
        return r.ok || r.status === 401 || r.status === 403;
      }
      case "yahoo": {
        const id = process.env.YAHOO_CLIENT_ID;
        const secret = process.env.YAHOO_CLIENT_SECRET;
        if (!id || !secret) return false;
        const basic = Buffer.from(`${id}:${secret}`).toString("base64");
        const r = await postForm(
          "https://api.login.yahoo.com/oauth2/revoke",
          new URLSearchParams({ token: token! }),
          { Authorization: `Basic ${basic}` },
        );
        return r.ok || r.status === 400;
      }
      case "slack": {
        if (!access) return false;
        const r = await fetchWithTimeout(
          "https://slack.com/api/auth.revoke",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${access}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ token: access }).toString(),
          },
          10_000,
        );
        if (!r.ok) return r.status === 401;
        const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        return data.ok === true || data.error === "token_revoked" || data.error === "invalid_auth";
      }
      case "hubspot": {
        if (!refresh && !access) return false;
        const target = refresh || access!;
        const r = await fetchWithTimeout(
          `https://api.hubapi.com/oauth/v1/refresh-tokens/${encodeURIComponent(target)}`,
          { method: "DELETE" },
          10_000,
        );
        return r.ok || r.status === 404;
      }
      case "salesforce": {
        const base =
          (conn.instanceUrl || "https://login.salesforce.com").replace(/\/$/, "") ||
          "https://login.salesforce.com";
        const r = await postForm(
          `${base}/services/oauth2/revoke`,
          new URLSearchParams({ token: token! }),
        );
        return r.ok || r.status === 400;
      }
      case "zoom": {
        const id = process.env.ZOOM_CLIENT_ID;
        const secret = process.env.ZOOM_CLIENT_SECRET;
        if (!id || !secret || !access) return false;
        const basic = Buffer.from(`${id}:${secret}`).toString("base64");
        const r = await postForm(
          "https://zoom.us/oauth/revoke",
          new URLSearchParams({ token: access }),
          { Authorization: `Basic ${basic}` },
        );
        return r.ok || r.status === 400;
      }
      case "meta": {
        if (!access) return false;
        const r = await fetchWithTimeout(
          `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(access)}`,
          { method: "DELETE" },
          10_000,
        );
        return r.ok || r.status === 400 || r.status === 401;
      }
      case "x": {
        const id = process.env.X_CLIENT_ID;
        const secret = process.env.X_CLIENT_SECRET;
        if (!id || !secret) return false;
        const basic = Buffer.from(`${id}:${secret}`).toString("base64");
        const r = await postForm(
          "https://api.twitter.com/2/oauth2/revoke",
          new URLSearchParams({
            token: token!,
            token_type_hint: refresh ? "refresh_token" : "access_token",
            client_id: id,
          }),
          { Authorization: `Basic ${basic}` },
        );
        return r.ok || r.status === 400;
      }
      case "shopify": {
        if (!access) return false;
        const shop = shopDomainFromConnection(conn);
        if (!shop) return false;
        const r = await fetchWithTimeout(
          `https://${shop}/admin/api_permissions/current.json`,
          {
            method: "DELETE",
            headers: { "X-Shopify-Access-Token": access },
          },
          10_000,
        );
        return r.ok || r.status === 401 || r.status === 404;
      }
      case "square": {
        const clientId = process.env.SQUARE_APPLICATION_ID;
        const clientSecret = process.env.SQUARE_APPLICATION_SECRET;
        if (!clientId || !clientSecret || !access) return false;
        const r = await fetchWithTimeout(
          "https://connect.squareup.com/oauth2/revoke",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Client ${clientSecret}`,
            },
            body: JSON.stringify({
              client_id: clientId,
              access_token: access,
            }),
          },
          10_000,
        );
        return r.ok || r.status === 404;
      }
      case "apollo":
      case "icloud":
      case "agentmail":
        // Apollo has no public token-revoke endpoint; iCloud uses an
        // app-specific password and AgentMail uses a tenant API key with
        // nothing to revoke remotely.
        return false;
      default:
        return false;
    }
  } catch (err) {
    log.warn("oauth provider revoke failed", {
      provider: conn.provider,
      error: getErrorMessage(err),
    });
    return false;
  }
}

/** Best-effort revoke for one CRM provider before local delete/deactivate. */
export async function revokeCrmProviderTokens(
  userId: string,
  provider: string,
): Promise<OAuthRevocationSummary> {
  const [conn] = await drizzle
    .select({
      provider: schema.crmConnections.provider,
      accessToken: schema.crmConnections.accessToken,
      refreshToken: schema.crmConnections.refreshToken,
      instanceUrl: schema.crmConnections.instanceUrl,
      metadata: schema.crmConnections.metadata,
    })
    .from(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, provider)),
    )
    .limit(1);

  if (!conn) {
    return { attempted: 0, revoked: 0, skipped: 0, errors: [] };
  }

  const ok = await revokeProviderGrant(conn);
  return {
    attempted: 1,
    revoked: ok ? 1 : 0,
    skipped: ok ? 0 : 1,
    errors: ok ? [] : [`${provider}: revoke not confirmed`],
  };
}

/**
 * Revoke every OAuth grant owned by the user (CRM + mailbox + calendar)
 * before GDPR purge deletes the encrypted tokens. Never throws.
 */
export async function revokeAllOAuthGrantsForUser(userId: string): Promise<OAuthRevocationSummary> {
  const summary: OAuthRevocationSummary = {
    attempted: 0,
    revoked: 0,
    skipped: 0,
    errors: [],
  };

  const crm = await drizzle
    .select({
      provider: schema.crmConnections.provider,
      accessToken: schema.crmConnections.accessToken,
      refreshToken: schema.crmConnections.refreshToken,
      instanceUrl: schema.crmConnections.instanceUrl,
      metadata: schema.crmConnections.metadata,
    })
    .from(schema.crmConnections)
    .where(eq(schema.crmConnections.userId, userId));

  const emails = await drizzle
    .select({
      provider: schema.emailAccounts.provider,
      accessToken: schema.emailAccounts.accessToken,
      refreshToken: schema.emailAccounts.refreshToken,
    })
    .from(schema.emailAccounts)
    .where(eq(schema.emailAccounts.userId, userId));

  const calendars = await drizzle
    .select({
      provider: schema.calendarAccounts.provider,
      accessToken: schema.calendarAccounts.accessToken,
      refreshToken: schema.calendarAccounts.refreshToken,
    })
    .from(schema.calendarAccounts)
    .where(eq(schema.calendarAccounts.userId, userId));

  const rawBundles = [
    ...crm.map((row) => ({
      provider: row.provider,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      instanceUrl: row.instanceUrl,
      metadata: row.metadata,
    })),
    ...emails.map((row) => ({
      provider: row.provider,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      instanceUrl: null,
      metadata: null,
    })),
    ...calendars.map((row) => ({
      provider: row.provider,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      instanceUrl: null,
      metadata: null,
    })),
  ];

  const bundles: TokenBundle[] = [];
  for (const bundle of rawBundles) {
    if (!bundle.provider) {
      summary.skipped += 1;
      summary.errors.push("unknown: OAuth grant is missing its provider");
      continue;
    }
    bundles.push({ ...bundle, provider: bundle.provider });
  }

  for (const bundle of bundles) {
    summary.attempted += 1;
    const ok = await revokeProviderGrant(bundle);
    if (ok) summary.revoked += 1;
    else {
      summary.skipped += 1;
      summary.errors.push(`${bundle.provider}: revoke not confirmed`);
    }
  }

  return summary;
}

/** Revoke a single mailbox/calendar-style account row before local delete. */
export async function revokeMailboxAccountTokens(account: {
  provider: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}): Promise<boolean> {
  if (!account.provider) {
    log.warn("oauth mailbox revoke skipped because provider is missing");
    return false;
  }

  return revokeProviderGrant({
    provider: account.provider,
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    instanceUrl: null,
    metadata: null,
  });
}
