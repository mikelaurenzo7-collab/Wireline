/* eslint-disable @typescript-eslint/no-explicit-any -- OAuth provider responses include provider-specific extension fields. */
import express from "express";
import { AppError } from "../../lib/api-error";
import { drizzle, log, IS_PROD } from "../../lib/server-context";
import * as schema from "../../db/schema";
import { encryptSecret } from "../../lib/secret-vault";
import { oauthRateLimiter } from "../../middleware/rate-limit-middleware";
import { authenticateUser } from "../../middleware/auth";
import {
  generateOAuthState,
  verifyAndClaimOAuthState,
  resolveLinkedOAuthUserId,
} from "../../lib/oauth-helpers";
import { buildCSP, generateCspNonce } from "../../lib/csp";
import { getErrorMessage } from "../../lib/server-utils";
import {
  microsoftGraphConfigured,
  getTeamsAuthUrl,
  getExcelAuthUrl,
  exchangeMicrosoftGraphCode,
  getMicrosoftAccountEmail,
  disconnectMicrosoftGraph,
  listTeamsNotifyTargets,
  setTeamsNotifyTarget,
  bootstrapTeamsNotifyTarget,
  type MsGraphProvider,
} from "../../lib/microsoft-graph-service";

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
//  Microsoft Graph — Teams + Excel
//
//  Two independent, least-privilege connections, kept separate from the
//  Outlook mail/calendar flow above. Each stores its own crmConnections
//  row (provider 'microsoft_teams' / 'microsoft_excel') and requests
//  only the Graph scopes that integration needs.
// ────────────────────────────────────────────────────────────────────

