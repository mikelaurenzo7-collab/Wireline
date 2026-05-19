import express, { Request, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import { google } from "googleapis";
import { drizzle, log, IS_PROD } from "../lib/server-context";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { encryptSecret } from "../lib/secret-vault";
import { oauthRateLimiter } from "../middleware/rate-limit-middleware";
import { authenticateUser } from "../middleware/auth";
import {
  SCOPES,
  MS_SCOPES,
  getGoogleOAuthClient,
  getMicrosoftRedirectUri,
  generateOAuthState,
  verifyOAuthState,
  resolveUserIdFromOAuthSession,
} from "../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../lib/csp";
import {
  sfOAuthConfigured,
  getSalesforceAuthUrl,
  exchangeSalesforceCode,
  disconnectSalesforce,
} from "../lib/salesforce-service";
import {
  hsOAuthConfigured,
  getHubSpotAuthUrl,
  exchangeHubSpotCode,
  disconnectHubSpot,
} from "../lib/hubspot-service";
import {
  slackOAuthConfigured,
  getSlackAuthUrl,
  exchangeSlackCode,
  disconnectSlack,
  listChannels as listSlackChannels,
  setDefaultChannel as setSlackDefaultChannel,
} from "../lib/slack-service";
import {
  zoomOAuthConfigured,
  getZoomAuthUrl,
  exchangeZoomCode,
  disconnectZoom,
} from "../lib/zoom-service";
import {
  apolloOAuthConfigured,
  getApolloAuthUrl,
  exchangeApolloCode,
  getApolloUserInfo,
  disconnectApollo,
} from "../lib/apollo-service";
import {
  metaOAuthConfigured,
  getMetaAuthUrl,
  exchangeMetaCode,
  getMetaUserInfo,
  subscribePageToLeadgen,
  disconnectMeta,
} from "../lib/meta-service";
import { computeIntegrationHealth } from "../lib/integration-health";

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
  async (req, res) => {
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
      const emailAddress = userInfo.data.email;

      if (!emailAddress) throw new Error("Could not fetch user email.");

      let userId = vs.userId ?? (await resolveUserIdFromOAuthSession(req as express.Request));
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
      const accessTokenGoogle = encryptSecret(tokens.access_token!);
      const refreshTokenGoogle = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
      const expiresAtGoogle = tokens.expiry_date ?? Date.now() + 3600 * 1000;

      await drizzle
        .insert(schema.emailAccounts)
        .values({
          userId,
          emailAddress,
          provider: "google",
          accessToken: accessTokenGoogle,
          refreshToken: refreshTokenGoogle,
          expiresAt: BigInt(expiresAtGoogle),
          oauthGrantedScopes: scopeStr || null,
        })
        .onConflictDoUpdate({
          target: schema.emailAccounts.emailAddress,
          set: {
            userId,
            provider: "google",
            accessToken: accessTokenGoogle,
            refreshToken: refreshTokenGoogle,
            expiresAt: BigInt(expiresAtGoogle),
            oauthGrantedScopes: scopeStr || null,
          },
        });

      await drizzle
        .insert(schema.calendarAccounts)
        .values({
          userId,
          emailAddress,
          provider: "google",
          accessToken: accessTokenGoogle,
          refreshToken: refreshTokenGoogle,
          expiresAt: BigInt(expiresAtGoogle),
          oauthGrantedScopes: scopeStr || null,
        })
        .onConflictDoUpdate({
          target: [schema.calendarAccounts.userId, schema.calendarAccounts.emailAddress],
          set: {
            provider: "google",
            accessToken: accessTokenGoogle,
            refreshToken: refreshTokenGoogle,
            expiresAt: BigInt(expiresAtGoogle),
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
      return res.status(400).send(`Microsoft OAuth error: ${error_description}`);
    }

    const vs = verifyOAuthState(state as string);
    if (!vs.ok) {
      return res.status(400).send("Invalid or expired OAuth state. Please restart.");
    }
    if (!code) return res.status(400).send("No code provided.");

    try {
      const redirectUri = getMicrosoftRedirectUri(req);
      const tokenParams = new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code: code as string,
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

      const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = (await profileRes.json()) as any;
      const emailAddress = profile.mail || profile.userPrincipalName;
      if (!emailAddress)
        throw new Error("Could not retrieve email address from Microsoft account.");

      let userId = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
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

      await drizzle
        .insert(schema.emailAccounts)
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
          target: schema.emailAccounts.emailAddress,
          set: {
            userId,
            provider: "microsoft",
            accessToken: accessTokenMs,
            refreshToken: refreshTokenMs,
            expiresAt: expiresAtMs,
            oauthGrantedScopes: scopeStr || null,
          },
        });

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

// ────────────────────────────────────────────────────────────────────
//  Salesforce OAuth
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/salesforce/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!sfOAuthConfigured()) {
      return res.status(500).json({
        error: "Missing SALESFORCE_CLIENT_ID or SALESFORCE_CLIENT_SECRET in environment variables.",
      });
    }

    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/salesforce/callback`;
    const uid = req.user?.id as string | undefined;
    const authUrl = getSalesforceAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid } : undefined),
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/salesforce/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("Salesforce OAuth error from provider", { error, error_description });
      return res.status(400).send(`Salesforce OAuth error: ${error_description}`);
    }

    const vs = verifyOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Salesforce.");
    }

    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/salesforce/callback`;

      const tokens = await exchangeSalesforceCode(code, redirectUri);

      // Fetch the user identity to link the connection
      const idRes = await fetch(tokens.id, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const identity = idRes.ok ? ((await idRes.json()) as any) : {};
      const connectedEmail = identity.email || "";

      let userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));

      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      const accessTokenSf = encryptSecret(tokens.access_token);
      const refreshTokenSf = encryptSecret(tokens.refresh_token);
      const expiresAtSf = new Date(Date.now() + tokens.expires_in * 1000);

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "salesforce",
          instanceUrl: tokens.instance_url,
          accessToken: accessTokenSf,
          refreshToken: refreshTokenSf,
          expiresAt: expiresAtSf,
          connectedEmail,
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            instanceUrl: tokens.instance_url,
            accessToken: accessTokenSf,
            refreshToken: refreshTokenSf,
            expiresAt: expiresAtSf,
            connectedEmail,
            updatedAt: new Date(),
            active: true,
          },
        });

      await drizzle
        .update(schema.settings)
        .set({ crmType: "salesforce" })
        .where(eq(schema.settings.userId, userId));

      const targetOrigin =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const cspNonce = generateCspNonce();
      res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
      res.send(`
      <html><body><script nonce="${cspNonce}">
        if (window.opener) {
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'salesforce' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Salesforce connected successfully. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("Salesforce OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Salesforce authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/salesforce/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      await disconnectSalesforce(userId);
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Salesforce disconnect failed", { error: e?.message });
      res.status(500).json({ error: "Failed to disconnect Salesforce" });
    }
  },
);

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
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("HubSpot OAuth error from provider", { error, error_description });
      return res.status(400).send(`HubSpot OAuth error: ${error_description}`);
    }

    const vs = verifyOAuthState(state as string | undefined);
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

      let userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));

      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
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
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      await disconnectHubSpot(userId);
      res.json({ ok: true });
    } catch (e: any) {
      log.error("HubSpot disconnect failed", { error: e?.message });
      res.status(500).json({ error: "Failed to disconnect HubSpot" });
    }
  },
);

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
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("Apollo OAuth error from provider", { error, error_description });
      return res.status(400).send(`Apollo OAuth error: ${error_description}`);
    }
    const vs = verifyOAuthState(state as string | undefined);
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
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      await disconnectApollo(userId);
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Apollo disconnect failed", { error: e?.message });
      res.status(500).json({ error: "Failed to disconnect Apollo" });
    }
  },
);

// ────────────────────────────────────────────────────────────────────
//  Meta OAuth (placeholder — connect button shows, data flows are
//  future work). Routes return 503 until META_APP_ID + META_APP_SECRET
//  land in env. When configured, the OAuth dance + token storage work
//  end-to-end; the Lead Ads webhook + CAPI export ship in a later
//  phase, at which point the stored token is already there to use.
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/meta/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!metaOAuthConfigured()) {
      return res
        .status(503)
        .json({ error: "Meta integration is finishing setup. Try again shortly." });
    }
    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/meta/callback`;
    const uid = req.user?.id as string | undefined;
    const authUrl = getMetaAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid } : undefined),
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/meta/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("Meta OAuth error from provider", { error, error_description });
      return res.status(400).send(`Meta OAuth error: ${error_description}`);
    }
    const vs = verifyOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res
        .status(400)
        .send("Invalid or expired OAuth state. Please restart the sign-in flow.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Meta.");
    }
    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/meta/callback`;
      const tokens = await exchangeMetaCode(code, redirectUri);

      const userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      const info = await getMetaUserInfo(tokens.access_token);
      const accessTokenM = encryptSecret(tokens.access_token);
      const expiresAtM = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

      // Pull the pages the user manages so the Lead Ads webhook can
      // route incoming events to this tenant. The /me/accounts call
      // returns each page's own access_token (needed to subscribe
      // that page to leadgen events). We use a quick refetch with
      // access_token in the field selector to keep both calls under
      // a single roundtrip cost.
      const pageRows = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(tokens.access_token)}`,
      )
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .catch(() => ({ data: [] }));
      const pages: { id: string; name: string; access_token?: string }[] = pageRows.data || [];
      const pageIds = pages.map((p) => p.id);

      // Best-effort: subscribe every managed page to leadgen events.
      // Failures don't block the OAuth flow — operator can re-trigger
      // later via a reconnect.
      await Promise.all(
        pages.map((p) =>
          p.access_token
            ? subscribePageToLeadgen(p.id, p.access_token).catch(() => false)
            : Promise.resolve(false),
        ),
      );

      const metaMetadata = {
        page_ids: pageIds,
        page_names: pages.map((p) => p.name),
        // Stored so the Data Deletion Callback can map an incoming
        // revocation event (signed_request.user_id) back to this
        // tenant. Without this, the callback can ack Meta but can't
        // disconnect the right account.
        facebook_user_id: info?.id || null,
      };

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "meta",
          accessToken: accessTokenM,
          expiresAt: expiresAtM,
          connectedEmail: info?.email || info?.name || null,
          metadata: metaMetadata,
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            accessToken: accessTokenM,
            expiresAt: expiresAtM,
            connectedEmail: info?.email || info?.name || null,
            metadata: metaMetadata,
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
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'meta' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Meta connected successfully. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("Meta OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Meta authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/meta/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      await disconnectMeta(userId);
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Meta disconnect failed", { error: e?.message });
      res.status(500).json({ error: "Failed to disconnect Meta" });
    }
  },
);

