import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- tenant configuration columns and aggregated drizzle rows have shapes that vary by route. */
/**
 * Wireline native sign-in OAuth (Google / Microsoft / Yahoo).
 * Mailbox/integration OAuth remains in `src/routes/oauth/`.
 *
 * OAuth-based SIGN-IN (distinct from the mailbox-connect OAuth in oauth/).
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
 * existing mailbox-connect OAuth — account holders only configure them once.
 * The scopes differ (no Gmail/Calendar.send here, just identity), so
 * the access token returned by sign-in is NOT mailbox-usable. If a
 * user later wants to attach their mailbox to an agent, they go
 * through the existing higher-scope OAuth flow.
 *
 * Email/password sign-in remains untouched. OAuth is an additional
 * option, not a replacement — customers who don't have a Gmail or
 * Outlook can keep using email/password.
 */

import { createHmac, randomBytes } from "node:crypto";
import { Router, Request, Response } from "express";
import { google } from "googleapis";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, lt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { generateToken, isOwnerEmail } from "../lib/auth-service";
import { authSuccessBody, setSessionCookie } from "../lib/session-cookie";
import { scheduleFounderBootstrap } from "../lib/founder-bootstrap";
import { generateOAuthState, verifyOAuthState } from "../lib/oauth-helpers";
import { getCanonicalAppUrl } from "../lib/app-url";
import {
  createOAuthBridgeState,
  readOAuthBridgeStateCookie,
  setOAuthBridgeStateCookie,
  clearOAuthBridgeStateCookie,
} from "../lib/oauth-bridge-cookie";
import { oauthRateLimiter } from "../middleware/rate-limit-middleware";

const router = Router();

function oauthBridgeSecret(): string {
  const secret =
    process.env.OAUTH_BRIDGE_SECRET ||
    process.env.OAUTH_STATE_SECRET ||
    process.env.INTERNAL_JWT_SECRET ||
    process.env.JWT_SECRET;
  if (!secret) throw AppError.fromHttpStatus(503, "OAuth bridge secret is not configured.");
  return secret;
}

export function hashOAuthBridgeValue(value: string): string {
  return createHmac("sha256", oauthBridgeSecret()).update(value, "utf8").digest("hex");
}

// Minimal identity scopes — NOT mailbox-readable.
const GOOGLE_SIGNIN_SCOPES = ["openid", "email", "profile"];
// Microsoft sign-in scopes. Standard OpenID Connect scopes alone
// (openid, email, profile, offline_access) get us an id_token but
// do NOT grant access to https://graph.microsoft.com/v1.0/me — the
// endpoint our callback hits to read the user's email + display name.
// Without User.Read, Graph returns 403 even though the user granted
// consent.
//
// Two fixes considered:
//   (A) keep Graph /me call, add User.Read → DONE (this line)
//   (B) decode the OIDC id_token claims for email/name and skip Graph
//       — cleaner long-term but a bigger code change.
//
// Going with (A) because it's a one-line fix and keeps the existing
// callback shape working. If we later need claims-from-id-token (e.g.
// for tenants that disable Graph access), revisit.
const MICROSOFT_SIGNIN_SCOPES = ["openid", "email", "profile", "offline_access", "User.Read"];
const YAHOO_SIGNIN_SCOPES = ["openid", "email", "profile"];

function oauthAppBaseUrl(): string {
  return getCanonicalAppUrl();
}

function beginOAuthSignIn(res: Response): void {
  setOAuthBridgeStateCookie(res, createOAuthBridgeState());
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
        // They can still add a password later via the reset flow.
        fullName,
        emailVerifiedAt: new Date(),
      })
      .returning()) as Array<{ id: string; email: string; fullName: string | null }>;
    const u = inserted[0];
    const { startTrialForUser } = await import("../lib/trial-gate");
    await startTrialForUser(u.id);
    log.info("auth oauth: created new user", { email: normalized });
    return { id: u.id, email: u.email, fullName: u.fullName };
  })();
}

/**
 * Bridge-code store for the OAuth sign-in callback → /oauth-complete
 * SPA redirect. Persisted to Postgres (was an in-process Map) so the
 * redirect can land on any Vercel function instance and still find
 * the row. Codes live ~60s and are deleted on read.
 */
const PENDING_CODE_TTL_MS = 60_000;
let pendingCodeSchemaReady = false;
let pendingCodeSchemaRepair: Promise<void> | null = null;

function getErrorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown })?.code;
  return typeof code === "string" ? code : undefined;
}

function getErrorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function shouldRepairPendingCodeSchema(err: unknown): boolean {
  const code = getErrorCode(err);
  if (code === "42P01" || code === "42703") return true;
  const message = getErrorText(err);
  return /wireline_oauth_pending_codes|relation .* does not exist|column .* does not exist/i.test(
    message,
  );
}

