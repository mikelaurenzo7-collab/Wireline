import express, { Request, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import { google } from "googleapis";
import { 
  db, 
  log, 
  IS_PROD
} from "../lib/server-context";
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
import { computeIntegrationHealth } from "../lib/integration-health";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Google OAuth
// ────────────────────────────────────────────────────────────────────

router.get('/api/oauth/google/url', oauthRateLimiter, authenticateUser, (req: express.Request, res: express.Response) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
     return res.status(500).json({ error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables." });
  }

  const uid = req.user?.id as string | undefined;
  const oauth2Client = getGoogleOAuthClient(req);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: generateOAuthState(uid ? { userId: uid } : undefined),
  });

  res.json({ url: authUrl });
});

router.get(['/api/oauth/google/callback', '/api/oauth/google/callback/'], oauthRateLimiter, async (req, res) => {
  const { code, state } = req.query;

  const vs = verifyOAuthState(state as string | undefined);
  if (!vs.ok) {
    return res.status(400).send("Invalid or expired OAuth state. Please restart the sign-in flow.");
  }
  if (!code || typeof code !== 'string') {
    return res.status(400).send("No code provided by Google.");
  }

  try {
    const oauth2Client = getGoogleOAuthClient(req);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const userInfo = await oauth2.userinfo.get();
    const emailAddress = userInfo.data.email;

    if (!emailAddress) throw new Error("Could not fetch user email.");

    let userId = vs.userId ?? await resolveUserIdFromOAuthSession(req as express.Request);
    if (!userId) {
      return res.status(401).send("Could not identify your account. Open Wireline, sign in, and connect Google again from Settings.");
    }

    const scopeStr =
      typeof (tokens as any).scope === "string"
        ? (tokens as any).scope
        : Array.isArray((tokens as any).scope)
          ? (tokens as any).scope.join(" ")
          : "";

    await db.from('wireline_email_accounts').upsert({
      user_id: userId,
      email_address: emailAddress,
      provider: 'google',
      access_token: encryptSecret(tokens.access_token!),
      refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      expires_at: tokens.expiry_date,
      oauth_granted_scopes: scopeStr || null,
    }, { onConflict: 'email_address' });

    await db.from("wireline_calendar_accounts").upsert({
      user_id: userId,
      email_address: emailAddress,
      provider: "google",
      access_token: encryptSecret(tokens.access_token!),
      refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      expires_at: tokens.expiry_date ?? (Date.now() + 3600 * 1000),
      oauth_granted_scopes: scopeStr || null,
    }, { onConflict: "user_id,email_address" });

    const targetOrigin = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
      || `${req.protocol}://${req.get('host')}`;
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
});

// ────────────────────────────────────────────────────────────────────
//  Microsoft OAuth
// ────────────────────────────────────────────────────────────────────

router.get("/api/oauth/microsoft/url", oauthRateLimiter, authenticateUser, (req: express.Request, res: express.Response) => {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    return res.status(500).json({ error: "Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET" });
  }

  const uid = req.user?.id as string | undefined;
  const redirectUri = getMicrosoftRedirectUri(req);
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri:  redirectUri,
    response_mode: "query",
    scope:         MS_SCOPES,
    state:         generateOAuthState(uid ? { userId: uid } : undefined),
  });

  res.json({ url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}` });
});

router.get("/api/oauth/microsoft/callback", oauthRateLimiter, async (req: express.Request, res: express.Response) => {
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
        client_id:     process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code:          code as string,
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
      });

      const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      });
      const tokens = await tokenRes.json() as any;
      if (!tokenRes.ok) throw new Error(tokens.error_description || "Token exchange failed");

      const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json() as any;
      const emailAddress = profile.mail || profile.userPrincipalName;
      if (!emailAddress) throw new Error("Could not retrieve email address from Microsoft account.");

      let userId = vs.userId ?? await resolveUserIdFromOAuthSession(req);
      if (!userId) {
        return res.status(401).send("Could not identify your account. Sign in to Wireline and connect Microsoft again from Settings.");
      }

      const scopeStr = typeof tokens.scope === "string" ? tokens.scope : "";

      await db.from("wireline_email_accounts").upsert({
        user_id: userId,
        email_address: emailAddress,
        provider:      "microsoft",
        access_token:  encryptSecret(tokens.access_token),
        refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : "",
        expires_at:    Date.now() + (tokens.expires_in || 3600) * 1000,
        oauth_granted_scopes: scopeStr || null,
      }, { onConflict: "email_address" });

      await db.from("wireline_calendar_accounts").upsert({
        user_id: userId,
        email_address: emailAddress,
        provider: "microsoft",
        access_token: encryptSecret(tokens.access_token),
        refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : "",
        expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
        oauth_granted_scopes: scopeStr || null,
      }, { onConflict: "user_id,email_address" });

      const targetOrigin = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
        || `${req.protocol}://${req.get("host")}`;
      const safeEmail  = JSON.stringify(emailAddress);
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
  }
);

