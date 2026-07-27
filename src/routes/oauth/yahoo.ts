/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { AppError } from "../../lib/api-error";
import { and, eq } from "drizzle-orm";
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
  generateOAuthState,
  verifyAndClaimOAuthState,
  resolveUserIdFromOAuthSession,
} from "../../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../../lib/csp";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Yahoo Mailbox OAuth — mail-r/mail-w scopes
//
//  Distinct from /api/auth/yahoo/* (sign-in, openid+email+profile only).
//  This flow is auth-gated: the Account Holder must already be signed in
//  before they can connect their Yahoo Mail account. We store the
//  tokens in wireline_email_accounts with provider='yahoo'. Actual
//  IMAP/SMTP polling + sending lands in a future phase — having the
//  OAuth tokens persisted is the precondition for that wiring.
//
//  Yahoo Mail uses XOAUTH2 over IMAP (imap.mail.yahoo.com:993) +
//  SMTP (smtp.mail.yahoo.com:465). The same access_token we store
//  here is what those clients will use as the SASL credential.
// ────────────────────────────────────────────────────────────────────

const YAHOO_MAIL_SCOPES = ["openid", "email", "profile", "mail-r", "mail-w"].join(" ");

router.get(
  "/api/oauth/yahoo/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!process.env.YAHOO_CLIENT_ID || !process.env.YAHOO_CLIENT_SECRET) {
      throw AppError.fromHttpStatus(503, "Yahoo mailbox integration is finishing setup.");
    }
    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/yahoo/callback`;
    const uid = req.user?.id as string | undefined;
    const params = new URLSearchParams({
      client_id: process.env.YAHOO_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: YAHOO_MAIL_SCOPES,
      state: generateOAuthState(uid ? { userId: uid } : undefined),
      prompt: "login",
    });
    res.json({ url: `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}` });
  },
);

router.get(
  "/api/oauth/yahoo/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("Yahoo Mail OAuth authorization was not completed");
      return res
        .status(400)
        .type("text/plain")
        .send("Yahoo authorization was not completed. Please restart the connection.");
    }
    const vs = await verifyAndClaimOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the connect flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Yahoo.");
    }
    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/yahoo/callback`;
      const basic = Buffer.from(
        `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`,
      ).toString("base64");

      const tokenRes = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        throw new Error(`Yahoo token exchange failed (${tokenRes.status}): ${body.slice(0, 200)}`);
      }
      const tokens = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!tokens.access_token) throw new Error("no access_token in Yahoo response");

      const userId = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      const meRes = await fetch("https://api.login.yahoo.com/openid/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!meRes.ok) throw new Error(`Yahoo userinfo failed (${meRes.status})`);
      const me = (await meRes.json()) as { email?: string };
      const emailAddress = me.email?.trim().toLowerCase();
      if (!emailAddress) throw new Error("Yahoo did not return an email address");

      const accessTokenY = encryptSecret(tokens.access_token);
      const refreshTokenY = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
      const expiresAtY = BigInt(Date.now() + (tokens.expires_in ?? 3600) * 1000);

      const emailAccountConnected = await upsertOwnedEmailAccount({
        userId,
        emailAddress,
        provider: "yahoo",
        accessToken: accessTokenY,
        refreshToken: refreshTokenY,
        expiresAt: expiresAtY,
        oauthGrantedScopes: YAHOO_MAIL_SCOPES,
      });
      if (!emailAccountConnected) {
        return res.status(409).send(EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE);
      }

      const targetOrigin =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const cspNonce = generateCspNonce();
      res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
      res.send(`
      <html><body><script nonce="${cspNonce}">
        if (window.opener) {
          window.opener.postMessage({ type: 'EMAIL_OAUTH_SUCCESS', provider: 'yahoo', email: ${JSON.stringify(emailAddress)} }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Yahoo Mail connected. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("Yahoo Mail OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Yahoo authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/yahoo/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      const accounts = await drizzle
        .select({
          provider: schema.emailAccounts.provider,
          accessToken: schema.emailAccounts.accessToken,
          refreshToken: schema.emailAccounts.refreshToken,
        })
        .from(schema.emailAccounts)
        .where(
          and(eq(schema.emailAccounts.userId, userId), eq(schema.emailAccounts.provider, "yahoo")),
        );
      const { revokeMailboxAccountTokens } = await import("../../lib/oauth-provider-revocation");
      for (const account of accounts) {
        await revokeMailboxAccountTokens(account);
      }
      await drizzle
        .delete(schema.emailAccounts)
        .where(
          and(eq(schema.emailAccounts.userId, userId), eq(schema.emailAccounts.provider, "yahoo")),
        );
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Yahoo disconnect failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to disconnect Yahoo Mail");
    }
  },
);

export default router;