async function ensurePendingCodeSchema(): Promise<void> {
  if (pendingCodeSchemaReady) return;
  if (!pendingCodeSchemaRepair) {
    pendingCodeSchemaRepair = (async () => {
      await drizzle.execute(sql`
        CREATE TABLE IF NOT EXISTS wireline_oauth_pending_codes (
          code_hash text PRIMARY KEY,
          user_id uuid NOT NULL,
          email text NOT NULL,
          full_name text,
          is_owner boolean NOT NULL DEFAULT false,
          bridge_state_hash text NOT NULL,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await drizzle.execute(sql`
        ALTER TABLE wireline_oauth_pending_codes
          ADD COLUMN IF NOT EXISTS code_hash text,
          ADD COLUMN IF NOT EXISTS bridge_state_hash text
      `);
      await drizzle.execute(sql`
        DELETE FROM wireline_oauth_pending_codes
        WHERE code_hash IS NULL OR bridge_state_hash IS NULL
      `);
      await drizzle.execute(sql`
        ALTER TABLE wireline_oauth_pending_codes
          DROP COLUMN IF EXISTS code,
          DROP COLUMN IF EXISTS token,
          DROP COLUMN IF EXISTS bridge_state,
          ALTER COLUMN code_hash SET NOT NULL,
          ALTER COLUMN bridge_state_hash SET NOT NULL
      `);
      await drizzle.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_oauth_pending_codes_expires_at
          ON wireline_oauth_pending_codes (expires_at)
      `);
      // Lock the table down (see migration 0035). The table now stores only
      // short-lived bridge metadata (not live Wireline JWTs), but remains
      // sensitive because rows bind browser state to pending sign-in. Enable
      // RLS so it can't be read via the Supabase Data API and strip direct
      // grants. The OAuth callback runs as the postgres base role (table owner
      // → bypasses RLS), so its own access is unaffected.
      // Guarded for non-Supabase local DBs that lack the anon/authenticated roles.
      await drizzle.execute(sql`
        DO $$
        BEGIN
          EXECUTE 'ALTER TABLE wireline_oauth_pending_codes ENABLE ROW LEVEL SECURITY';
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE 'REVOKE ALL ON wireline_oauth_pending_codes FROM authenticated';
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE 'REVOKE ALL ON wireline_oauth_pending_codes FROM anon';
          END IF;
        END $$;
      `);
      pendingCodeSchemaReady = true;
      log.info("auth oauth: repaired pending-code schema");
    })().finally(() => {
      pendingCodeSchemaRepair = null;
    });
  }
  await pendingCodeSchemaRepair;
}

async function insertPendingCode(
  code: string,
  entry: {
    user: { id: string; email: string; fullName: string | null };
    isOwner: boolean;
    bridgeState: string;
  },
): Promise<void> {
  await drizzle.insert(schema.oauthPendingCodes).values({
    codeHash: hashOAuthBridgeValue(code),
    userId: entry.user.id,
    email: entry.user.email,
    fullName: entry.user.fullName,
    isOwner: entry.isOwner,
    bridgeStateHash: hashOAuthBridgeValue(entry.bridgeState),
    expiresAt: new Date(Date.now() + PENDING_CODE_TTL_MS),
  });
}

async function storePendingCode(
  code: string,
  entry: {
    user: { id: string; email: string; fullName: string | null };
    isOwner: boolean;
    bridgeState: string;
  },
): Promise<void> {
  try {
    await insertPendingCode(code, entry);
    pendingCodeSchemaReady = true;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (shouldRepairPendingCodeSchema(err)) {
      log.warn("auth oauth: pending-code schema missing; repairing before retry", {
        error: getErrorText(err),
        code: getErrorCode(err),
      });
      try {
        await ensurePendingCodeSchema();
        await insertPendingCode(code, entry);
        return;
      } catch (repairErr) {
        if (repairErr instanceof AppError) throw repairErr;
        log.error("auth oauth: pending-code schema repair failed", {
          initial_error: getErrorText(err),
          error: getErrorText(repairErr),
          code: getErrorCode(repairErr),
        });
        throw repairErr;
      }
    }
    log.error("auth oauth: failed to persist pending code", {
      error: getErrorText(err),
      code: getErrorCode(err),
    });
    throw err;
  }
}

