/* eslint-disable @typescript-eslint/no-explicit-any -- Ads API responses are vendor-defined JSON. */
import { createHmac, randomBytes } from "node:crypto";
import { fetchWithTimeout, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/**
 * X Ads API — OAuth 1.0a user-context (platform credentials on Vercel).
 *
 * Ads write/read does not use the tenant OAuth 2.0 PKCE connection. Set
 * X_API_KEY, X_API_SECRET, X_ADS_ACCESS_TOKEN, X_ADS_ACCESS_TOKEN_SECRET,
 * and X_ADS_ACCOUNT_ID for campaign listing and stats.
 */

const X_ADS_API = "https://ads-api.twitter.com/12";

export interface XAdCampaign {
  id: string;
  name: string;
  entity_status: string;
  daily_budget_amount_local_micro?: number | null;
  currency?: string | null;
}

export interface XAdCampaignStats {
  campaign_id: string;
  impressions?: number;
  clicks?: number;
  spend_local_micro?: number;
  currency?: string | null;
}

export function xAdsConfigured(): boolean {
  return !!(
    process.env.X_API_KEY &&
    process.env.X_API_SECRET &&
    process.env.X_ADS_ACCESS_TOKEN &&
    process.env.X_ADS_ACCESS_TOKEN_SECRET &&
    process.env.X_ADS_ACCOUNT_ID
  );
}

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function oauth1Authorization(
  method: string,
  url: string,
  queryParams: Record<string, string>,
): string {
  const consumerKey = process.env.X_API_KEY!;
  const consumerSecret = process.env.X_API_SECRET!;
  const token = process.env.X_ADS_ACCESS_TOKEN!;
  const tokenSecret = process.env.X_ADS_ACCESS_TOKEN_SECRET!;

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: "1.0",
  };

  const allParams = { ...oauthParams, ...queryParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k] ?? "")}`)
    .join("&");

  const baseUrl = url.split("?")[0];
  const baseString = [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(paramString),
  ].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");
  oauthParams.oauth_signature = signature;

  return (
    "OAuth " +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k] ?? "")}"`)
      .join(", ")
  );
}

async function adsGet<T>(path: string, query: Record<string, string> = {}): Promise<T | null> {
  if (!xAdsConfigured()) {
    log.warn("X Ads not configured, missing platform OAuth 1.0a credentials");
    return null;
  }

  const qs = new URLSearchParams(query).toString();
  const url = `${X_ADS_API}${path}${qs ? `?${qs}` : ""}`;
  try {
    const r = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: { Authorization: oauth1Authorization("GET", url, query) },
      },
      20_000,
    );
    const data = (await r.json()) as any;
    if (!r.ok) {
      throw new Error(data.errors?.[0]?.message || data.error || `X Ads error: ${r.status}`);
    }
    return data as T;
  } catch (err) {
    log.error("X Ads API request failed", { path, error: getErrorMessage(err) });
    return null;
  }
}

export async function listXAdCampaigns(): Promise<XAdCampaign[]> {
  const accountId = process.env.X_ADS_ACCOUNT_ID!;
  const data = await adsGet<{ data?: any[] }>(`/accounts/${accountId}/campaigns`, {
    count: "50",
  });
  if (!data?.data) return [];
  return data.data.map((row) => ({
    id: String(row.id),
    name: String(row.name || ""),
    entity_status: String(row.entity_status || ""),
    daily_budget_amount_local_micro: row.daily_budget_amount_local_micro ?? null,
    currency: row.currency ?? null,
  }));
}

export async function getXAdCampaignStats(campaignId: string): Promise<XAdCampaignStats | null> {
  const accountId = process.env.X_ADS_ACCOUNT_ID!;
  const data = await adsGet<{ data?: any[] }>(`/stats/accounts/${accountId}`, {
    entity: "CAMPAIGN",
    entity_ids: campaignId,
    metric_groups: "ENGAGEMENT,BILLING",
    placement: "ALL_ON_TWITTER",
  });
  const row = data?.data?.[0];
  if (!row) return null;
  const metrics = row.id_data?.[0]?.metrics || {};
  return {
    campaign_id: campaignId,
    impressions: metrics.impressions?.[0],
    clicks: metrics.clicks?.[0],
    spend_local_micro: metrics.billed_charge_local_micro?.[0],
    currency: row.currency ?? null,
  };
}
