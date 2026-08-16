/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";

/**
 * Square Integration Service — OAuth 2.0 authorization_code flow.
 *
 * Square tokens expire after 30 days. The service auto-refreshes when
 * fewer than 7 days remain. Tokens are stored encrypted in
 * wireline_crm_connections with provider='square'.
 *
 * Per-tenant: each Wireline Account Holder connects their own Square merchant
 * account. The APPLICATION_ID/SECRET are Wireline's platform credentials;
 * the resulting access_token scopes to the Account Holder's merchant account.
 */

const SQUARE_API_BASE = "https://connect.squareup.com";
const SQUARE_API_V2 = `${SQUARE_API_BASE}/v2`;
const SQUARE_API_VERSION = "2024-12-18";

const SQUARE_SCOPES = [
  "ORDERS_READ",
  "CUSTOMERS_READ",
  "CUSTOMERS_WRITE",
  "INVENTORY_READ",
  "ITEMS_READ",
  "MERCHANT_PROFILE_READ",
  "PAYMENTS_WRITE",
].join(" ");

export function squareOAuthConfigured(): boolean {
  return !!(process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_APPLICATION_SECRET);
}

export function getSquareAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SQUARE_APPLICATION_ID!,
    scope: SQUARE_SCOPES,
    redirect_uri: redirectUri,
    state,
    session: "false",
    response_type: "code",
  });
  return `${SQUARE_API_BASE}/oauth2/authorize?${params.toString()}`;
}

export interface SquareTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  merchant_id: string;
  token_type: string;
}

export async function exchangeSquareCode(
  code: string,
  redirectUri: string,
): Promise<SquareTokenResponse> {
  const r = await fetchWithTimeout(
    `${SQUARE_API_BASE}/oauth2/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Square-Version": SQUARE_API_VERSION,
      },
      body: JSON.stringify({
        client_id: process.env.SQUARE_APPLICATION_ID!,
        client_secret: process.env.SQUARE_APPLICATION_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    },
    15_000,
  );
  const data = (await r.json()) as SquareTokenResponse & { error?: string; message?: string };
  if (!r.ok || !data.access_token) {
    throw new Error(data.message || data.error || "Square token exchange failed");
  }
  return data;
}

async function refreshSquareToken(refreshToken: string): Promise<SquareTokenResponse> {
  const r = await fetchWithTimeout(
    `${SQUARE_API_BASE}/oauth2/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Square-Version": SQUARE_API_VERSION,
      },
      body: JSON.stringify({
        client_id: process.env.SQUARE_APPLICATION_ID!,
        client_secret: process.env.SQUARE_APPLICATION_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
    15_000,
  );
  const data = (await r.json()) as SquareTokenResponse & { error?: string; message?: string };
  if (!r.ok || !data.access_token) {
    throw new Error(data.message || data.error || "Square token refresh failed");
  }
  return data;
}

interface SquareClient {
  token: string;
  merchantId: string | null;
}

async function getClient(userId: string): Promise<SquareClient | null> {
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
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "square")),
    )
    .limit(1);

  if (!conn) return null;

  let token: string;
  let refreshTokenDecrypted: string | null = null;

  try {
    token = decryptSecret(conn.accessToken);
    if (conn.refreshToken) refreshTokenDecrypted = decryptSecret(conn.refreshToken);
  } catch (err) {
    log.error("Square token decrypt failed", { error: getErrorMessage(err) });
    return null;
  }

  // Auto-refresh when fewer than 7 days remain.
  if (conn.expiresAt && refreshTokenDecrypted) {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (conn.expiresAt.getTime() - Date.now() < sevenDays) {
      try {
        const refreshed = await refreshSquareToken(refreshTokenDecrypted);
        await drizzle
          .update(schema.crmConnections)
          .set({
            accessToken: encryptSecret(refreshed.access_token),
            refreshToken: encryptSecret(refreshed.refresh_token),
            expiresAt: new Date(refreshed.expires_at),
            updatedAt: new Date(),
          })
          .where(eq(schema.crmConnections.id, conn.id));
        token = refreshed.access_token;
      } catch (refreshErr) {
        log.warn("Square token refresh failed, using existing token", {
          error: getErrorMessage(refreshErr),
        });
      }
    }
  }

  const merchantId = (conn.metadata as { merchant_id?: string } | null)?.merchant_id ?? null;
  return { token, merchantId };
}

function squareHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Square-Version": SQUARE_API_VERSION,
  };
}