function msGraphRedirectUri(req: express.Request, provider: MsGraphProvider): string {
  const baseUrl =
    (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
    `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/api/oauth/${provider}/callback`;
}

function buildMsGraphUrlRoute(provider: MsGraphProvider) {
  return (req: express.Request, res: express.Response) => {
    if (!microsoftGraphConfigured()) {
      return res
        .status(500)
        .json({ error: "Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET" });
    }
    const uid = req.user?.id as string | undefined;
    const redirectUri = msGraphRedirectUri(req, provider);
    const state = generateOAuthState(uid ? { userId: uid } : undefined);
    const url =
      provider === "microsoft_teams"
        ? getTeamsAuthUrl(redirectUri, state)
        : getExcelAuthUrl(redirectUri, state);
    res.json({ url });
  };
}

async function handleMsGraphCallback(
  provider: MsGraphProvider,
  req: express.Request,
  res: express.Response,
) {
  const { code, state, error } = req.query;
  if (error) {
    log.warn("Microsoft Graph OAuth authorization was not completed", { provider });
    return res
      .status(400)
      .type("text/plain")
      .send("Microsoft authorization was not completed. Please restart the connection.");
  }
  const vs = await verifyAndClaimOAuthState(state as string | undefined);
  if (!vs.ok) {
    return res.status(400).send("Invalid or expired OAuth state. Please restart the connect flow.");
  }
  if (!code || typeof code !== "string") {
    return res.status(400).send("No authorization code provided by Microsoft.");
  }

  try {
    const redirectUri = msGraphRedirectUri(req, provider);
    const tokens = await exchangeMicrosoftGraphCode(code, redirectUri);

    const userId = await resolveLinkedOAuthUserId(req, vs);
    if (!userId) {
      return res
        .status(401)
        .send("Complete this connection in the same browser and Wireline account that started it.");
    }

    const email = await getMicrosoftAccountEmail(tokens.access_token);
    const accessTokenEnc = encryptSecret(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    await drizzle
      .insert(schema.crmConnections)
      .values({
        userId,
        provider,
        accessToken: accessTokenEnc,
        refreshToken: refreshTokenEnc,
        expiresAt,
        connectedEmail: email,
        metadata: { scope: tokens.scope || "" },
      })
      .onConflictDoUpdate({
        target: [schema.crmConnections.userId, schema.crmConnections.provider],
        set: {
          accessToken: accessTokenEnc,
          refreshToken: refreshTokenEnc,
          expiresAt,
          connectedEmail: email,
          metadata: { scope: tokens.scope || "" },
          updatedAt: new Date(),
          active: true,
        },
      });

    if (provider === "microsoft_teams") {
      void bootstrapTeamsNotifyTarget(userId).catch((err) =>
        log.warn("bootstrapTeamsNotifyTarget failed", {
          userId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }

    const targetOrigin =
      (process.env.APP_URL && new URL(process.env.APP_URL).origin) ||
      `${req.protocol}://${req.get("host")}`;
    const cspNonce = generateCspNonce();
    res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce));
    const label = provider === "microsoft_teams" ? "Microsoft Teams" : "Microsoft Excel";
    res.send(`
      <html><body><script nonce="${cspNonce}">
        if (window.opener) {
          window.opener.postMessage({ type: 'CRM_OAUTH_SUCCESS', provider: ${JSON.stringify(provider)} }, ${JSON.stringify(targetOrigin)});
          window.close();
        } else { window.location.href = '/'; }
      </script><p>${label} connected successfully. You can close this window.</p></body></html>
    `);
  } catch (e: any) {
    log.error("Microsoft Graph OAuth callback failed", {
      provider,
      error: e?.message || String(e),
    });
    res.status(500).send("Microsoft authentication failed. Please try again.");
  }
}

router.get(
  "/api/oauth/microsoft_teams/url",
  oauthRateLimiter,
  authenticateUser,
  buildMsGraphUrlRoute("microsoft_teams"),
);

router.get(
  "/api/oauth/microsoft_teams/callback",
  oauthRateLimiter,
  (req: express.Request, res: express.Response) =>
    handleMsGraphCallback("microsoft_teams", req, res),
);

router.post(
  "/api/oauth/microsoft_teams/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      await disconnectMicrosoftGraph(userId, "microsoft_teams");
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Microsoft Teams disconnect failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to disconnect Microsoft Teams");
    }
  },
);

router.get(
  "/api/oauth/microsoft_teams/channels",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      const channels = await listTeamsNotifyTargets(userId);
      res.json({ channels });
    } catch (err: any) {
      log.error("GET /api/oauth/microsoft_teams/channels failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to list Teams channels");
    }
  },
);

router.post(
  "/api/oauth/microsoft_teams/notify-target",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    const { team_id, channel_id, team_name, channel_name } = req.body || {};
    if (!team_id || !channel_id) {
      throw AppError.fromHttpStatus(400, "team_id and channel_id required");
    }
    try {
      await setTeamsNotifyTarget(userId, String(team_id), String(channel_id), {
        team_name: team_name ? String(team_name) : undefined,
        channel_name: channel_name ? String(channel_name) : undefined,
      });
      res.json({ ok: true });
    } catch (err: any) {
      log.error("POST /api/oauth/microsoft_teams/notify-target failed", {
        error: getErrorMessage(err),
      });
      throw AppError.fromHttpStatus(500, "Failed to set Teams notify target");
    }
  },
);

router.get(
  "/api/oauth/microsoft_excel/url",
  oauthRateLimiter,
  authenticateUser,
  buildMsGraphUrlRoute("microsoft_excel"),
);

router.get(
  "/api/oauth/microsoft_excel/callback",
  oauthRateLimiter,
  (req: express.Request, res: express.Response) =>
    handleMsGraphCallback("microsoft_excel", req, res),
);

router.post(
  "/api/oauth/microsoft_excel/disconnect",
  authenticateUser,
  async (req: express.Request, res: express.Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      await disconnectMicrosoftGraph(userId, "microsoft_excel");
      res.json({ ok: true });
    } catch (e: any) {
      log.error("Microsoft Excel disconnect failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to disconnect Microsoft Excel");
    }
  },
);

export default router;
