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
  zoomOAuthConfigured,
  getZoomAuthUrl,
  exchangeZoomCode,
  disconnectZoom,
} from "../../lib/zoom-service";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Zoom OAuth
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/zoom/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!zoomOAuthConfigured()) {
      return res
        .status(500)
        .json({ error: "Missing ZOOM_CLIENT_ID or ZOOM_CLIENT_SECRET in environment variables." });
    }
    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/zoom/callback`;
    const uid = req.user?.id as string | undefined;
    const authUrl = getZoomAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid } : undefined),
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/zoom/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error: oauthError } = req.query;
    if (oauthError) {
      log.warn("Zoom OAuth authorization was not completed");
      return res
        .status(400)
        .type("text/plain")
        .send("Zoom authorization was not completed. Please restart the connection.");
    }
    const vs = await verifyAndClaimOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res.status(400).send("Invalid or expired OAuth state.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Zoom.");
    }

    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/zoom/callback`;
      const tokens = await exchangeZoomCode(code, redirectUri);

      let userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      const accessTokenZoom = encryptSecret(tokens.access_token);
      const refreshTokenZoom = encryptSecret(tokens.refresh_token);
      const expiresAtZoom = new Date(Date.now() + tokens.expires_in * 1000);

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "zoom",
          instanceUrl: "https://zoom.us",
          accessToken: accessTokenZoom,
          refreshToken: refreshTokenZoom,
          expiresAt: expiresAtZoom,
          connectedEmail: "",
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            accessToken: accessTokenZoom,
            refreshToken: refreshTokenZoom,
            expiresAt: expiresAtZoom,
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
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'zoom' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Zoom connected successfully. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("Zoom OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Zoom authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/zoom/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      await disconnectZoom(userId);
      res.json({ ok: true });
    } catch (err: any) {
      log.error("POST /api/oauth/zoom/disconnect failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to disconnect Zoom");
    }
  },
);

export default router;