// ────────────────────────────────────────────────────────────────────
//  CRM Connection Status (shared endpoint)
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/crm/status",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      // The Supabase-client `db.from(...)` path was a runtime crash — the
      // server-context `db` is a Drizzle handle, so `.from()` was never
      // callable. Use Drizzle's typed select instead. This is what
      // CrmConnectionCard polls on mount to render connection badges.
      const connections = await drizzle
        .select({
          provider: schema.crmConnections.provider,
          connectedEmail: schema.crmConnections.connectedEmail,
          instanceUrl: schema.crmConnections.instanceUrl,
          createdAt: schema.crmConnections.createdAt,
          updatedAt: schema.crmConnections.updatedAt,
          metadata: schema.crmConnections.metadata,
        })
        .from(schema.crmConnections)
        .where(eq(schema.crmConnections.userId, userId));

      const findBy = (p: string) => (connections || []).find((c) => c.provider === p);
      const sfConn = findBy("salesforce");
      const hsConn = findBy("hubspot");
      const slackConn = findBy("slack");
      const zoomConn = findBy("zoom");
      const apolloConn = findBy("apollo");
      const metaConn = findBy("meta");

      res.json({
        salesforce: sfConn
          ? {
              connected: true,
              email: sfConn.connectedEmail,
              instance_url: sfConn.instanceUrl,
              connected_at: sfConn.createdAt,
            }
          : { connected: false, configured: sfOAuthConfigured() },
        hubspot: hsConn
          ? {
              connected: true,
              email: hsConn.connectedEmail,
              instance_url: hsConn.instanceUrl,
              connected_at: hsConn.createdAt,
            }
          : { connected: false, configured: hsOAuthConfigured() },
        slack: slackConn
          ? {
              connected: true,
              team: slackConn.connectedEmail,
              instance_url: slackConn.instanceUrl,
              connected_at: slackConn.createdAt,
              default_channel_id:
                (slackConn.metadata as { default_channel?: string } | null)?.default_channel ??
                null,
            }
          : { connected: false, configured: slackOAuthConfigured() },
        zoom: zoomConn
          ? {
              connected: true,
              instance_url: zoomConn.instanceUrl,
              connected_at: zoomConn.createdAt,
            }
          : { connected: false, configured: zoomOAuthConfigured() },
        apollo: apolloConn
          ? {
              connected: true,
              email: apolloConn.connectedEmail,
              connected_at: apolloConn.createdAt,
            }
          : { connected: false, configured: apolloOAuthConfigured() },
        meta: metaConn
          ? {
              connected: true,
              email: metaConn.connectedEmail,
              connected_at: metaConn.createdAt,
            }
          : { connected: false, configured: metaOAuthConfigured() },
      });
    } catch (e: any) {
      log.error("CRM status check failed", { error: e?.message });
      res.status(500).json({ error: "Failed to check CRM status" });
    }
  },
);

