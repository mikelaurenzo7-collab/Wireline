/* eslint-disable @typescript-eslint/no-explicit-any -- Shopify Storefront API returns vendor-defined GraphQL envelopes. */
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { drizzle, fetchWithTimeout, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { normalizeShopDomain } from "./shopify-service";

const STOREFRONT_API_VERSION = "2026-04";

export interface StorefrontMoney {
  amount: string;
  currencyCode: string;
}

export interface StorefrontVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  price: StorefrontMoney;
}

export interface StorefrontProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  availableForSale: boolean;
  imageUrl?: string;
  imageAlt?: string;
  minPrice: StorefrontMoney;
  maxPrice: StorefrontMoney;
  variants: StorefrontVariant[];
}

export interface StorefrontCollection {
  id: string;
  handle: string;
  title: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
}

export interface StorefrontCatalog {
  shop: string;
  primaryDomainUrl?: string;
  products: StorefrontProduct[];
  collections: StorefrontCollection[];
}

export interface StorefrontCart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost?: {
    subtotalAmount?: StorefrontMoney;
    totalAmount?: StorefrontMoney;
  };
  lines: Array<{
    id: string;
    quantity: number;
    title: string;
    merchandiseId: string;
  }>;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

async function getConnectedShopifyShop(userId: string): Promise<{ shop: string } | null> {
  const [connection] = await drizzle
    .select({ instanceUrl: schema.crmConnections.instanceUrl, metadata: schema.crmConnections.metadata })
    .from(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, "shopify")),
    )
    .limit(1);

  if (!connection) return null;
  const meta = connection.metadata as { shop?: unknown } | null;
  let shop = meta && typeof meta.shop === "string" ? normalizeShopDomain(meta.shop) : null;
  if (!shop && connection.instanceUrl) {
    try {
      shop = normalizeShopDomain(new URL(connection.instanceUrl).host);
    } catch {
      /* malformed legacy instanceUrl */
    }
  }
  return shop ? { shop } : null;
}

