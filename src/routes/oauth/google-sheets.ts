/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { AppError } from "../../lib/api-error";
import { google } from "googleapis";
import { drizzle, log, IS_PROD } from "../../lib/server-context";
import * as schema from "../../db/schema";
import { encryptSecret } from "../../lib/secret-vault";
import { oauthRateLimiter } from "../../middleware/rate-limit-middleware";
import { authenticateUser } from "../../middleware/auth";
import {
  getGoogleOAuthClient,
  generateOAuthState,
  verifyAndClaimOAuthState,
  resolveLinkedOAuthUserId,
} from "../../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../../lib/csp";
import {
  googleSheetsConfigured,
  getGoogleSheetsAuthUrl,
  exchangeGoogleSheetsCode,
  disconnectGoogleSheets,
} from "../../lib/google-sheets-service";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Google Sheets OAuth
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/google_sheets/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!googleSheetsConfigured()) {
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables.",
      });
    }

    const uid = req.user?.id as string | undefined;
    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/google_sheets/callback`;
    const state = generateOAuthState(uid ? { userId: uid } : undefined);
    const authUrl = getGoogleSheetsAuthUrl(redirectUri, state);

    res.json({ url: authUrl });
  },
);

router.get(
  ["/api/oauth/google_sheets/callback", "/api/oauth/google_sheets/callback/"],
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state } = req.query;

    const vs = await verifyAndClaimOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the connect flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Google.");
    }

    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/google_sheets/callback`;

      const tokens = await exchangeGoogleSheetsCode(code, redirectUri);

      const userId = await resolveLinkedOAuthUserId(req as express.Request, vs);
      if (!userId) {
        return res
          .status(401)
          .send(
            "Complete this connection in the same browser and Wireline account that started it. Sign in, then connect Google Sheets again.",
          );
      }

      // Fetch user's email to store as connected email
      const oauth2Client = getGoogleOAuthClient(req as express.Request);
      oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
      const userInfo = await oauth2.userinfo.get();
      const emailAddress = userInfo.data.email || "";

      const accessTokenGoogle = encryptSecret(tokens.access_token);
      const refreshTokenGoogle = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
      const expiresAtGoogle = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "google_sheets",
          accessToken: accessTokenGoogle,
          refreshToken: refreshTokenGoogle,
          expiresAt: expiresAtGoogle,
          connectedEmail: emailAddress,
          active: true,
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            accessToken: accessTokenGoogle,
            refreshToken: refreshTokenGoogle,
            expiresAt: expiresAtGoogle,
            connectedEmail: emailAddress,
            updatedAt: new Date(),
            active: true,
          },
        });

      const targetOrigin =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const safeOrigin = JSON.stringify(targetOrigin);
      const cspNonce = generateCspNonce();

      res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
      res.send(`
        <html><body><script nonce="${cspNonce}">
          if (window.opener) {
            window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'google_sheets' }, ${safeOrigin});
            window.close();
          } else { window.location.href = '/'; }
        </script><p>Google Sheets connected successfully. You can close this window.</p></body></html>
      `);
    } catch (error: any) {
      log.error("Google Sheets OAuth callback failed", { error: error.message });
      res.status(500).send("Authentication failed.");
    }
  },
);

router.post(
  "/api/oauth/google_sheets/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");

    try {
      await disconnectGoogleSheets(userId);
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Google Sheets disconnect failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to disconnect Google Sheets");
    }
  },
);

export default router;