// ────────────────────────────────────────────────────────────────────
//  Slack OAuth
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/slack/url",
  oauthRateLimiter,
  authenticateUser,
  (req: express.Request, res: express.Response) => {
    if (!slackOAuthConfigured()) {
      return res.status(500).json({
        error: "Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET in environment variables.",
      });
    }
    const baseUrl =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/slack/callback`;
    const uid = req.user?.id as string | undefined;
    const authUrl = getSlackAuthUrl(
      redirectUri,
      generateOAuthState(uid ? { userId: uid } : undefined),
    );
    res.json({ url: authUrl });
  },
);

router.get(
  "/api/oauth/slack/callback",
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, state, error: oauthError } = req.query;
    if (oauthError) {
      return res.status(400).send(`Slack OAuth error: ${oauthError}`);
    }
    const vs = verifyOAuthState(state as string | undefined);
    if (!vs.ok) {
      return res.status(400).send("Invalid or expired OAuth state.");
    }
    if (!code || typeof code !== "string") {
      return res.status(400).send("No code provided by Slack.");
    }

    try {
      const baseUrl =
        (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
        `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/oauth/slack/callback`;
      const tokens = await exchangeSlackCode(code, redirectUri);

      let userId: string | null = vs.userId ?? (await resolveUserIdFromOAuthSession(req));
      if (!userId) {
        return res.status(401).send("Could not identify user. Please reconnect from the app.");
      }

      const slackInstanceUrl = `https://${tokens.team.name}.slack.com`;
      const accessTokenSlack = encryptSecret(tokens.access_token);
      const refreshTokenSlack = encryptSecret("slack-no-refresh");
      const slackMetadata = {
        team_id: tokens.team.id,
        team_name: tokens.team.name,
        bot_user_id: tokens.bot_user_id,
      };

      await drizzle
        .insert(schema.crmConnections)
        .values({
          userId,
          provider: "slack",
          instanceUrl: slackInstanceUrl,
          accessToken: accessTokenSlack,
          refreshToken: refreshTokenSlack,
          connectedEmail: tokens.team.name,
          metadata: slackMetadata,
        })
        .onConflictDoUpdate({
          target: [schema.crmConnections.userId, schema.crmConnections.provider],
          set: {
            instanceUrl: slackInstanceUrl,
            accessToken: accessTokenSlack,
            refreshToken: refreshTokenSlack,
            connectedEmail: tokens.team.name,
            metadata: slackMetadata,
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
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: 'slack' }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>Slack connected successfully. You can close this window.</p></body></html>
    `);
    } catch (e: any) {
      log.error("Slack OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Slack authentication failed. Please try again.");
    }
  },
);

router.post(
  "/api/oauth/slack/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      await disconnectSlack(userId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to disconnect Slack" });
    }
  },
);

router.get(
  "/api/oauth/slack/channels",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const channels = await listSlackChannels(userId);
      res.json({ channels });
    } catch {
      res.status(500).json({ error: "Failed to list Slack channels" });
    }
  },
);

router.post(
  "/api/oauth/slack/default-channel",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { channel_id } = req.body;
    if (!channel_id) return res.status(400).json({ error: "channel_id required" });
    try {
      await setSlackDefaultChannel(userId, channel_id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to set default channel" });
    }
  },
);

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
      return res.status(400).send(`Zoom OAuth error: ${oauthError}`);
    }
    const vs = verifyOAuthState(state as string | undefined);
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
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      await disconnectZoom(userId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to disconnect Zoom" });
    }
  },
);

// ────────────────────────────────────────────────────────────────────
//  Integration health (OAuth scope freshness)
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/oauth/integration-health",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const health = await computeIntegrationHealth(userId);
      res.json(health);
    } catch (e: any) {
      log.error("integration-health failed", { error: e?.message });
      res.status(500).json({ error: "Failed to load integration health." });
    }
  },
);

export default router;