async function getMerchantLocationIds(token: string): Promise<string[]> {
  try {
    const r = await fetchWithTimeout(
      `${SQUARE_API_V2}/locations`,
      { headers: squareHeaders(token) },
      10_000,
    );
    if (!r.ok) return [];
    const data = (await r.json()) as { locations?: { id: string; status?: string }[] };
    return (data.locations || []).filter((l) => l.status === "ACTIVE").map((l) => l.id);
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────
//  Order lookup
// ────────────────────────────────────────────────────────────────────

export interface SquareOrderResult {
  id: string;
  displayId: string;
  state: string;
  total: string;
  currency: string;
  createdAt: string;
  fulfillmentStatus: string;
  lineItems: { name: string; quantity: string; price: string }[];
}

function priceMoney(m: { amount?: number; currency?: string } | undefined): string {
  if (!m) return "0.00";
  return `${(Number(m.amount || 0) / 100).toFixed(2)} ${m.currency || "USD"}`;
}

function mapSquareOrder(o: any): SquareOrderResult {
  return {
    id: o.id || "",
    displayId: o.reference_id || o.ticket_name || o.id || "",
    state: o.state || "OPEN",
    total: priceMoney(o.net_amounts?.total_money || o.total_money),
    currency: (o.net_amounts?.total_money || o.total_money)?.currency || "USD",
    createdAt: o.created_at || "",
    fulfillmentStatus: o.fulfillments?.[0]?.state || o.state || "PROPOSED",
    lineItems: (o.line_items || []).map((li: any) => ({
      name: li.name || "item",
      quantity: li.quantity || "1",
      price: priceMoney(li.gross_sales_money || li.base_price_money),
    })),
  };
}

export async function squareLookupOrder(params: {
  orderId?: string;
  email?: string;
  phone?: string;
  userId: string;
}): Promise<SquareOrderResult | null> {
  const client = await getClient(params.userId);
  if (!client) {
    log.warn("Square not connected, skipping order lookup");
    return null;
  }

  try {
    if (params.orderId) {
      const r = await fetchWithTimeout(
        `${SQUARE_API_V2}/orders/${encodeURIComponent(params.orderId)}`,
        { headers: squareHeaders(client.token) },
        15_000,
      );
      if (!r.ok) return null;
      const data = (await r.json()) as { order?: any };
      return data.order ? mapSquareOrder(data.order) : null;
    }

    // No orderId — look up by customer then search their orders.
    const customer = await squareLookupCustomer({
      email: params.email,
      phone: params.phone,
      userId: params.userId,
    });
    if (!customer?.squareId) return null;

    const locationIds = await getMerchantLocationIds(client.token);
    if (locationIds.length === 0) return null;

    const r = await fetchWithTimeout(
      `${SQUARE_API_V2}/orders/search`,
      {
        method: "POST",
        headers: squareHeaders(client.token),
        body: JSON.stringify({
          location_ids: locationIds,
          query: {
            filter: { customer_filter: { customer_ids: [customer.squareId] } },
            sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
          },
          limit: 1,
        }),
      },
      15_000,
    );
    if (!r.ok) return null;
    const data = (await r.json()) as { orders?: any[] };
    const orders = data.orders || [];
    return orders.length > 0 ? mapSquareOrder(orders[0]) : null;
  } catch (err) {
    log.error("Square order lookup failed", { error: getErrorMessage(err) });
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
//  Customer lookup
// ────────────────────────────────────────────────────────────────────

export interface SquareCustomerResult {
  squareId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

export async function squareLookupCustomer(params: {
  email?: string;
  phone?: string;
  userId: string;
}): Promise<SquareCustomerResult | null> {
  const client = await getClient(params.userId);
  if (!client) {
    log.warn("Square not connected, skipping customer lookup");
    return null;
  }

  if (!params.email && !params.phone) return null;

  try {
    const filter: Record<string, unknown> = {};
    if (params.email) filter.email_address = { exact: params.email };
    else if (params.phone) filter.phone_number = { exact: params.phone };

    const r = await fetchWithTimeout(
      `${SQUARE_API_V2}/customers/search`,
      {
        method: "POST",
        headers: squareHeaders(client.token),
        body: JSON.stringify({ query: { filter } }),
      },
      15_000,
    );
    if (!r.ok) throw new Error(`Square customer search: ${r.status}`);
    const data = (await r.json()) as { customers?: any[] };
    const c = (data.customers || [])[0];
    if (!c) return null;

    return {
      squareId: c.id,
      firstName: c.given_name || "",
      lastName: c.family_name || "",
      email: c.email_address || null,
      phone: c.phone_number || null,
      createdAt: c.created_at || "",
    };
  } catch (err) {
    log.error("Square customer lookup failed", { error: getErrorMessage(err) });
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
//  Catalog / inventory check
// ────────────────────────────────────────────────────────────────────

export interface SquareItemResult {
  id: string;
  name: string;
  description: string;
  variations: {
    id: string;
    name: string;
    price: string;
    sku: string | null;
    stockCount: number | null;
  }[];
}

export async function squareCheckInventory(params: {
  query: string;
  userId: string;
}): Promise<SquareItemResult[]> {
  const client = await getClient(params.userId);
  if (!client) {
    log.warn("Square not connected, skipping inventory check");
    return [];
  }

  try {
    const r = await fetchWithTimeout(
      `${SQUARE_API_V2}/catalog/search-catalog-items`,
      {
        method: "POST",
        headers: squareHeaders(client.token),
        body: JSON.stringify({ text_filter: { keyword: params.query }, limit: 10 }),
      },
      15_000,
    );
    if (!r.ok) throw new Error(`Square catalog search: ${r.status}`);
    const data = (await r.json()) as { items?: any[] };
    const items = data.items || [];
    if (items.length === 0) return [];

    // Batch-fetch inventory counts for all variation IDs.
    const variationIds: string[] = items.flatMap((item: any) =>
      (item.item_data?.variations || []).map((v: any) => v.id),
    );
    const countMap: Record<string, number> = {};
    if (variationIds.length > 0) {
      try {
        const invR = await fetchWithTimeout(
          `${SQUARE_API_V2}/inventory/counts/batch-retrieve`,
          {
            method: "POST",
            headers: squareHeaders(client.token),
            body: JSON.stringify({ catalog_object_ids: variationIds.slice(0, 100) }),
          },
          10_000,
        );
        if (invR.ok) {
          const invData = (await invR.json()) as {
            counts?: { catalog_object_id: string; quantity: string }[];
          };
          for (const c of invData.counts || []) {
            countMap[c.catalog_object_id] = parseFloat(c.quantity || "0");
          }
        }
      } catch {
        /* non-fatal — return items without stock counts */
      }
    }

    return items.map((item: any): SquareItemResult => {
      const d = item.item_data || {};
      return {
        id: item.id,
        name: d.name || item.id,
        description: d.description || "",
        variations: (d.variations || []).map((v: any) => {
          const vd = v.item_variation_data || {};
          return {
            id: v.id,
            name: vd.name || "Default",
            price: priceMoney(vd.price_money),
            sku: vd.sku || null,
            stockCount: countMap[v.id] ?? null,
          };
        }),
      };
    });
  } catch (err) {
    log.error("Square inventory check failed", { error: getErrorMessage(err) });
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────
//  Payment link creation
// ────────────────────────────────────────────────────────────────────

export interface SquarePaymentLinkResult {
  ok: boolean;
  url?: string;
  orderId?: string;
  message: string;
}

export async function squareCreatePaymentLink(params: {
  title: string;
  amountCents: number;
  currency?: string;
  userId: string;
}): Promise<SquarePaymentLinkResult> {
  const client = await getClient(params.userId);
  if (!client) {
    return { ok: false, message: "Square is not connected for this account." };
  }

  try {
    const locationIds = await getMerchantLocationIds(client.token);
    if (locationIds.length === 0) {
      return { ok: false, message: "No active Square location found, check your Square account." };
    }

    const r = await fetchWithTimeout(
      `${SQUARE_API_V2}/online-checkout/payment-links`,
      {
        method: "POST",
        headers: squareHeaders(client.token),
        body: JSON.stringify({
          idempotency_key: `wl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          quick_pay: {
            name: params.title,
            price_money: {
              amount: params.amountCents,
              currency: params.currency || "USD",
            },
            location_id: locationIds[0],
          },
        }),
      },
      15_000,
    );
    const data = (await r.json()) as {
      payment_link?: { url: string; order_id: string };
      errors?: { detail?: string }[];
    };
    if (!r.ok || !data.payment_link) {
      throw new Error(data.errors?.[0]?.detail || `Square payment link error: ${r.status}`);
    }
    return {
      ok: true,
      url: data.payment_link.url,
      orderId: data.payment_link.order_id,
      message: `Payment link ready: ${data.payment_link.url}`,
    };
  } catch (err) {
    log.error("Square payment link creation failed", { error: getErrorMessage(err) });
    return {
      ok: false,
      message: "Could not create the payment link. A team member will follow up.",
    };
  }
}

export async function disconnectSquare(userId: string): Promise<void> {
  const { revokeCrmProviderTokens } = await import("./oauth-provider-revocation");
  await revokeCrmProviderTokens(userId, "square");
  await drizzle
    .delete(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "square")),
    );
}
