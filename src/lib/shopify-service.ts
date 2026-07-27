/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptSecret } from "./secret-vault";
import { getErrorMessage } from "./server-utils";

/**
 * Shopify Integration Service — real OAuth 2.0 authorization_code flow.
 *
 * Shopify OAuth is PER-STORE: every merchant has their own
 * `{shop}.myshopify.com` domain, the install URL is built against that
 * domain, and the resulting access token only works for that one store.
 *
 * Tokens are stored encrypted in wireline_crm_connections with
 * provider='shopify'. The shop domain is stored on `instanceUrl` (the
 * `https://{shop}.myshopify.com` origin) and also in `metadata.shop`.
 * Shopify access tokens DO NOT EXPIRE, so there is no refresh logic —
 * simpler than HubSpot/Salesforce.
 *
 * If no connection exists for the Account Holder (they haven't completed the
 * per-store OAuth), every function logs a warning and returns a
 * graceful empty/no-op result — never throws.
 */

// Shopify pins the Admin API to a dated version. Bump when adopting a
// newer release; 2026-04 is current as of this integration.
const SHOPIFY_API_VERSION = "2026-04";

// Strict myshopify-domain matcher. Used everywhere a `shop` value
// crosses a trust boundary (OAuth URL builder, token exchange) to stop
// open-redirect / SSRF — an attacker-supplied `shop` could otherwise
// point the authorize/exchange call at any host.
const SHOP_DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

const SHOPIFY_SCOPES = [
  "read_orders",
  "read_products",
  "read_customers",
  "write_orders",
  "write_draft_orders",
  "read_returns",
  "write_returns",
  "read_inventory",
  "read_fulfillments",
].join(",");

export interface ShopifyOrderResult {
  id: string;
  name: string;
  status: string;
  financial_status: string;
  fulfillment_status: string;
  tracking: { company: string | null; number: string | null; url: string | null }[];
  line_items: { title: string; quantity: number; sku: string | null }[];
  total: string;
  currency: string;
  customer_email: string | null;
}

export interface ShopifyProductResult {
  id: string;
  title: string;
  status: string;
  variants: {
    id: string;
    title: string;
    sku: string | null;
    price: string;
    inventory_quantity: number;
  }[];
}

export interface ShopifyCustomerResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  orders_count: number;
  total_spent: string;
  recent_orders: { name: string; financial_status: string; total: string }[];
}

interface ShopifyConnection {
  id: string;
  accessToken: string;
  instanceUrl: string | null;
  metadata: unknown;
}

// ────────────────────────────────────────────────────────────────────
//  Pure helpers (unit-tested in shopify-service.test.ts)
// ────────────────────────────────────────────────────────────────────

/** True when SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET are both set. */
export function shopifyOAuthConfigured(): boolean {
  return !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
}

/**
 * Validate + normalize a merchant's myshopify domain. Lowercases the
 * input first (Shopify domains are case-insensitive) and rejects
 * anything that isn't exactly `{store}.myshopify.com`. Returns the
 * normalized domain, or null when invalid — callers MUST treat null as
 * a hard reject (no fallback host).
 */
export function normalizeShopDomain(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const shop = raw.trim().toLowerCase();
  if (!SHOP_DOMAIN_RE.test(shop)) return null;
  return shop;
}

/**
 * Build the per-store Shopify install URL. Throws if the shop domain is
 * invalid — the caller (oauth/shopify.ts) catches and returns a 400, which
 * is the right behavior: an unvalidated shop must never reach Shopify.
 */
