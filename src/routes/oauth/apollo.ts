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
  apolloOAuthConfigured,
  getApolloAuthUrl,
  exchangeApolloCode,
  getApolloUserInfo,
  disconnectApollo,
} from "../../lib/apollo-service";
import { bootstrapDefaultChannel } from "../../lib/slack-service";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Apollo OAuth
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/apollo/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!apolloOAuthConfigured()) {
      return res
        .status(503)
        .json({ error: "Apollo integration is finishing setup. Try again shortly." });
    }
    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/apollo/callback`;
    const uid = req.user?.id as string | undefined;
    const authUrl = getApolloAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid } : undefined),
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/apollo/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error } = req.query;
    if (error) {
      log.warn("Apollo OAuth authorization was not completed");
      return res
        .status(400)
        .type("text/plain")
        .send("Apollo authorization was not completed. Please restart the connection.");
    }
    const vs = await verifyAndClaimOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Apollo.");
    }
    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/apollo/callback`;
      const tokens = await exchangeApolloCode(code, redirectUri);

      const userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      const info = await getApolloUserInfo(tokens.access_token);
      const accessTokenA = encryptSecret(tokens.access_token);
      const refreshTokenA = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
      const expiresAtA = new Date(Date.now() + tokens.expires_in * 1000);

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "apollo",
          accessToken: accessTokenA,
          refreshToken: refreshTokenA,
          expiresAt: expiresAtA,
          connectedEmail: info?.email || info?.team || null,
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            accessToken: accessTokenA,
            refreshToken: refreshTokenA,
            expiresAt: expiresAtA,
            connectedEmail: info?.email || info?.team || null,
            updatedAt: new Date(),
            active: true,
          },
        });

      try {
        await bootstrapDefaultChannel(userId);
      } catch (e: any) {
        log.warn("Slack default channel bootstrap failed", { error: e?.message });
      }

      const targetOrigin =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const cspNonce = generateCspNonce();
      res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
      res.send(`
      <html><body><script nonce="${cspNonce}">
        if (window.opener) {
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'apollo' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Apollo connected successfully. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("Apollo OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Apollo authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/apollo/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      await disconnectApollo(userId);
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Apollo disconnect failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to disconnect Apollo");
    }
  },
);

export default router;
