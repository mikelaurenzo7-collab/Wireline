/**
 * OAuth-based SIGN-IN (distinct from the mailbox-connect OAuth in oauth-routes.ts).
 *
 * The flow:
 *   1. Visitor clicks "Continue with Google" on /auth (no session yet).
 *   2. GET /api/auth/google/url → returns an authorization URL with
 *      minimal scopes (openid email profile) and a signed state with
 *      intent=signin.
 *   3. Provider sends them back to /api/auth/google/callback.
 *   4. We exchange the code, read the email + name, look up the user
 *      in wireline_users by email, create the row if it doesn't exist,
 *      issue a Wireline JWT, and redirect to
 *      /auth/oauth-complete?token=…&email=…&name=… so the SPA's
 *      AuthContext can populate localStorage and route to /.
 *
 * The PUBLIC client IDs for Google/Microsoft are reused from the
 * existing mailbox-connect OAuth — operators only configure them once.
 * The scopes differ (no Gmail/Calendar.send here, just identity), so
 * the access token returned by sign-in is NOT mailbox-usable. If a
 * user later wants to attach their mailbox to an agent, they go
 * through the existing higher-scope OAuth flow.
 *
 * Email/password sign-in remains untouched. OAuth is an additional
 * option, not a replacement — customers who don't have a Gmail or
 * Outlook can keep using email/password.
 */

import { Router, Request, Response } from "express";
import { google } from "googleapis";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { generateToken } from "../lib/auth-service";
import { generateOAuthState, verifyOAuthState } from "../lib/oauth-helpers";

const router = Router();

// Minimal identity scopes — NOT mailbox-readable.
const GOOGLE_SIGNIN_SCOPES = ["openid", "email", "profile"];
const MICROSOFT_SIGNIN_SCOPES = ["openid", "email", "profile", "offline_access"];
const YAHOO_SIGNIN_SCOPES = ["openid", "email", "profile"];

function appOrigin(req: Request): string {
  return (process.env.APP_URL || `${req.protocol}://${req.get("host")}` || "").replace(/\/+$/, "");
}

function findOrCreateUserByEmail(
  email: string,
  fullName: string | null,
): Promise<{ id: string; email: string; fullName: string | null }> {
  return (async () => {
    const normalized = email.trim().toLowerCase();
    const [existing] = await drizzle
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, normalized))
      .limit(1);
    if (existing) {
      return { id: existing.id, email: existing.email, fullName: existing.fullName };
    }
    const inserted = (await drizzle
      .insert(schema.users)
      .values({
        email: normalized,
        // passwordHash stays NULL — these users sign in via OAuth.
        // Password reset will no-op for them; we surface a clearer
        // message in the reset flow when passwordHash is null.
        fullName,
      })
      .returning()) as Array<{ id: string; email: string; fullName: string | null }>;
    const u = inserted[0];
    log.info("auth oauth: created new user", { email: normalized });
    return { id: u.id, email: u.email, fullName: u.fullName };
  })();
}

function bridgeRedirect(
  baseUrl: string,
  user: { id: string; email: string; fullName: string | null },
  token: string,
  errorMessage?: string,
): string {
  if (errorMessage) {
    return `${baseUrl}/auth/oauth-complete?error=${encodeURIComponent(errorMessage)}`;
  }
  const params = new URLSearchParams({
    token,
    user_id: user.id,
    email: user.email,
    name: user.fullName ?? "",
  });
  return `${baseUrl}/auth/oauth-complete?${params.toString()}`;
}

/* ─────────────────────────  Google  ─────────────────────── */

router.get("/api/auth/google/url", (req: Request, res: Response) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: "Google sign-in is not configured." });
  }
  const baseUrl = appOrigin(req);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
  const authUrl = client.generateAuthUrl({
    scope: GOOGLE_SIGNIN_SCOPES,
    access_type: "online",
    prompt: "select_account",
    state: generateOAuthState({ userId: "signin" }),
  });
  res.json({ url: authUrl });
});

router.get("/api/auth/google/callback", async (req: Request, res: Response) => {
  const baseUrl = appOrigin(req);
  const { code, state } = req.query;
  const vs = verifyOAuthState(state as string | undefined);
  if (!vs.ok) {
    return res.redirect(
      bridgeRedirect(baseUrl, {} as any, "", "Invalid or expired sign-in state."),
    );
  }
  if (!code || typeof code !== "string") {
    return res.redirect(bridgeRedirect(baseUrl, {} as any, "", "Google did not return a code."));
  }
  try {
    const redirectUri = `${baseUrl}/api/auth/google/callback`;
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    );
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ auth: client, version: "v2" });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    const name = userInfo.data.name || userInfo.data.given_name || null;
    if (!email) {
      return res.redirect(
        bridgeRedirect(baseUrl, {} as any, "", "Google did not return an email address."),
      );
    }
    const user = await findOrCreateUserByEmail(email, name);
    const token = generateToken({ id: user.id, email: user.email });
    return res.redirect(bridgeRedirect(baseUrl, user, token));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Google sign-in failed.";
    log.error("auth oauth google: callback failed", { error: message });
    return res.redirect(bridgeRedirect(baseUrl, {} as any, "", message));
  }
});

