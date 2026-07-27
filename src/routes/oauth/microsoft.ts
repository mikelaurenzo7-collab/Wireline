/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
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
  MS_SCOPES,
  getMicrosoftRedirectUri,
  generateOAuthState,
  verifyAndClaimOAuthState,
  resolveUserIdFromOAuthSession,
} from "../../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../../lib/csp";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Microsoft OAuth
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/microsoft/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
      return res
        .status(500)
        .json({ error: "Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET" });
    }

    const uid = req.user?.id as string | undefined;
    const redirectUri = getMicrosoftRedirectUri(req);
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: MS_SCOPES,
      state: generateOAuthState(uid ? { userId: uid } : undefined),
    });

    res.json({
      url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`,
    });
  },
);

router.get(
  "/api/oauth/microsoft/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("Microsoft OAuth error from provider", { error, error_description });
      return res
        .status(400)
        .type("text/plain")
        .send("Microsoft authorization was not completed. Please restart the connection.");
    }

    const vs = await verifyAndClaimOAuthState(state as string);
    if (!vs.ok) {
      return res.status(400).send("Invalid or expired OAuth state. Please restart.");
    }
    if (!code || typeof code !== "string") return res.status(400).send("No code provided.");

    try {
      const redirectUri = getMicrosoftRedirectUri(req);
      const tokenParams = new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });

      const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      });
      const tokens = (await tokenRes.json()) as any;
      if (!tokenRes.ok) throw new Error(tokens.error_description || "Token exchange failed");
      if (!tokens.access_token) throw new Error("Microsoft token response omitted access_token.");

      const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!profileRes.ok) throw new Error(`Microsoft profile request failed (${profileRes.status}).`);
      const profile = (await profileRes.json()) as any;
      const emailAddress = String(profile.mail || profile.userPrincipalName || "")
        .trim()
        .toLowerCase();
      if (!emailAddress)
        throw new Error("Could not retrieve email address from Microsoft account.");

      const userId = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res
          .status(401)
          .send(
            "Could not identify your account. Sign in to Wireline and connect Microsoft again from Settings.",
          );
      }

      const scopeStr = typeof tokens.scope === "string" ? tokens.scope : "";

      const accessTokenMs = encryptSecret(tokens.access_token);
      const refreshTokenMs = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
      const expiresAtMs = BigInt(Date.now() + (tokens.expires_in || 3600) * 1000);

      const emailAccountConnected = await upsertOwnedEmailAccount({
        userId,
        emailAddress,
        provider: "microsoft",
        accessToken: accessTokenMs,
        refreshToken: refreshTokenMs,
        expiresAt: expiresAtMs,
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
          provider: "microsoft",
          accessToken: accessTokenMs,
          refreshToken: refreshTokenMs,
          expiresAt: expiresAtMs,
          oauthGrantedScopes: scopeStr || null,
        })
        .onConflictDoUpdate({
          target: [schema.calendarAccounts.userId, schema.calendarAccounts.emailAddress],
          set: {
            provider: "microsoft",
            accessToken: accessTokenMs,
            refreshToken: refreshTokenMs,
            expiresAt: expiresAtMs,
            oauthGrantedScopes: scopeStr || null,
          },
        });

      const targetOrigin =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const safeEmail = JSON.stringify(emailAddress);
      const safeOrigin = JSON.stringify(targetOrigin);
      const cspNonce = generateCspNonce();
      res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
      res.send(`
        <html><body><script nonce="${cspNonce}">
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', email: ${safeEmail} }, ${safeOrigin});
            window.close();
          } else { window.location.href = '/'; }
        </script><p>Authentication successful. You can close this window.</p></body></html>
      `);
    } catch (e: any) {
      log.error("Microsoft OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Microsoft authentication failed.");
    }
  },
);

export default router;