async function storefrontGraphql<T>(
  shop: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetchWithTimeout(
    `https://${shop}/api/${STOREFRONT_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    },
    15_000,
  );
  const json = (await response.json()) as GraphqlResponse<T>;
  if (!response.ok || json.errors?.length || !json.data) {
    const message = json.errors?.map((e) => e.message).filter(Boolean).join("; ");
    throw new Error(message || `Shopify Storefront API failed with ${response.status}`);
  }
  return json.data;
}

const CATALOG_QUERY = `query WirelineCatalog($productsFirst: Int!, $collectionsFirst: Int!) {
  shop { primaryDomain { url } }
  products(first: $productsFirst) {
    edges { node {
      id handle title description availableForSale
      featuredImage { url altText }
      priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
      variants(first: 10) { edges { node { id title availableForSale price { amount currencyCode } } } }
    } }
  }
  collections(first: $collectionsFirst) {
    edges { node { id handle title description image { url altText } } }
  }
}`;

const CART_CREATE_MUTATION = `mutation WirelineCartCreate($lines: [CartLineInput!]) {
  cartCreate(input: { lines: $lines }) {
    cart { id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } } lines(first: 20) { edges { node { id quantity merchandise { ... on ProductVariant { id title product { title } } } } } } }
    userErrors { field message }
  }
}`;

const CART_LINES_ADD_MUTATION = `mutation WirelineCartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
  cartLinesAdd(cartId: $cartId, lines: $lines) {
    cart { id checkoutUrl totalQuantity cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } } lines(first: 20) { edges { node { id quantity merchandise { ... on ProductVariant { id title product { title } } } } } } }
    userErrors { field message }
  }
}`;

function money(value: unknown): StorefrontMoney {
  const v = value as Partial<StorefrontMoney> | null;
  return { amount: String(v?.amount ?? "0.00"), currencyCode: String(v?.currencyCode ?? "USD") };
}

function mapCart(raw: any): StorefrontCart {
  return {
    id: String(raw.id),
    checkoutUrl: String(raw.checkoutUrl || ""),
    totalQuantity: Number(raw.totalQuantity) || 0,
    cost: raw.cost,
    lines: (raw.lines?.edges ?? []).map((edge: any) => {
      const line = edge.node;
      const merch = line?.merchandise;
      return {
        id: String(line?.id || ""),
        quantity: Number(line?.quantity) || 0,
        title: merch?.product?.title || merch?.title || "Product",
        merchandiseId: String(merch?.id || ""),
      };
    }),
  };
}

export async function loadShopifyStorefrontStatus(userId: string): Promise<{
  connected: boolean;
  shop?: string;
  primaryDomainUrl?: string;
  apiVersion: string;
  error?: string;
}> {
  const connected = await getConnectedShopifyShop(userId);
  if (!connected) return { connected: false, apiVersion: STOREFRONT_API_VERSION };
  try {
    const catalog = await loadShopifyStorefrontCatalog({ userId, productsFirst: 1, collectionsFirst: 1 });
    return {
      connected: true,
      shop: connected.shop,
      primaryDomainUrl: catalog.primaryDomainUrl,
      apiVersion: STOREFRONT_API_VERSION,
    };
  } catch (error) {
    log.warn("Shopify Storefront status failed", { error: getErrorMessage(error) });
    return {
      connected: true,
      shop: connected.shop,
      apiVersion: STOREFRONT_API_VERSION,
      error: getErrorMessage(error),
    };
  }
}

export async function loadShopifyStorefrontCatalog(params: {
  userId: string;
  productsFirst?: number;
  collectionsFirst?: number;
}): Promise<StorefrontCatalog> {
  const connected = await getConnectedShopifyShop(params.userId);
  if (!connected) throw new Error("Connect Shopify before generating a live storefront catalog.");
  const productsFirst = Math.min(Math.max(params.productsFirst ?? 12, 1), 24);
  const collectionsFirst = Math.min(Math.max(params.collectionsFirst ?? 6, 1), 12);
  const data = await storefrontGraphql<any>(connected.shop, CATALOG_QUERY, { productsFirst, collectionsFirst });

  return {
    shop: connected.shop,
    primaryDomainUrl: data.shop?.primaryDomain?.url,
    products: (data.products?.edges ?? []).map((edge: any) => {
      const node = edge.node;
      return {
        id: String(node.id),
        handle: String(node.handle || ""),
        title: String(node.title || "Untitled product"),
        description: String(node.description || ""),
        availableForSale: node.availableForSale !== false,
        imageUrl: node.featuredImage?.url,
        imageAlt: node.featuredImage?.altText || undefined,
        minPrice: money(node.priceRange?.minVariantPrice),
        maxPrice: money(node.priceRange?.maxVariantPrice),
        variants: (node.variants?.edges ?? []).map((variantEdge: any) => {
          const variant = variantEdge.node;
          return {
            id: String(variant.id),
            title: String(variant.title || "Default"),
            availableForSale: variant.availableForSale !== false,
            price: money(variant.price),
          };
        }),
      };
    }),
    collections: (data.collections?.edges ?? []).map((edge: any) => {
      const node = edge.node;
      return {
        id: String(node.id),
        handle: String(node.handle || ""),
        title: String(node.title || "Untitled collection"),
        description: String(node.description || ""),
        imageUrl: node.image?.url,
        imageAlt: node.image?.altText || undefined,
      };
    }),
  };
}

export async function createShopifyStorefrontCart(params: {
  userId: string;
  lines: Array<{ merchandiseId: string; quantity: number }>;
}): Promise<StorefrontCart> {
  const connected = await getConnectedShopifyShop(params.userId);
  if (!connected) throw new Error("Connect Shopify before creating a storefront cart.");
  const data = await storefrontGraphql<any>(connected.shop, CART_CREATE_MUTATION, { lines: params.lines });
  const errors = data.cartCreate?.userErrors ?? [];
  if (errors.length) throw new Error(errors.map((e: any) => e.message).join("; "));
  return mapCart(data.cartCreate.cart);
}

export async function addShopifyStorefrontCartLines(params: {
  userId: string;
  cartId: string;
  lines: Array<{ merchandiseId: string; quantity: number }>;
}): Promise<StorefrontCart> {
  const connected = await getConnectedShopifyShop(params.userId);
  if (!connected) throw new Error("Connect Shopify before updating a storefront cart.");
  const data = await storefrontGraphql<any>(connected.shop, CART_LINES_ADD_MUTATION, {
    cartId: params.cartId,
    lines: params.lines,
  });
  const errors = data.cartLinesAdd?.userErrors ?? [];
  if (errors.length) throw new Error(errors.map((e: any) => e.message).join("; "));
  return mapCart(data.cartLinesAdd.cart);
}