export function getShopifyAuthUrl(shop: string, redirectUri: string, state: string): string {
  const normalized = normalizeShopDomain(shop);
  if (!normalized) {
    throw new Error("Invalid Shopify shop domain — expected {store}.myshopify.com");
  }
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_CLIENT_ID!,
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${normalized}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verify the HMAC signature Shopify attaches to the OAuth callback
 * query string. Shopify computes HMAC-SHA256 over the query parameters
 * (sorted by key, joined `key=value` with `&`) EXCLUDING `hmac` and
 * `signature`, keyed by the app's client secret.
 *
 * Returns false on any malformation or mismatch — never throws — and
 * uses a constant-time compare to avoid leaking byte-match progress.
 *
 * `query` is the parsed query object (Express `req.query`). `secret`
 * is SHOPIFY_CLIENT_SECRET.
 *
 * Docs: https://shopify.dev/docs/apps/auth/oauth/getting-started#step-3-verify-the-installation
 */
export function verifyShopifyHmac(query: Record<string, unknown>, secret: string): boolean {
  if (!secret) return false;
  const provided = query.hmac;
  if (typeof provided !== "string" || provided.length === 0) return false;

  const message = Object.keys(query)
    .filter((k) => k !== "hmac" && k !== "signature")
    .sort()
    .map((k) => {
      const v = query[k];
      // Express parses repeated params into arrays — Shopify never
      // sends repeated keys on the callback, but coerce defensively.
      const value = Array.isArray(v) ? v.join(",") : String(v);
      return `${k}=${value}`;
    })
    .join("&");

  const digest = createHmac("sha256", secret).update(message).digest("hex");

  // Constant-time compare. timingSafeEqual throws on length mismatch,
  // so guard the length first (a length mismatch is already a reject).
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ────────────────────────────────────────────────────────────────────
//  OAuth token exchange
// ────────────────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for a permanent access token. POSTs
 * to the store's `/admin/oauth/access_token` with a JSON body. Throws
 * on a bad shop domain or a non-OK response — the OAuth callback
 * catches and renders a failure page.
 */
export async function exchangeShopifyCode(
  shop: string,
  code: string,
): Promise<{ access_token: string; scope: string; shop: string }> {
  const normalized = normalizeShopDomain(shop);
  if (!normalized) {
    throw new Error("Invalid Shopify shop domain — expected {store}.myshopify.com");
  }

  const r = await fetchWithTimeout(
    `https://${normalized}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID!,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET!,
        code,
      }),
    },
    15_000,
  );
  const data = (await r.json()) as { access_token?: string; scope?: string; errors?: unknown };
  if (!r.ok || !data.access_token) {
    throw new Error(
      typeof data.errors === "string" ? data.errors : "Shopify token exchange failed",
    );
  }
  return { access_token: data.access_token, scope: data.scope || "", shop: normalized };
}

// ────────────────────────────────────────────────────────────────────
//  Connection / token retrieval
// ────────────────────────────────────────────────────────────────────

async function getConnection(userId: string): Promise<ShopifyConnection | null> {
  if (!userId) return null;
  const [data] = await drizzle
    .select({
      id: schema.crmConnections.id,
      accessToken: schema.crmConnections.accessToken,
      instanceUrl: schema.crmConnections.instanceUrl,
      metadata: schema.crmConnections.metadata,
    })
    .from(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "shopify")),
    )
    .limit(1);
  return data || null;
}

/**
 * Resolve the store's API base URL + decrypted access token for a
 * tenant. Returns null when no Shopify connection exists. The shop
 * domain is read from `metadata.shop` (preferred) and falls back to
 * parsing `instanceUrl` for older rows.
 */
async function getStoreClient(
  userId: string,
): Promise<{ apiBase: string; token: string; shop: string } | null> {
  const conn = await getConnection(userId);
  if (!conn) return null;

  let shop: string | null = null;
  const meta = conn.metadata as { shop?: unknown } | null;
  if (meta && typeof meta.shop === "string") {
    shop = normalizeShopDomain(meta.shop);
  }
  if (!shop && conn.instanceUrl) {
    try {
      shop = normalizeShopDomain(new URL(conn.instanceUrl).host);
    } catch {
      /* malformed instanceUrl — fall through */
    }
  }
  if (!shop) {
    log.warn("Shopify connection has no usable shop domain", { userId });
    return null;
  }

  let token: string;
  try {
    token = decryptSecret(conn.accessToken);
  } catch (err) {
    log.error("Shopify token decrypt failed", { error: getErrorMessage(err) });
    return null;
  }

  return {
    apiBase: `https://${shop}/admin/api/${SHOPIFY_API_VERSION}`,
    token,
    shop,
  };
}

function shopifyHeaders(token: string): Record<string, string> {
  return {
    "X-Shopify-Access-Token": token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ────────────────────────────────────────────────────────────────────
//  Storefront operations
// ────────────────────────────────────────────────────────────────────

function mapOrder(o: any): ShopifyOrderResult {
  const fulfillments: any[] = Array.isArray(o.fulfillments) ? o.fulfillments : [];
  const tracking = fulfillments.map((f: any) => ({
    company: f.tracking_company || null,
    number:
      f.tracking_number ||
      (Array.isArray(f.tracking_numbers) ? f.tracking_numbers[0] : null) ||
      null,
    url: f.tracking_url || (Array.isArray(f.tracking_urls) ? f.tracking_urls[0] : null) || null,
  }));
  return {
    id: String(o.id),
    name: o.name || `#${o.order_number ?? o.id}`,
    status: o.cancelled_at ? "cancelled" : o.closed_at ? "closed" : "open",
    financial_status: o.financial_status || "unknown",
    fulfillment_status: o.fulfillment_status || "unfulfilled",
    tracking,
    line_items: (Array.isArray(o.line_items) ? o.line_items : []).map((li: any) => ({
      title: li.title || li.name || "",
      quantity: Number(li.quantity) || 0,
      sku: li.sku || null,
    })),
    total: o.total_price || "0.00",
    currency: o.currency || "USD",
    customer_email: o.email || o.contact_email || null,
  };
}

/**
 * Look up a single order by order number (e.g. "1001" or "#1001") or
 * by customer email. Returns the most recent matching order, or null
 * when nothing matches / Shopify isn't connected.
 */
export async function lookupOrder(params: {
  orderNumber?: string;
  email?: string;
  userId: string;
}): Promise<ShopifyOrderResult | null> {
  const client = await getStoreClient(params.userId);
  if (!client) {
    log.warn("Shopify not connected — skipping order lookup");
    return null;
  }

  try {
    const qs = new URLSearchParams({
      status: "any",
      limit: "5",
      order: "created_at desc",
    });
    if (params.orderNumber) {
      // Shopify's `name` filter matches the customer-facing order name.
      // Accept both "1001" and "#1001" from the caller.
      const name = params.orderNumber.startsWith("#")
        ? params.orderNumber
        : `#${params.orderNumber}`;
      qs.set("name", name);
    }
    if (params.email) qs.set("email", params.email);

    const res = await fetchWithTimeout(
      `${client.apiBase}/orders.json?${qs.toString()}`,
      { headers: shopifyHeaders(client.token) },
      15_000,
    );
    if (!res.ok) throw new Error(`Shopify orders error: ${res.status}`);
    const data = (await res.json()) as { orders?: any[] };
    const orders = data.orders || [];
    if (orders.length === 0) return null;
    return mapOrder(orders[0]);
  } catch (err) {
    log.error("Shopify order lookup failed", { error: getErrorMessage(err) });
    return null;
  }
}

/**
 * Search products by title/keyword and return their variants with live
 * inventory levels. Returns [] when nothing matches / not connected.
 */
export async function searchProducts(params: {
  query: string;
  userId: string;
}): Promise<ShopifyProductResult[]> {
  const client = await getStoreClient(params.userId);
  if (!client) {
    log.warn("Shopify not connected — skipping product search");
    return [];
  }

  try {
    const qs = new URLSearchParams({ title: params.query, limit: "10" });
    const res = await fetchWithTimeout(
      `${client.apiBase}/products.json?${qs.toString()}`,
      { headers: shopifyHeaders(client.token) },
      15_000,
    );
    if (!res.ok) throw new Error(`Shopify products error: ${res.status}`);
    const data = (await res.json()) as { products?: any[] };
    return (data.products || []).map((p: any) => ({
      id: String(p.id),
      title: p.title || "",
      status: p.status || "active",
      variants: (Array.isArray(p.variants) ? p.variants : []).map((v: any) => ({
        id: String(v.id),
        title: v.title || "Default",
        sku: v.sku || null,
        price: v.price || "0.00",
        inventory_quantity: Number(v.inventory_quantity) || 0,
      })),
    }));
  } catch (err) {
    log.error("Shopify product search failed", { error: getErrorMessage(err) });
    return [];
  }
}

/**
 * Look up a customer by email or phone, including a short slice of
 * their recent order history. Returns null when no match / not
 * connected.
 */
export async function lookupCustomer(params: {
  email?: string;
  phone?: string;
  userId: string;
}): Promise<ShopifyCustomerResult | null> {
  const client = await getStoreClient(params.userId);
  if (!client) {
    log.warn("Shopify not connected — skipping customer lookup");
    return null;
  }

  try {
    const term = params.email
      ? `email:${params.email}`
      : params.phone
        ? `phone:${params.phone}`
        : "";
    if (!term) return null;

    const res = await fetchWithTimeout(
      `${client.apiBase}/customers/search.json?query=${encodeURIComponent(term)}&limit=1`,
      { headers: shopifyHeaders(client.token) },
      15_000,
    );
    if (!res.ok) throw new Error(`Shopify customer search error: ${res.status}`);
    const data = (await res.json()) as { customers?: any[] };
    const customer = (data.customers || [])[0];
    if (!customer) return null;

    // Best-effort recent orders — failure here doesn't fail the lookup.
    let recent: ShopifyCustomerResult["recent_orders"] = [];
    try {
      const ordRes = await fetchWithTimeout(
        `${client.apiBase}/customers/${customer.id}/orders.json?status=any&limit=5&order=created_at desc`,
        { headers: shopifyHeaders(client.token) },
        10_000,
      );
      if (ordRes.ok) {
        const ordData = (await ordRes.json()) as { orders?: any[] };
        recent = (ordData.orders || []).map((o: any) => ({
          name: o.name || `#${o.order_number ?? o.id}`,
          financial_status: o.financial_status || "unknown",
          total: o.total_price || "0.00",
        }));
      }
    } catch {
      /* non-fatal */
    }

    return {
      id: String(customer.id),
      first_name: customer.first_name || "",
      last_name: customer.last_name || "",
      email: customer.email || null,
      phone: customer.phone || null,
      orders_count: Number(customer.orders_count) || 0,
      total_spent: customer.total_spent || "0.00",
      recent_orders: recent,
    };
  } catch (err) {
    log.error("Shopify customer lookup failed", { error: getErrorMessage(err) });
    return null;
  }
}

/**
 * Start a return for an order. This OPENS a return request via the
 * Shopify Returns API — it deliberately does NOT issue a refund.
 * Refunds stay merchant-approved: an agent can initiate the return, a
 * human approves the money movement.
 *
 * Returns `{ ok, returnId?, message }`.
 */
export async function startReturn(params: {
  orderId: string;
  reason: string;
  userId: string;
}): Promise<{ ok: boolean; returnId?: string; message: string }> {
  const client = await getStoreClient(params.userId);
  if (!client) {
    log.warn("Shopify not connected — skipping return start");
    return { ok: false, message: "Shopify is not connected." };
  }

  try {
    // The Returns API needs the fulfillment line items, not the order
    // line items. Pull the order's fulfillment-line-items so we can
    // request a return for everything that shipped.
    const fliRes = await fetchWithTimeout(
      `${client.apiBase}/orders/${params.orderId}/fulfillment_orders.json`,
      { headers: shopifyHeaders(client.token) },
      15_000,
    );
    if (!fliRes.ok) throw new Error(`Shopify fulfillment_orders error: ${fliRes.status}`);
    const fliData = (await fliRes.json()) as { fulfillment_orders?: any[] };
    const fulfillmentOrders = fliData.fulfillment_orders || [];

    const returnLineItems: { fulfillment_line_item_id: number; quantity: number }[] = [];
    for (const fo of fulfillmentOrders) {
      for (const li of fo.line_items || []) {
        const qty = Number(li.quantity) || 0;
        if (qty > 0) {
          returnLineItems.push({ fulfillment_line_item_id: li.id, quantity: qty });
        }
      }
    }
    if (returnLineItems.length === 0) {
      return {
        ok: false,
        message: "No fulfilled items found on that order to return.",
      };
    }

    // Map the free-text reason onto Shopify's accepted return-reason
    // enum, defaulting to OTHER.
    const reasonText = (params.reason || "").toLowerCase();
    const returnReason =
      reasonText.includes("size") || reasonText.includes("fit")
        ? "SIZE_TOO_SMALL"
        : reasonText.includes("defect") ||
            reasonText.includes("damage") ||
            reasonText.includes("broken")
          ? "DEFECTIVE"
          : reasonText.includes("wrong")
            ? "WRONG_ITEM"
            : reasonText.includes("late")
              ? "NOT_AS_DESCRIBED"
              : "OTHER";

    const res = await fetchWithTimeout(
      `${client.apiBase}/returns.json`,
      {
        method: "POST",
        headers: shopifyHeaders(client.token),
        body: JSON.stringify({
          return: {
            order_id: Number(params.orderId),
            return_line_items: returnLineItems.map((li) => ({
              ...li,
              return_reason: returnReason,
              return_reason_note: params.reason || "",
            })),
            notify_customer: true,
          },
        }),
      },
      15_000,
    );
    const data = (await res.json()) as { return?: { id?: unknown }; errors?: unknown };
    if (!res.ok || !data.return?.id) {
      throw new Error(
        typeof data.errors === "string" ? data.errors : `Return error: ${res.status}`,
      );
    }
    return {
      ok: true,
      returnId: String(data.return.id),
      message: "Return request opened. A team member will review and approve any refund.",
    };
  } catch (err) {
    log.error("Shopify start return failed", { error: getErrorMessage(err) });
    return { ok: false, message: "Could not start the return. A team member will follow up." };
  }
}

/**
 * Cancel an order. Shopify's cancel endpoint does NOT auto-refund
 * unless asked — we pass no refund instruction, so money movement
 * stays merchant-controlled.
 */
export async function cancelOrder(params: {
  orderId: string;
  userId: string;
}): Promise<{ ok: boolean; message: string }> {
  const client = await getStoreClient(params.userId);
  if (!client) {
    log.warn("Shopify not connected — skipping order cancel");
    return { ok: false, message: "Shopify is not connected." };
  }

  try {
    const res = await fetchWithTimeout(
      `${client.apiBase}/orders/${params.orderId}/cancel.json`,
      {
        method: "POST",
        headers: shopifyHeaders(client.token),
        body: JSON.stringify({ email: true }),
      },
      15_000,
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { errors?: unknown };
      throw new Error(
        typeof data.errors === "string" ? data.errors : `Cancel error: ${res.status}`,
      );
    }
    return { ok: true, message: "Order cancelled." };
  } catch (err) {
    log.error("Shopify cancel order failed", { error: getErrorMessage(err) });
    return { ok: false, message: "Could not cancel the order. A team member will follow up." };
  }
}

/**
 * Update the shipping address on an order. Only writes the
 * `shipping_address` block — useful before fulfillment when a customer
 * realizes they gave the wrong address.
 */
export async function updateOrderShippingAddress(params: {
  orderId: string;
  address: {
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    country?: string;
    name?: string;
  };
  userId: string;
}): Promise<{ ok: boolean; message: string }> {
  const client = await getStoreClient(params.userId);
  if (!client) {
    log.warn("Shopify not connected — skipping address update");
    return { ok: false, message: "Shopify is not connected." };
  }

  try {
    const res = await fetchWithTimeout(
      `${client.apiBase}/orders/${params.orderId}.json`,
      {
        method: "PUT",
        headers: shopifyHeaders(client.token),
        body: JSON.stringify({
          order: {
            id: Number(params.orderId),
            shipping_address: params.address,
          },
        }),
      },
      15_000,
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { errors?: unknown };
      throw new Error(
        typeof data.errors === "string" ? data.errors : `Address update error: ${res.status}`,
      );
    }
    return { ok: true, message: "Shipping address updated." };
  } catch (err) {
    log.error("Shopify update shipping address failed", { error: getErrorMessage(err) });
    return {
      ok: false,
      message: "Could not update the shipping address. A team member will follow up.",
    };
  }
}

/**
 * Create a draft order — a not-yet-paid order an agent can build for a
 * customer (e.g. a phone order). The merchant then sends an invoice /
 * collects payment. Returns the draft order's id + invoice URL.
 */
export async function createDraftOrder(params: {
  lineItems: { variantId?: string; title?: string; quantity: number; price?: string }[];
  customer?: { email?: string; first_name?: string; last_name?: string };
  userId: string;
}): Promise<{ ok: boolean; draftOrderId?: string; invoiceUrl?: string; message: string }> {
  const client = await getStoreClient(params.userId);
  if (!client) {
    log.warn("Shopify not connected — skipping draft order create");
    return { ok: false, message: "Shopify is not connected." };
  }

  try {
    const lineItems = (params.lineItems || []).map((li) => {
      if (li.variantId) {
        return { variant_id: Number(li.variantId), quantity: li.quantity };
      }
      // Custom line item — Shopify requires a title + price when there
      // is no variant_id.
      return {
        title: li.title || "Custom item",
        price: li.price || "0.00",
        quantity: li.quantity,
      };
    });
    if (lineItems.length === 0) {
      return { ok: false, message: "No line items supplied for the draft order." };
    }

    const draftOrder: Record<string, unknown> = { line_items: lineItems };
    if (params.customer?.email) {
      draftOrder.customer = {
        email: params.customer.email,
        first_name: params.customer.first_name || "",
        last_name: params.customer.last_name || "",
      };
    }

    const res = await fetchWithTimeout(
      `${client.apiBase}/draft_orders.json`,
      {
        method: "POST",
        headers: shopifyHeaders(client.token),
        body: JSON.stringify({ draft_order: draftOrder }),
      },
      15_000,
    );
    const data = (await res.json()) as {
      draft_order?: { id?: unknown; invoice_url?: unknown };
      errors?: unknown;
    };
    if (!res.ok || !data.draft_order?.id) {
      throw new Error(
        typeof data.errors === "string" ? data.errors : `Draft order error: ${res.status}`,
      );
    }
    return {
      ok: true,
      draftOrderId: String(data.draft_order.id),
      invoiceUrl:
        typeof data.draft_order.invoice_url === "string" ? data.draft_order.invoice_url : undefined,
      message: "Draft order created.",
    };
  } catch (err) {
    log.error("Shopify create draft order failed", { error: getErrorMessage(err) });
    return {
      ok: false,
      message: "Could not create the draft order. A team member will follow up.",
    };
  }
}

/**
 * Append an internal note on an order (merchant-visible in Shopify admin).
 */
export async function addOrderNote(params: {
  orderId: string;
  note: string;
  userId: string;
}): Promise<{ ok: boolean; message: string }> {
  const client = await getStoreClient(params.userId);
  if (!client) {
    return { ok: false, message: "Shopify is not connected." };
  }
  const note = String(params.note || "").trim();
  if (!note) return { ok: false, message: "Note text is required." };
  try {
    const res = await fetchWithTimeout(
      `${client.apiBase}/orders/${params.orderId}.json`,
      {
        method: "PUT",
        headers: shopifyHeaders(client.token),
        body: JSON.stringify({ order: { id: Number(params.orderId), note } }),
      },
      15_000,
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { errors?: unknown };
      throw new Error(typeof data.errors === "string" ? data.errors : `Note error: ${res.status}`);
    }
    return { ok: true, message: "Order note saved for the merchant team." };
  } catch (err) {
    log.error("Shopify add order note failed", { error: getErrorMessage(err) });
    return { ok: false, message: "Could not save the order note." };
  }
}
/** Remove the Shopify connection for a tenant. */
export async function disconnectShopify(userId: string): Promise<void> {
  const { revokeCrmProviderTokens } = await import("./oauth-provider-revocation");
  await revokeCrmProviderTokens(userId, "shopify");
  await drizzle
    .delete(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "shopify")),
    );
}