async function consumePendingCode(code: string): Promise<{
  user: { id: string; email: string; fullName: string | null };
  isOwner: boolean;
  bridgeStateHash: string | null;
} | null> {
  // Single-shot read-and-delete. We rely on a DELETE … RETURNING so
  // a concurrent exchange request can only succeed for one caller.
  const rows = (await drizzle.execute(sql`
    DELETE FROM wireline_oauth_pending_codes
    WHERE code_hash = ${hashOAuthBridgeValue(code)}
    RETURNING code_hash, user_id, email, full_name, is_owner, bridge_state_hash, expires_at
  `)) as unknown as {
    rows?: Array<{
      code_hash: string;
      user_id: string;
      email: string;
      full_name: string | null;
      is_owner: boolean;
      bridge_state_hash: string | null;
      expires_at: Date | string;
    }>;
  };
  const row = rows.rows?.[0];
  if (!row) return null;
  const expiresAt =
    row.expires_at instanceof Date ? row.expires_at.getTime() : new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return {
    isOwner: row.is_owner,
    bridgeStateHash: row.bridge_state_hash,
    user: { id: row.user_id, email: row.email, fullName: row.full_name },
  };
}

// Opportunistic GC of expired rows. Cheap; runs alongside every callback.
async function gcExpiredPendingCodes(): Promise<void> {
  try {
    await drizzle
      .delete(schema.oauthPendingCodes)
      .where(lt(schema.oauthPendingCodes.expiresAt, new Date()));
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Non-fatal — surface only at warn level.
    log.warn("auth oauth: pending-code GC failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function bridgeRedirect(
  baseUrl: string,
  user: { id: string; email: string; fullName: string | null },
  _token: string,
  errorMessage?: string,
  req?: Request,
): Promise<string> {
  if (errorMessage) {
    return `${baseUrl}/auth/oauth-complete?error=${encodeURIComponent(errorMessage)}`;
  }
  const bridgeState = req ? readOAuthBridgeStateCookie(req) : undefined;
  if (!bridgeState) {
    return `${baseUrl}/auth/oauth-complete?error=${encodeURIComponent("Sign-in session expired. Please try again.")}`;
  }
  const code = randomBytes(32).toString("base64url");
  try {
    await storePendingCode(code, {
      user,
      isOwner: isOwnerEmail(user.email),
      bridgeState,
    });
  } catch {
    return `${baseUrl}/auth/oauth-complete?error=${encodeURIComponent("Failed to start session. Please try again.")}`;
  }
  // Fire-and-forget GC.
  void gcExpiredPendingCodes();
  return `${baseUrl}/auth/oauth-complete?code=${code}`;
}

/* ─────────────────────────  Google  ─────────────────────── */

router.get("/api/auth/google/url", oauthRateLimiter, (req: Request, res: Response) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw AppError.fromHttpStatus(503, "Google sign-in is not configured.");
    }
    beginOAuthSignIn(res);
    const baseUrl = oauthAppBaseUrl();
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
    return res.json({ url: authUrl });
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : "Google sign-in failed to start.";
    log.error("auth oauth google: /url failed", { error: message });
    throw AppError.fromHttpStatus(500, `Google sign-in failed to start: ${message}`);
  }
});

router.get("/api/auth/google/callback", async (req: Request, res: Response) => {
  const baseUrl = oauthAppBaseUrl();
  const { code, state } = req.query;
  const vs = verifyOAuthState(state as string | undefined);
  if (!vs.ok) {
    return res.redirect(
      await bridgeRedirect(baseUrl, {} as any, "", "Invalid or expired sign-in state."),
    );
  }
  if (!code || typeof code !== "string") {
    return res.redirect(
      await bridgeRedirect(baseUrl, {} as any, "", "Google did not return a code."),
    );
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
        await bridgeRedirect(baseUrl, {} as any, "", "Google did not return an email address."),
      );
    }
    const user = await findOrCreateUserByEmail(email, name);
    scheduleFounderBootstrap(user.id, user.email);
    return res.redirect(await bridgeRedirect(baseUrl, user, "", undefined, req));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Google sign-in failed.";
    log.error("auth oauth google: callback failed", { error: message });
    return res.redirect(await bridgeRedirect(baseUrl, {} as any, "", message));
  }
});

/* ─────────────────────────  Microsoft  ─────────────────────── */

router.get("/api/auth/microsoft/url", oauthRateLimiter, (req: Request, res: Response) => {
  try {
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
      throw AppError.fromHttpStatus(503, "Microsoft sign-in is not configured.");
    }
    beginOAuthSignIn(res);
    const baseUrl = oauthAppBaseUrl();
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
    return res.json({ url: authUrl });
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : "Microsoft sign-in failed to start.";
    log.error("auth oauth microsoft: /url failed", { error: message });
    throw AppError.fromHttpStatus(500, `Microsoft sign-in failed to start: ${message}`);
  }
});