// ────────────────────────────────────────────────────────────────────
//  Salesforce OAuth
// ────────────────────────────────────────────────────────────────────

router.get("/api/oauth/salesforce/url", oauthRateLimiter, authenticateUser, (req: express.Request, res: express.Response) => {
  if (!sfOAuthConfigured()) {
    return res.status(500).json({ error: "Missing SALESFORCE_CLIENT_ID or SALESFORCE_CLIENT_SECRET in environment variables." });
  }

  const baseUrl = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
    || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${baseUrl}/api/oauth/salesforce/callback`;
  const uid = req.user?.id as string | undefined;
  const authUrl = getSalesforceAuthUrl(redirectUri, generateOAuthState(uid ? { userId: uid } : undefined));
  res.json({ url: authUrl });
});

router.get("/api/oauth/salesforce/callback", oauthRateLimiter, async (req: express.Request, res: express.Response) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    log.warn("Salesforce OAuth error from provider", { error, error_description });
    return res.status(400).send(`Salesforce OAuth error: ${error_description}`);
  }

  const vs = verifyOAuthState(state as string | undefined);
  if (!vs.ok) {
    return res.status(400).send("Invalid or expired OAuth state. Please restart the sign-in flow.");
  }
  if (!code || typeof code !== "string") {
    return res.status(400).send("No code provided by Salesforce.");
  }

  try {
    const baseUrl = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
      || `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/salesforce/callback`;

    const tokens = await exchangeSalesforceCode(code, redirectUri);

    // Fetch the user identity to link the connection
    const idRes = await fetch(tokens.id, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const identity = idRes.ok ? (await idRes.json() as any) : {};
    const connectedEmail = identity.email || "";

    let userId: string | null = vs.userId ?? await resolveUserIdFromOAuthSession(req);

    if (!userId) {
      return res.status(401).send("Could not identify user. Please reconnect from the app.");
    }

    await db.from("wireline_crm_connections").upsert({
      user_id: userId,
      provider: "salesforce",
      instance_url: tokens.instance_url,
      access_token: encryptSecret(tokens.access_token),
      refresh_token: encryptSecret(tokens.refresh_token),
      expires_at: Date.now() + tokens.expires_in * 1000,
      scopes: "api refresh_token id",
      connected_email: connectedEmail,
    }, { onConflict: "user_id,provider" });

    await db.from("wireline_settings")
      .update({ crm_type: "salesforce" })
      .eq("user_id", userId);

    const targetOrigin = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
      || `${req.protocol}://${req.get("host")}`;
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
});

router.post("/api/oauth/salesforce/disconnect", authenticateUser, async (req: express.Request, res: express.Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await disconnectSalesforce(userId);
    res.json({ ok: true });
  } catch (e: any) {
    log.error("Salesforce disconnect failed", { error: e?.message });
    res.status(500).json({ error: "Failed to disconnect Salesforce" });
  }
});

// ────────────────────────────────────────────────────────────────────
//  HubSpot OAuth
// ────────────────────────────────────────────────────────────────────

