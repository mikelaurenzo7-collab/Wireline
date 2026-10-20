/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { googleApis } from "../../lib/google-apis";
import { BOTBOUND_BRAND_NAME } from "../../lib/brand";
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
  verifyAndClaimOAuthState,
  resolveLinkedOAuthUserId,
} from "../../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../../lib/csp";
import { assertOAuthProviderConnectAllowed } from "../../lib/oauth-connect-environment";
import { getTenantChannelEntitlements } from "../../lib/channel-entitlements";

const router = express.Router();

router.get(
  "/api/oauth/google/url",
  oauthRateLimiter,
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({
        code: "SERVICE_UNAVAILABLE",
        error: "Google connections are not available yet. Contact BotBound support for setup help.",
      });
    }

    const uid = req.user?.id as string | undefined;
    const tenantId = await assertOAuthProviderConnectAllowed(uid, "Google");
    const emailIncluded = (await getTenantChannelEntitlements(tenantId)).channels.includes("email");
    const oauth2Client = await getGoogleOAuthClient(req);
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: emailIncluded ? SCOPES : SCOPES.filter((scope) => !scope.includes("/gmail.")),
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

    const vs = await verifyAndClaimOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Google.");
    }

    const userId = await resolveLinkedOAuthUserId(req as express.Request, vs);
    if (!userId) {
      return res
        .status(401)
        .send(
          `Complete this connection in the same browser and ${BOTBOUND_BRAND_NAME} account that started it. Sign in, then connect Google again from Settings.`,
        );
    }
    await assertOAuthProviderConnectAllowed(userId, "Google");
    const emailIncluded = (await getTenantChannelEntitlements(userId)).channels.includes("email");

    try {
      const oauth2Client = await getGoogleOAuthClient(req);
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const google = await googleApis();
      const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
      const userInfo = await oauth2.userinfo.get();
      const emailAddress = userInfo.data.email?.trim().toLowerCase();

      if (!emailAddress) throw new Error("Could not fetch user email.");

      const scopeStr =
        typeof (tokens as any).scope === "string"
          ? (tokens as any).scope
          : Array.isArray((tokens as any).scope)
            ? (tokens as any).scope.join(" ")
            : "";

      if (!tokens.access_token) throw new Error("Google token response omitted access_token.");
      const accessTokenGoogle = encryptSecret(tokens.access_token);
      const refreshTokenGoogle = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
      const expiresAtGoogle = BigInt(tokens.expiry_date ?? Date.now() + 3600 * 1000);

      // Calendar/Drive remain usable without buying the Email channel. Recheck
      // at callback so a plan change during consent cannot provision a mailbox.
      const emailAccountConnected =
        !emailIncluded ||
        (await upsertOwnedEmailAccount({
          userId,
          emailAddress,
          provider: "google",
          accessToken: accessTokenGoogle,
          refreshToken: refreshTokenGoogle,
          expiresAt: expiresAtGoogle,
          oauthGrantedScopes: scopeStr || null,
        }));
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
