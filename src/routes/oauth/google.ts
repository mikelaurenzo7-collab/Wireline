/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { google } from "googleapis";
import { drizzle, log, IS_PROD } from "../../lib/server-context";
import * as schema from "../../db/schema";
import { encryptSecret } from "../../lib/secret-vault";
import {
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE,
  upsertOwnedEmailAccount,
} from "../../lib/owned-email-account";
import { oauthRateLimiter } from "../../middleware/rate-limit-middleware";
import { authenticateUser } from "../../middleware/auth";
import {
  SCOPES,
  getGoogleOAuthClient,
  generateOAuthState,
  verifyOAuthState,
  resolveUserIdFromOAuthSession,
} from "../../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../../lib/csp";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Google OAuth
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/google/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables.",
      });
    }

    const uid = req.user?.id as string | undefined;
    const oauth2Client = getGoogleOAuthClient(req);
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
      state: generateOAuthState(uid ? { userId: uid } : undefined),
    });

    res.json({ url: authUrl });
  },
);

router.get(
  ["/api/oauth/google/callback", "/api/oauth/google/callback/"],
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state } = req.query;

    const vs = verifyOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Google.");
    }

    try {
      const oauth2Client = getGoogleOAuthClient(req);
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
      const userInfo = await oauth2.userinfo.get();
      const emailAddress = userInfo.data.email?.trim().toLowerCase();

      if (!emailAddress) throw new Error("Could not fetch user email.");

      const userId = vs.userId ?? (await resolveUserIdFromOAuthSession(req as express.Request));
      if (!userId) {
        return res
          .status(401)
          .send(
            "Could not identify your account. Open Wireline, sign in, and connect Google again from Settings.",
          );
      }

      const scopeStr =
        typeof (tokens as any).scope === "string"
          ? (tokens as any).scope
          : Array.isArray((tokens as any).scope)
            ? (tokens as any).scope.join(" ")
            : "";

      // Persist tokens via Drizzle. The previous code used `db.from('table')`
      // Supabase-client syntax against a Drizzle handle, which throws
      // `db.from is not a function` at runtime — every Google OAuth callback
      // was silently failing before this fix.
      if (!tokens.access_token) throw new Error("Google token response omitted access_token.");
      const accessTokenGoogle = encryptSecret(tokens.access_token);
      const refreshTokenGoogle = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
      const expiresAtGoogle = BigInt(tokens.expiry_date ?? Date.now() + 3600 * 1000);

      const emailAccountConnected = await upsertOwnedEmailAccount({
        userId,
        emailAddress,
        provider: "google",
        accessToken: accessTokenGoogle,
        refreshToken: refreshTokenGoogle,
        expiresAt: expiresAtGoogle,
        oauthGrantedScopes: scopeStr || null,
      });
      if (!emailAccountConnected) {
        return res.status(409).send(EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE);
      }

      await drizzle
        .insert(schema.calendarAccounts)
        .values({
          userId,
          emailAddress,
          provider: "google",
          accessToken: accessTokenGoogle,
          refreshToken: refreshTokenGoogle,
          expiresAt: expiresAtGoogle,
          oauthGrantedScopes: scopeStr || null,
        })
        .onConflictDoUpdate({
          target: [schema.calendarAccounts.userId, schema.calendarAccounts.emailAddress],
          set: {
            provider: "google",
            accessToken: accessTokenGoogle,
            refreshToken: refreshTokenGoogle,
            expiresAt: expiresAtGoogle,
            oauthGrantedScopes: scopeStr || null,
          },
        });

      const targetOrigin =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const safeEmail = JSON.stringify(emailAddress);
      const safeOrigin = JSON.stringify(targetOrigin);
      const cspNonce = generateCspNonce();

      // Note: CSP_CONNECT_SRCS should ideally be in server-context or passed.
      // For now, we'll hardcode or use the default.
      res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
      res.send(`
      <html><body><script nonce="${cspNonce}">
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', email: ${safeEmail} }, ${safeOrigin});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Authentication successful. You can close this window.</p></body></html>
    `);
    } catch (error: any) {
      log.error("Google OAuth callback failed", { error: error.message });
      res.status(500).send("Authentication failed.");
    }
  },
);

export default router;