/* ─────────────────────────  Microsoft  ─────────────────────── */

router.get("/api/auth/microsoft/url", (req: Request, res: Response) => {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    return res.status(503).json({ error: "Microsoft sign-in is not configured." });
  }
  const baseUrl = appOrigin(req);
  const redirectUri = `${baseUrl}/api/auth/microsoft/callback`;
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MICROSOFT_SIGNIN_SCOPES.join(" "),
    state: generateOAuthState({ userId: "signin" }),
    prompt: "select_account",
  });
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  res.json({ url: authUrl });
});

router.get("/api/auth/microsoft/callback", async (req: Request, res: Response) => {
  const baseUrl = appOrigin(req);
  const { code, state, error_description } = req.query;
  const vs = verifyOAuthState(state as string | undefined);
  if (!vs.ok) {
    return res.redirect(
      bridgeRedirect(baseUrl, {} as any, "", "Invalid or expired sign-in state."),
    );
  }
  if (!code || typeof code !== "string") {
    const msg =
      (typeof error_description === "string" && error_description) ||
      "Microsoft did not return a code.";
    return res.redirect(bridgeRedirect(baseUrl, {} as any, "", msg));
  }
  try {
    const redirectUri = `${baseUrl}/api/auth/microsoft/callback`;
    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: MICROSOFT_SIGNIN_SCOPES.join(" "),
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`token exchange failed (${tokenRes.status}): ${body.slice(0, 200)}`);
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) throw new Error("no access_token in Microsoft response");

    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!meRes.ok) throw new Error(`Graph /me failed (${meRes.status})`);
    const me = (await meRes.json()) as {
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    };
    const email = me.mail || me.userPrincipalName;
    const name = me.displayName || null;
    if (!email) {
      return res.redirect(
        bridgeRedirect(baseUrl, {} as any, "", "Microsoft did not return an email address."),
      );
    }
    const user = await findOrCreateUserByEmail(email, name);
    const token = generateToken({ id: user.id, email: user.email });
    return res.redirect(bridgeRedirect(baseUrl, user, token));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Microsoft sign-in failed.";
    log.error("auth oauth microsoft: callback failed", { error: message });
    return res.redirect(bridgeRedirect(baseUrl, {} as any, "", message));
  }
});

/* ─────────────────────────  Yahoo  ─────────────────────── */
/**
 * Yahoo OAuth 2.0 / OpenID Connect sign-in. Yahoo's developer console
 * issues a CLIENT_ID + CLIENT_SECRET; operator registers
 * https://trywireline.com/api/auth/yahoo/callback as the redirect URI.
 * Auth endpoint:  https://api.login.yahoo.com/oauth2/request_auth
 * Token endpoint: https://api.login.yahoo.com/oauth2/get_token
 * Userinfo:       https://api.login.yahoo.com/openid/v1/userinfo
 */

router.get("/api/auth/yahoo/url", (req: Request, res: Response) => {
  if (!process.env.YAHOO_CLIENT_ID || !process.env.YAHOO_CLIENT_SECRET) {
    return res.status(503).json({ error: "Yahoo sign-in is not configured." });
  }
  const baseUrl = appOrigin(req);
  const redirectUri = `${baseUrl}/api/auth/yahoo/callback`;
  const params = new URLSearchParams({
    client_id: process.env.YAHOO_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: YAHOO_SIGNIN_SCOPES.join(" "),
    state: generateOAuthState({ userId: "signin" }),
    prompt: "login",
  });
  const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;
  res.json({ url: authUrl });
});

router.get("/api/auth/yahoo/callback", async (req: Request, res: Response) => {
  const baseUrl = appOrigin(req);
  const { code, state, error_description } = req.query;
  const vs = verifyOAuthState(state as string | undefined);
  if (!vs.ok) {
    return res.redirect(
      bridgeRedirect(baseUrl, {} as any, "", "Invalid or expired sign-in state."),
    );
  }
  if (!code || typeof code !== "string") {
    const msg =
      (typeof error_description === "string" && error_description) ||
      "Yahoo did not return a code.";
    return res.redirect(bridgeRedirect(baseUrl, {} as any, "", msg));
  }
  try {
    const redirectUri = `${baseUrl}/api/auth/yahoo/callback`;
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
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) throw new Error("no access_token in Yahoo response");

    const meRes = await fetch("https://api.login.yahoo.com/openid/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!meRes.ok) throw new Error(`Yahoo userinfo failed (${meRes.status})`);
    const me = (await meRes.json()) as { email?: string; name?: string; given_name?: string };
    const email = me.email;
    const name = me.name || me.given_name || null;
    if (!email) {
      return res.redirect(
        bridgeRedirect(baseUrl, {} as any, "", "Yahoo did not return an email address."),
      );
    }
    const user = await findOrCreateUserByEmail(email, name);
    const token = generateToken({ id: user.id, email: user.email });
    return res.redirect(bridgeRedirect(baseUrl, user, token));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Yahoo sign-in failed.";
    log.error("auth oauth yahoo: callback failed", { error: message });
    return res.redirect(bridgeRedirect(baseUrl, {} as any, "", message));
  }
});

export default router;
