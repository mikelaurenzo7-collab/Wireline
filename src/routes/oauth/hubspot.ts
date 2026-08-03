/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { AppError } from "../../lib/api-error";
import { eq } from "drizzle-orm";
import { drizzle, log, IS_PROD } from "../../lib/server-context";
import * as schema from "../../db/schema";
import { encryptSecret } from "../../lib/secret-vault";
import { oauthRateLimiter } from "../../middleware/rate-limit-middleware";
import { authenticateUser } from "../../middleware/auth";
import {
  generateOAuthState,
  verifyAndClaimOAuthState,
  resolveLinkedOAuthUserId,
} from "../../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../../lib/csp";
import {
  hsOAuthConfigured,
  getHubSpotAuthUrl,
  exchangeHubSpotCode,
  disconnectHubSpot,
} from "../../lib/hubspot-service";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  HubSpot OAuth
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/hubspot/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!hsOAuthConfigured()) {
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        error: "Missing HUBSPOT_CLIENT_ID or HUBSPOT_CLIENT_SECRET in environment variables.",
      });
    }

    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/hubspot/callback`;
    const uid = req.user?.id as string | undefined;
    const authUrl = getHubSpotAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid } : undefined),
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/hubspot/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error } = req.query;
    if (error) {
      log.warn("HubSpot OAuth authorization was not completed");
      return res
        .status(400)
        .type("text/plain")
        .send("HubSpot authorization was not completed. Please restart the connection.");
    }

    const vs = await verifyAndClaimOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by HubSpot.");
    }

    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/hubspot/callback`;

      const tokens = await exchangeHubSpotCode(code, redirectUri);

      const userId = await resolveLinkedOAuthUserId(req, vs);

      if (!userId) {
        return res
          .status(401)
          .send("Complete this connection in the same browser and Wireline account that started it.");
      }

      // Fetch HubSpot account info for display
      const infoRes = await fetch("https://api.hubapi.com/account-info/v3/details", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const info = infoRes.ok ? ((await infoRes.json()) as any) : {};

      const accessTokenHs = encryptSecret(tokens.access_token);
      const refreshTokenHs = encryptSecret(tokens.refresh_token);
      const expiresAtHs = new Date(Date.now() + tokens.expires_in * 1000);
      const instanceUrlHs = `https://app.hubspot.com/contacts/${info.portalId || ""}`;
      const connectedAccountHs = info.accountType || "";

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "hubspot",
          instanceUrl: instanceUrlHs,
          accessToken: accessTokenHs,
          refreshToken: refreshTokenHs,
          expiresAt: expiresAtHs,
          connectedEmail: connectedAccountHs,
          portalId: info.portalId ? String(info.portalId) : null,
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            instanceUrl: instanceUrlHs,
            accessToken: accessTokenHs,
            refreshToken: refreshTokenHs,
            expiresAt: expiresAtHs,
            connectedEmail: connectedAccountHs,
            portalId: info.portalId ? String(info.portalId) : null,
            updatedAt: new Date(),
            active: true,
          },
        });

      await drizzle
        .update(schema.settings)
        .set({ crmType: "hubspot" })
        .where(eq(schema.settings.userId, userId));

      const targetOrigin =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const cspNonce = generateCspNonce();
      res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
      res.send(`
      <html><body><script nonce="${cspNonce}">
        if (window.opener) {
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'hubspot' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>HubSpot connected successfully. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("HubSpot OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("HubSpot authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/hubspot/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");

    try {
      await disconnectHubSpot(userId);
      res.json({ ok: true });
    } catch (e: any) {
      log.error("HubSpot disconnect failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to disconnect HubSpot");
    }
  },
);

export default router;
