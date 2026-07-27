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
  squareOAuthConfigured,
  getSquareAuthUrl,
  exchangeSquareCode,
  disconnectSquare,
} from "../../lib/square-service";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Square OAuth
//
//  Square uses standard authorization_code flow. Tokens expire in 30
//  days; the service layer auto-refreshes when < 7 days remain.
//  The registered redirect URL is /api/ecommerce/oauth/callback to
//  match what Mike registered in the Square Developer Dashboard.
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/square/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!squareOAuthConfigured()) {
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        error:
          "Missing SQUARE_APPLICATION_ID or SQUARE_APPLICATION_SECRET in environment variables.",
      });
    }
    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/ecommerce/oauth/callback`;
    const uid = req.user?.id as string | undefined;
    const authUrl = getSquareAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid } : undefined),
    );
    res.json({ url: authUrl });
  },
);

router.get("/api/ecommerce/oauth/callback", async (req: express.Request, res: express.Response) => {
  const { code, state, error: oauthError } = req.query as Record<string, string | undefined>;

  if (oauthError) {
    log.warn("Square OAuth error from provider", { oauthError });
    return res
      .status(400)
      .type("text/plain")
      .send("Square authorization was not completed. Please restart the connection.");
  }
  if (!state) {
    return res.status(400).send("Missing OAuth state. Please restart the connect flow.");
  }
  const vs = await verifyAndClaimOAuthState(state as string | undefined);
  if (!vs.ok) {
    return res.status(400).send("Invalid or expired OAuth state. Please restart the connect flow.");
  }
  if (!code || typeof code !== "string") {
    return res.status(400).send("No authorization code provided by Square.");
  }

  try {
    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/ecommerce/oauth/callback`;

    const tokens = await exchangeSquareCode(code, redirectUri);

    const userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
    if (!userId) {
      return res.status(401).send("Could not identify user. Please reconnect from the app.");
    }

    await drizzle
      .insert(schema.crmConnections)
      .values({
        userId,
        provider: "square",
        accessToken: encryptSecret(tokens.access_token),
        refreshToken: encryptSecret(tokens.refresh_token),
        expiresAt: new Date(tokens.expires_at),
        connectedEmail: tokens.merchant_id,
        metadata: { merchant_id: tokens.merchant_id },
      })
      .onConflictDoUpdate({
        target: [schema.crmConnections.userId, schema.crmConnections.provider],
        set: {
          accessToken: encryptSecret(tokens.access_token),
          refreshToken: encryptSecret(tokens.refresh_token),
          expiresAt: new Date(tokens.expires_at),
          connectedEmail: tokens.merchant_id,
          metadata: { merchant_id: tokens.merchant_id },
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
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'square' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Square connected successfully. You can close this window.</p></body></html>
    `);
  } catch (e: any) {
    log.error("Square OAuth callback failed", { error: e?.message || String(e) });
    res.status(500).send("Square authentication failed. Please try again.");
  }
});

router.post(
  "/api/oauth/square/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      await disconnectSquare(userId);
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Square disconnect failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to disconnect Square");
    }
  },
);

export default router;