router.get("/api/auth/microsoft/callback", async (req: Request, res: Response) => {
  const baseUrl = oauthAppBaseUrl();
  const { code, state, error_description } = req.query;
  const vs = verifyOAuthState(state as string | undefined);
  if (!vs.ok) {
    return res.redirect(
      await bridgeRedirect(baseUrl, {} as any, "", "Invalid or expired sign-in state."),
    );
  }
  if (!code || typeof code !== "string") {
    const msg =
      (typeof error_description === "string" && error_description) ||
      "Microsoft did not return a code.";
    return res.redirect(await bridgeRedirect(baseUrl, {} as any, "", msg));
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
        await bridgeRedirect(baseUrl, {} as any, "", "Microsoft did not return an email address."),
      );
    }
    const user = await findOrCreateUserByEmail(email, name);
    scheduleFounderBootstrap(user.id, user.email);
    return res.redirect(await bridgeRedirect(baseUrl, user, "", undefined, req));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Microsoft sign-in failed.";
    log.error("auth oauth microsoft: callback failed", { error: message });
    return res.redirect(await bridgeRedirect(baseUrl, {} as any, "", message));
  }
});

/* ─────────────────────────  Yahoo  ─────────────────────── */
/**
 * Yahoo OAuth 2.0 / OpenID Connect sign-in. Yahoo's developer console
 * issues a CLIENT_ID + CLIENT_SECRET; Account Holder registers
 * https://trywireline.com/api/auth/yahoo/callback as the redirect URI.
 * Auth endpoint:  https://api.login.yahoo.com/oauth2/request_auth
 * Token endpoint: https://api.login.yahoo.com/oauth2/get_token
 * Userinfo:       https://api.login.yahoo.com/openid/v1/userinfo
 */

router.get("/api/auth/yahoo/url", oauthRateLimiter, (req: Request, res: Response) => {
  try {
    if (!process.env.YAHOO_CLIENT_ID || !process.env.YAHOO_CLIENT_SECRET) {
      throw AppError.fromHttpStatus(503, "Yahoo sign-in is not configured.");
    }
    beginOAuthSignIn(res);
    const baseUrl = oauthAppBaseUrl();
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
    return res.json({ url: authUrl });
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : "Yahoo sign-in failed to start.";
    log.error("auth oauth yahoo: /url failed", { error: message });
    throw AppError.fromHttpStatus(500, `Yahoo sign-in failed to start: ${message}`);
  }
});

router.get("/api/auth/yahoo/callback", async (req: Request, res: Response) => {
  const baseUrl = oauthAppBaseUrl();
  const { code, state, error_description } = req.query;
  const vs = verifyOAuthState(state as string | undefined);
  if (!vs.ok) {
    return res.redirect(
      await bridgeRedirect(baseUrl, {} as any, "", "Invalid or expired sign-in state."),
    );
  }
  if (!code || typeof code !== "string") {
    const msg =
      (typeof error_description === "string" && error_description) ||
      "Yahoo did not return a code.";
    return res.redirect(await bridgeRedirect(baseUrl, {} as any, "", msg));
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
        await bridgeRedirect(baseUrl, {} as any, "", "Yahoo did not return an email address."),
      );
    }
    const user = await findOrCreateUserByEmail(email, name);
    scheduleFounderBootstrap(user.id, user.email);
    return res.redirect(await bridgeRedirect(baseUrl, user, "", undefined, req));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Yahoo sign-in failed.";
    log.error("auth oauth yahoo: callback failed", { error: message });
    return res.redirect(await bridgeRedirect(baseUrl, {} as any, "", message));
  }
});

/* ──────────────────  One-time code exchange  ────────────────── */

router.post("/api/auth/oauth/exchange", oauthRateLimiter, async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code || typeof code !== "string") {
    throw AppError.fromHttpStatus(400, "Missing code");
  }
  const entry = await consumePendingCode(code);
  if (!entry) {
    throw AppError.fromHttpStatus(400, "Invalid or expired code");
  }
  const cookieState = readOAuthBridgeStateCookie(req);
  if (
    !cookieState ||
    !entry.bridgeStateHash ||
    hashOAuthBridgeValue(cookieState) !== entry.bridgeStateHash
  ) {
    throw AppError.fromHttpStatus(400, "Invalid or expired code");
  }
  clearOAuthBridgeStateCookie(res);
  const sessionToken = generateToken({ id: entry.user.id, email: entry.user.email });
  setSessionCookie(res, sessionToken);

  const [sub] = await drizzle
    .select({ plan: schema.subscriptions.plan })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, entry.user.id))
    .limit(1);

  const { resolveAccountType } = await import("../lib/account-type");
  const { ensureDefaultAccount } = await import("../lib/account-service");
  const fallbackAccountType = resolveAccountType(sub?.plan);
  const account_type = (await ensureDefaultAccount(entry.user.id, fallbackAccountType)).type;

  return res.json({
    ...authSuccessBody({
      id: entry.user.id,
      email: entry.user.email,
      full_name: entry.user.fullName,
      is_owner: entry.isOwner,
      account_type,
    }),
    user_id: entry.user.id,
    email: entry.user.email,
    name: entry.user.fullName ?? "",
    is_owner: entry.isOwner ? "1" : "0",
  });
});

export default router;