router.get("/api/oauth/hubspot/url", oauthRateLimiter, authenticateUser, (req: express.Request, res: express.Response) => {
  if (!hsOAuthConfigured()) {
    return res.status(500).json({ error: "Missing HUBSPOT_CLIENT_ID or HUBSPOT_CLIENT_SECRET in environment variables." });
  }

  const baseUrl = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
    || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${baseUrl}/api/oauth/hubspot/callback`;
  const uid = req.user?.id as string | undefined;
  const authUrl = getHubSpotAuthUrl(redirectUri, generateOAuthState(uid ? { userId: uid } : undefined));
  res.json({ url: authUrl });
});

router.get("/api/oauth/hubspot/callback", oauthRateLimiter, async (req: express.Request, res: express.Response) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    log.warn("HubSpot OAuth error from provider", { error, error_description });
    return res.status(400).send(`HubSpot OAuth error: ${error_description}`);
  }

  const vs = verifyOAuthState(state as string | undefined);
  if (!vs.ok) {
    return res.status(400).send("Invalid or expired OAuth state. Please restart the sign-in flow.");
  }
  if (!code || typeof code !== "string") {
    return res.status(400).send("No code provided by HubSpot.");
  }

  try {
    const baseUrl = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
      || `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/hubspot/callback`;

    const tokens = await exchangeHubSpotCode(code, redirectUri);

    let userId: string | null = vs.userId ?? await resolveUserIdFromOAuthSession(req);

    if (!userId) {
      return res.status(401).send("Could not identify user. Please reconnect from the app.");
    }

    // Fetch HubSpot account info for display
    const infoRes = await fetch("https://api.hubapi.com/account-info/v3/details", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = infoRes.ok ? (await infoRes.json() as any) : {};

    await db.from("wireline_crm_connections").upsert({
      user_id: userId,
      provider: "hubspot",
      instance_url: `https://app.hubspot.com/contacts/${info.portalId || ""}`,
      access_token: encryptSecret(tokens.access_token),
      refresh_token: encryptSecret(tokens.refresh_token),
      expires_at: Date.now() + tokens.expires_in * 1000,
      scopes: "crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write",
      connected_email: info.accountType || "",
    }, { onConflict: "user_id,provider" });

    await db.from("wireline_settings")
      .update({ crm_type: "hubspot" })
      .eq("user_id", userId);

    const targetOrigin = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
      || `${req.protocol}://${req.get("host")}`;
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
});

router.post("/api/oauth/hubspot/disconnect", authenticateUser, async (req: express.Request, res: express.Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await disconnectHubSpot(userId);
    res.json({ ok: true });
  } catch (e: any) {
    log.error("HubSpot disconnect failed", { error: e?.message });
    res.status(500).json({ error: "Failed to disconnect HubSpot" });
  }
});

// ────────────────────────────────────────────────────────────────────
//  CRM Connection Status (shared endpoint)
// ────────────────────────────────────────────────────────────────────

router.get("/api/oauth/crm/status", authenticateUser, async (req: express.Request, res: express.Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: connections } = await db
      .from("wireline_crm_connections")
      .select("provider, connected_email, instance_url, created_at, updated_at, metadata")
      .eq("user_id", userId);

    const sfConn = (connections || []).find((c: { provider: string }) => c.provider === "salesforce");
    const hsConn = (connections || []).find((c: { provider: string }) => c.provider === "hubspot");
    const slackConn = (connections || []).find((c: { provider: string }) => c.provider === "slack");
    const zoomConn = (connections || []).find((c: { provider: string }) => c.provider === "zoom");

    res.json({
      salesforce: sfConn ? {
        connected: true,
        email: sfConn.connected_email,
        instance_url: sfConn.instance_url,
        connected_at: sfConn.created_at,
      } : { connected: false, configured: sfOAuthConfigured() },
      hubspot: hsConn ? {
        connected: true,
        email: hsConn.connected_email,
        instance_url: hsConn.instance_url,
        connected_at: hsConn.created_at,
      } : { connected: false, configured: hsOAuthConfigured() },
      slack: slackConn ? {
        connected: true,
        team: slackConn.connected_email,
        instance_url: slackConn.instance_url,
        connected_at: slackConn.created_at,
        default_channel_id: (slackConn as { metadata?: { default_channel?: string } }).metadata?.default_channel ?? null,
      } : { connected: false, configured: slackOAuthConfigured() },
      zoom: zoomConn ? {
        connected: true,
        instance_url: zoomConn.instance_url,
        connected_at: zoomConn.created_at,
      } : { connected: false, configured: zoomOAuthConfigured() },
    });
  } catch (e: any) {
    log.error("CRM status check failed", { error: e?.message });
    res.status(500).json({ error: "Failed to check CRM status" });
  }
});

// ────────────────────────────────────────────────────────────────────
//  Slack OAuth
// ────────────────────────────────────────────────────────────────────

