import express from "express";
import { google } from "googleapis";
import { 
  db, 
  log, 
  IS_PROD
} from "../lib/server-context";
import { encryptSecret } from "../lib/secret-vault";
import { oauthRateLimiter } from "../middleware/rate-limit-middleware";
import { 
  SCOPES, 
  MS_SCOPES, 
  getGoogleOAuthClient, 
  getMicrosoftRedirectUri, 
  generateOAuthState, 
  verifyOAuthState 
} from "../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../lib/csp";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Google OAuth
// ────────────────────────────────────────────────────────────────────

router.get('/api/oauth/google/url', oauthRateLimiter, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
     return res.status(500).json({ error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables." });
  }

  const oauth2Client = getGoogleOAuthClient(req);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: generateOAuthState(),
  });

  res.json({ url: authUrl });
});

router.get(['/api/oauth/google/callback', '/api/oauth/google/callback/'], oauthRateLimiter, async (req, res) => {
  const { code, state } = req.query;

  if (!verifyOAuthState(state as string | undefined)) {
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

    await db.from('wireline_email_accounts').insert({
      email_address: emailAddress,
      provider: 'google',
      access_token: encryptSecret(tokens.access_token!),
      refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      expires_at: tokens.expiry_date
    });

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

router.get("/api/oauth/microsoft/url", oauthRateLimiter, (req: express.Request, res: express.Response) => {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    return res.status(500).json({ error: "Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET" });
  }

  const redirectUri = getMicrosoftRedirectUri(req);
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri:  redirectUri,
    response_mode: "query",
    scope:         MS_SCOPES,
    state:         generateOAuthState(),
  });

  res.json({ url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}` });
});

router.get("/api/oauth/microsoft/callback", oauthRateLimiter, async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      log.warn("Microsoft OAuth error from provider", { error, error_description });
      return res.status(400).send(`Microsoft OAuth error: ${error_description}`);
    }

    if (!verifyOAuthState(state as string)) {
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

      await db.from("wireline_email_accounts").upsert({
        email_address: emailAddress,
        provider:      "microsoft",
        access_token:  encryptSecret(tokens.access_token),
        refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : "",
        expires_at:    Date.now() + (tokens.expires_in || 3600) * 1000,
      }, { onConflict: "email_address" });

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

export default router;
