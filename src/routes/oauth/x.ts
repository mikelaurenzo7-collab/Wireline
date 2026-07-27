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
import { getErrorMessage } from "../../lib/server-utils";
import {
  xOAuthConfigured,
  generatePkcePair,
  getXAuthUrl,
  exchangeXCode,
  fetchXUserProfile,
  disconnectX,
} from "../../lib/x-service";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  X (Twitter) OAuth 2.0 + PKCE
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/x/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!xOAuthConfigured()) {
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        error: "Missing X_CLIENT_ID or X_CLIENT_SECRET in environment variables.",
      });
    }

    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/x/callback`;
    const uid = req.user?.id;
    if (!uid) throw AppError.fromHttpStatus(401, "Unauthorized");
    const { verifier, challenge } = generatePkcePair();
    const authUrl = getXAuthUrl(
      redirectUri,
      generateOAuthState({ userId: uid, pkceVerifier: verifier }),
      challenge,
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/x/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("X OAuth error from provider", { error, error_description });
      return res.status(400).send(`X OAuth error: ${error_description || error}`);
    }

    const vs = await verifyAndClaimOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by X.");
    }
    if (!vs.pkceVerifier) {
      return res.status(400).send("Missing PKCE verifier. Please restart the sign-in flow.");
    }

    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/x/callback`;

      const tokens = await exchangeXCode(code, redirectUri, vs.pkceVerifier);

      let userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      const profile = await fetchXUserProfile(tokens.access_token);
      const username = profile?.username || "";
      const instanceUrl = username ? `https://x.com/${username}` : "https://x.com";
      const connectedEmail = username ? `@${username}` : profile?.name || "";

      const accessTokenX = encryptSecret(tokens.access_token);
      const refreshTokenX = encryptSecret(tokens.refresh_token);
      const expiresAtX = new Date(Date.now() + tokens.expires_in * 1000);
      const metadata = profile
        ? { x_user_id: profile.id, username: profile.username, name: profile.name }
        : null;

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "x",
          instanceUrl,
          accessToken: accessTokenX,
          refreshToken: refreshTokenX,
          expiresAt: expiresAtX,
          connectedEmail,
          metadata,
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            instanceUrl,
            accessToken: accessTokenX,
            refreshToken: refreshTokenX,
            expiresAt: expiresAtX,
            connectedEmail,
            metadata,
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
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'x' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>X connected successfully. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("X OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("X authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/x/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");

    try {
      await disconnectX(userId);
      res.json({ ok: true });
    } catch (err: any) {
      log.error("POST /api/oauth/x/disconnect failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to disconnect X");
    }
  },
);

export default router;