router.get("/api/oauth/slack/url", oauthRateLimiter, authenticateUser, (req: express.Request, res: express.Response) => {
  if (!slackOAuthConfigured()) {
    return res.status(500).json({ error: "Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET in environment variables." });
  }
  const baseUrl = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
    || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${baseUrl}/api/oauth/slack/callback`;
  const uid = req.user?.id as string | undefined;
  const authUrl = getSlackAuthUrl(redirectUri, generateOAuthState(uid ? { userId: uid } : undefined));
  res.json({ url: authUrl });
});

router.get("/api/oauth/slack/callback", oauthRateLimiter, async (req: express.Request, res: express.Response) => {
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
    const baseUrl = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
      || `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/slack/callback`;
    const tokens = await exchangeSlackCode(code, redirectUri);

    let userId: string | null = vs.userId ?? await resolveUserIdFromOAuthSession(req);
    if (!userId) {
      return res.status(401).send("Could not identify user. Please reconnect from the app.");
    }

    await db.from("wireline_crm_connections").upsert({
      user_id: userId,
      provider: "slack",
      instance_url: `https://${tokens.team.name}.slack.com`,
      access_token: encryptSecret(tokens.access_token),
      refresh_token: encryptSecret("slack-no-refresh"),
      expires_at: 0,
      scopes: "chat:write,channels:read,groups:read,team:read",
      connected_email: tokens.team.name,
      metadata: { team_id: tokens.team.id, team_name: tokens.team.name, bot_user_id: tokens.bot_user_id },
    }, { onConflict: "user_id,provider" });

    const targetOrigin = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
      || `${req.protocol}://${req.get("host")}`;
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
});

router.post("/api/oauth/slack/disconnect", authenticateUser, async (req: express.Request, res: express.Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    await disconnectSlack(userId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to disconnect Slack" });
  }
});

router.get("/api/oauth/slack/channels", authenticateUser, async (req: express.Request, res: express.Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const channels = await listSlackChannels(userId);
    res.json({ channels });
  } catch {
    res.status(500).json({ error: "Failed to list Slack channels" });
  }
});

router.post("/api/oauth/slack/default-channel", authenticateUser, async (req: express.Request, res: express.Response) => {
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
});

// ────────────────────────────────────────────────────────────────────
//  Zoom OAuth
// ────────────────────────────────────────────────────────────────────

router.get("/api/oauth/zoom/url", oauthRateLimiter, authenticateUser, (req: express.Request, res: express.Response) => {
  if (!zoomOAuthConfigured()) {
    return res.status(500).json({ error: "Missing ZOOM_CLIENT_ID or ZOOM_CLIENT_SECRET in environment variables." });
  }
  const baseUrl = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
    || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${baseUrl}/api/oauth/zoom/callback`;
  const uid = req.user?.id as string | undefined;
  const authUrl = getZoomAuthUrl(redirectUri, generateOAuthState(uid ? { userId: uid } : undefined));
  res.json({ url: authUrl });
});

router.get("/api/oauth/zoom/callback", oauthRateLimiter, async (req: express.Request, res: express.Response) => {
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
    const baseUrl = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
      || `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${baseUrl}/api/oauth/zoom/callback`;
    const tokens = await exchangeZoomCode(code, redirectUri);

    let userId: string | null = vs.userId ?? await resolveUserIdFromOAuthSession(req);
    if (!userId) {
      return res.status(401).send("Could not identify user. Please reconnect from the app.");
    }

    await db.from("wireline_crm_connections").upsert({
      user_id: userId,
      provider: "zoom",
      instance_url: "https://zoom.us",
      access_token: encryptSecret(tokens.access_token),
      refresh_token: encryptSecret(tokens.refresh_token),
      expires_at: Date.now() + tokens.expires_in * 1000,
      scopes: "meeting:write",
      connected_email: "",
    }, { onConflict: "user_id,provider" });

    const targetOrigin = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
      || `${req.protocol}://${req.get("host")}`;
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
});

router.post("/api/oauth/zoom/disconnect", authenticateUser, async (req: express.Request, res: express.Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    await disconnectZoom(userId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to disconnect Zoom" });
  }
});

// ────────────────────────────────────────────────────────────────────
//  Integration health (OAuth scope freshness)
// ────────────────────────────────────────────────────────────────────

router.get("/api/oauth/integration-health", authenticateUser, async (req: express.Request, res: express.Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const health = await computeIntegrationHealth(userId);
    res.json(health);
  } catch (e: any) {
    log.error("integration-health failed", { error: e?.message });
    res.status(500).json({ error: "Failed to load integration health." });
  }
});

export default router;
