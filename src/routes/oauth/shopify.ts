/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { AppError } from "../../lib/api-error";
import { drizzle, log, IS_PROD } from "../../lib/server-context";
import * as schema from "../../db/schema";
import { encryptSecret } from "../../lib/secret-vault";
import { oauthRateLimiter } from "../../middleware/rate-limit-middleware";
import { authenticateUser } from "../../middleware/auth";
import {
  generateOAuthState,
  verifyAndClaimOAuthState,
  resolveUserIdFromOAuthSession,
} from "../../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../../lib/csp";
import {
  shopifyOAuthConfigured,
  getShopifyAuthUrl,
  exchangeShopifyCode,
  verifyShopifyHmac,
  normalizeShopDomain,
  disconnectShopify,
} from "../../lib/shopify-service";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Shopify OAuth — PER-STORE.
//
//  Unlike the other connectors, Shopify OAuth is scoped to a single
//  merchant store. The /url endpoint takes a `shop` query param (the
//  merchant's `{store}.myshopify.com` domain), which is strictly
//  validated against `normalizeShopDomain` before it is ever placed in
//  a URL — an unvalidated shop is an open-redirect / SSRF vector.
//
//  The callback additionally verifies the HMAC signature Shopify
//  attaches to the query string (HMAC-SHA256 over the sorted params
//  minus `hmac`, keyed by the client secret). Shopify access tokens
//  do NOT expire, so there is no refresh logic.
//
//  The store's myshopify domain is persisted on `instanceUrl` (as the
//  full origin) and in `metadata.shop` so shopify-service can rebuild
//  the per-store API base on every call.
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/shopify/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!shopifyOAuthConfigured()) {
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        error: "Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET in environment variables.",
      });
    }

    // The merchant's myshopify domain. Validate STRICTLY — reject
    // anything that isn't exactly `{store}.myshopify.com` so the
    // authorize URL can never be pointed at an attacker host.
    const shop = normalizeShopDomain(req.query.shop);
    if (!shop) {
      return res.status(400).json({
        code: "BAD_REQUEST",
        error: "A valid Shopify store domain is required (e.g. your-store.myshopify.com).",
      });
    }

    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/shopify/callback`;
    const uid = req.user?.id as string | undefined;
    try {
      const authUrl = getShopifyAuthUrl(
        shop,
        redirectUri,
        generateOAuthState(uid ? { userId: uid } : undefined),
      );
      res.json({ url: authUrl });
    } catch (e: any) {
      res.status(400).json({
        code: "BAD_REQUEST",
        error: e?.message || "Invalid Shopify store domain.",
      });
    }
  },
);

router.get(
  "/api/oauth/shopify/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, shop, error } = req.query;
    if (error) {
      log.warn("Shopify OAuth error from provider", { error });
      return res.status(400).send(`Shopify OAuth error: ${error}`);
    }

    // Verify the HMAC signature BEFORE trusting any other query value —
    // this proves the callback genuinely came from Shopify.
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!clientSecret || !verifyShopifyHmac(req.query as Record<string, unknown>, clientSecret)) {
      log.warn("Shopify OAuth callback HMAC verification failed");
      return res
        .status(400)
        .send("Shopify request verification failed. Please restart the connect flow.");
    }

    const vs = await verifyAndClaimOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the connect flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Shopify.");
    }
    const shopDomain = normalizeShopDomain(shop);
    if (!shopDomain) {
      return res.status(400).send("Shopify returned an invalid store domain.");
    }

    try {
      const tokens = await exchangeShopifyCode(shopDomain, code);

      const userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      // Shopify tokens never expire — no expiresAt, no refresh token.
      // Store the shop domain on instanceUrl (full origin, so the
      // status card's "open" link works) AND in metadata.shop so
      // shopify-service can resolve the per-store API base.
      const accessTokenShopify = encryptSecret(tokens.access_token);
      const instanceUrlShopify = `https://${tokens.shop}`;
      const shopifyMetadata = { shop: tokens.shop, scope: tokens.scope };

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "shopify",
          instanceUrl: instanceUrlShopify,
          accessToken: accessTokenShopify,
          connectedEmail: tokens.shop,
          metadata: shopifyMetadata,
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            instanceUrl: instanceUrlShopify,
            accessToken: accessTokenShopify,
            connectedEmail: tokens.shop,
            metadata: shopifyMetadata,
            updatedAt: new Date(),
            active: true,
          },
        });

      const targetOrigin =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const cspNonce = generateCspNonce();
      res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
      res.send(`
      <html><body><script nonce="${cspNonce}">
        if (window.opener) {
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'shopify' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Shopify connected successfully. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("Shopify OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Shopify authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/shopify/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      await disconnectShopify(userId);
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Shopify disconnect failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to disconnect Shopify");
    }
  },
);

export default router;
